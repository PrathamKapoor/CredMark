-- Migration to add more flexible controls to templates table

ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS name_width INTEGER DEFAULT 300,
ADD COLUMN IF NOT EXISTS name_height INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS event_alignment TEXT DEFAULT 'center' CHECK (event_alignment IN ('left', 'center', 'right')),
ADD COLUMN IF NOT EXISTS event_width INTEGER DEFAULT 300,
ADD COLUMN IF NOT EXISTS event_height INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS date_alignment TEXT DEFAULT 'center' CHECK (date_alignment IN ('left', 'center', 'right')),
ADD COLUMN IF NOT EXISTS date_width INTEGER DEFAULT 200,
ADD COLUMN IF NOT EXISTS date_height INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS link_font_size INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS link_alignment TEXT DEFAULT 'center' CHECK (link_alignment IN ('left', 'center', 'right'));
