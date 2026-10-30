'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import type { Template, CreateTemplateInput } from '@/lib/types/database';
import { requireAdminOrThrow } from '@/lib/auth/admin';
import { assertSafeTemplateImageUrl } from '@/lib/utils/safe-url';
import sharp from 'sharp';

const MAX_TEMPLATE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEMPLATE_IMAGE_WIDTH = 10000;
const MAX_TEMPLATE_IMAGE_HEIGHT = 10000;
const MAX_TEMPLATE_FONT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

const ALLOWED_FONT_MIME_TYPES = new Set([
    'font/otf',
    'font/ttf',
    'application/font-sfnt',
    'application/x-font-otf',
    'application/x-font-ttf',
]);

const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;
const DEFAULT_TEXT_COLOR = '#000000';

function normalizeHexColor(value: string | null | undefined): string {
    if (!value) {
        return DEFAULT_TEXT_COLOR;
    }

    const normalized = value.trim();
    if (!HEX_COLOR_REGEX.test(normalized)) {
        return DEFAULT_TEXT_COLOR;
    }

    const upper = normalized.toUpperCase();
    if (upper.length === 4) {
        return `#${upper[1]}${upper[1]}${upper[2]}${upper[2]}${upper[3]}${upper[3]}`;
    }

    return upper;
}

function normalizePlaceholderColors(placeholders: CreateTemplateInput['placeholders']) {
    if (!placeholders || !Array.isArray(placeholders)) {
        return [];
    }

    return placeholders.map((placeholder) => ({
        ...placeholder,
        color: normalizeHexColor(placeholder.color),
    }));
}

function detectMimeTypeFromMagicBytes(buffer: Buffer): string | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }

    if (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47 &&
        buffer[4] === 0x0d &&
        buffer[5] === 0x0a &&
        buffer[6] === 0x1a &&
        buffer[7] === 0x0a
    ) {
        return 'image/png';
    }

    if (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
    ) {
        return 'image/webp';
    }

    return null;
}

function detectFontMimeTypeFromMagicBytes(buffer: Buffer): string | null {
    // OpenType (CFF): "OTTO"
    if (
        buffer.length >= 4 &&
        buffer[0] === 0x4f &&
        buffer[1] === 0x54 &&
        buffer[2] === 0x54 &&
        buffer[3] === 0x4f
    ) {
        return 'font/otf';
    }

    // TrueType: 0x00010000 or "true"
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
        return 'font/ttf';
    }

    return null;
}

function getExtensionForMimeType(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg';
        case 'image/png':
            return 'png';
        case 'image/webp':
            return 'webp';
        default:
            return 'bin';
    }
}

function getFontExtensionForMimeType(mimeType: string): string {
    switch (mimeType) {
        case 'font/otf':
        case 'application/x-font-otf':
            return 'otf';
        case 'font/ttf':
        case 'application/font-sfnt':
        case 'application/x-font-ttf':
            return 'ttf';
        default:
            return 'bin';
    }
}

function getExtensionFromFileName(fileName: string): string | null {
    const idx = fileName.lastIndexOf('.');
    if (idx <= -1 || idx === fileName.length - 1) {
        return null;
    }

    return fileName.slice(idx + 1).toLowerCase();
}

function extractTemplatesStoragePath(publicUrl: string): string | null {
    try {
        const url = new URL(publicUrl);
        const marker = '/storage/v1/object/public/templates/';
        const markerIndex = url.pathname.indexOf(marker);
        if (markerIndex === -1) {
            return null;
        }
        return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    } catch {
        return null;
    }
}

export async function getTemplates(): Promise<Template[]> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        return [];
    }

    return data as Template[];
}

export async function getTemplate(id: string): Promise<Template | null> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const { data, error } = await supabase
        .from('templates')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        return null;
    }

    return data as Template;
}

export async function createTemplate(input: CreateTemplateInput): Promise<{
    success: boolean;
    template?: Template;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        if (!input.image_url || input.image_url.startsWith('blob:')) {
            return {
                success: false,
                error: 'Template image upload failed. Please upload the image again before saving.'
            };
        }

        let safeImageUrl: string;
        try {
            safeImageUrl = await assertSafeTemplateImageUrl(input.image_url);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Template image URL is invalid.'
            };
        }

        const supabase = await createClient();

        const { data, error } = await supabase
            .from('templates')
            .insert({
                name: input.name,
                image_url: safeImageUrl,
                link_x: input.link_x ?? 0,
                link_y: input.link_y ?? 0,
                link_width: input.link_width ?? 200,
                link_height: input.link_height ?? 30,
                link_font_size: input.link_font_size ?? 12,
                link_alignment: input.link_alignment ?? 'center',
                link_font_family: input.link_font_family ?? 'sans-serif',
                link_color: normalizeHexColor(input.link_color),
                link_bold: input.link_bold ?? false,
                link_italic: input.link_italic ?? false,
                link_underline: input.link_underline ?? true,
                name_x: input.name_x ?? 0,
                name_y: input.name_y ?? 0,
                name_width: input.name_width ?? 600,
                name_height: input.name_height ?? 80,
                name_font_size: input.name_font_size ?? 48,
                name_alignment: input.name_alignment ?? 'center',
                name_font_family: input.name_font_family ?? 'serif',
                name_color: normalizeHexColor(input.name_color),
                name_bold: input.name_bold ?? true,
                name_italic: input.name_italic ?? false,
                name_underline: input.name_underline ?? false,
                event_x: input.event_x ?? null,
                event_y: input.event_y ?? null,
                event_width: input.event_width ?? 400,
                event_height: input.event_height ?? 60,
                event_font_size: input.event_font_size ?? 24,
                event_alignment: input.event_alignment ?? 'center',
                event_font_family: input.event_font_family ?? 'sans-serif',
                event_color: normalizeHexColor(input.event_color),
                event_bold: input.event_bold ?? false,
                event_italic: input.event_italic ?? false,
                event_underline: input.event_underline ?? false,
                date_x: input.date_x ?? null,
                date_y: input.date_y ?? null,
                date_width: input.date_width ?? 300,
                date_height: input.date_height ?? 40,
                date_font_size: input.date_font_size ?? 18,
                date_alignment: input.date_alignment ?? 'center',
                date_font_family: input.date_font_family ?? 'sans-serif',
                date_color: normalizeHexColor(input.date_color),
                date_bold: input.date_bold ?? false,
                date_italic: input.date_italic ?? false,
                date_underline: input.date_underline ?? false,
                image_width: input.image_width ?? 1920,
                image_height: input.image_height ?? 1080,
                custom_fonts: input.custom_fonts ?? [],
                custom_font_files: input.custom_font_files ?? {},
                placeholders: normalizePlaceholderColors(input.placeholders),
            })
            .select()
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath('/admin/templates');

        return { success: true, template: data as Template };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

export async function updateTemplate(
    id: string,
    input: Partial<CreateTemplateInput>
): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    const updatePayload: Partial<CreateTemplateInput> = { ...input };

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'link_color')) {
        updatePayload.link_color = normalizeHexColor(updatePayload.link_color);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'name_color')) {
        updatePayload.name_color = normalizeHexColor(updatePayload.name_color);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'event_color')) {
        updatePayload.event_color = normalizeHexColor(updatePayload.event_color);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'date_color')) {
        updatePayload.date_color = normalizeHexColor(updatePayload.date_color);
    }

    if (Object.prototype.hasOwnProperty.call(updatePayload, 'placeholders')) {
        updatePayload.placeholders = normalizePlaceholderColors(updatePayload.placeholders);
    }

    console.log(`[Update Template] Template ID: ${id}`);
    console.log(`[Update Template] Input keys: ${Object.keys(updatePayload).join(', ')}`);
    console.log(`[Update Template] custom_font_files in payload:`, updatePayload.custom_font_files ? Object.keys(updatePayload.custom_font_files) : 'not included');
    if (updatePayload.custom_font_files) {
        console.log(`[Update Template] Uploaded font mapping updated`);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'image_url')) {
        const imageUrl = input.image_url;
        if (!imageUrl || imageUrl.startsWith('blob:')) {
            return {
                success: false,
                error: 'Template image upload failed. Please upload the image again before saving.'
            };
        }

        try {
            updatePayload.image_url = await assertSafeTemplateImageUrl(imageUrl);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Template image URL is invalid.'
            };
        }
    }

    const { error } = await supabase
        .from('templates')
        .update(updatePayload)
        .eq('id', id);

    if (error) {
        console.error(`[Update Template] Error updating template:`, error);
        return { success: false, error: error.message };
    }

    console.log(`[Update Template] ✓ Template updated successfully`);
    revalidatePath('/admin/templates');

    return { success: true };
}

export async function uploadTemplateFont(formData: FormData): Promise<{
    success: boolean;
    fontName?: string;
    url?: string;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        const file = formData.get('file') as File;
        const rawFontName = formData.get('fontName');

        if (!file) {
            return { success: false, error: 'No font file provided.' };
        }

        if (typeof rawFontName !== 'string' || !rawFontName.trim()) {
            return { success: false, error: 'Font name is required.' };
        }

        const fontName = rawFontName.trim().replace(/\s+/g, ' ');

        if (fontName.length < 2 || fontName.length > 80) {
            return {
                success: false,
                error: 'Font name must be between 2 and 80 characters.'
            };
        }

        if (file.size > MAX_TEMPLATE_FONT_SIZE_BYTES) {
            return {
                success: false,
                error: `Font file is too large. Maximum allowed size is ${Math.floor(MAX_TEMPLATE_FONT_SIZE_BYTES / (1024 * 1024))}MB.`
            };
        }

        const extension = getExtensionFromFileName(file.name);
        const extensionAllowed = extension === 'otf' || extension === 'ttf';

        if (!ALLOWED_FONT_MIME_TYPES.has(file.type) && !extensionAllowed) {
            return {
                success: false,
                error: 'Unsupported font type. Allowed formats: OTF, TTF.'
            };
        }

        const adminClient = createAdminClient();

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const detectedMimeType = detectFontMimeTypeFromMagicBytes(buffer);
        if (!detectedMimeType) {
            return {
                success: false,
                error: 'Invalid font file signature. Upload a valid OTF or TTF font.'
            };
        }

        const ext = getFontExtensionForMimeType(detectedMimeType);
        const slug = fontName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const fileName = `fonts/${slug || 'custom-font'}_${Date.now()}.${ext}`;

        const { data, error } = await adminClient.storage
            .from('templates')
            .upload(fileName, buffer, {
                contentType: detectedMimeType,
                upsert: false,
            });

        if (error) {
            return { success: false, error: error.message };
        }

        const { data: { publicUrl } } = adminClient.storage
            .from('templates')
            .getPublicUrl(data.path);

        return {
            success: true,
            fontName,
            url: publicUrl,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Font upload failed'
        };
    }
}

export async function deleteTemplate(id: string): Promise<{ success: boolean; error?: string }> {
    await requireAdminOrThrow();

    const supabase = await createClient();

    // Get template to delete associated assets
    const { data: template } = await supabase
        .from('templates')
        .select('image_url, custom_font_files')
        .eq('id', id)
        .single();

    // Delete uploaded template assets from storage when possible.
    if (template) {
        const adminClient = createAdminClient();
        const pathsToDelete = new Set<string>();

        const imagePath = extractTemplatesStoragePath(template.image_url);
        if (imagePath) {
            pathsToDelete.add(imagePath);
        }

        const customFontFiles = (template.custom_font_files ?? {}) as Record<string, string>;
        for (const url of Object.values(customFontFiles)) {
            const fontPath = extractTemplatesStoragePath(url);
            if (fontPath) {
                pathsToDelete.add(fontPath);
            }
        }

        if (pathsToDelete.size > 0) {
            await adminClient.storage.from('templates').remove([...pathsToDelete]);
        }
    }

    const { error } = await supabase
        .from('templates')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    revalidatePath('/admin/templates');

    return { success: true };
}

export async function uploadTemplateImage(formData: FormData): Promise<{
    success: boolean;
    url?: string;
    width?: number;
    height?: number;
    error?: string;
}> {
    try {
        await requireAdminOrThrow();

        const file = formData.get('file') as File;

        if (!file) {
            return { success: false, error: 'No file provided' };
        }

        if (file.size > MAX_TEMPLATE_IMAGE_SIZE_BYTES) {
            return {
                success: false,
                error: `File is too large. Maximum allowed size is ${Math.floor(MAX_TEMPLATE_IMAGE_SIZE_BYTES / (1024 * 1024))}MB.`
            };
        }

        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
            return {
                success: false,
                error: 'Unsupported image type. Allowed formats: JPEG, PNG, WEBP.'
            };
        }

        const adminClient = createAdminClient();

        // Convert to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const detectedMimeType = detectMimeTypeFromMagicBytes(buffer);
        if (!detectedMimeType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
            return {
                success: false,
                error: 'Invalid image file signature. Upload a valid JPEG, PNG, or WEBP image.'
            };
        }

        if (detectedMimeType !== file.type) {
            return {
                success: false,
                error: 'Uploaded file type does not match file content.'
            };
        }

        const metadata = await sharp(buffer).metadata();
        if (!metadata.width || !metadata.height) {
            return {
                success: false,
                error: 'Could not read image dimensions. Please upload a valid image.'
            };
        }

        if (metadata.width > MAX_TEMPLATE_IMAGE_WIDTH || metadata.height > MAX_TEMPLATE_IMAGE_HEIGHT) {
            return {
                success: false,
                error: `Image dimensions are too large. Maximum allowed is ${MAX_TEMPLATE_IMAGE_WIDTH}x${MAX_TEMPLATE_IMAGE_HEIGHT}.`
            };
        }

        // Generate unique filename from verified MIME type
        const ext = getExtensionForMimeType(detectedMimeType);
        const fileName = `template_${Date.now()}.${ext}`;

        // Upload to Supabase storage
        const { data, error } = await adminClient.storage
            .from('templates')
            .upload(fileName, buffer, {
                contentType: detectedMimeType,
                upsert: false,
            });

        if (error) {
            return { success: false, error: error.message };
        }

        // Get public URL
        const { data: { publicUrl } } = adminClient.storage
            .from('templates')
            .getPublicUrl(data.path);

        return {
            success: true,
            url: publicUrl,
            width: metadata.width,
            height: metadata.height,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed'
        };
    }
}
