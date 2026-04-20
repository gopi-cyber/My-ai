-- AETHER SYSTEM SCHEMA UPDATE v1.0
-- Run this in the Supabase SQL Editor

-- 1. Content Pipeline Tables
CREATE TABLE IF NOT EXISTS public.content_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    title TEXT NOT NULL,
    content_type TEXT NOT NULL, -- 'page', 'component', 'asset'
    content TEXT,
    stage TEXT DEFAULT 'draft', -- 'draft', 'review', 'published'
    tags TEXT[] DEFAULT '{}',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_stage_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_content_items_project ON public.content_items(project_id);
CREATE INDEX IF NOT EXISTS idx_observations_created_at ON public.observations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commitments_due ON public.commitments(when_due);

-- 3. RLS Policies (Basic)
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for development" ON public.content_items FOR ALL USING (true);
ALTER TABLE public.content_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for development" ON public.content_attachments FOR ALL USING (true);
ALTER TABLE public.content_stage_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access for development" ON public.content_stage_notes FOR ALL USING (true);
