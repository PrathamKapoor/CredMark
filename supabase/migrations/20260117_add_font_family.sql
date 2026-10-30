-- Migration: Add font_family columns to templates table
-- Date: 2026-01-17

-- Add font_family columns for customizable fonts per placeholder

-- Link font family
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_font_family TEXT NOT NULL DEFAULT 'sans-serif';

-- Name font family  
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_font_family TEXT NOT NULL DEFAULT 'serif';

-- Event font family (optional - can be null if event placeholder is not used)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_font_family TEXT DEFAULT 'sans-serif';

-- Date font family (optional - can be null if date placeholder is not used)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_font_family TEXT DEFAULT 'sans-serif';

-- Add alignment column for link if not exists
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_alignment TEXT NOT NULL DEFAULT 'center' 
CHECK (link_alignment IN ('left', 'center', 'right'));

-- Add width/height columns for all placeholders if not exists
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_width INTEGER NOT NULL DEFAULT 600;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS name_height INTEGER NOT NULL DEFAULT 80;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_width INTEGER NOT NULL DEFAULT 400;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_height INTEGER NOT NULL DEFAULT 60;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS event_alignment TEXT NOT NULL DEFAULT 'center'
CHECK (event_alignment IN ('left', 'center', 'right'));

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_width INTEGER NOT NULL DEFAULT 300;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_height INTEGER NOT NULL DEFAULT 40;

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS date_alignment TEXT NOT NULL DEFAULT 'center'
CHECK (date_alignment IN ('left', 'center', 'right'));

ALTER TABLE templates
ADD COLUMN IF NOT EXISTS link_font_size INTEGER NOT NULL DEFAULT 12;
