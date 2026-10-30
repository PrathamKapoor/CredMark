/**
 * Font Registration Helper
 * 
 * Utility functions to upload OTF/TTF fonts and register them in templates.
 * This can be used to:
 * 1. Upload a single font file for a template
 * 2. Register a font file with a template
 * 3. Help diagnose and fix font mapping issues
 */

'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrThrow } from '@/lib/auth/admin';
import type { Template } from '@/lib/types/database';

interface FontUploadResult {
    success: boolean;
    fontName?: string;
    url?: string;
    templateUpdated?: boolean;
    error?: string;
}

/**
 * Validate font file magic bytes to ensure it's a valid OTF/TTF file
 */
function validateFontFileMagic(buffer: Buffer): boolean {
    // OpenType (CFF/OTF): "OTTO" magic bytes
    const isOTF =
        buffer.length >= 4 &&
        buffer[0] === 0x4f &&
        buffer[1] === 0x54 &&
        buffer[2] === 0x54 &&
        buffer[3] === 0x4f;

    // TrueType (TTF): 0x00010000 or "true" header
    const isTTF =
        (buffer.length >= 4 &&
            buffer[0] === 0x00 &&
            buffer[1] === 0x01 &&
            buffer[2] === 0x00 &&
            buffer[3] === 0x00) ||
        (buffer.length >= 4 &&
            buffer[0] === 0x74 &&
            buffer[1] === 0x72 &&
            buffer[2] === 0x75 &&
            buffer[3] === 0x65);

    return isOTF || isTTF;
}

/**
 * Get file extension based on magic bytes
 */
function getExtensionFromMagic(buffer: Buffer): 'otf' | 'ttf' | null {
    // OpenType (OTF)
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x4f &&
        buffer[1] === 0x54 &&
        buffer[2] === 0x54 &&
        buffer[3] === 0x4f
    ) {
        return 'otf';
    }

    // TrueType (TTF)
    if (
        (buffer.length >= 4 &&
            buffer[0] === 0x00 &&
            buffer[1] === 0x01 &&
            buffer[2] === 0x00 &&
            buffer[3] === 0x00) ||
        (buffer.length >= 4 &&
            buffer[0] === 0x74 &&
            buffer[1] === 0x72 &&
            buffer[2] === 0x75 &&
            buffer[3] === 0x65)
    ) {
        return 'ttf';
    }

    return null;
}

/**
 * Upload a font file and register it with a template
 * 
 * @param templateId - The template ID to register the font with
 * @param fontFileBuffer - The font file buffer (OTF/TTF)
 * @param fontName - The display name for the font (e.g., "Norwester")
 * @returns Upload result with URL and status
 */
export async function registerFontWithTemplate(
    templateId: string,
    fontFileBuffer: Buffer,
    fontName: string
): Promise<FontUploadResult> {
    try {
        await requireAdminOrThrow();

        // Validate inputs
        if (!templateId || !fontFileBuffer || !fontName) {
            return {
                success: false,
                error: 'Missing required parameters: templateId, fontFileBuffer, fontName'
            };
        }

        if (fontFileBuffer.length === 0) {
            return { success: false, error: 'Font file is empty' };
        }

        if (fontFileBuffer.length > 5 * 1024 * 1024) {
            return { success: false, error: 'Font file exceeds 5MB limit' };
        }

        // Validate font file format
        if (!validateFontFileMagic(fontFileBuffer)) {
            return {
                success: false,
                error: 'Invalid font file. Must be a valid OTF or TTF file.'
            };
        }

        const ext = getExtensionFromMagic(fontFileBuffer);
        if (!ext) {
            return { success: false, error: 'Could not determine font file type' };
        }

        // Prepare filename
        const slug = fontName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const fileName = `fonts/${slug || 'font'}_${Date.now()}.${ext}`;

        console.log(`[Font Registration] Uploading font "${fontName}" as "${fileName}"`);

        // Upload to Supabase Storage
        const adminClient = createAdminClient();
        const { data, error: uploadError } = await adminClient.storage
            .from('templates')
            .upload(fileName, fontFileBuffer, {
                contentType: ext === 'otf' ? 'font/otf' : 'font/ttf',
                upsert: false,
            });

        if (uploadError) {
            console.error(`[Font Registration] ✗ Upload error:`, uploadError);
            return { success: false, error: `Upload failed: ${uploadError.message}` };
        }

        // Get public URL
        const { data: { publicUrl } } = adminClient.storage
            .from('templates')
            .getPublicUrl(data.path);

        console.log(`[Font Registration] ✓ Font uploaded: ${publicUrl}`);

        // Update template's custom_font_files
        const { data: template, error: templateFetchError } = await adminClient
            .from('templates')
            .select('custom_font_files, custom_fonts')
            .eq('id', templateId)
            .single();

        if (templateFetchError || !template) {
            console.error(`[Font Registration] ✗ Template fetch error:`, templateFetchError);
            return {
                success: false,
                error: `Template not found: ${templateFetchError?.message || 'Unknown'}`
            };
        }

        // Prepare updated font files mapping
        const customFontFiles = template.custom_font_files || {};
        const customFonts = template.custom_fonts || [];

        // Add/update the font mapping
        customFontFiles[fontName] = publicUrl;

        // Also add to custom_fonts if not already there
        if (!customFonts.includes(fontName)) {
            customFonts.push(fontName);
        }

        // Update template
        const { error: updateError } = await adminClient
            .from('templates')
            .update({
                custom_font_files: customFontFiles,
                custom_fonts: customFonts
            })
            .eq('id', templateId);

        if (updateError) {
            console.error(`[Font Registration] ✗ Update error:`, updateError);
            return {
                success: false,
                error: `Failed to update template: ${updateError.message}`
            };
        }

        console.log(`[Font Registration] ✓ Template updated successfully`);
        console.log(`[Font Registration] custom_font_files:`, customFontFiles);

        return {
            success: true,
            fontName,
            url: publicUrl,
            templateUpdated: true
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Font Registration] ✗ Error:`, msg);
        return { success: false, error: msg };
    }
}

/**
 * Fix orphaned fonts - add missing URL mappings for fonts in custom_fonts array
 * This helps recover from situations where fonts were added but not properly uploaded
 * 
 * @param templateId - The template ID to fix
 * @param fontToUrlMap - Map of font names to their URLs
 * @returns Result indicating success or failure
 */
export async function fixOrphanedFonts(
    templateId: string,
    fontToUrlMap: Record<string, string>
): Promise<{ success: boolean; error?: string; updated?: number }> {
    try {
        await requireAdminOrThrow();

        const adminClient = createAdminClient();

        // Get current template
        const { data: template, error: fetchError } = await adminClient
            .from('templates')
            .select('custom_font_files, custom_fonts')
            .eq('id', templateId)
            .single();

        if (fetchError || !template) {
            return { success: false, error: `Template not found: ${fetchError?.message}` };
        }

        const customFontFiles = template.custom_font_files || {};
        const customFonts = template.custom_fonts || [];

        // Merge new URLs into custom_font_files
        let updated = 0;
        for (const [fontName, url] of Object.entries(fontToUrlMap)) {
            if (!customFontFiles[fontName]) {
                customFontFiles[fontName] = url;
                updated++;
            }
            if (!customFonts.includes(fontName)) {
                customFonts.push(fontName);
            }
        }

        if (updated === 0) {
            return { success: true, updated: 0 };
        }

        // Update template
        const { error: updateError } = await adminClient
            .from('templates')
            .update({
                custom_font_files: customFontFiles,
                custom_fonts: customFonts
            })
            .eq('id', templateId);

        if (updateError) {
            return { success: false, error: `Update failed: ${updateError.message}` };
        }

        return { success: true, updated };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}

/**
 * Diagnose font issues for a template
 */
export async function diagnoseFontIssues(templateId: string): Promise<{
    success: boolean;
    template?: Template;
    orphanedFonts?: string[];
    issues?: string[];
    recommendations?: string[];
}> {
    try {
        await requireAdminOrThrow();

        const adminClient = createAdminClient();

        // Get template
        const { data: template, error } = await adminClient
            .from('templates')
            .select('*')
            .eq('id', templateId)
            .single();

        if (error || !template) {
            return {
                success: false,
                issues: ['Template not found']
            };
        }

        const customFonts = (template as Template).custom_fonts || [];
        const customFontFiles = (template as Template).custom_font_files || {};

        const issues: string[] = [];
        const recommendations: string[] = [];
        const orphanedFonts: string[] = [];

        // Check for orphaned fonts (in custom_fonts but not in custom_font_files)
        for (const fontName of customFonts) {
            if (!customFontFiles[fontName]) {
                orphanedFonts.push(fontName);
                issues.push(`Font "${fontName}" is in custom_fonts but has no URL in custom_font_files`);
            }
        }

        // Check for empty custom_font_files
        if (Object.keys(customFontFiles).length === 0) {
            issues.push('No custom fonts have been uploaded yet');
            recommendations.push('Use the template editor to upload OTF/TTF font files');
        }

        // Provide recommendations
        if (orphanedFonts.length > 0) {
            recommendations.push(
                `Fix ${orphanedFonts.length} orphaned font(s) by uploading OTF/TTF files or programmatically registering URLs`
            );
        }

        return {
            success: true,
            template: template as Template,
            orphanedFonts,
            issues: issues.length > 0 ? issues : undefined,
            recommendations: recommendations.length > 0 ? recommendations : undefined
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            issues: [msg]
        };
    }
}
