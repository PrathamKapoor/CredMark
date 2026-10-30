# Template Custom Fonts - Complete Analysis

## 1. ACTUAL DATABASE STRUCTURE

### Database Schema (Supabase PostgreSQL)
**Table:** `templates`

Key columns relevant to custom fonts:

```sql
CREATE TABLE templates (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    
    -- Font styling fields (for 4 text areas)
    name_font_family TEXT,
    name_font_size INTEGER,
    name_bold BOOLEAN,
    name_italic BOOLEAN,
    name_underline BOOLEAN,
    
    event_font_family TEXT,
    event_font_size INTEGER,
    event_bold BOOLEAN,
    event_italic BOOLEAN,
    event_underline BOOLEAN,
    
    date_font_family TEXT,
    date_font_size INTEGER,
    date_bold BOOLEAN,
    date_italic BOOLEAN,
    date_underline BOOLEAN,
    
    link_font_family TEXT,
    link_bold BOOLEAN,
    link_italic BOOLEAN,
    link_underline BOOLEAN,
    
    -- CUSTOM FONTS STORAGE:
    custom_fonts JSONB,                          -- Array of Google Font names
    custom_font_files JSONB NOT NULL DEFAULT '{}' -- MAPPED FONTS (font name → public URL)
    
    -- Other fields...
    image_width INTEGER,
    image_height INTEGER,
    placeholders JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
```

**Critical Column:** `custom_font_files` 
- Type: JSONB (JSON binary)
- Default: Empty object `{}`
- Structure: `{ "Font Name": "https://storage.url/fonts/font.ttf" }`

### TypeScript Type Definition

See [lib/types/database.ts](lib/types/database.ts#L30-L31) and [lib/types/database.ts](lib/types/database.ts#L136):

```typescript
export interface Template {
    // ... other fields ...
    custom_fonts: string[];                        // Array of font names
    custom_font_files?: Record<string, string>;   // Font name → URL mapping
}
```

---

## 2. CUSTOM_FONT_FILES POPULATION & FLOW

### A. How Custom Fonts Get Into Database

**Entry Point:** [app/actions/templates.ts - uploadTemplateFont()](app/actions/templates.ts#L314-L400)

1. **User uploads font file (OTF/TTF)**
   ```
   FormData: { file: Font.ttf, fontName: "My Font" }
   ```

2. **Validation:**
   - File size max: 5 MB
   - Allowed types: OTF, TTF
   - Magic byte verification (file signature check)

3. **Upload to Storage:**
   ```typescript
   const fileName = `fonts/${slug || 'custom-font'}_${Date.now()}.${ext}`;
   
   adminClient.storage
       .from('templates')
       .upload(fileName, buffer, { contentType, upsert: false })
   ```
   - Stored in Supabase Storage under `/templates/fonts/` directory
   - Returns public URL

4. **Response:**
   ```json
   {
       "success": true,
       "fontName": "My Font",
       "url": "https://xxxx.supabase.co/storage/v1/object/public/templates/fonts/my-font_1234567890.ttf"
   }
   ```

### B. How custom_font_files Gets Saved

**Function:** [app/actions/templates.ts - createTemplate() & updateTemplate()](app/actions/templates.ts#L185-L240)

**Create Template:**
```typescript
const { data, error } = await supabase
    .from('templates')
    .insert({
        name: input.name,
        custom_fonts: input.custom_fonts ?? [],
        custom_font_files: input.custom_font_files ?? {},    // ← Maps to JSONB column
        // ... other fields ...
    })
    .select()
    .single();
```

**Update Template:**
```typescript
const updatePayload = { ...input };
// Logs what's being updated:
console.log(`[Update Template] custom_font_files in payload:`, 
    updatePayload.custom_font_files ? Object.keys(updatePayload.custom_font_files) : 'not included');

await supabase
    .from('templates')
    .update(updatePayload)
    .eq('id', id);
```

### C. Expected Data Structure

When a template is saved with fonts, the database contains:

```json
{
    "id": "uuid-here",
    "name": "My Certificate",
    "custom_fonts": ["Montserrat", "Inter"],
    "custom_font_files": {
        "Montserrat": "https://xxxx.supabase.co/storage/v1/object/public/templates/fonts/montserrat_1711234567890.ttf",
        "Inter": "https://xxxx.supabase.co/storage/v1/object/public/templates/fonts/inter_1711234567891.ttf"
    }
}
```

---

## 3. CONSUMPTION: WHERE CUSTOM_FONT_FILES IS USED

### PDF Generation Pipeline

**File:** [lib/pdf/generate-certificate.ts](lib/pdf/generate-certificate.ts#L403)

**Flow:**
1. `generateCertificatePdf()` retrieves template with `custom_font_files`
2. Logs custom fonts available: `console.log('[PDF Gen] Custom font files in template:', ...)`
3. Calls `getFont()` function with `template.custom_font_files`
4. Font matching happens in `findCustomFontUrl()` function

**Font Matching Logic** [lib/pdf/generate-certificate.ts#L225-L260]:
- Normalizes font family names (lowercase, trim)
- Tries exact match first: `"Montserrat" === "montserrat"`
- Falls back to partial match: if name contains or is contained in target
- Returns URL if found, null if not

**Font Loading** [lib/pdf/generate-certificate.ts#L271-L360]:
1. Fetch font bytes from URL via `fetchFontBytesFromUrl()`
2. For Supabase URLs, uses admin client to download directly
3. Embeds font into PDF using PDF-lib + fontkit
4. Falls back to standard fonts (Times, Courier, Helvetica) if embedding fails

### Logging Points for Debugging

The code has comprehensive logging at multiple stages:

```
[Update Template] custom_font_files in payload: ['Montserrat', 'Inter']
[PDF Gen] Custom font files in template: ['Montserrat', 'Inter']
[PDF Gen] Custom fonts list: ['Montserrat', 'Inter']
[PDF Font] Loading font: "Montserrat"
[PDF Font Match] Looking for font: "Montserrat" → normalized to: "montserrat"
[PDF Font Match] ✓ Found exact match: montserrat
[PDF Font] Found custom font URL for "Montserrat": https://...
[PDF Font] Successfully fetched custom font bytes (28392 bytes)
[PDF Font] ✓ Successfully embedded custom font: Montserrat
```

---

## 4. HOW TO DIRECTLY QUERY & MODIFY TEMPLATE DATA

### A. Direct Database Queries (Supabase SQL Editor)

#### Query a single template with all custom fonts:
```sql
SELECT id, name, custom_fonts, custom_font_files
FROM templates
WHERE id = 'TEMPLATE-UUID-HERE';
```

#### Query all templates with custom fonts:
```sql
SELECT id, name, custom_fonts, custom_font_files, created_at
FROM templates
WHERE custom_font_files != '{}':jsonb
ORDER BY created_at DESC;
```

#### Check if custom_font_files is populated:
```sql
SELECT 
    id, 
    name,
    jsonb_array_length(custom_fonts) as font_count,
    jsonb_object_keys(custom_font_files) as mapped_font_names,
    custom_font_files
FROM templates
WHERE custom_font_files IS NOT NULL;
```

### B. Direct Updates via SQL (Dangerous - Test First!)

#### Add a custom font mapping to existing template:
```sql
UPDATE templates
SET custom_font_files = jsonb_set(
    custom_font_files,
    '{"Font Name"}',
    '"https://storage.url/fonts/font-name_123456.ttf"'
)
WHERE id = 'TEMPLATE-UUID-HERE';
```

#### Clear custom fonts from a template:
```sql
UPDATE templates
SET custom_font_files = '{}'::jsonb
WHERE id = 'TEMPLATE-UUID-HERE';
```

#### View raw JSONB size:
```sql
SELECT 
    id, 
    name,
    pg_column_size(custom_font_files) as jsonb_bytes
FROM templates
ORDER BY jsonb_bytes DESC;
```

### C. Via TypeScript Server Actions

#### Query single template:
```typescript
// File: app/actions/templates.ts (already exists)
import { getTemplate } from '@/app/actions/templates';

const template = await getTemplate(templateId);
console.log('Custom font files:', template.custom_font_files);
```

#### Query all templates:
```typescript
// File: app/actions/templates.ts (already exists)
import { getTemplates } from '@/app/actions/templates';

const templates = await getTemplates();
const withCustomFonts = templates.filter(t => 
    t.custom_font_files && Object.keys(t.custom_font_files).length > 0
);
console.log('Templates with custom fonts:', withCustomFonts);
```

#### Update custom_font_files programmatically:
```typescript
// File: app/actions/templates.ts
import { createClient } from '@/lib/supabase/server';

export async function updateTemplateCustomFonts(
    templateId: string,
    customFontFiles: Record<string, string>
) {
    const supabase = await createClient();
    
    const { error } = await supabase
        .from('templates')
        .update({ custom_font_files: customFontFiles })
        .eq('id', templateId);
    
    if (error) {
        console.error('Failed to update custom fonts:', error);
        return { success: false, error: error.message };
    }
    
    return { success: true };
}
```

### D. Admin Client (Bypasses RLS)

```typescript
import { createAdminClient } from '@/lib/supabase/admin';

const adminClient = createAdminClient();

// Query with service role (bypasses Row Level Security)
const { data, error } = await adminClient
    .from('templates')
    .select('*')
    .eq('id', templateId);
```

---

## 5. DEBUGGING CUSTOM_FONT_FILES ISSUES

### Steps to Check if Fonts are Being Saved:

1. **Template Creation/Update:**
   - Check server logs for: `[Update Template] custom_font_files in payload:`
   - Should show non-empty array of font names

2. **After Upload, Before Save:**
   - EditTemplateForm receives: `template.custom_font_files || {}`
   - Should be object with font name → URL mappings

3. **PDF Generation:**
   - Logs show: `[PDF Gen] Custom font files in template:`
   - Should list the font names, not "none"

4. **Font Loading:**
   - Logs show: `[PDF Font] Found custom font URL for "FontName"`
   - If not found, check font name matching logic

### Common Issues & Checks:

| Issue | Check | Solution |
|-------|-------|----------|
| `custom_font_files` is `{}` | Is font being uploaded before save? | Upload font first, then save template |
| Font name in DB doesn't match CSS | Check exact case/spacing | Font names are case-sensitive |
| URL in DB is invalid/broken | Verify Supabase storage path | Re-upload font, regenerate URL |
| PDF still uses default font | Check logs for embedding errors | Font file may be corrupted or unsupported |

---

## 6. CURRENT STATE SUMMARY

### Working:
✅ Font upload to Supabase Storage  
✅ Font URL stored in `custom_font_files` JSONB column  
✅ Template save/update preserves font mappings  
✅ PDF generation retrieves and attempts to use custom fonts  
✅ Fallback to standard fonts if custom font fails  

### Known Limitations:
⚠️ PDF font embedding depends on font file validity  
⚠️ Font name matching is basic (exact/partial string match)  
⚠️ TTF/OTF format compatibility varies with pdf-lib  

### Table Structure:
- `custom_font_files`: JSONB, default `{}`
- Stored as: `{ "Font Name": "public_url" }`
- Populated via: `uploadTemplateFont()` → stored via `updateTemplate()`
- Consumed by: `generateCertificatePdf()` → `getFont()` → `findCustomFontUrl()`

---

## 7. FILE REFERENCES

Essential files for understanding custom fonts:

| Purpose | File | Key Functions |
|---------|------|---|
| Database schema | [supabase/schema.sql](supabase/schema.sql#L36) | `custom_font_files JSONB` |
| Migration | [supabase/migrations/20260320_add_custom_font_files.sql](supabase/migrations/20260320_add_custom_font_files.sql) | Add column |
| Type definitions | [lib/types/database.ts](lib/types/database.ts#L30-L31) | `custom_font_files?: Record<string, string>` |
| Font upload | [app/actions/templates.ts](app/actions/templates.ts#L314) | `uploadTemplateFont()` |
| Template CRUD | [app/actions/templates.ts](app/actions/templates.ts#L147-L240) | `getTemplates()`, `createTemplate()`, `updateTemplate()` |
| PDF generation | [lib/pdf/generate-certificate.ts](lib/pdf/generate-certificate.ts#L403-L360) | `generateCertificatePdf()`, `getFont()`, `findCustomFontUrl()` |
| Font editor UI | [app/admin/templates/[id]/EditTemplateForm.tsx](app/admin/templates/%5Bid%5D/EditTemplateForm.tsx#L60-L63) | Uses `template.custom_font_files` |

