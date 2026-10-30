'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCertificateCode, generateBatchCertificateCodes } from '@/lib/utils/certificate-code';
import { revalidatePath } from 'next/cache';
import type { Certificate, CreateCertificateInput, Folder } from '@/lib/types/database';
import { requireAdminOrThrow, verifyAdminPassword } from '@/lib/auth/admin';
import { checkSuperDeleteRateLimit } from '@/lib/utils/rate-limit';
import { validateEmail } from '@/lib/validation/email';
import { certificateObjectPath } from '@/lib/verification/public';

export interface BulkCertificateInput {
    entries: Array<{ name: string; email: string; [key: string]: string }>;
    event_name: string;
    date_of_issue: string;
    template_id: string;
    folder_id: string;
}

export interface BulkCertificateResult {
    total: number;
    successful: number;
    failed: number;
    results: Array<{
        name: string;
        email: string;
        success: boolean;
        certificateCode?: string;
        error?: string;
    }>;
}

export interface CreateFolderInput {
    name: string;
    parent_id?: string | null;
}

export type SuperDeleteScope =
    | 'delete_folder_tree'
    | 'delete_folder_certificates_only'
    | 'delete_subtree_certificates_keep_folders';

const SUPER_DELETE_SCOPES: SuperDeleteScope[] = [
    'delete_folder_tree',
    'delete_folder_certificates_only',
    'delete_subtree_certificates_keep_folders',
];

export interface SuperDeleteFolderInput {
    folder_id: string;
    scope: SuperDeleteScope;
    password: string;
    confirmation_text: string;
}

export interface SuperDeleteSummary {
    scope: SuperDeleteScope;
    folderName: string;
    deletedCertificates: number;
    deletedFolders: number;
    storageCleanupFailures: number;
}

export interface SuperDeleteFolderResult {
    success: boolean;
    summary?: SuperDeleteSummary;
    error?: string;
}

interface FolderTreeNode {
    id: string;
    parent_id: string | null;
}

function isSuperDeleteScope(value: string): value is SuperDeleteScope {
    return SUPER_DELETE_SCOPES.includes(value as SuperDeleteScope);
}

function getStoragePathFromCertificateUrl(pdfUrl: string | null, pdfObjectPath?: string | null): string | null {
    return certificateObjectPath({pdf_url:pdfUrl,pdf_object_path:pdfObjectPath},process.env.NEXT_PUBLIC_SUPABASE_URL??'');
}

function collectDescendantFolderIds(rootFolderId: string, folderRows: FolderTreeNode[]): string[] {
    const childrenByParent = new Map<string, string[]>();

    for (const folder of folderRows) {
        if (!folder.parent_id) {
            continue;
        }

        const children = childrenByParent.get(folder.parent_id) || [];
        children.push(folder.id);
        childrenByParent.set(folder.parent_id, children);
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const stack = [rootFolderId];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || seen.has(current)) {
            continue;
        }

        seen.add(current);
        result.push(current);

        const children = childrenByParent.get(current) || [];
        for (const childId of children) {
            stack.push(childId);
        }
    }

    return result;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
        chunks.push(items.slice(i, i + chunkSize));
    }
    return chunks;
}

export async function updateCertificateEmail(
    certificateId: string,
    email: string
  ): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    try {
      // Validate email using Zod schema (strict RFC 5321 compliance)
      const validatedEmail = await validateEmail(email);

      const { error } = await createAdminClient().rpc('update_certificate_email', {
        p_id: certificateId,
        p_email: validatedEmail.toLowerCase(),
      });

      if (error) {
        return { success: false, error: error.message };
      }
  
      revalidatePath('/admin');
      revalidatePath('/admin/certificates');
  
      return { success: true };
    } catch (error) {
      // Validation errors from Zod
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: 'Failed to update certificate email' };
    }
  }
  


export async function createBulkCertificates(input: BulkCertificateInput): Promise<{
    success: boolean;
    result?: BulkCertificateResult;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        const supabase = await createClient();

        if (!input.folder_id) {
            return { success: false, error: 'Folder is required' };
        }

        const { data: folder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', input.folder_id)
            .single();

        if (!folder) {
            return { success: false, error: 'Selected folder not found' };
        }

        // Get template info for snapshot
        const { data: template } = await supabase
            .from('templates')
            .select('image_url')
            .eq('id', input.template_id)
            .single();

        if (!template) {
            return { success: false, error: 'Template not found' };
        }

        const results: BulkCertificateResult['results'] = [];
        let successful = 0;
        let failed = 0;

        // Pre-generate unique codes for all entries using batch generation
        // This is more efficient than generating codes one by one
        const certificateCodes = generateBatchCertificateCodes(input.entries.length, {
            strategy: 'hybrid', // Time-prefixed for minimal collisions
            length: 12
        });

        // Verify codes don't already exist in database (batch check)
        const { data: existingCodes } = await supabase
            .from('certificates')
            .select('certificate_code')
            .in('certificate_code', certificateCodes);

        // Create a set of existing codes for quick lookup
        const existingCodeSet = new Set((existingCodes || []).map(c => c.certificate_code));

        // Filter out any existing codes and generate replacements
        let codeIndex = 0;
        const finalCodes: string[] = [];
        for (let i = 0; i < input.entries.length; i++) {
            let code = certificateCodes[codeIndex++];
            let regenerationAttempts = 0;
            const maxRegenerationAttempts = 5;

            while (existingCodeSet.has(code) && regenerationAttempts < maxRegenerationAttempts) {
                code = generateCertificateCode({ strategy: 'hybrid', length: 12 });
                regenerationAttempts++;
            }

            finalCodes.push(code);
            existingCodeSet.add(code); // Add to set to prevent duplicates within this batch
        }

        // Process each entry with their pre-generated codes
        for (let i = 0; i < input.entries.length; i++) {
            const entry = input.entries[i];
            const certificateCode = finalCodes[i];

            try {
                // Extract custom fields from entry (all keys except name and email)
                const customFields: Record<string, string> = {};
                Object.entries(entry).forEach(([key, value]) => {
                    if (key !== 'name' && key !== 'email' && typeof value === 'string') {
                        customFields[key] = value;
                    }
                });

                // Create certificate record
                const { data, error } = await supabase
                    .from('certificates')
                    .insert({
                        certificate_code: certificateCode,
                        name: entry.name,
                        email: entry.email,
                        event_name: input.event_name,
                        date_of_issue: input.date_of_issue || new Date().toISOString().split('T')[0],
                        template_id: input.template_id,
                        folder_id: input.folder_id,
                        template_image_url: template.image_url || null,
                        is_valid: true,
                        custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
                    })
                    .select()
                    .single();

                if (error) {
                    results.push({
                        name: entry.name,
                        email: entry.email,
                        success: false,
                        error: error.message
                    });
                    failed++;
                } else {
                    results.push({
                        name: entry.name,
                        email: entry.email,
                        success: true,
                        certificateCode: (data as Certificate).certificate_code
                    });
                    successful++;
                }
            } catch (entryError) {
                results.push({
                    name: entry.name,
                    email: entry.email,
                    success: false,
                    error: entryError instanceof Error ? entryError.message : 'Unknown error'
                });
                failed++;
            }
        }

        revalidatePath('/admin');
        revalidatePath('/admin/certificates');

        return {
            success: true,
            result: {
                total: input.entries.length,
                successful,
                failed,
                results
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

export async function createCertificate(input: CreateCertificateInput): Promise<{
    success: boolean;
    certificate?: Certificate;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        const supabase = await createClient();

        if (!input.folder_id) {
            return { success: false, error: 'Folder is required' };
        }

        const { data: folder } = await supabase
            .from('folders')
            .select('id')
            .eq('id', input.folder_id)
            .single();

        if (!folder) {
            return { success: false, error: 'Selected folder not found' };
        }

        // Generate unique certificate code using hybrid strategy (time-prefixed + random)
        // This virtually eliminates collisions between certificates created in different minutes
        let certificateCode = generateCertificateCode({ strategy: 'hybrid', length: 12 });
        let attempts = 0;
        const maxAttempts = 5;

        // Verify uniqueness - in most cases, this loop won't execute at all
        // due to the time-based component making collisions extremely rare
        while (attempts < maxAttempts) {
            const { data: existing } = await supabase
                .from('certificates')
                .select('id')
                .eq('certificate_code', certificateCode)
                .single();

            if (!existing) break;

            // Regenerate with hybrid strategy
            certificateCode = generateCertificateCode({ strategy: 'hybrid', length: 12 });
            attempts++;
        }

        if (attempts >= maxAttempts) {
            return { success: false, error: 'Failed to generate unique certificate code' };
        }

        // Get template info for snapshot
        const { data: template } = await supabase
            .from('templates')
            .select('image_url')
            .eq('id', input.template_id)
            .single();

        // Create certificate record
        const { data, error } = await supabase
            .from('certificates')
            .insert({
                certificate_code: certificateCode,
                name: input.name,
                email: input.email,
                event_name: input.event_name,
                date_of_issue: input.date_of_issue || new Date().toISOString().split('T')[0],
                template_id: input.template_id,
                folder_id: input.folder_id,
                template_image_url: template?.image_url || null,
                is_valid: true,
                custom_fields: input.custom_fields || {},
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath('/admin');
        revalidatePath('/admin/certificates');

        return { success: true, certificate: data as Certificate };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

export async function getCertificates(): Promise<Certificate[]> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return [];
    }

    return data as Certificate[];
}

export async function getFolders(): Promise<Folder[]> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('folders')
        .select('*')
        .order('parent_id', { ascending: true, nullsFirst: true })
        .order('name', { ascending: true });

    if (error) {
        return [];
    }

    return data as Folder[];
}

export async function createFolder(input: CreateFolderInput): Promise<{
    success: boolean;
    folder?: Folder;
    error?: string;
}> {
    await requireAdminOrThrow();

    const name = input.name?.trim();
    if (!name) {
        return { success: false, error: 'Folder name is required' };
    }

    const supabase = await createClient();
    const parentId = input.parent_id || null;

    if (parentId) {
        const { data: parent } = await supabase
            .from('folders')
            .select('id')
            .eq('id', parentId)
            .single();

        if (!parent) {
            return { success: false, error: 'Parent folder not found' };
        }
    }

    const { data, error } = await supabase
        .from('folders')
        .insert({
            name,
            parent_id: parentId,
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'A folder with this name already exists in the selected location' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/admin/certificates');
    revalidatePath('/admin/certificates/create');
    revalidatePath('/admin/certificates/bulk');

    return { success: true, folder: data as Folder };
}

export async function getCertificate(id: string): Promise<Certificate | null> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('certificates')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        return null;
    }

    return data as Certificate;
}

export async function updateCertificateValidity(
    id: string,
    isValid: boolean
): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { error } = await supabase
        .from('certificates')
        .update({ is_valid: isValid })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/admin');
    revalidatePath('/admin/certificates');

    return { success: true };
}

export async function deleteCertificate(id: string): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    // Delete associated PDF from storage if exists
    const { data: cert } = await supabase
        .from('certificates')
        .select('pdf_url, pdf_object_path')
        .eq('id', id)
        .single();

    const { error } = await supabase
        .from('certificates')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.code==='23503'?'Certificate belongs to issuance history. Revoke it to preserve delivery records.':error.message };
    }

    const filePath = cert && getStoragePathFromCertificateUrl(cert.pdf_url,cert.pdf_object_path);
    if (filePath) await createAdminClient().storage.from('certificates').remove([filePath]);

    revalidatePath('/admin');
    revalidatePath('/admin/certificates');

    return { success: true };
}

export async function superDeleteFolderTarget(
    input: SuperDeleteFolderInput
): Promise<SuperDeleteFolderResult> {
    const adminUser = await requireAdminOrThrow();

    const folderId = input.folder_id?.trim();
    const password = input.password?.trim();
    const confirmationText = input.confirmation_text?.trim();

    if (!folderId) {
        return { success: false, error: 'Folder is required' };
    }

    if (!isSuperDeleteScope(input.scope)) {
        return { success: false, error: 'Invalid super delete scope' };
    }

    if (!password) {
        return { success: false, error: 'Admin password is required' };
    }

    const superDeleteRateLimit = await checkSuperDeleteRateLimit(`super-delete:${adminUser.id}`);
    if (!superDeleteRateLimit.allowed) {
        const retryAfterSeconds = superDeleteRateLimit.retryAfter;
        return {
            success: false,
            error: retryAfterSeconds
                ? `Too many Super Delete attempts. Try again in ${retryAfterSeconds} seconds.`
                : superDeleteRateLimit.message || 'Too many Super Delete attempts. Please try again later.',
        };
    }

    const email = adminUser.email;
    if (!email) {
        return { success: false, error: 'Unable to validate admin credentials' };
    }

    const supabase = await createClient();

    const { data: targetFolder, error: targetFolderError } = await supabase
        .from('folders')
        .select('id, name, parent_id')
        .eq('id', folderId)
        .single();

    if (targetFolderError || !targetFolder) {
        return { success: false, error: 'Folder not found' };
    }

    const expectedConfirmationText = `DELETE ${targetFolder.name}`;
    if (!confirmationText || confirmationText !== expectedConfirmationText) {
        return {
            success: false,
            error: `Type exactly \"${expectedConfirmationText}\" to confirm this action`,
        };
    }

    const passwordVerification = await verifyAdminPassword(email, password, adminUser.id);
    if (!passwordVerification.ok) {
        return { success: false, error: passwordVerification.error };
    }

    let targetFolderIds = [folderId];

    if (
        input.scope === 'delete_folder_tree' ||
        input.scope === 'delete_subtree_certificates_keep_folders'
    ) {
        const { data: folderRows, error: folderTreeError } = await supabase
            .from('folders')
            .select('id, parent_id');

        if (folderTreeError) {
            return { success: false, error: 'Failed to load folder hierarchy' };
        }

        targetFolderIds = collectDescendantFolderIds(folderId, (folderRows || []) as FolderTreeNode[]);
    }

    const { data: certificatesToDelete, error: certificatesFetchError } = await supabase
        .from('certificates')
        .select('id, pdf_url, pdf_object_path')
        .in('folder_id', targetFolderIds);

    if (certificatesFetchError) {
        return { success: false, error: 'Failed to load certificates for deletion' };
    }

    const certificateIds = (certificatesToDelete || []).map((certificate) => certificate.id);
    if (certificateIds.length > 0) {
        const { error: certificateDeleteError } = await supabase
            .from('certificates')
            .delete()
            .in('id', certificateIds);

        if (certificateDeleteError) {
            return { success: false, error: 'Failed to delete certificates' };
        }
    }

    let deletedFolders = 0;
    if (input.scope === 'delete_folder_tree') {
        const { error: folderDeleteError } = await supabase
            .from('folders')
            .delete()
            .eq('id', folderId);

        if (folderDeleteError) {
            return { success: false, error: 'Failed to delete folder tree' };
        }

        deletedFolders = targetFolderIds.length;
    }

    const storagePaths = (certificatesToDelete || [])
        .map((certificate) => getStoragePathFromCertificateUrl(certificate.pdf_url, certificate.pdf_object_path))
        .filter((path): path is string => Boolean(path));

    let storageCleanupFailures = 0;
    if (storagePaths.length > 0) {
        const adminClient = createAdminClient();
        const storagePathChunks = chunkArray(storagePaths, 100);

        for (const chunk of storagePathChunks) {
            const { error: storageError } = await adminClient.storage
                .from('certificates')
                .remove(chunk);

            if (storageError) {
                storageCleanupFailures += chunk.length;
            }
        }
    }

    revalidatePath('/admin');
    revalidatePath('/admin/certificates');
    revalidatePath('/admin/certificates/create');
    revalidatePath('/admin/certificates/bulk');

    return {
        success: true,
        summary: {
            scope: input.scope,
            folderName: targetFolder.name,
            deletedCertificates: certificateIds.length,
            deletedFolders,
            storageCleanupFailures,
        },
    };
}

export async function updateCertificatePdfUrl(
    id: string,
    pdfUrl: string
): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { error } = await supabase
        .from('certificates')
        .update({ pdf_url: pdfUrl })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/admin/certificates');

    return { success: true };
}

export async function markEmailSent(id: string): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const {data:certificate,error:certificateError}=await supabase.from('certificates').select('email').eq('id',id).single();
    if(certificateError||!certificate)return {success:false,error:'Certificate not found'};
    const {data:attempt,error}=await supabase.from('email_attempts').select('id').eq('certificate_id',id).eq('recipient_email',certificate.email).in('outcome',['accepted_by_provider','delivered']).limit(1).maybeSingle();
    if(error||!attempt)return {success:false,error:'No durable provider acceptance exists for this recipient'};
    // The worker records acceptance and the compatibility flag in the same transaction.
    // This legacy action may confirm evidence; it may not manufacture a send outcome.

    revalidatePath('/admin/certificates');

    return { success: true };
}
