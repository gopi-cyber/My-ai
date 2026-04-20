-- Supabase Schema Migration (full_schema.sql)
-- Run this in your Supabase SQL Editor to resolve column mismatches.

--
-- 1. Goals Table
--

CREATE TABLE IF NOT EXISTS public.goals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES public.goals(id),
    level text NOT NULL,
    title text NOT NULL,
    description text DEFAULT '',
    success_criteria text DEFAULT '',
    time_horizon text DEFAULT 'quarterly',
    score real DEFAULT 0.0,
    score_reason text,
    status text DEFAULT 'draft',
    health text DEFAULT 'on_track',
    deadline timestamp with time zone,
    started_at timestamp with time zone,
    estimated_hours real,
    actual_hours real DEFAULT 0,
    authority_level integer DEFAULT 3,
    tags text[] DEFAULT '{}',
    dependencies text[] DEFAULT '{}',
    escalation_stage text DEFAULT 'none',
    escalation_started_at timestamp with time zone,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone
);

ALTER TABLE public.goals 
  ADD COLUMN IF NOT EXISTS health text DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dependencies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS escalation_stage text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS escalation_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_hours real DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_hours real,
  ADD COLUMN IF NOT EXISTS authority_level integer DEFAULT 3;

--
-- 2. Screen Captures Table
--

CREATE TABLE IF NOT EXISTS public.screen_captures (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp timestamp with time zone NOT NULL,
    session_id text,
    image_path text,
    thumbnail_path text,
    pixel_change_pct real,
    ocr_text text,
    app_name text,
    window_title text,
    url text,
    file_path text,
    retention_tier text DEFAULT 'full',
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.screen_captures
  ADD COLUMN IF NOT EXISTS retention_tier text DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS app_name text,
  ADD COLUMN IF NOT EXISTS window_title text,
  ADD COLUMN IF NOT EXISTS url text,
  ADD COLUMN IF NOT EXISTS file_path text;

--
-- 3. Awareness Sessions
--

CREATE TABLE IF NOT EXISTS public.awareness_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    apps text[] DEFAULT '{}',
    project_context text,
    action_types text[] DEFAULT '{}',
    entity_links text[] DEFAULT '{}',
    capture_count integer DEFAULT 0,
    summary text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.awareness_sessions
  ADD COLUMN IF NOT EXISTS apps text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS project_context text,
  ADD COLUMN IF NOT EXISTS action_types text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS entity_links text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS capture_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary text;

--
-- 4. Awareness Suggestions
--

CREATE TABLE IF NOT EXISTS public.awareness_suggestions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type text NOT NULL,
    trigger_capture_id uuid,
    title text NOT NULL,
    body text NOT NULL,
    context jsonb,
    delivered boolean DEFAULT false,
    delivered_at timestamp with time zone,
    delivery_channel text,
    dismissed boolean DEFAULT false,
    acted_on boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.awareness_suggestions
  ADD COLUMN IF NOT EXISTS delivered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acted_on boolean DEFAULT false;

-- Notify complete
-- (You should now be able to run JARVIS without schema mismatch runtime errors.)

--
-- 5. Workflows
--

CREATE TABLE IF NOT EXISTS public.workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text DEFAULT '',
    enabled boolean DEFAULT true,
    authority_level integer DEFAULT 1,
    authority_approved boolean DEFAULT false,
    approved_at timestamp with time zone,
    approved_by text,
    tags text[] DEFAULT '{}',
    current_version integer DEFAULT 1,
    execution_count integer DEFAULT 0,
    last_executed_at timestamp with time zone,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid REFERENCES public.workflows(id) ON DELETE CASCADE,
    version integer NOT NULL,
    definition jsonb NOT NULL,
    changelog text,
    created_by text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid REFERENCES public.workflows(id) ON DELETE CASCADE,
    version integer NOT NULL,
    trigger_type text NOT NULL,
    trigger_data jsonb,
    status text DEFAULT 'running',
    variables jsonb DEFAULT '{}',
    error_message text,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    duration_ms integer
);

CREATE TABLE IF NOT EXISTS public.workflow_step_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id uuid REFERENCES public.workflow_executions(id) ON DELETE CASCADE,
    node_id text NOT NULL,
    node_type text NOT NULL,
    status text DEFAULT 'pending',
    input_data jsonb,
    output_data jsonb,
    error_message text,
    retry_count integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    duration_ms integer
);

CREATE TABLE IF NOT EXISTS public.workflow_variables (
    workflow_id uuid REFERENCES public.workflows(id) ON DELETE CASCADE,
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (workflow_id, key)
);

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS authority_level integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS authority_approved boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS execution_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_executed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamp with time zone;

-- 6. Auxiliary System Tables
CREATE TABLE IF NOT EXISTS public.webapp_templates (
    id TEXT PRIMARY KEY,
    app_name TEXT NOT NULL,
    domains JSONB DEFAULT '[]'::jsonb,
    keywords JSONB DEFAULT '[]'::jsonb,
    description TEXT,
    instructions TEXT,
    version TEXT,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.keychain_metadata (
    id TEXT PRIMARY KEY,
    master_seed TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.keychain (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goal_progress (
    id TEXT PRIMARY KEY,
    goal_id UUID REFERENCES public.goals(id) ON DELETE CASCADE,
    type TEXT,
    score_before FLOAT,
    score_after FLOAT,
    note TEXT,
    source TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goal_check_ins (
    id TEXT PRIMARY KEY,
    type TEXT,
    summary TEXT,
    goals_reviewed JSONB DEFAULT '[]'::jsonb,
    actions_planned JSONB DEFAULT '[]'::jsonb,
    actions_completed JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Evolution Log
CREATE TABLE IF NOT EXISTS public.evolution_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    type TEXT NOT NULL, -- 'optimization', 'crash_fix', 'learning', 'failover'
    target TEXT, -- file path or component name
    summary TEXT NOT NULL,
    details TEXT,
    status TEXT DEFAULT 'success', -- 'pending', 'success', 'failed', 'rolled_back'
    stability_impact FLOAT DEFAULT 0.0,
    created_at TIMESTAMPTZ DEFAULT now()
);


ALTER TABLE public.webapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keychain_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.keychain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for anon" ON public.webapp_templates;
CREATE POLICY "Enable all for anon" ON public.webapp_templates FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.keychain_metadata;
CREATE POLICY "Enable all for anon" ON public.keychain_metadata FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.keychain;
CREATE POLICY "Enable all for anon" ON public.keychain FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.goal_progress;
CREATE POLICY "Enable all for anon" ON public.goal_progress FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.goal_check_ins;
CREATE POLICY "Enable all for anon" ON public.goal_check_ins FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.evolution_log;
CREATE POLICY "Enable all for anon" ON public.evolution_log FOR ALL USING (true);

--
-- 8. Content Pipeline Tables
--

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

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_stage_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_items;
CREATE POLICY "Enable all for anon" ON public.content_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_stage_notes;
CREATE POLICY "Enable all for anon" ON public.content_stage_notes FOR ALL USING (true);

DROP POLICY IF EXISTS "Enable all for anon" ON public.content_attachments;
CREATE POLICY "Enable all for anon" ON public.content_attachments FOR ALL USING (true);
