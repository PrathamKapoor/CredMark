-- Canonical safe, idempotent setup. Existing installations should use the additive migration.
BEGIN;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    
    -- Image dimensions for proper scaling
    image_width INTEGER NOT NULL DEFAULT 1920,
    image_height INTEGER NOT NULL DEFAULT 1080,
    
    -- ================================================
    -- LINK PLACEHOLDER - Verification URL position
    -- ================================================
    link_x INTEGER NOT NULL DEFAULT 0,
    link_y INTEGER NOT NULL DEFAULT 0,
    link_width INTEGER NOT NULL DEFAULT 200,
    link_height INTEGER NOT NULL DEFAULT 30,
    link_font_size INTEGER NOT NULL DEFAULT 12,
    link_alignment TEXT NOT NULL DEFAULT 'center' CHECK (link_alignment IN ('left', 'center', 'right')),
    link_font_family TEXT NOT NULL DEFAULT 'sans-serif',
    link_bold BOOLEAN NOT NULL DEFAULT false,
    link_italic BOOLEAN NOT NULL DEFAULT false,
    link_underline BOOLEAN NOT NULL DEFAULT true,
    
    -- ================================================
    -- NAME PLACEHOLDER - Recipient name position
    -- ================================================
    name_x INTEGER NOT NULL DEFAULT 0,
    name_y INTEGER NOT NULL DEFAULT 0,
    name_width INTEGER NOT NULL DEFAULT 600,
    name_height INTEGER NOT NULL DEFAULT 80,
    name_font_size INTEGER NOT NULL DEFAULT 48,
    name_alignment TEXT NOT NULL DEFAULT 'center' CHECK (name_alignment IN ('left', 'center', 'right')),
    name_font_family TEXT NOT NULL DEFAULT 'serif',
    name_bold BOOLEAN NOT NULL DEFAULT true,
    name_italic BOOLEAN NOT NULL DEFAULT false,
    name_underline BOOLEAN NOT NULL DEFAULT false,
    
    -- ================================================
    -- EVENT PLACEHOLDER - Event name position (optional)
    -- ================================================
    event_x INTEGER DEFAULT NULL,
    event_y INTEGER DEFAULT NULL,
    event_width INTEGER NOT NULL DEFAULT 400,
    event_height INTEGER NOT NULL DEFAULT 60,
    event_font_size INTEGER DEFAULT 24,
    event_alignment TEXT NOT NULL DEFAULT 'center' CHECK (event_alignment IN ('left', 'center', 'right')),
    event_font_family TEXT DEFAULT 'sans-serif',
    event_bold BOOLEAN NOT NULL DEFAULT false,
    event_italic BOOLEAN NOT NULL DEFAULT false,
    event_underline BOOLEAN NOT NULL DEFAULT false,
    
    -- ================================================
    -- DATE PLACEHOLDER - Issue date position (optional)
    -- ================================================
    date_x INTEGER DEFAULT NULL,
    date_y INTEGER DEFAULT NULL,
    date_width INTEGER NOT NULL DEFAULT 300,
    date_height INTEGER NOT NULL DEFAULT 40,
    date_font_size INTEGER DEFAULT 18,
    date_alignment TEXT NOT NULL DEFAULT 'center' CHECK (date_alignment IN ('left', 'center', 'right')),
    date_font_family TEXT DEFAULT 'sans-serif',
    date_bold BOOLEAN NOT NULL DEFAULT false,
    date_italic BOOLEAN NOT NULL DEFAULT false,
    date_underline BOOLEAN NOT NULL DEFAULT false,
    
    -- ================================================
    -- CUSTOM FONTS - User-added font family names
    -- ================================================
    custom_fonts TEXT[] DEFAULT '{}',

    -- Uploaded custom OTF/TTF fonts mapped by family name => public URL
    custom_font_files JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- ================================================
    -- CUSTOM PLACEHOLDERS - Dynamic placeholder configurations
    -- Stores array of placeholder objects with position, styling, etc.
    -- ================================================
    placeholders JSONB DEFAULT '[]'::jsonb,
    
    -- ================================================
    -- TIMESTAMPS
    -- ================================================
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT folders_name_not_empty CHECK (length(btrim(name)) > 0)
);
CREATE TABLE IF NOT EXISTS public.certificates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    certificate_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    event_name TEXT NOT NULL,
    date_of_issue DATE NOT NULL DEFAULT CURRENT_DATE,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
    template_image_url TEXT,           -- Snapshot of template URL at generation time
    pdf_url TEXT,                       -- Generated certificate PDF URL
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    email_sent_at TIMESTAMPTZ,
    -- Custom fields mapped by placeholder key (for dynamic placeholders)
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS image_width INTEGER NOT NULL DEFAULT 1920;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS image_height INTEGER NOT NULL DEFAULT 1080;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_width INTEGER NOT NULL DEFAULT 200;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_height INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_font_size INTEGER NOT NULL DEFAULT 12;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_alignment TEXT NOT NULL DEFAULT 'center' CHECK (link_alignment IN ('left', 'center', 'right'));
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_font_family TEXT NOT NULL DEFAULT 'sans-serif';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_bold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_italic BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_underline BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_x INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_y INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_width INTEGER NOT NULL DEFAULT 600;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_height INTEGER NOT NULL DEFAULT 80;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_font_size INTEGER NOT NULL DEFAULT 48;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_alignment TEXT NOT NULL DEFAULT 'center' CHECK (name_alignment IN ('left', 'center', 'right'));
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_font_family TEXT NOT NULL DEFAULT 'serif';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_bold BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_italic BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_underline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_x INTEGER DEFAULT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_y INTEGER DEFAULT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_width INTEGER NOT NULL DEFAULT 400;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_height INTEGER NOT NULL DEFAULT 60;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_font_size INTEGER DEFAULT 24;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_alignment TEXT NOT NULL DEFAULT 'center' CHECK (event_alignment IN ('left', 'center', 'right'));
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_font_family TEXT DEFAULT 'sans-serif';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_bold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_italic BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_underline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_x INTEGER DEFAULT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_y INTEGER DEFAULT NULL;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_width INTEGER NOT NULL DEFAULT 300;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_height INTEGER NOT NULL DEFAULT 40;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_font_size INTEGER DEFAULT 18;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_alignment TEXT NOT NULL DEFAULT 'center' CHECK (date_alignment IN ('left', 'center', 'right'));
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_font_family TEXT DEFAULT 'sans-serif';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_bold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_italic BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_underline BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS custom_fonts TEXT[] DEFAULT '{}';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS custom_font_files JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS placeholders JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES folders(id) ON DELETE CASCADE;
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.folders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS certificate_code TEXT UNIQUE NOT NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS name TEXT NOT NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS email TEXT NOT NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS date_of_issue DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates(id) ON DELETE SET NULL;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE RESTRICT;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS template_image_url TEXT;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS is_valid BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS link_color TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS name_color TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS event_color TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS date_color TEXT NOT NULL DEFAULT '#000000';
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS pdf_object_path text;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS pdf_sha256 text;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS render_snapshot jsonb;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE INDEX IF NOT EXISTS idx_certificates_code ON public.certificates(certificate_code);
CREATE INDEX IF NOT EXISTS idx_certificates_email ON public.certificates(email);
CREATE INDEX IF NOT EXISTS idx_certificates_event ON public.certificates(event_name);
CREATE INDEX IF NOT EXISTS idx_certificates_created ON public.certificates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificates_folder ON public.certificates(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON public.folders(parent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_parent_name_unique ON public.folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS certificates_idempotency_key_unique ON public.certificates(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$ SELECT coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin' $$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
CREATE OR REPLACE FUNCTION public.verify_certificate(p_code text)
RETURNS TABLE(certificate_code text, name text, event_name text, date_of_issue date, is_valid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
 SELECT c.certificate_code, CASE WHEN c.is_valid THEN c.name END,
 CASE WHEN c.is_valid THEN c.event_name END, CASE WHEN c.is_valid THEN c.date_of_issue END, c.is_valid
 FROM public.certificates c
 WHERE p_code ~ '^[A-Z0-9][A-Z0-9-]{7,63}$' AND c.certificate_code = p_code
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;
-- Replace permissive legacy policies; unknown policy names must not preserve enumeration.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('certificates','templates','folders') LOOP
 EXECUTE format('DROP POLICY %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
 END LOOP;
END $$;
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.certificates, public.templates, public.folders FROM anon;
GRANT ALL ON public.certificates,public.templates,public.folders TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.certificates,public.templates,public.folders TO authenticated;
CREATE POLICY foundations_certificates_admin ON public.certificates FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY foundations_templates_admin ON public.templates FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY foundations_folders_admin ON public.folders FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
INSERT INTO storage.buckets(id,name,public) VALUES('templates','templates',true),('certificates','certificates',false),('issuance-assets','issuance-assets',false)
ON CONFLICT(id) DO UPDATE SET public=excluded.public;
-- Remove legacy policies targeting these buckets before installing explicit boundaries.
DO $$ DECLARE p record; BEGIN
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
 AND (coalesce(qual,'') || coalesce(with_check,'')) ~ '(templates|certificates)' LOOP
 EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname);
 END LOOP;
END $$;
CREATE POLICY foundations_template_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='templates');
CREATE POLICY foundations_asset_admin ON storage.objects FOR ALL TO authenticated USING(bucket_id IN ('templates','certificates') AND public.is_admin()) WITH CHECK(bucket_id IN ('templates','certificates') AND public.is_admin());

-- Restrictive guards also defeat an unknown legacy USING(true) storage policy.
DROP POLICY IF EXISTS foundations_private_read_guard ON storage.objects;
CREATE POLICY foundations_private_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING(bucket_id NOT IN ('certificates','issuance-assets') OR (bucket_id='certificates' AND coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'));
DROP POLICY IF EXISTS foundations_asset_insert_guard ON storage.objects;
CREATE POLICY foundations_asset_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated
WITH CHECK(bucket_id NOT IN ('templates','certificates','issuance-assets') OR (bucket_id IN ('templates','certificates') AND coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'));
DROP POLICY IF EXISTS foundations_asset_update_guard ON storage.objects;
CREATE POLICY foundations_asset_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated
USING(bucket_id NOT IN ('templates','certificates','issuance-assets') OR (bucket_id IN ('templates','certificates') AND coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'))
WITH CHECK(bucket_id NOT IN ('templates','certificates','issuance-assets') OR (bucket_id IN ('templates','certificates') AND coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'));
DROP POLICY IF EXISTS foundations_asset_delete_guard ON storage.objects;
CREATE POLICY foundations_asset_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated
USING(bucket_id NOT IN ('templates','certificates','issuance-assets') OR (bucket_id IN ('templates','certificates') AND coalesce(auth.jwt()->'app_metadata'->>'role','')='admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS update_templates_updated_at ON public.templates;
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_folders_updated_at ON public.folders;
CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_certificates_updated_at ON public.certificates;
CREATE TRIGGER update_certificates_updated_at BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
