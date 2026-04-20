/**
 * Vault — Awareness CRUD
 *
 * Database operations for screen_captures, awareness_sessions, and awareness_suggestions tables.
 * Refactored to use async Supabase client.
 */

import { getDb, generateId } from './schema.ts';
import type {
  ScreenCaptureRow,
  SessionRow,
  SuggestionRow,
  SuggestionType,
  AppUsageStat,
} from '../awareness/types.ts';

// ── Screen Captures ──

export async function createCapture(data: {
  timestamp: number;
  sessionId?: string;
  imagePath?: string;
  thumbnailPath?: string;
  pixelChangePct: number;
  ocrText?: string;
  appName?: string;
  windowTitle?: string;
  url?: string;
  filePath?: string;
  retentionTier?: 'full' | 'key_moment' | 'metadata_only';
}): Promise<ScreenCaptureRow> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const payload = {
    id,
    timestamp: data.timestamp,
    session_id: data.sessionId ?? null,
    image_path: data.imagePath ?? null,
    thumbnail_path: data.thumbnailPath ?? null,
    pixel_change_pct: data.pixelChangePct,
    ocr_text: data.ocrText ?? null,
    app_name: data.appName ?? null,
    window_title: data.windowTitle ?? null,
    url: data.url ?? null,
    file_path: data.filePath ?? null,
    retention_tier: data.retentionTier ?? 'full',
    created_at: now,
  };

  const { error } = await db.from('screen_captures').insert(payload);
  if (error) throw new Error(`Failed to create capture: ${error.message}`);

  return payload;
}

export async function getCapture(id: string): Promise<ScreenCaptureRow | null> {
  const db = getDb();
  const { data, error } = await db.from('screen_captures').select('*').eq('id', id).single();
  return (data && !error) ? data as ScreenCaptureRow : null;
}

export async function getRecentCaptures(limit: number = 50, appName?: string): Promise<ScreenCaptureRow[]> {
  const db = getDb();
  let q = db.from('screen_captures').select('*').order('timestamp', { ascending: false }).limit(limit);
  
  if (appName) {
    q = q.eq('app_name', appName);
  }

  const { data, error } = await q;
  if (error || !data) return [];
  return data as ScreenCaptureRow[];
}

export async function getCapturesInRange(startTime: number, endTime: number): Promise<ScreenCaptureRow[]> {
  const db = getDb();
  const { data, error } = await db
    .from('screen_captures')
    .select('*')
    .gte('timestamp', startTime)
    .lte('timestamp', endTime)
    .order('timestamp', { ascending: true });

  if (error || !data) return [];
  return data as ScreenCaptureRow[];
}

export async function getAppUsageStats(startTime: number, endTime: number): Promise<AppUsageStat[]> {
  const db = getDb();
  
  // Supabase doesn't support complex GROUP BY in the simple client, 
  // but we can fetch and aggregate or use a RPC. 
  // For standard pattern here, we fetch and aggregate.
  const { data, error } = await db
    .from('screen_captures')
    .select('app_name')
    .gte('timestamp', startTime)
    .lte('timestamp', endTime)
    .not('app_name', 'is', null);

  if (error || !data) return [];

  const counts: Record<string, number> = {};
  for (const r of data) {
    counts[r.app_name] = (counts[r.app_name] || 0) + 1;
  }

  const rows = Object.entries(counts).map(([app_name, capture_count]) => ({
    app_name,
    capture_count,
  })).sort((a, b) => b.capture_count - a.capture_count);

  const totalCaptures = rows.reduce((sum, r) => sum + r.capture_count, 0);

  return rows.map(r => ({
    app: r.app_name,
    captureCount: r.capture_count,
    minutes: Math.round((r.capture_count * 7) / 60),  // ~7s per capture
    percentage: totalCaptures > 0 ? Math.round((r.capture_count / totalCaptures) * 100) : 0,
  }));
}

export async function getCaptureCountSince(timestamp: number): Promise<number> {
  const db = getDb();
  const { count, error } = await db
    .from('screen_captures')
    .select('*', { count: 'exact', head: true })
    .gte('timestamp', timestamp);
  return count || 0;
}

export async function updateCaptureRetention(id: string, tier: 'full' | 'key_moment' | 'metadata_only'): Promise<void> {
  const db = getDb();
  await db.from('screen_captures').update({ retention_tier: tier }).eq('id', id);
}

export async function deleteCapturesBefore(timestamp: number, retentionTier: string): Promise<number> {
  const db = getDb();
  const { error, count } = await db
    .from('screen_captures')
    .delete({ count: 'exact' })
    .lt('timestamp', timestamp)
    .eq('retention_tier', retentionTier);
  
  return count || 0;
}

export async function updateCaptureOcrText(id: string, ocrText: string): Promise<void> {
  const db = getDb();
  await db.from('screen_captures').update({ ocr_text: ocrText }).eq('id', id);
}

export async function getCapturesForSession(sessionId: string, limit: number = 50): Promise<ScreenCaptureRow[]> {
  const db = getDb();
  const { data, error } = await db
    .from('screen_captures')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as ScreenCaptureRow[];
}

// ── Awareness Sessions ──

export async function createSession(data: {
  startedAt: number;
  apps?: string[];
  projectContext?: string;
}): Promise<SessionRow> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const payload = {
    id,
    started_at: data.startedAt,
    ended_at: null,
    topic: null,
    apps: JSON.stringify(data.apps ?? []),
    project_context: data.projectContext ?? null,
    action_types: JSON.stringify([]),
    entity_links: JSON.stringify([]),
    summary: null,
    capture_count: 0,
    created_at: now,
  };

  const { error } = await db.from('awareness_sessions').insert(payload);
  if (error) throw new Error(`Failed to create session: ${error.message}`);

  return payload;
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const db = getDb();
  const { data, error } = await db.from('awareness_sessions').select('*').eq('id', id).single();
  return (data && !error) ? data as SessionRow : null;
}

export async function updateSession(id: string, updates: Partial<{
  ended_at: number | null;
  topic: string | null;
  apps: string[];
  project_context: string | null;
  action_types: string[];
  entity_links: string[];
  summary: string | null;
  capture_count: number;
}>): Promise<void> {
  const db = getDb();
  const payload: any = {};

  if (updates.ended_at !== undefined) payload.ended_at = updates.ended_at;
  if (updates.topic !== undefined) payload.topic = updates.topic;
  if (updates.apps !== undefined) payload.apps = JSON.stringify(updates.apps);
  if (updates.project_context !== undefined) payload.project_context = updates.project_context;
  if (updates.action_types !== undefined) payload.action_types = JSON.stringify(updates.action_types);
  if (updates.entity_links !== undefined) payload.entity_links = JSON.stringify(updates.entity_links);
  if (updates.summary !== undefined) payload.summary = updates.summary;
  if (updates.capture_count !== undefined) payload.capture_count = updates.capture_count;

  if (Object.keys(payload).length === 0) return;

  await db.from('awareness_sessions').update(payload).eq('id', id);
}

export async function endSession(id: string, summary?: string): Promise<void> {
  const db = getDb();
  await db.from('awareness_sessions').update({
    ended_at: Date.now(),
    summary: summary ?? null,
  }).eq('id', id);
}

export async function getRecentSessions(limit: number = 20): Promise<SessionRow[]> {
  const db = getDb();
  const { data, error } = await db
    .from('awareness_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as SessionRow[];
}

export async function incrementSessionCaptureCount(id: string): Promise<void> {
  const db = getDb();
  // Using a RPC or raw update for increment is better, but simple client doesn't do it.
  // We'll use a standard update pattern.
  const session = await getSession(id);
  if (session) {
    await db.from('awareness_sessions').update({ capture_count: session.capture_count + 1 }).eq('id', id);
  }
}

// ── Awareness Suggestions ──

export async function createSuggestion(data: {
  type: SuggestionType;
  triggerCaptureId?: string;
  title: string;
  body: string;
  context?: Record<string, unknown>;
}): Promise<SuggestionRow> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const payload = {
    id,
    type: data.type,
    trigger_capture_id: data.triggerCaptureId ?? null,
    title: data.title,
    body: data.body,
    context: data.context ? JSON.stringify(data.context) : null,
    delivered: 0,
    delivered_at: null,
    delivery_channel: null,
    dismissed: 0,
    acted_on: 0,
    created_at: now,
  };

  const { error } = await db.from('awareness_suggestions').insert(payload);
  if (error) throw new Error(`Failed to create suggestion: ${error.message}`);

  return payload;
}

export async function markSuggestionDelivered(id: string, channel: string): Promise<void> {
  const db = getDb();
  await db.from('awareness_suggestions').update({
    delivered: 1,
    delivered_at: Date.now(),
    delivery_channel: channel,
  }).eq('id', id);
}

export async function markSuggestionDismissed(id: string): Promise<void> {
  const db = getDb();
  await db.from('awareness_suggestions').update({ dismissed: 1 }).eq('id', id);
}

export async function markSuggestionActedOn(id: string): Promise<void> {
  const db = getDb();
  await db.from('awareness_suggestions').update({ acted_on: 1 }).eq('id', id);
}

export async function getRecentSuggestions(limit: number = 20, type?: SuggestionType): Promise<SuggestionRow[]> {
  const db = getDb();
  let q = db.from('awareness_suggestions').select('*').order('created_at', { ascending: false }).limit(limit);
  
  if (type) {
    q = q.eq('type', type);
  }

  const { data, error } = await q;
  if (error || !data) return [];
  return data as SuggestionRow[];
}

export async function getSuggestionCountSince(timestamp: number): Promise<number> {
  const db = getDb();
  const { count, error } = await db
    .from('awareness_suggestions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', timestamp);
  return count || 0;
}

export async function getSuggestionStats(startTime: number, endTime: number): Promise<{ total: number; actedOn: number }> {
  const db = getDb();
  const { data, error } = await db
    .from('awareness_suggestions')
    .select('acted_on')
    .gte('created_at', startTime)
    .lte('created_at', endTime);

  if (error || !data) return { total: 0, actedOn: 0 };

  const total = data.length;
  const actedOn = data.filter(r => r.acted_on === 1).length;

  return { total, actedOn };
}
