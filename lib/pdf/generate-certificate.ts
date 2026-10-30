import sharp from 'sharp';
import { PDFDocument, degrees, rgb, StandardFonts, PDFPage, Color, PDFFont, PDFName, PDFArray, PDFString } from 'pdf-lib';
import type { Template, Certificate } from '@/lib/types/database';
import { buildVerificationUrl } from '@/lib/utils/certificate-code';
import { fetchSafeTemplateImage, validateCertificateLinkUrl } from '@/lib/utils/safe-url';
import { createAdminClient } from '@/lib/supabase/admin';
import fontkit from '@pdf-lib/fontkit';

interface GenerateCertificatePdfParams {
    certificate: Certificate;
    template: Template;
    imageBytes?: Uint8Array;
    fontBytes?: Record<string, Uint8Array>;
    baseUrl?: string;
    strictFonts?: boolean;
}

interface PdfGenerationResult {
    pdfBytes: Uint8Array;
    fileName: string;
}

const debug = (...values: unknown[]) => { if (process.env.TRUEMARK_DEBUG_RENDERING === 'true') console.debug(...values); };

// Font URLs - Using TTF format which pdf-lib supports (NOT woff2)
// These are direct TTF downloads from GitHub repositories
const GOOGLE_FONT_URLS: Record<string, string> = {
    // Montserrat TTF from official Google Fonts GitHub
    'montserrat': 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Medium.ttf',
    'montserrat-bold': 'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf',
    // Inter TTF from official GitHub
    'inter': 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf',
    'inter-bold': 'https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.ttf',
};

// Map font family CSS values to internal font names
function getFontType(fontFamily: string): { name: string; isBold: boolean } {
    const lowerFont = fontFamily.toLowerCase();

    if (lowerFont.includes('montserrat')) {
        return { name: 'montserrat', isBold: false };
    }
    if (lowerFont.includes('inter')) {
        return { name: 'inter', isBold: false };
    }
    if (lowerFont.includes('georgia')) {
        return { name: 'georgia', isBold: false };
    }
    if (lowerFont.includes('times')) {
        return { name: 'times', isBold: false };
    }
    if (lowerFont.includes('arial')) {
        return { name: 'arial', isBold: false };
    }
    if (lowerFont.includes('verdana')) {
        return { name: 'verdana', isBold: false };
    }
    if (lowerFont.includes('courier')) {
        return { name: 'courier', isBold: false };
    }
    if (lowerFont.includes('serif') && !lowerFont.includes('sans')) {
        return { name: 'serif', isBold: false };
    }
    return { name: 'sans-serif', isBold: false };
}

// Cache for loaded fonts
const fontCache: Map<string, Uint8Array> = new Map();
const HEX_COLOR_REGEX = /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i;

/**
 * Fetch font bytes from a URL
 */
async function fetchFromUrl(url: string): Promise<Uint8Array | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }
        const buffer = await response.arrayBuffer();
        return new Uint8Array(buffer);
    } catch {
        return null;
    }
}

/**
 * Try to get a TTF URL for a Google Font by parsing the Google Fonts CSS API
 */
async function getGoogleFontTTFUrl(fontName: string, bold: boolean = false): Promise<string | null> {
    try {
        // Request TTF format (for pdf-lib compatibility)
        const weight = bold ? '700' : '400';
        const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@${weight}&display=swap`;

        // Fetch the CSS with a user agent that requests TTF
        const response = await fetch(cssUrl, {
            headers: {
                // Use a user agent that will return TTF URLs
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            return null;
        }

        const css = await response.text();

        // Extract the font URL from the CSS (look for woff2 or ttf)
        const urlMatch = css.match(/src:\s*url\(([^)]+)\)/);
        if (urlMatch) {
            const fontUrl = urlMatch[1].replace(/['"]/g, '');
            // Note: Google typically returns woff2, which pdf-lib doesn't support directly
            // We'll try a different approach - using fontsource or jsDelivr for TTF
            return fontUrl;
        }
    } catch {
        // Silently fail - will fall back to standard fonts
    }
    return null;
}

async function fetchFontBytes(fontName: string): Promise<Uint8Array | null> {
    // Check cache first
    if (fontCache.has(fontName)) {
        return fontCache.get(fontName)!;
    }

    // First try the predefined URLs
    const url = GOOGLE_FONT_URLS[fontName];

    if (url) {
        const bytes = await fetchFromUrl(url);
        if (bytes) {
            fontCache.set(fontName, bytes);
            return bytes;
        }
    }

    // For dynamic fonts, try using jsDelivr CDN which hosts font files
    // Format: https://cdn.jsdelivr.net/npm/@fontsource/{font-name}/files/{font-name}-latin-400-normal.woff
    // Unfortunately, woff isn't well supported by pdf-lib, so we need TTF

    // Try Google Fonts GitHub repository patterns
    const cleanName = fontName.replace('-bold', '').toLowerCase().replace(/\s+/g, '-');
    const isBold = fontName.includes('-bold');
    const weight = isBold ? 'Bold' : 'Regular';

    // Common Google Fonts TTF patterns on GitHub
    const possibleUrls = [
        // Google Fonts repository on GitHub
        `https://github.com/google/fonts/raw/main/ofl/${cleanName}/${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)}-${weight}.ttf`,
        `https://github.com/google/fonts/raw/main/apache/${cleanName}/${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)}-${weight}.ttf`,
    ];

    for (const tryUrl of possibleUrls) {
        const bytes = await fetchFromUrl(tryUrl);
        if (bytes) {
            fontCache.set(fontName, bytes);
            return bytes;
        }
    }

    return null;
}

async function fetchFontBytesFromUrl(url: string): Promise<Uint8Array | null> {
    const cacheKey = `url:${url}`;
    if (fontCache.has(cacheKey)) {
        return fontCache.get(cacheKey)!;
    }

    // Prefer direct storage download for Supabase template font URLs.
    const storagePath = extractTemplatesStoragePathFromUrl(url);
    if (storagePath) {
        debug(`[PDF Font Fetch] Using Supabase admin download for path: ${storagePath}`);
        try {
            const adminClient = createAdminClient();
            const { data, error } = await adminClient.storage
                .from('templates')
                .download(storagePath);

            if (error) {
                console.error(`[PDF Font Fetch] ✗ Supabase download error:`, error);
            } else if (data) {
                const bytes = new Uint8Array(await data.arrayBuffer());
                debug(`[PDF Font Fetch] ✓ Downloaded ${bytes.length} bytes from Supabase`);
                fontCache.set(cacheKey, bytes);
                return bytes;
            }
        } catch (error) {
            console.error(`[PDF Font Fetch] ✗ Exception during Supabase download:`, error);
        }
    }

    debug(`[PDF Font Fetch] Falling back to HTTP fetch for URL: [font URL]...`);
    const bytes = await fetchFromUrl(url);
    if (bytes) {
        debug(`[PDF Font Fetch] ✓ Downloaded ${bytes.length} bytes via HTTP`);
        fontCache.set(cacheKey, bytes);
    } else {
        console.warn(`[PDF Font Fetch] ✗ HTTP fetch failed for URL: [font URL]...`);
    }
    return bytes;
}

function extractTemplatesStoragePathFromUrl(url: string): string | null {
    try {
        const parsed = new URL(url);
        const publicMarker = '/storage/v1/object/public/templates/';
        const signMarker = '/storage/v1/object/sign/templates/';

        const pathName = parsed.pathname;
        if (pathName.includes(publicMarker)) {
            return decodeURIComponent(pathName.split(publicMarker)[1] ?? '');
        }

        if (pathName.includes(signMarker)) {
            return decodeURIComponent(pathName.split(signMarker)[1] ?? '');
        }

        return null;
    } catch {
        return null;
    }
}

function extractPrimaryFontFamily(fontFamily: string): string {
    return fontFamily
        .split(',')[0]
        .trim()
        .toLowerCase()
        .replace(/['"]/g, '');
}

function parseHexToPdfColor(value: string | null | undefined): Color {
    if (!value || !HEX_COLOR_REGEX.test(value.trim())) {
        return rgb(0, 0, 0);
    }

    const normalized = value.trim().toUpperCase();
    const expanded = normalized.length === 4
        ? `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`
        : normalized;

    const r = parseInt(expanded.slice(1, 3), 16) / 255;
    const g = parseInt(expanded.slice(3, 5), 16) / 255;
    const b = parseInt(expanded.slice(5, 7), 16) / 255;

    return rgb(r, g, b);
}

function findCustomFontUrl(
    customFontFiles: Record<string, string> | undefined,
    family: string
): string | null {
    if (!customFontFiles || Object.keys(customFontFiles).length === 0) {
        debug(`[PDF Font Match] No custom font files available`);
        return null;
    }

    const target = extractPrimaryFontFamily(family);
    debug(`[PDF Font Match] Looking for font: "${family}" → normalized to: "${target}"`);
    debug(`[PDF Font Match] Available stored keys:`, Object.keys(customFontFiles).map(k => `"${k.toLowerCase()}"`));
    
    // Try exact match first
    for (const [name, url] of Object.entries(customFontFiles)) {
        if (name && typeof url === 'string' && url.length > 0) {
            const normalizedName = name.trim().toLowerCase();
            debug(`[PDF Font Match]   Comparing "${target}" with "${normalizedName}" (exact)`);
            if (normalizedName === target) {
                debug(`[PDF Font Match] ✓ Found exact match: ${normalizedName}`);
                return url;
            }
        }
    }

    // Try partial match if exact match fails
    for (const [name, url] of Object.entries(customFontFiles)) {
        if (name && typeof url === 'string' && url.length > 0) {
            const normalizedName = name.trim().toLowerCase();
            // Check if the target is contained in the name or vice versa (for flexibility)
            if (normalizedName.includes(target) || target.includes(normalizedName)) {
                debug(`[PDF Font Match] ✓ Found partial match: "${normalizedName}" contains or is contained in "${target}"`);
                return url;
            }
        }
    }

    debug(`[PDF Font Match] ✗ No match found for "${target}"`);
    return null;
}

// Get or embed a font based on the font family string
async function getFont(
    pdfDoc: PDFDocument,
    fontFamily: string | null,
    isBold: boolean = false,
    embeddedFonts: Map<string, PDFFont>,
    customFontFiles?: Record<string, string>,
    strictFonts = false
): Promise<PDFFont> {
    const family = fontFamily || 'serif';
    const fontType = getFontType(family);
    const injected = embeddedFonts.get(`injected:${extractPrimaryFontFamily(family)}`);
    if (injected) return injected;
    if (strictFonts && findCustomFontUrl(customFontFiles, family)) throw new Error(`Frozen font bytes missing: ${family}`);
    const cacheKey = `${fontType.name}-${isBold ? 'bold' : 'regular'}`;

    // Check if already embedded
    if (embeddedFonts.has(cacheKey)) {
        return embeddedFonts.get(cacheKey)!;
    }

    // Log font loading information
    debug(`[PDF Font] Loading font: "${family}" (parsed as: ${fontType.name}), bold=${isBold}`);
    debug(`[PDF Font] Custom font files available:`, customFontFiles ? Object.keys(customFontFiles) : 'none');

    // First, try to find and use custom uploaded font
    const uploadedFontUrl = findCustomFontUrl(customFontFiles, family);
    if (uploadedFontUrl && !strictFonts) {
        const uploadedFontCacheKey = `uploaded:${extractPrimaryFontFamily(family)}-${isBold ? 'bold' : 'regular'}`;
        debug(`[PDF Font] Found custom font URL for "${family}": [uploaded font]`);
        
        if (embeddedFonts.has(uploadedFontCacheKey)) {
            debug(`[PDF Font] Using cached custom font: [uploaded font cache]`);
            return embeddedFonts.get(uploadedFontCacheKey)!;
        }

        const uploadedFontBytes = await fetchFontBytesFromUrl(uploadedFontUrl);
        if (uploadedFontBytes) {
            debug(`[PDF Font] Successfully fetched custom font bytes (${uploadedFontBytes.length} bytes)`);
            try {
                pdfDoc.registerFontkit(fontkit);
                const uploadedFont = await pdfDoc.embedFont(uploadedFontBytes);
                embeddedFonts.set(uploadedFontCacheKey, uploadedFont);
                debug(`[PDF Font] ✓ Successfully embedded custom font: ${family}`);
                return uploadedFont;
            } catch (error) {
                // Log detailed error for debugging
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.error(`[PDF Font] ✗ Failed to embed custom font from [uploaded font]:`, errorMsg);
                
                // Check if it's a file format issue
                if (errorMsg.includes('not a valid') || errorMsg.includes('invalid')) {
                    console.error(`[PDF Font] ✗ The font file may be corrupted or in an unsupported format`);
                }
            }
        } else {
            console.warn(`[PDF Font] ✗ Failed to fetch custom font bytes from [uploaded font]`);
        }
    } else {
        debug(`[PDF Font] No custom font URL found for "${family}"`);
    }

    // Try to embed custom font (known fonts: Montserrat, Inter)
    if (!strictFonts && (fontType.name === 'montserrat' || fontType.name === 'inter')) {
        const fontKey = isBold ? `${fontType.name}-bold` : fontType.name;
        const fontBytes = await fetchFontBytes(fontKey);

        if (fontBytes) {
            try {
                pdfDoc.registerFontkit(fontkit);
                const customFont = await pdfDoc.embedFont(fontBytes);
                embeddedFonts.set(cacheKey, customFont);
                return customFont;
            } catch {
                // Failed to embed font, will fall back to standard fonts
            }
        }
    }

    // Try to extract and load custom font name from font-family string
    // e.g., "Roboto, sans-serif" -> "roboto"
    const customFontName = extractPrimaryFontFamily(family);
    if (!strictFonts && !['serif', 'sans-serif', 'monospace', 'georgia', 'times', 'times new roman', 'arial', 'verdana', 'courier', 'courier new', 'montserrat', 'inter'].includes(customFontName)) {
        const fontKey = isBold ? `${customFontName}-bold` : customFontName;
        const fontBytes = await fetchFontBytes(fontKey);

        if (fontBytes) {
            try {
                pdfDoc.registerFontkit(fontkit);
                const customFont = await pdfDoc.embedFont(fontBytes);
                embeddedFonts.set(cacheKey, customFont);
                return customFont;
            } catch {
            }
        }
    }

    // Fall back to standard PDF fonts
    let standardFont: StandardFonts;
    let fontDisplayName: string;

    switch (fontType.name) {
        case 'serif':
        case 'georgia':
        case 'times':
            standardFont = isBold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
            fontDisplayName = `Times Roman${isBold ? ' Bold' : ''}`;
            break;
        case 'courier':
            standardFont = isBold ? StandardFonts.CourierBold : StandardFonts.Courier;
            fontDisplayName = `Courier${isBold ? ' Bold' : ''}`;
            break;
        case 'sans-serif':
        case 'arial':
        case 'verdana':
        default:
            standardFont = isBold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
            fontDisplayName = `Helvetica${isBold ? ' Bold' : ''}`;
            break;
    }

    debug(`[PDF Font] ⚠ Falling back to standard font: ${fontDisplayName}`);
    const font = await pdfDoc.embedFont(standardFont);
    embeddedFonts.set(cacheKey, font);
    return font;
}

/**
 * Generate a certificate PDF with the template image as background,
 * recipient name overlay, and invisible clickable verification link.
 */
export async function generateCertificatePdf({
    certificate,
    template,
    imageBytes: suppliedImageBytes,
    fontBytes: suppliedFontBytes = {},
    baseUrl,
    strictFonts = false,
}: GenerateCertificatePdfParams): Promise<PdfGenerationResult> {
    debug(`[PDF Gen] Starting PDF generation for certificate: ${certificate.id}`);
    debug(`[PDF Gen] Template: ${template.name}, ID: ${template.id}`);
    debug(`[PDF Gen] Custom font files in template:`, template.custom_font_files ? Object.keys(template.custom_font_files) : 'none');
    debug(`[PDF Gen] Custom fonts list:`, template.custom_fonts || 'none');
    
    // Diagnose font mapping issues
    if (template.custom_fonts && template.custom_fonts.length > 0) {
        const customFontFiles = template.custom_font_files || {};
        const orphanedFonts = template.custom_fonts.filter(
            font => !customFontFiles[font]
        );
        
        if (orphanedFonts.length > 0) {
            console.warn(`[PDF Gen] ⚠ WARNING: Found ${orphanedFonts.length} orphaned font(s) without URL mappings: ${orphanedFonts.join(', ')}`);
            console.warn(`[PDF Gen] ℹ These fonts are listed in custom_fonts but have no corresponding entries in custom_font_files.`);
            console.warn(`[PDF Gen] ℹ To fix: Upload OTF/TTF files for these fonts via the template editor.`);
        }
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const timestamp = new Date(certificate.created_at);
    if (Number.isNaN(timestamp.getTime())) throw new Error("Certificate creation timestamp is invalid");
    pdfDoc.setCreationDate(timestamp);
    pdfDoc.setModificationDate(timestamp);

    // Font embedding cache
    const embeddedFonts = new Map<string, PDFFont>();
    for (const [family, bytes] of Object.entries(suppliedFontBytes)) {
        pdfDoc.registerFontkit(fontkit);
        const font = await pdfDoc.embedFont(bytes);
        embeddedFonts.set(`injected:${extractPrimaryFontFamily(family)}`, font);
    }

    // Fetch the template image
    let imageBytes = suppliedImageBytes;
    if (!imageBytes) {
        const response = await fetchSafeTemplateImage(template.image_url);
        if (!response.ok) throw new Error(`Failed to fetch template image (status ${response.status}).`);
        imageBytes = new Uint8Array(await response.arrayBuffer());
    }
    // Decode by content, including WebP uploads, rather than guessing from URLs.
    const pngBytes = await sharp(Buffer.from(imageBytes)).png().toBuffer();
    const embeddedImage = await pdfDoc.embedPng(pngBytes);

    // Get image dimensions
    const imageWidth = embeddedImage.width;
    const imageHeight = embeddedImage.height;

    // Create a page with the same dimensions as the template image
    // Using 72 DPI for PDF (standard), so we use pixel dimensions directly
    const page = pdfDoc.addPage([imageWidth, imageHeight]);

    // Draw the template image as background (full page)
    page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imageWidth,
        height: imageHeight,
    });

    // Calculate scale factor if template dimensions differ from actual image
    const scaleX = imageWidth / template.image_width;
    const scaleY = imageHeight / template.image_height;

    // Helper function to convert template coordinates to PDF coordinates
    // PDF Y-axis is from bottom, template Y is from top
    const toPdfCoords = (x: number, y: number) => ({
        x: x * scaleX,
        y: imageHeight - (y * scaleY), // Flip Y-axis
    });

    // Get font for name (usually bold for recipient name)
    debug(`[PDF Gen] Loading name font: "${template.name_font_family}"`);
    const nameFont = await getFont(
        pdfDoc,
        template.name_font_family,
        template.name_bold ?? true,
        embeddedFonts,
        template.custom_font_files, strictFonts
    );

    // Draw recipient name
    drawTextWithAlignment({
        page,
        font: nameFont,
        text: certificate.name,
        x: template.name_x * scaleX,
        y: imageHeight - (template.name_y * scaleY),
        fontSize: template.name_font_size * Math.min(scaleX, scaleY),
        alignment: template.name_alignment,
        pageWidth: imageWidth,
        color: parseHexToPdfColor(template.name_color),
        italic: template.name_italic ?? false,
        underline: template.name_underline ?? false,
    });

    // Draw event name if coordinates are set
    if (template.event_x !== null && template.event_y !== null) {
        const eventFont = await getFont(
            pdfDoc,
            template.event_font_family,
            template.event_bold ?? false,
            embeddedFonts,
            template.custom_font_files, strictFonts
        );
        const fontSize = (template.event_font_size || 24) * Math.min(scaleX, scaleY);
        drawTextWithAlignment({
            page,
            font: eventFont,
            text: certificate.event_name,
            x: template.event_x * scaleX,
            y: imageHeight - (template.event_y * scaleY),
            fontSize,
            alignment: template.event_alignment || 'center',
            pageWidth: imageWidth,
            color: parseHexToPdfColor(template.event_color),
            italic: template.event_italic ?? false,
        underline: template.event_underline ?? false,
        });
    }

    // Draw date if coordinates are set
    if (template.date_x !== null && template.date_y !== null) {
        const dateFont = await getFont(
            pdfDoc,
            template.date_font_family,
            template.date_bold ?? false,
            embeddedFonts,
            template.custom_font_files, strictFonts
        );
        const fontSize = (template.date_font_size || 18) * Math.min(scaleX, scaleY);
        const dateStr = new Date(certificate.date_of_issue).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: 'UTC',
        });
        drawTextWithAlignment({
            page,
            font: dateFont,
            text: dateStr,
            x: template.date_x * scaleX,
            y: imageHeight - (template.date_y * scaleY),
            fontSize,
            alignment: template.date_alignment || 'center',
            pageWidth: imageWidth,
            color: parseHexToPdfColor(template.date_color),
            italic: template.date_italic ?? false,
        underline: template.date_underline ?? false,
        });
    }

    // Draw custom placeholders
    if (template.placeholders && template.placeholders.length > 0) {
        for (const placeholder of template.placeholders) {
            const customValue = certificate.custom_fields?.[placeholder.key] || '';
            
            if (!customValue) continue; // Skip empty custom fields
            
            const customFont = await getFont(
                pdfDoc,
                placeholder.fontFamily,
                placeholder.bold,
                embeddedFonts,
                template.custom_font_files, strictFonts
            );
            const fontSize = placeholder.fontSize * Math.min(scaleX, scaleY);
            
            if (placeholder.isLink) {
                // Validate the URL before using it as a link annotation
                let validatedUrl: string;
                try {
                    validatedUrl = await validateCertificateLinkUrl(customValue);
                } catch (error) {
                    // Skip creating link annotation if URL validation fails
                    // Still render the text, just without the link
                    console.warn(`Invalid certificate link URL for placeholder "${placeholder.key}": ${error instanceof Error ? error.message : 'Unknown error'}`);
                    
                    drawTextWithAlignment({
                        page,
                        font: customFont,
                        text: customValue,
                        x: placeholder.x * scaleX,
                        y: imageHeight - (placeholder.y * scaleY),
                        fontSize,
                        alignment: placeholder.alignment,
                        pageWidth: imageWidth,
                        color: parseHexToPdfColor(placeholder.color),
                        italic: placeholder.italic,
                        underline: placeholder.underline,
                    });
                    continue;
                }

                // Render as link placeholder
                const linkAnnotation = pdfDoc.context.obj({
                    Type: 'Annot',
                    Subtype: 'Link',
                    Rect: [
                        placeholder.x * scaleX - (placeholder.width * scaleX) / 2,
                        imageHeight - (placeholder.y * scaleY) - (placeholder.height * scaleY) / 2,
                        placeholder.x * scaleX + (placeholder.width * scaleX) / 2,
                        imageHeight - (placeholder.y * scaleY) + (placeholder.height * scaleY) / 2,
                    ],
                    Border: [0, 0, 0],
                    F: 4,
                    A: {
                        Type: 'Action',
                        S: 'URI',
                        URI: PDFString.of(validatedUrl),
                    },
                });

                const linkAnnotRef = pdfDoc.context.register(linkAnnotation);
                const annotsKey = PDFName.of('Annots');
                const existingAnnots = page.node.get(annotsKey);

                if (existingAnnots instanceof PDFArray) {
                    existingAnnots.push(linkAnnotRef);
                } else {
                    page.node.set(annotsKey, pdfDoc.context.obj([linkAnnotRef]));
                }
            }
            
            drawTextWithAlignment({
                page,
                font: customFont,
                text: customValue,
                x: placeholder.x * scaleX,
                y: imageHeight - (placeholder.y * scaleY),
                fontSize,
                alignment: placeholder.alignment,
                pageWidth: imageWidth,
                color: parseHexToPdfColor(placeholder.color),
                italic: placeholder.italic,
                        underline: placeholder.underline,
            });
        }
    }

    // Add invisible clickable verification link
    const verificationUrl = baseUrl ? `${baseUrl.replace(/\/$/, '')}/verify/${certificate.certificate_code}` : buildVerificationUrl(certificate.certificate_code);
    const linkCoords = toPdfCoords(template.link_x, template.link_y);
    const linkWidth = template.link_width * scaleX;
    const linkHeight = template.link_height * scaleY;

    // Calculate Rect boundaries (Centered on X and Y)
    const linkLeft = linkCoords.x - linkWidth / 2;
    const linkRight = linkCoords.x + linkWidth / 2;
    const linkBottom = linkCoords.y - linkHeight / 2;
    const linkTop = linkCoords.y + linkHeight / 2;

    // Create a link annotation (invisible but clickable)

    const linkAnnotation = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [linkLeft, linkBottom, linkRight, linkTop],
        Border: [0, 0, 0], // No visible border
        F: 4, // Print flag - annotation should be printed
        A: {
            Type: 'Action',
            S: 'URI',
            URI: PDFString.of(verificationUrl),
        },
    });

    // Register the annotation object
    const linkAnnotRef = pdfDoc.context.register(linkAnnotation);

    // Add annotation to page using PDFName
    const annotsKey = PDFName.of('Annots');
    const existingAnnots = page.node.get(annotsKey);

    if (existingAnnots instanceof PDFArray) {
        existingAnnots.push(linkAnnotRef);
    } else {
        page.node.set(annotsKey, pdfDoc.context.obj([linkAnnotRef]));
    }

    // Draw the verification URL text
    const linkFont = await getFont(
        pdfDoc,
        template.link_font_family,
        template.link_bold ?? false,
        embeddedFonts,
        template.custom_font_files, strictFonts
    );
    const linkFontSize = (template.link_font_size || 12) * Math.min(scaleX, scaleY);
    const urlText = verificationUrl;

    let textAnchorX = linkCoords.x;
    if (template.link_alignment === 'left') textAnchorX = linkLeft;
    if (template.link_alignment === 'right') textAnchorX = linkRight;

    drawTextWithAlignment({
        page,
        font: linkFont,
        text: urlText,
        x: textAnchorX,
        y: linkCoords.y,
        fontSize: linkFontSize,
        alignment: template.link_alignment || 'center',
        pageWidth: imageWidth,
        color: parseHexToPdfColor(template.link_color),
        italic: template.link_italic ?? false,
        underline: template.link_underline ?? true,
    });

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    
    // Create folder structure: event-name/certificate-code.pdf
    // Sanitize event name to be folder-safe (replace spaces with hyphens, remove special chars)
    const sanitizedEventName = certificate.event_name
        .toLowerCase()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/[^a-z0-9\-_]/g, '') // Remove special characters except hyphen and underscore
        .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
    
    const fileName = `${sanitizedEventName}/${certificate.certificate_code}.pdf`;

    return {
        pdfBytes,
        fileName,
    };
}

/**
 * Draw text with specified alignment relative to the anchor point
 */
function drawTextWithAlignment({
    page,
    font,
    text,
    x,
    y,
    fontSize,
    alignment,
    pageWidth,
    color,
    italic = false,
    underline = false,
}: {
    page: PDFPage;
    font: PDFFont;
    text: string;
    x: number;
    y: number;
    fontSize: number;
    alignment: 'left' | 'center' | 'right';
    pageWidth: number;
    color?: Color;
    italic?: boolean;
    underline?: boolean;
}) {
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let drawX: number;

    switch (alignment) {
        case 'left':
            drawX = x;
            break;
        case 'center':
            drawX = x - textWidth / 2;
            break;
        case 'right':
            drawX = x - textWidth;
            break;
        default:
            drawX = x - textWidth / 2;
    }

    // Ensure text doesn't go off the page
    drawX = Math.max(10, Math.min(drawX, pageWidth - textWidth - 10));

    const textY = y - fontSize / 2;

    // Draw the text
    // Shear preserves the baseline and works with embedded fonts as well as built-ins.
    page.drawText(text, {
        x: drawX,
        y: textY,
        size: fontSize,
        font,
        color: color || rgb(0, 0, 0),
        xSkew: degrees(italic ? 12 : 0),
    });

    // Draw underline if enabled
    if (underline) {
        const underlineY = textY - 2;
        page.drawLine({
            start: { x: drawX, y: underlineY },
            end: { x: drawX + textWidth, y: underlineY },
            thickness: Math.max(1, fontSize / 20),
            color: color || rgb(0, 0, 0),
        });
    }
}
