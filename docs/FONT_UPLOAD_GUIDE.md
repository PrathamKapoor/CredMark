# Font Upload and Registration Guide for TrueMark

## Quick Summary - Your Issue

Your template has font names in the `custom_fonts` array ('norwester', 'norwester.regular'), but **no corresponding OTF/TTF files have been uploaded** - the `custom_font_files` mapping is empty. When the PDF generator tries to use these fonts, it can't find them and falls back to Helvetica.

## Solution: Upload Your OTF Font Files

### Option 1: Upload Via Template Editor (Recommended)

This is the easiest way and doesn't require any coding.

1. **Go to Admin → Templates**
   - Find and open "Inceptio-26"

2. **Scroll to Font Management Section**
   - Look for "Add Font Family:" with inputs for:
     - Font Name (text field)
     - Font File (file picker)
     - Buttons: "Upload OTF/TTF" and "Add & Upload"

3. **Upload Your Norwester Font File**
   - Click file picker
   - Select your `norwester.otf` or `norwester.ttf` file
   - Font name should auto-populate as "Norwester"
   - Click **"Upload OTF/TTF"** button

4. **Wait for Upload to Complete**
   - Button text changes to "Uploading..." while processing
   - Success message appears after ~2-3 seconds
   - Font appears in the custom fonts list below

5. **Verify in Template Settings**
   - Save the template (click Save Template button)
   - Font should appear in the "Name Font Family" dropdown
   - Use it for certificate text rendering

---

### Option 2: Programmatic Upload (For Developers)

If you need to upload fonts programmatically:

```bash
# Option 2a: Using the provided font registration helper

# 1. Create a simple script to upload font:
import fs from 'fs';
import { registerFontWithTemplate } from '@/lib/utils/font-registration-helper';

// Load your OTF file
const fontBuffer = fs.readFileSync('./norwester.otf');

// Register it with the template
const result = await registerFontWithTemplate(
    'a5787add-ce71-4d57-b1e6-a99b998b6450', // Template ID
    fontBuffer,
    'Norwester' // Font display name
);

console.log(result);
// Output: { success: true, fontName: 'Norwester', url: '...' }
```

```typescript
// Option 2b: Using the font management action

import { registerFontUrl } from '@/app/actions/font-management';

// If you already have the OTF file uploaded to Supabase Storage:
const result = await registerFontUrl(
    'a5787add-ce71-4d57-b1e6-a99b998b6450', // Template ID
    'Norwester',                              // Font display name
    'https://supabase.../fonts/norwester.otf' // Public URL
);
```

---

## Technical Details: How Font Registration Works

### Data Structure

```typescript
// templates table in Supabase
{
  id: UUID,
  name: 'Inceptio-26',
  custom_fonts: ['Norwester', 'Garamond'],           // Array of font names
  custom_font_files: {
    'Norwester': 'https://storage.url/fonts/...',   // Name → URL mapping
    'Garamond': 'https://storage.url/fonts/...'
  }
}
```

### Upload Flow

```
📄 OTF File (local)
    ↓
✅ Validation (magic bytes, size < 5MB)
    ↓
☁️  Supabase Storage (templates bucket/fonts/)
    ↓
🔗 Get Public URL
    ↓
💾 Save to custom_font_files: { "FontName": "URL" }
    ↓
✨ PDF can now find and embed the font
```

---

## Diagnosing Your Font Issues

### Check Current Status

Use this action to see what's registered:

```typescript
import { getTemplateFontStatus } from '@/app/actions/font-management';

const status = await getTemplateFontStatus('a5787add-ce71-4d57-b1e6-a99b998b6450');
​
console.log(status);
// Output:
// {
//   success: true,
//   hasOrphanedFonts: true,
//   orphanedFonts: ['norwester', 'norwester.regular'],
//   registeredFonts: {},
//   totalFonts: 2,
//   recommendations: [
//     'Upload OTF/TTF files for: norwester, norwester.regular',
//     'Use the template editor to register fonts'
//   ]
// }
```

### PDF Generation Logs

When generating PDFs, check server logs for diagnostics:

```
[PDF Gen] Custom font files in template: []
[PDF Gen] Custom fonts list: [ 'norwester.regular', 'norwester' ]
[PDF Gen] ⚠ WARNING: Found 2 orphaned font(s) without URL mappings
[PDF Font] No custom font URL found for "norwester, sans-serif"
[PDF Font] ⚠ Falling back to standard font: Helvetica Bold
```

This indicates:
- ✗ Fonts are named but not uploaded
- ✗ No URLs in `custom_font_files`
- ✗ PDF falls back to Helvetica

---

## Step-by-Step Fix Process

### 1️⃣ Gather Your Font Files
- Locate your Norwester OTF file
- Ensure it's valid (can open in font viewer)
- Note the file size (must be < 5MB)

### 2️⃣ Upload Via UI (Option 1 - Easiest)
- Open template editor
- Go to Font section
- Click file picker, select OTF
- Click "Upload OTF/TTF"
- Wait for success

### 3️⃣ Verify Registration
- Run `getTemplateFontStatus()` 
- Check that `orphanedFonts` is now empty
- Confirm `registeredFonts` has the font name and URL

### 4️⃣ Update Template to Use Font
- In template editor, set **Name Font Family** to "Norwester"
- Save template

### 5️⃣ Test PDF Generation
- Create a test certificate
- Verify font renders correctly in PDF
- Check logs for success messages

---

## Fixing Existing Orphaned Fonts

If you have fonts in `custom_fonts` but no URLs:

### Method A: Clear and Re-upload
```typescript
import { removeFontFromTemplate } from '@/app/actions/font-management';

// Remove orphaned fonts
await removeFontFromTemplate(templateId, 'norwester');
await removeFontFromTemplate(templateId, 'norwester.regular');

// Then upload the correct ones via UI
```

### Method B: Register Existing URLs
If the OTF files are already in Supabase Storage:
```typescript
import { registerFontUrl } from '@/app/actions/font-management';

await registerFontUrl(
    templateId,
    'Norwester',
    'https://supabase.../fonts/norwester_1234567890.otf'
);
```

---

## Font File Requirements

### Supported Formats
- ✅ **OTF** (OpenType with CFF outlines)
  - Magic bytes: `4F 54 54 4F` ("OTTO")
  - Extension: `.otf`
  - MIME: `font/otf`, `application/x-font-otf`

- ✅ **TTF** (TrueType)
  - Magic bytes: `00 01 00 00` or `74 72 75 65` ("true")
  - Extension: `.ttf`
  - MIME: `font/ttf`, `application/font-sfnt`

### Size Limits
- **Maximum**: 5 MB per font file
- **Recommended**: < 1 MB (OTF fonts are typically 200KB-500KB)

### What Gets Validated
- ✅ File magic bytes (ensures it's really a font)
- ✅ File size check
- ✅ Font name length (2-80 characters)
- ✅ File extension

---

## Common Issues and Solutions

### Issue: Upload fails silently
**Solution:**
- Check file size (must be < 5MB)
- Verify it's a real OTF/TTF file
- Check browser console for errors
- Try with a different font file

### Issue: Font appears in list but doesn't render
**Solution:**
- Verify `custom_font_files` has the URL (check database)
- Ensure font name in template matches registered name
- Check PDF logs for "No custom font URL found"
- Try removing and re-uploading

### Issue: PDF still uses Helvetica after registration
**Solution:**
- Verify font name in template matches registered name exactly  (case-insensitive but spelling matters)
- Check that `custom_font_files` in database has the font
- Check PDF logs for matching attempts
- Regenerate PDF (may be cached)

### Issue: "Font file is too large"
**Solution:**
- OTF/TTF must be < 5MB
- Optimize font with tools like fonttools or FontForge
- Check file isn't corrupted
- Try a different font file

---

## For Developers: Direct Database Access

If you need to directly update the database:

```sql
-- Check current status
SELECT id, name, custom_fonts, custom_font_files 
FROM templates 
WHERE id = 'a5787add-ce71-4d57-b1e6-a99b998b6450';

-- Manually register a font (if URL is known)
UPDATE templates
SET custom_font_files = jsonb_set(
    custom_font_files, 
    '{"Norwester"}', 
    '"https://storage.url/fonts/norwester.otf"'
)
WHERE id = 'a5787add-ce71-4d57-b1e6-a99b998b6450';

-- Clear all fonts
UPDATE templates
SET custom_fonts = '{}', custom_font_files = '{}'::jsonb
WHERE id = 'a5787add-ce71-4d57-b1e6-a99b998b6450';
```

---

## Related Files

- **Font upload handler**: `app/actions/templates.ts` → `uploadTemplateFont()`
- **Font management**: `app/actions/font-management.ts` (new)
- **PDF generation**: `lib/pdf/generate-certificate.ts` → `generateCertificatePdf()`
- **Font registration helper**: `lib/utils/font-registration-helper.ts` (new)
- **Template schema**: `supabase/schema.sql`
- **UI component**: `app/admin/templates/[id]/EditTemplateForm.tsx`

---

## Next Steps

1. **Immediate**: Upload your Norwester OTF via the template editor
2. **Verify**: Check that PDF generation now uses the custom font
3. **Test**: Create a test certificate and verify in PDF
4. **Deploy**: Your template should now render with custom fonts!

Need help? Check the logs or run `getTemplateFontStatus()` to diagnose issues.
