-- Public verification RLS hardening
-- Ensures public verification only returns valid certificates

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can verify valid certificates" ON public.certificates;

CREATE POLICY "Public can verify valid certificates"
    ON public.certificates
    FOR SELECT
    TO anon, authenticated
    USING (is_valid = true);
