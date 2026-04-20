-- Migration: Add evolution_log table for autonomous self-healing tracking
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.evolution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    type TEXT NOT NULL,
    target TEXT,
    summary TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'success',
    stability_impact FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.evolution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for anon" ON public.evolution_log;
CREATE POLICY "Enable all for anon" ON public.evolution_log FOR ALL USING (true);

-- Also fix the workflows table missing 'tags' column (seen in startup logs)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'workflows' AND column_name = 'tags'
    ) THEN
        ALTER TABLE public.workflows ADD COLUMN tags JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
