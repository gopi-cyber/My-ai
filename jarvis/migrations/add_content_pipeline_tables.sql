-- Migration: Add Content Pipeline Tables
-- Adds support for content orchestration and awareness integration.

CREATE TABLE IF NOT EXISTS public.content_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    body text DEFAULT '',
    content_type text DEFAULT 'blog',
    stage text DEFAULT 'idea',
    tags text[] DEFAULT '{}',
    scheduled_at timestamp with time zone,
    published_at timestamp with time zone,
    published_url text,
    created_by text DEFAULT 'user',
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_stage_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid REFERENCES public.content_items(id) ON DELETE CASCADE,
    stage text NOT NULL,
    note text NOT NULL,
    author text DEFAULT 'user',
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.content_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    content_id uuid REFERENCES public.content_items(id) ON DELETE CASCADE,
    filename text NOT NULL,
    disk_path text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint DEFAULT 0,
    label text,
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS and add policies
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_stage_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_items;
CREATE POLICY "Enable all for anon" ON public.content_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_stage_notes;
CREATE POLICY "Enable all for anon" ON public.content_stage_notes FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_attachments;
CREATE POLICY "Enable all for anon" ON public.content_attachments FOR ALL USING (true);
