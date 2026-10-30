'use server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateManualPdf } from '@/lib/issuance/service';
import { certificateObjectPath } from '@/lib/verification/public';
import { revalidatePath } from 'next/cache';
import { requireAdminOrThrow } from '@/lib/auth/admin';
interface GeneratePdfResult {success:boolean;pdfUrl?:string;error?:string}
export async function generateAndStorePdf(certificateId:string, regenerate=false):Promise<GeneratePdfResult> {
 try {await requireAdminOrThrow();const result=await generateManualPdf(certificateId,regenerate);revalidatePath('/admin/certificates');return {success:true,...result};}
 catch(error){return {success:false,error:error instanceof Error?error.message:'PDF generation failed'};}
}
export async function generatePdfBytes(certificateId:string):Promise<{success:boolean;pdfBytes?:Uint8Array;fileName?:string;error?:string}> {
 try {
  await requireAdminOrThrow(); await generateManualPdf(certificateId);
  const db=createAdminClient(); const {data,error}=await db.from('certificates').select('certificate_code,pdf_object_path,pdf_url,is_valid').eq('id',certificateId).single();
  if(error || !data || !data.is_valid) throw new Error('Certificate not found or revoked');
  const path=certificateObjectPath(data,process.env.NEXT_PUBLIC_SUPABASE_URL || '');if(!path) throw new Error('PDF object unavailable');
  const {data:pdf,error:downloadError}=await db.storage.from('certificates').download(path);if(downloadError || !pdf) throw new Error('PDF download failed');
  return {success:true,pdfBytes:new Uint8Array(await pdf.arrayBuffer()),fileName:`${data.certificate_code}.pdf`};
 }catch(error){return {success:false,error:error instanceof Error?error.message:'PDF generation failed'};}
}
export interface BulkPdfResult {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    results: Array<{
        certificateId: string;
        certificateCode: string;
        name: string;
        success: boolean;
        skipped?: boolean;
        error?: string;
    }>;
}

/**
 * Generate PDFs for multiple certificates in bulk
 * @param certificateIds - Array of certificate IDs to generate PDFs for
 * @param skipExisting - If true, skip certificates that already have PDFs
 */
export async function generateBulkPdfs(
    certificateIds: string[],
    skipExisting: boolean = true
): Promise<{ success: boolean; result?: BulkPdfResult; error?: string }> {
    try {
        await requireAdminOrThrow();

        const supabase = await createClient();

        // Fetch all certificates in one query
        const { data: certificates, error: fetchError } = await supabase
            .from('certificates')
            .select('id, certificate_code, name, template_id, pdf_url, pdf_object_path')
            .in('id', certificateIds);

        if (fetchError) {
            return { success: false, error: fetchError.message };
        }

        if (!certificates || certificates.length === 0) {
            return { success: false, error: 'No certificates found' };
        }

        const results: BulkPdfResult['results'] = [];
        let successful = 0;
        let failed = 0;
        let skipped = 0;

        // Process each certificate
        for (const cert of certificates) {
            // Skip if already has PDF and skipExisting is true
            if (skipExisting && (cert.pdf_object_path || cert.pdf_url)) {
                results.push({
                    certificateId: cert.id,
                    certificateCode: cert.certificate_code,
                    name: cert.name,
                    success: true,
                    skipped: true
                });
                skipped++;
                continue;
            }

            // Skip if no template
            if (!cert.template_id) {
                results.push({
                    certificateId: cert.id,
                    certificateCode: cert.certificate_code,
                    name: cert.name,
                    success: false,
                    error: 'No template assigned'
                });
                failed++;
                continue;
            }

            // Generate PDF
            const pdfResult = await generateAndStorePdf(cert.id, !skipExisting);

            if (pdfResult.success) {
                results.push({
                    certificateId: cert.id,
                    certificateCode: cert.certificate_code,
                    name: cert.name,
                    success: true
                });
                successful++;
            } else {
                results.push({
                    certificateId: cert.id,
                    certificateCode: cert.certificate_code,
                    name: cert.name,
                    success: false,
                    error: pdfResult.error
                });
                failed++;
            }
        }

        revalidatePath('/admin/certificates');

        return {
            success: true,
            result: {
                total: certificates.length,
                successful,
                failed,
                skipped,
                results
            }
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Bulk PDF generation failed'
        };
    }
}

/**
 * Get certificates that don't have PDFs generated yet
 */
export async function getCertificatesWithoutPdf(): Promise<{
    success: boolean;
    certificates?: Array<{ id: string; certificate_code: string; name: string }>;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('certificates')
            .select('id, certificate_code, name')
            .is('pdf_url', null)
            .is('pdf_object_path', null)
            .eq('is_valid', true)
            .not('template_id', 'is', null);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true, certificates: data || [] };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch certificates'
        };
    }
}
