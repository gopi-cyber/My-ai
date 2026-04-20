import { getDb, generateId } from './schema.ts';

export type CommitmentPriority = 'low' | 'normal' | 'high' | 'critical';
export type CommitmentStatus = 'pending' | 'active' | 'completed' | 'failed' | 'escalated';

export type RetryPolicy = {
  max_retries: number;
  interval_ms: number;
  escalate_after: number;
};

export type Commitment = {
  id: string;
  what: string;
  when_due: number | null;
  context: string | null;
  priority: CommitmentPriority;
  status: CommitmentStatus;
  retry_policy: RetryPolicy | null;
  created_from: string | null;
  assigned_to: string | null;
  created_at: number;
  completed_at: number | null;
  result: string | null;
  sort_order: number;
};

type CommitmentRow = {
  id: string;
  what: string;
  when_due: number | null;
  context: string | null;
  priority: CommitmentPriority;
  status: CommitmentStatus;
  retry_policy: string | null;
  created_from: string | null;
  assigned_to: string | null;
  created_at: number;
  completed_at: number | null;
  result: string | null;
  sort_order: number;
};

/**
 * Parse commitment row from database, deserializing JSON fields
 */
function parseCommitment(row: CommitmentRow): Commitment {
  return {
    ...row,
    retry_policy: row.retry_policy ? (typeof row.retry_policy === 'string' ? JSON.parse(row.retry_policy) : row.retry_policy) : null,
  };
}

/**
 * Create a new commitment
 */
export async function createCommitment(
  what: string,
  opts?: {
    when_due?: number;
    context?: string;
    priority?: CommitmentPriority;
    retry_policy?: RetryPolicy;
    created_from?: string;
    assigned_to?: string;
  }
): Promise<Commitment> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();
  const priority = opts?.priority ?? 'normal';

  const { error } = await db.from('commitments').insert({
    id,
    what,
    when_due: opts?.when_due ?? null,
    context: opts?.context ?? null,
    priority,
    status: 'pending',
    retry_policy: opts?.retry_policy ? JSON.stringify(opts.retry_policy) : null,
    created_from: opts?.created_from ?? null,
    assigned_to: opts?.assigned_to ?? null,
    created_at: now,
    completed_at: null,
    result: null,
    sort_order: 0,
  });

  if (error) throw new Error(`Failed to create commitment: ${error.message}`);

  return {
    id,
    what,
    when_due: opts?.when_due ?? null,
    context: opts?.context ?? null,
    priority,
    status: 'pending',
    retry_policy: opts?.retry_policy ?? null,
    created_from: opts?.created_from ?? null,
    assigned_to: opts?.assigned_to ?? null,
    created_at: now,
    completed_at: null,
    result: null,
    sort_order: 0,
  };
}

/**
 * Get a commitment by ID
 */
export async function getCommitment(id: string): Promise<Commitment | null> {
  const db = getDb();
  const { data: row, error } = await db.from('commitments').select('*').eq('id', id).single();

  if (error || !row) return null;

  return parseCommitment(row as CommitmentRow);
}

/**
 * Find commitments matching query criteria
 */
export async function findCommitments(query: {
  status?: CommitmentStatus;
  priority?: CommitmentPriority;
  assigned_to?: string;
  overdue?: boolean;
}): Promise<Commitment[]> {
  const db = getDb();
  let q = db.from('commitments').select('*');

  if (query.status) {
    q = q.eq('status', query.status);
  }

  if (query.priority) {
    q = q.eq('priority', query.priority);
  }

  if (query.assigned_to) {
    q = q.eq('assigned_to', query.assigned_to);
  }

  if (query.overdue) {
    q = q.lte('when_due', Date.now()).in('status', ['pending', 'active']);
  }

  const { data: rows, error } = await q.order('sort_order', { ascending: true }).order('created_at', { ascending: false });

  if (error || !rows) return [];

  return (rows as CommitmentRow[]).map(parseCommitment);
}

/**
 * Get upcoming commitments, ordered by due date
 */
export async function getUpcoming(limit: number = 10): Promise<Commitment[]> {
  const db = getDb();
  const { data: rows, error } = await db
    .from('commitments')
    .select('*')
    .in('status', ['pending', 'active'])
    .not('when_due', 'is', null)
    .order('when_due', { ascending: true })
    .limit(limit);

  if (error || !rows) return [];

  return (rows as CommitmentRow[]).map(parseCommitment);
}

/**
 * Mark a commitment as completed
 */
export async function completeCommitment(id: string, result?: string): Promise<Commitment | null> {
  const db = getDb();
  const { error } = await db.from('commitments').update({
    status: 'completed',
    completed_at: Date.now(),
    result: result ?? null,
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Mark a commitment as failed
 */
export async function failCommitment(id: string, reason?: string): Promise<Commitment | null> {
  const db = getDb();
  const { error } = await db.from('commitments').update({
    status: 'failed',
    completed_at: Date.now(),
    result: reason ?? null,
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Escalate a commitment
 */
export async function escalateCommitment(id: string): Promise<Commitment | null> {
  const db = getDb();
  const { error } = await db.from('commitments').update({
    status: 'escalated',
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Get commitments that are currently due
 */
export async function getDueCommitments(): Promise<Commitment[]> {
  const db = getDb();
  const now = Date.now();
  const { data: rows, error } = await db
    .from('commitments')
    .select('*')
    .not('when_due', 'is', null)
    .lte('when_due', now)
    .in('status', ['pending', 'active'])
    .order('when_due', { ascending: true });

  if (error || !rows) return [];

  return (rows as CommitmentRow[]).map(parseCommitment);
}

/**
 * Update a commitment's status to any valid status.
 * Sets completed_at for terminal states (completed, failed).
 */
export async function updateCommitmentStatus(
  id: string,
  status: CommitmentStatus,
  result?: string
): Promise<Commitment | null> {
  const db = getDb();
  const isTerminal = status === 'completed' || status === 'failed';
  const completedAt = isTerminal ? Date.now() : null;

  const { error } = await db.from('commitments').update({
    status,
    completed_at: completedAt,
    result: result ?? null,
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Update a commitment's assigned_to field.
 */
export async function updateCommitmentAssignee(id: string, assignedTo: string): Promise<Commitment | null> {
  const db = getDb();
  const { error } = await db.from('commitments').update({
    assigned_to: assignedTo,
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Update a commitment's due date.
 */
export async function updateCommitmentDue(id: string, when_due: number | null): Promise<Commitment | null> {
  const db = getDb();
  const { error } = await db.from('commitments').update({
    when_due,
  }).eq('id', id);

  if (error) return null;

  return getCommitment(id);
}

/**
 * Bulk update sort order for commitments (used by kanban drag & drop).
 */
export async function reorderCommitments(
  items: { id: string; sort_order: number }[]
): Promise<void> {
  const db = getDb();
  
  const updates = items.map(item => 
    db.from('commitments').update({ sort_order: item.sort_order }).eq('id', item.id)
  );

  await Promise.all(updates);
}
