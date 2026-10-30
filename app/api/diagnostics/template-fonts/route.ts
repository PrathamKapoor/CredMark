import type { Template } from '@/lib/types/database';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/auth/roles';

/**
 * API endpoint for diagnosing font issues in templates
 * GET /api/diagnostics/template-fonts?templateId=<id>
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Verify authentication
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        if (!isAdminUser(user)) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            );
        }

        // Get template ID from query params
        const templateId = request.nextUrl.searchParams.get('templateId');
        if (!templateId) {
            return NextResponse.json(
                { error: 'Missing templateId parameter' },
                { status: 400 }
            );
        }

        // Fetch template
        const { data: template, error } = await supabase
            .from('templates')
            .select('*')
            .eq('id', templateId)
            .single();

        if (error || !template) {
            return NextResponse.json(
                { error: `Template not found: ${error?.message}` },
                { status: 404 }
            );
        }

        // Analyze font status
        const customFonts = (template as Template).custom_fonts || [];
        const customFontFiles = (template as Template).custom_font_files || {};

        const orphanedFonts = customFonts.filter(
            (font: string) => !customFontFiles[font]
        );

        const registeredFonts: Record<string, { url: string; status: string }> = {};
        for (const [name, url] of Object.entries(customFontFiles)) {
            if (typeof url === 'string' && url.length > 0) {
                registeredFonts[name] = {
                    url,
                    status: 'registered'
                };
            }
        }

        const analysis = {
            templateId: template.id,
            templateName: template.name,
            timestamp: new Date().toISOString(),
            
            // Font summary
            totalFontsListed: customFonts.length,
            totalFontsRegistered: Object.keys(registeredFonts).length,
            hasOrphanedFonts: orphanedFonts.length > 0,
            
            // Details
            orphanedFonts: orphanedFonts,
            registeredFonts: registeredFonts,
            allCustomFonts: customFonts,
            rawCustomFontFiles: customFontFiles,
            
            // Diagnostics
            issues: [] as string[],
            recommendations: [] as string[],
            healthStatus: 'ok' as 'ok' | 'warning' | 'critical'
        };

        // Add issues and recommendations
        if (orphanedFonts.length > 0) {
            analysis.healthStatus = 'warning';
            analysis.issues.push(
                `${orphanedFonts.length} font(s) listed but not registered: ${orphanedFonts.join(', ')}`
            );
            analysis.recommendations.push(
                'Upload OTF/TTF files for orphaned fonts via template editor'
            );
            analysis.recommendations.push(
                'Use Admin → Templates → Edit → Font Management section'
            );
        }

        if (customFonts.length === 0) {
            analysis.issues.push('No custom fonts configured');
            analysis.recommendations.push(
                'Add fonts via template editor if you want to use custom typefaces'
            );
        }

        if (customFontFiles && Object.keys(customFontFiles).length > 0) {
            // Check if any registered fonts aren't in the font list
            const unlistedFonts = Object.keys(customFontFiles).filter(
                name => !customFonts.includes(name)
            );
            if (unlistedFonts.length > 0) {
                analysis.healthStatus = 'warning';
                analysis.issues.push(
                    `${unlistedFonts.length} font URL(s) registered but not listed: ${unlistedFonts.join(', ')}`
                );
                analysis.recommendations.push(
                    'Consider removing unlisted fonts or adding them to the font list'
                );
            }
        }

        return NextResponse.json(analysis, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[Font Diagnostics API] Error:', message);

        return NextResponse.json(
            {
                error: 'Diagnostic failed',
                message: message
            },
            { status: 500 }
        );
    }
}
