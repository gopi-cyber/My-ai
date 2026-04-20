-- Migration: Add missing columns to goals table
-- Run this in Supabase SQL Editor

-- Add actual_hours column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS actual_hours numeric DEFAULT 0;

-- Add sort_order column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- Add level column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS level text DEFAULT 'task';

-- Add parent_id column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.goals(id);

-- Add dependencies column
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS dependencies text[] DEFAULT '{}';

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'goals' 
AND column_name IN ('actual_hours', 'sort_order', 'level', 'parent_id', 'dependencies');