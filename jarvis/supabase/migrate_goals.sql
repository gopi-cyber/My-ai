-- AETHER Goals Schema Migration
-- Run this in your Supabase SQL Editor to ensure the database matches the AETHER Goal System requirements.

-- Ensure the 'goals' table has all required columns
ALTER TABLE goals 
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES goals(id),
  ADD COLUMN IF NOT EXISTS time_horizon TEXT DEFAULT 'quarterly',
  ADD COLUMN IF NOT EXISTS score_reason TEXT,
  ADD COLUMN IF NOT EXISTS health TEXT DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_hours FLOAT,
  ADD COLUMN IF NOT EXISTS actual_hours FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS authority_level INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_stage TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS escalation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_goals_parent_id ON goals(parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_health ON goals(health);

-- Table for Goal Progress Logs
CREATE TABLE IF NOT EXISTS goal_progress_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  score_before FLOAT NOT NULL,
  score_after FLOAT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table for Rhythm Check-ins (Morning Plan / Evening Review)
CREATE TABLE IF NOT EXISTS goal_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'morning_plan' or 'evening_review'
  summary TEXT,
  goals_reviewed JSONB DEFAULT '[]'::jsonb,
  actions_planned JSONB DEFAULT '[]'::jsonb,
  actions_completed JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Policy to allow anonymous access (if relying on API key only)
-- WARNING: In a real production app, you should use Row Level Security (RLS) properly.
ALTER TABLE goals DISABLE ROW LEVEL SECURITY;
ALTER TABLE goal_progress_entries DISABLE ROW LEVEL SECURITY;
ALTER TABLE goal_check_ins DISABLE ROW LEVEL SECURITY;
