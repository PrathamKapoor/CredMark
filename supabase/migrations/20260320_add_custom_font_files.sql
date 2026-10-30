-- Migration: Add uploaded custom font file mapping to templates
-- Date: 2026-03-20

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS custom_font_files JSONB NOT NULL DEFAULT '{}'::jsonb;
