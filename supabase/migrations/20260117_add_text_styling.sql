-- Migration: Add text styling columns and custom_fonts to templates table
-- Date: 2026-01-17

-- Add custom_fonts array column (stores Google Font names added by user)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS custom_fonts TEXT[] DEFAULT '{}';

-- Add text styling columns for Link
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_bold BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_italic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_underline BOOLEAN NOT NULL DEFAULT true;

-- Add text styling columns for Name
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_bold BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_italic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_underline BOOLEAN NOT NULL DEFAULT false;

-- Add text styling columns for Event
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_bold BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_italic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_underline BOOLEAN NOT NULL DEFAULT false;

-- Add text styling columns for Date
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_bold BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_italic BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_underline BOOLEAN NOT NULL DEFAULT false;
