-- Add hierarchical folders for certificate organization
-- Supports required folder assignment for certificate creation

CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT folders_name_not_empty CHECK (length(btrim(name)) > 0)
);

-- Enforce unique folder names within the same parent (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_parent_name_unique
    ON public.folders (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE INDEX IF NOT EXISTS idx_folders_parent_id
    ON public.folders(parent_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'update_folders_updated_at'
    ) THEN
        CREATE TRIGGER update_folders_updated_at
            BEFORE UPDATE ON public.folders
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

ALTER TABLE public.certificates
    ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_certificates_folder_id
    ON public.certificates(folder_id);

-- Backfill folders from existing event names
INSERT INTO public.folders (name)
SELECT DISTINCT btrim(c.event_name)
FROM public.certificates c
WHERE c.folder_id IS NULL
  AND btrim(COALESCE(c.event_name, '')) <> ''
ON CONFLICT (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

UPDATE public.certificates c
SET folder_id = f.id
FROM public.folders f
WHERE c.folder_id IS NULL
  AND f.parent_id IS NULL
  AND lower(f.name) = lower(btrim(c.event_name));

-- Fallback for records that still cannot be mapped
INSERT INTO public.folders (name)
VALUES ('Uncategorized')
ON CONFLICT (COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

UPDATE public.certificates c
SET folder_id = f.id
FROM public.folders f
WHERE c.folder_id IS NULL
  AND f.parent_id IS NULL
  AND lower(f.name) = 'uncategorized';

ALTER TABLE public.certificates
    ALTER COLUMN folder_id SET NOT NULL;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to folders" ON public.folders;

CREATE POLICY "Admin full access to folders"
    ON public.folders
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
