/**
 * Action to check template font status and help users fix orphaned fonts
 */

'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminOrThrow } from '@/lib/auth/admin';
import type { Template } from '@/lib/types/database';

export interface FontStatusResult {
    success: boolean;
    template?: Template;
    hasOrphanedFonts: boolean;
    orphanedFonts: string[];
    registeredFonts: Record<string, string>;
    totalFonts: number;
    recommendations: string[];
    error?: string;
}

/**
 * Get the current font status for a template
 * Shows which fonts are properly registered and which are orphaned
 */
export async function getTemplateFontStatus(templateId: string): Promise<FontStatusResult> {
    try {
        await requireAdminOrThrow();

        const supabase = await createClient();
        const { data: template, error } = await supabase
            .from('templates')
            .select('*')
            .eq('id', templateId)
            .single();

        if (error || !template) {
            return {
                success: false,
                hasOrphanedFonts: false,
                orphanedFonts: [],
                registeredFonts: {},
                totalFonts: 0,
                recommendations: [],
                error: `Template not found: ${error?.message}`
            };
        }

        const customFonts = (template as Template).custom_fonts || [];
        const customFontFiles = (template as Template).custom_font_files || {};

        // Find orphaned fonts
        const orphanedFonts = customFonts.filter((font: string) => !customFontFiles[font]);

        // Get registered fonts
        const registeredFonts: Record<string, string> = {};
        for (const [name, url] of Object.entries(customFontFiles)) {
            if (typeof url === 'string' && url.length > 0) {
                registeredFonts[name] = url;
            }
        }

        const recommendations: string[] = [];

        if (orphanedFonts.length > 0) {
            recommendations.push(
                `Upload OTF/TTF files for: ${orphanedFonts.join(', ')}`
            );
            recommendations.push(
                `Use the template editor's "Add Font Family" and "Upload OTF/TTF" section to register fonts`
            );
        }

        if (Object.keys(registeredFonts).length === 0 && customFonts.length === 0) {
            recommendations.push(`No custom fonts configured. Add fonts via the template editor to customize certificate styling.`);
        }

        return {
            success: true,
            template: template as Template,
            hasOrphanedFonts: orphanedFonts.length > 0,
            orphanedFonts,
            registeredFonts,
            totalFonts: customFonts.length,
            recommendations
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            hasOrphanedFonts: false,
            orphanedFonts: [],
            registeredFonts: {},
            totalFonts: 0,
            recommendations: [],
            error: msg
        };
    }
}

/**
 * Manually register a font URL with a template
 * This is useful if the file is already uploaded to Supabase Storage
 */
export async function registerFontUrl(
    templateId: string,
    fontName: string,
    fontUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await requireAdminOrThrow();

        if (!templateId || !fontName || !fontUrl) {
            return { success: false, error: 'Missing required parameters' };
        }

        const adminClient = createAdminClient();

        // Get template
        const { data: template, error: fetchError } = await adminClient
            .from('templates')
            .select('custom_font_files, custom_fonts')
            .eq('id', templateId)
            .single();

        if (fetchError || !template) {
            return { success: false, error: `Template not found: ${fetchError?.message}` };
        }

        // Update font file mapping
        const customFontFiles = template.custom_font_files || {};
        customFontFiles[fontName] = fontUrl;

        // Ensure font is in custom_fonts list
        const customFonts = template.custom_fonts || [];
        if (!customFonts.includes(fontName)) {
            customFonts.push(fontName);
        }

        // Save
        const { error: updateError } = await adminClient
            .from('templates')
            .update({
                custom_font_files: customFontFiles,
                custom_fonts: customFonts
            })
            .eq('id', templateId);

        if (updateError) {
            return { success: false, error: `Failed to update template: ${updateError.message}` };
        }

        console.log(`[Font Registration] Registered font "${fontName}" with URL: ${fontUrl}`);
        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}

/**
 * Remove a font from the template
 */
export async function removeFontFromTemplate(
    templateId: string,
    fontName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await requireAdminOrThrow();

        const adminClient = createAdminClient();

        // Get template
        const { data: template, error: fetchError } = await adminClient
            .from('templates')
            .select('custom_font_files, custom_fonts')
            .eq('id', templateId)
            .single();

        if (fetchError || !template) {
            return { success: false, error: `Template not found: ${fetchError?.message}` };
        }

        // Remove from both maps
        const customFontFiles = { ...template.custom_font_files };
        const customFonts = (template.custom_fonts || []).filter((f: string) => f !== fontName);
        delete customFontFiles[fontName];

        // Save
        const { error: updateError } = await adminClient
            .from('templates')
            .update({
                custom_font_files: customFontFiles,
                custom_fonts: customFonts
            })
            .eq('id', templateId);

        if (updateError) {
            return { success: false, error: `Failed to update template: ${updateError.message}` };
        }

        return { success: true };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}
