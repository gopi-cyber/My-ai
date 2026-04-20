import { getDb, generateId, nowIso } from './schema.ts';

export type ObservationType =
  | 'file_change'
  | 'notification'
  | 'clipboard'
  | 'app_activity'
  | 'calendar'
  | 'email'
  | 'browser'
  | 'process'
  | 'screen_capture';

export type Observation = {
  id: string;
  type: ObservationType;
  data: Record<string, unknown>;
  processed: boolean;
  created_at: string; // Changed from number to string (ISO)
};

type ObservationRow = {
  id: string;
  type: ObservationType;
  data: string;
  processed: boolean;
  created_at: string; // Changed from number to string (ISO)
};

/**
 * Parse observation row from database, deserializing JSON fields
 */
function parseObservation(row: ObservationRow): Observation {
  return {
    ...row,
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    processed: !!row.processed,
  };
}

/**
 * Create a new observation
 */
export async function createObservation(
  type: ObservationType,
  data: Record<string, unknown>
): Promise<Observation> {
  const db = getDb();
  const id = generateId();
  const createdAt = nowIso();

  const { error } = await db.from('observations').insert({
    id,
    type,
    data: JSON.stringify(data),
    processed: false,
    created_at: createdAt,
  });

  if (error) throw new Error(`Failed to create observation: ${error.message}`);

  return {
    id,
    type,
    data,
    processed: false,
    created_at: createdAt,
  };
}

/**
 * Get unprocessed observations
 */
export async function getUnprocessed(limit: number = 100): Promise<Observation[]> {
  const db = getDb();
  const { data: rows, error } = await db
    .from('observations')
    .select('*')
    .eq('processed', false)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !rows) return [];

  return (rows as ObservationRow[]).map(parseObservation);
}

/**
 * Mark an observation as processed
 */
export async function markProcessed(id: string): Promise<void> {
  const db = getDb();
  await db.from('observations').update({ processed: true }).eq('id', id);
}

/**
 * Get recent observations, optionally filtered by type
 */
export async function getRecentObservations(
  type?: ObservationType,
  limit: number = 50
): Promise<Observation[]> {
  const db = getDb();

  let q = db.from('observations').select('*');

  if (type) {
    q = q.eq('type', type);
  }

  const { data: rows, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !rows) return [];

  return (rows as ObservationRow[]).map(parseObservation);
}
