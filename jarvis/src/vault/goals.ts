/**
 * Goal Vault — CRUD operations for M16 Autonomous Goal Pursuit
 */

import { getDb, generateId, nowIso } from './schema.ts';
import type {
  Goal, GoalProgressEntry, GoalCheckIn,
  GoalLevel, GoalStatus, GoalHealth, EscalationStage,
  GoalQuery, GoalUpdate,
} from '../goals/types.ts';

// ── Row types (raw DB) ──────────────────────────────────────────────

type GoalRow = Omit<Goal, 'tags' | 'dependencies'> & {
  tags: string | null;
  dependencies: string | null;
};

type ProgressRow = GoalProgressEntry;

type CheckInRow = Omit<GoalCheckIn, 'goals_reviewed' | 'actions_planned' | 'actions_completed'> & {
  goals_reviewed: string | null;
  actions_planned: string | null;
  actions_completed: string | null;
};

// ── Parsers ─────────────────────────────────────────────────────────

function parseGoal(row: GoalRow): Goal {
  return {
    ...row,
    tags: row.tags ? (typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags) : [],
    dependencies: row.dependencies ? (typeof row.dependencies === 'string' ? JSON.parse(row.dependencies) : row.dependencies) : [],
  };
}

function parseCheckIn(row: CheckInRow): GoalCheckIn {
  return {
    ...row,
    goals_reviewed: row.goals_reviewed ? (typeof row.goals_reviewed === 'string' ? JSON.parse(row.goals_reviewed) : row.goals_reviewed) : [],
    actions_planned: row.actions_planned ? (typeof row.actions_planned === 'string' ? JSON.parse(row.actions_planned) : row.actions_planned) : [],
    actions_completed: row.actions_completed ? (typeof row.actions_completed === 'string' ? JSON.parse(row.actions_completed) : row.actions_completed) : [],
  };
}

// ── Goals CRUD ──────────────────────────────────────────────────────

export async function createGoal(
  title: string,
  level: GoalLevel,
  opts?: {
    parent_id?: string;
    description?: string;
    success_criteria?: string;
    time_horizon?: string;
    deadline?: number;
    estimated_hours?: number;
    authority_level?: number;
    tags?: string[];
    dependencies?: string[];
    status?: GoalStatus;
    sort_order?: number;
  },
): Promise<Goal> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('goals').insert({
    id,
    parent_id: opts?.parent_id ?? null,
    level,
    title,
    description: opts?.description ?? '',
    success_criteria: opts?.success_criteria ?? '',
    time_horizon: opts?.time_horizon ?? 'quarterly',
    score: 0.0,
    score_reason: null,
    status: opts?.status ?? 'draft',
    health: 'on_track',
    deadline: opts?.deadline ? new Date(opts.deadline).toISOString() : null,
    started_at: opts?.status === 'active' ? now : null,
    estimated_hours: opts?.estimated_hours ?? null,
    actual_hours: 0,
    authority_level: opts?.authority_level ?? 3,
    tags: opts?.tags ? JSON.stringify(opts.tags) : null,
    dependencies: opts?.dependencies ? JSON.stringify(opts.dependencies) : null,
    escalation_stage: 'none',
    escalation_started_at: null,
    sort_order: opts?.sort_order ?? 0,
    created_at: now,
    updated_at: now,
    completed_at: null,
  });

  if (error) throw new Error(`Failed to create goal: ${error.message}`);

  const goal = await getGoal(id);
  if (!goal) throw new Error('Failed to retrieve created goal');
  return goal;
}

export async function getGoal(id: string): Promise<Goal | null> {
  const db = getDb();
  const { data: row, error } = await db.from('goals').select('*').eq('id', id).single();
  return (row && !error) ? parseGoal(row as GoalRow) : null;
}

export async function findGoals(query: GoalQuery = {}): Promise<Goal[]> {
  const db = getDb();
  let q = db.from('goals').select('*');

  if (query.status) {
    q = q.eq('status', query.status);
  }
  if (query.level) {
    q = q.eq('level', query.level);
  }
  if (query.parent_id !== undefined) {
    if (query.parent_id === null) {
      q = q.is('parent_id', null);
    } else {
      q = q.eq('parent_id', query.parent_id);
    }
  }
  if (query.health) {
    q = q.eq('health', query.health);
  }
  if (query.tag) {
    q = q.like('tags', `%"${query.tag}"%`);
  }
  if (query.time_horizon) {
    q = q.eq('time_horizon', query.time_horizon);
  }

  const limit = Math.max(1, Math.min(parseInt(String(query.limit ?? 100), 10) || 100, 1000));
  
  const { data: rows, error } = await q
    .limit(limit);

  if (error || !rows) return [];

  return (rows as GoalRow[]).map(parseGoal);
}

export async function getRootGoals(): Promise<Goal[]> {
  return findGoals({ parent_id: null });
}

export async function getGoalChildren(parentId: string): Promise<Goal[]> {
  return findGoals({ parent_id: parentId });
}

export async function getGoalTree(rootId: string): Promise<Goal[]> {
  const result: Goal[] = [];
  const root = await getGoal(rootId);
  if (!root) return result;

  result.push(root);

  const collectChildren = async (parentId: string) => {
    const children = await getGoalChildren(parentId);
    for (const child of children) {
      result.push(child);
      await collectChildren(child.id);
    }
  };

  await collectChildren(rootId);
  return result;
}

export async function updateGoal(id: string, updates: GoalUpdate): Promise<Goal | null> {
  const db = getDb();
  const existing = await getGoal(id);
  if (!existing) return null;

  const payload: any = {};
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.success_criteria !== undefined) payload.success_criteria = updates.success_criteria;
  if (updates.time_horizon !== undefined) payload.time_horizon = updates.time_horizon;
  if (updates.deadline !== undefined) payload.deadline = updates.deadline ? new Date(updates.deadline).toISOString() : null;
  if (updates.estimated_hours !== undefined) payload.estimated_hours = updates.estimated_hours;
  if (updates.authority_level !== undefined) payload.authority_level = updates.authority_level;
  if (updates.tags !== undefined) payload.tags = JSON.stringify(updates.tags);
  if (updates.dependencies !== undefined) payload.dependencies = JSON.stringify(updates.dependencies);
  if (updates.sort_order !== undefined) payload.sort_order = updates.sort_order;

  if (Object.keys(payload).length === 0) return existing;

  payload.updated_at = nowIso();

  const { error } = await db.from('goals').update(payload).eq('id', id);
  if (error) throw new Error(`Failed to update goal: ${error.message}`);

  return getGoal(id);
}

export async function updateGoalScore(id: string, score: number, reason: string, source = 'user'): Promise<Goal | null> {
  const db = getDb();
  const existing = await getGoal(id);
  if (!existing) return null;

  const clampedScore = Math.max(0, Math.min(1, score));
  const now = nowIso();

  // Log progress entry
  await addProgressEntry(id, source === 'user' ? 'manual' : 'system', existing.score, clampedScore, reason, source);

  // Update the goal
  const { error } = await db.from('goals').update({
    score: clampedScore,
    score_reason: reason,
    updated_at: now,
  }).eq('id', id);

  if (error) throw new Error(`Failed to update goal score: ${error.message}`);

  return getGoal(id);
}

export async function updateGoalStatus(id: string, status: GoalStatus): Promise<Goal | null> {
  const db = getDb();
  const existing = await getGoal(id);
  if (!existing) return null;

  const now = nowIso();
  const isTerminal = status === 'completed' || status === 'failed' || status === 'killed';

  const payload: any = {
    status,
    updated_at: now,
  };

  if (status === 'active' && !existing.started_at) {
    payload.started_at = now;
  }

  if (isTerminal) {
    payload.completed_at = now;
  }

  const { error } = await db.from('goals').update(payload).eq('id', id);
  if (error) throw new Error(`Failed to update goal status: ${error.message}`);

  return getGoal(id);
}

export async function updateGoalHealth(id: string, health: GoalHealth): Promise<Goal | null> {
  const db = getDb();
  const now = nowIso();
  const { error } = await db.from('goals').update({
    health,
    updated_at: now,
  }).eq('id', id);
  if (error) throw new Error(`Failed to update goal health: ${error.message}`);
  return getGoal(id);
}

export async function updateGoalEscalation(id: string, stage: EscalationStage): Promise<Goal | null> {
  const db = getDb();
  const now = nowIso();

  if (stage === 'none') {
    await db.from('goals').update({
      escalation_stage: 'none',
      escalation_started_at: null,
      updated_at: now,
    }).eq('id', id);
  } else {
    const existing = await getGoal(id);
    if (!existing) return null;
    const startedAt = existing.escalation_stage === 'none' ? now : existing.escalation_started_at;
    await db.from('goals').update({
      escalation_stage: stage,
      escalation_started_at: startedAt,
      updated_at: now,
    }).eq('id', id);
  }

  return getGoal(id);
}

export async function updateGoalActualHours(id: string, hours: number): Promise<Goal | null> {
  const db = getDb();
  const now = nowIso();
  await db.from('goals').update({
    actual_hours: hours,
    updated_at: now,
  }).eq('id', id);
  return getGoal(id);
}

export async function deleteGoal(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('goals').delete().eq('id', id);
  return !error;
}

export async function reorderGoals(items: { id: string; sort_order: number }[]): Promise<void> {
  const db = getDb();
  const now = nowIso();

  const updates = items.map(item => 
    db.from('goals').update({ sort_order: item.sort_order, updated_at: now }).eq('id', item.id)
  );

  await Promise.all(updates);
}

export async function getOverdueGoals(): Promise<Goal[]> {
  const db = getDb();
  const now = nowIso();
  const { data: rows, error } = await db
    .from('goals')
    .select('*')
    .eq('status', 'active')
    .not('deadline', 'is', null)
    .lt('deadline', now)
    .order('deadline', { ascending: true });

  if (error || !rows) return [];
  return (rows as GoalRow[]).map(parseGoal);
}

export async function getGoalsByDependency(goalId: string): Promise<Goal[]> {
  const db = getDb();
  // Using LIKE for JSON array search as a fallback if not using Postgres JSON functions
  const { data: rows, error } = await db
    .from('goals')
    .select('*')
    .like('dependencies', `%${goalId}%`)
    .in('status', ['draft', 'active', 'paused']);

  if (error || !rows) return [];
  return (rows as GoalRow[]).map(parseGoal);
}

export async function getGoalsNeedingEscalation(): Promise<Goal[]> {
  const db = getDb();
  const { data: rows, error } = await db
    .from('goals')
    .select('*')
    .eq('status', 'active')
    .in('health', ['behind', 'critical'])
    .order('deadline', { ascending: true });

  if (error || !rows) return [];
  return (rows as GoalRow[]).map(parseGoal);
}

export async function getActiveGoalsByLevel(level: GoalLevel): Promise<Goal[]> {
  return findGoals({ status: 'active', level });
}

// ── Progress Entries ────────────────────────────────────────────────

export async function addProgressEntry(
  goalId: string,
  type: 'manual' | 'auto_detected' | 'review' | 'system',
  scoreBefore: number,
  scoreAfter: number,
  note: string,
  source: string,
): Promise<GoalProgressEntry> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('goal_progress').insert({
    id,
    goal_id: goalId,
    type,
    score_before: scoreBefore,
    score_after: scoreAfter,
    note,
    source,
    created_at: now,
  });

  if (error) throw new Error(`Failed to add progress entry: ${error.message}`);

  return { id, goal_id: goalId, type, score_before: scoreBefore, score_after: scoreAfter, note, source, created_at: now as any };
}

export async function getProgressHistory(goalId: string, limit = 50): Promise<GoalProgressEntry[]> {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const { data: rows, error } = await db
    .from('goal_progress')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error || !rows) return [];
  return rows as GoalProgressEntry[];
}

// ── Check-Ins ───────────────────────────────────────────────────────

export async function createCheckIn(
  type: 'morning_plan' | 'evening_review',
  summary: string,
  goalsReviewed: string[],
  actionsPlanned: string[] = [],
  actionsCompleted: string[] = [],
): Promise<GoalCheckIn> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('goal_check_ins').insert({
    id,
    type,
    summary,
    goals_reviewed: JSON.stringify(goalsReviewed),
    actions_planned: JSON.stringify(actionsPlanned),
    actions_completed: JSON.stringify(actionsCompleted),
    created_at: now,
  });

  if (error) throw new Error(`Failed to create check-in: ${error.message}`);

  return {
    id, type, summary,
    goals_reviewed: goalsReviewed,
    actions_planned: actionsPlanned,
    actions_completed: actionsCompleted,
    created_at: now as any,
  };
}

export async function getRecentCheckIns(type?: 'morning_plan' | 'evening_review', limit = 10): Promise<GoalCheckIn[]> {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(limit, 100));

  let q = db.from('goal_check_ins').select('*');

  if (type) {
    q = q.eq('type', type);
  }

  const { data: rows, error } = await q
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error || !rows) return [];
  return (rows as CheckInRow[]).map(parseCheckIn);
}

export async function getTodayCheckIn(type: 'morning_plan' | 'evening_review'): Promise<GoalCheckIn | null> {
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: row, error } = await db
    .from('goal_check_ins')
    .select('*')
    .eq('type', type)
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (row && !error) ? parseCheckIn(row as CheckInRow) : null;
}

// ── Metrics ─────────────────────────────────────────────────────────

export async function getGoalMetrics(): Promise<{
  total: number;
  active: number;
  completed: number;
  failed: number;
  killed: number;
  avg_score: number;
  on_track: number;
  at_risk: number;
  behind: number;
  critical: number;
  overdue: number;
}> {
  const db = getDb();

  // For metrics, we'll do three separate counts as complex grouping isn't as ergonomic in the REST client
  const { data: statusData } = await db.from('goals').select('status');
  const { data: healthData } = await db.from('goals').select('health').eq('status', 'active');
  const { data: scoreData } = await db.from('goals').select('score').eq('status', 'active').eq('level', 'objective');
  const { count: overdueCount } = await db.from('goals').select('id', { count: 'exact', head: true }).eq('status', 'active').not('deadline', 'is', null).lt('deadline', nowIso());

  const statusMap: Record<string, number> = {};
  if (statusData) {
    for (const r of statusData) statusMap[r.status] = (statusMap[r.status] || 0) + 1;
  }

  const healthMap: Record<string, number> = {};
  if (healthData) {
    for (const r of healthData) healthMap[r.health] = (healthMap[r.health] || 0) + 1;
  }

  const totalScore = scoreData?.reduce((sum, r) => sum + (r.score || 0), 0) || 0;
  const avgScore = scoreData && scoreData.length > 0 ? totalScore / scoreData.length : 0;

  return {
    total: statusData?.length || 0,
    active: statusMap['active'] ?? 0,
    completed: statusMap['completed'] ?? 0,
    failed: statusMap['failed'] ?? 0,
    killed: statusMap['killed'] ?? 0,
    avg_score: avgScore,
    on_track: healthMap['on_track'] ?? 0,
    at_risk: healthMap['at_risk'] ?? 0,
    behind: healthMap['behind'] ?? 0,
    critical: healthMap['critical'] ?? 0,
    overdue: overdueCount || 0,
  };
}
