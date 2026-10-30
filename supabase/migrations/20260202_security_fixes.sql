-- Security Fixes Migration
-- Addresses Supabase Security Advisor warnings
-- Run this in Supabase SQL Editor

-- ============================================
-- FIX 1: Function Search Path Mutable
-- Set a secure search_path for the trigger function
-- ============================================

-- Drop existing function and recreate with security settings
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Recreate triggers after function recreation
CREATE TRIGGER update_templates_updated_at
    BEFORE UPDATE ON templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_certificates_updated_at
    BEFORE UPDATE ON certificates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FIX 2 & 3: RLS Policies Always True
-- Replace overly permissive policies with proper admin checks
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admin can manage templates" ON templates;
DROP POLICY IF EXISTS "Admin can manage certificates" ON certificates;
DROP POLICY IF EXISTS "Public can verify certificates" ON certificates;

-- Create a helper function to check if user is admin
-- You can customize this based on your user roles setup
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    user_role TEXT;
BEGIN
    -- Option 1: Check user metadata for admin role
    -- Assumes you set app_metadata.role = 'admin' for admin users
    SELECT COALESCE(
        auth.jwt() -> 'app_metadata' ->> 'role',
        ''
    ) INTO user_role;
    
    RETURN user_role = 'admin';
END;
$$;

-- ============================================
-- TEMPLATES TABLE POLICIES
-- ============================================

-- Admins can do everything with templates
CREATE POLICY "Admin full access to templates"
    ON templates
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Public can read templates (needed for certificate verification display)
CREATE POLICY "Public can view templates"
    ON templates
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- ============================================
-- CERTIFICATES TABLE POLICIES  
-- ============================================

-- Admins can do everything with certificates
CREATE POLICY "Admin full access to certificates"
    ON certificates
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Public can ONLY read valid certificates (for verification)
CREATE POLICY "Public can verify valid certificates"
    ON certificates
    FOR SELECT
    TO anon
    USING (is_valid = true);

-- Authenticated non-admin users can view their own certificates
CREATE POLICY "Users can view own certificates"
    ON certificates
    FOR SELECT
    TO authenticated
    USING (
        email = auth.jwt() ->> 'email'
        OR public.is_admin()
    );

-- ============================================
-- GRANT EXECUTE permissions on functions
-- ============================================
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
