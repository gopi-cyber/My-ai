import { getDb, generateId } from './schema.ts';
import { findEntities } from './entities.ts';

export type Fact = {
  id: string;
  subject_id: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string | null;
  created_at: number;
  verified_at: number | null;
};

type FactRow = {
  id: string;
  subject_id: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string | null;
  created_at: number;
  verified_at: number | null;
};

/**
 * Parse fact row from database
 */
function parseFact(row: FactRow): Fact {
  return { ...row };
}

/**
 * Create a new fact in the knowledge graph
 */
export async function createFact(
  subject_id: string,
  predicate: string,
  object: string,
  opts?: { confidence?: number; source?: string }
): Promise<Fact> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();
  const confidence = opts?.confidence ?? 1.0;
  const source = opts?.source ?? null;

  const objectStr = typeof object === 'string' ? object : JSON.stringify(object);

  const { error } = await db.from('facts').insert({
    id,
    subject_id,
    predicate,
    object: objectStr,
    confidence,
    source,
    created_at: now,
    verified_at: null,
  });

  if (error) throw new Error(`Failed to create fact: ${error.message}`);

  return {
    id,
    subject_id,
    predicate,
    object,
    confidence,
    source,
    created_at: now,
    verified_at: null,
  };
}

/**
 * Get a fact by ID
 */
export async function getFact(id: string): Promise<Fact | null> {
  const db = getDb();
  const { data: row, error } = await db.from('facts').select('*').eq('id', id).single();

  if (error || !row) return null;

  return parseFact(row as FactRow);
}

/**
 * Find facts matching query criteria
 */
export async function findFacts(query: {
  subject_id?: string;
  predicate?: string;
  object?: string;
}): Promise<Fact[]> {
  const db = getDb();
  let q = db.from('facts').select('*');

  if (query.subject_id) {
    q = q.eq('subject_id', query.subject_id);
  }

  if (query.predicate) {
    q = q.eq('predicate', query.predicate);
  }

  if (query.object) {
    q = q.eq('object', query.object);
  }

  const { data: rows, error } = await q.order('created_at', { ascending: false });

  if (error || !rows) return [];

  return (rows as FactRow[]).map(parseFact);
}

/**
 * Query a fact by subject name and predicate
 * Example: "What is Anna's birthday?" → queryFact("Anna", "birthday")
 */
export async function queryFact(subjectName: string, predicate: string): Promise<Fact | null> {
  const entities = await findEntities({ name: subjectName });

  if (entities.length === 0) return null;

  // Use the first matching entity
  const facts = await findFacts({ subject_id: entities[0]!.id, predicate });

  return facts.length > 0 ? facts[0]! : null;
}

/**
 * Update a fact's properties
 */
export async function updateFact(
  id: string,
  updates: Partial<Pick<Fact, 'predicate' | 'object' | 'confidence' | 'source'>>
): Promise<Fact | null> {
  const db = getDb();
  
  const payload: any = {};
  if (updates.predicate !== undefined) payload.predicate = updates.predicate;
  if (updates.object !== undefined) payload.object = updates.object;
  if (updates.confidence !== undefined) payload.confidence = updates.confidence;
  if (updates.source !== undefined) payload.source = updates.source;

  if (Object.keys(payload).length === 0) return getFact(id);

  const { error } = await db.from('facts').update(payload).eq('id', id);

  if (error) throw new Error(`Failed to update fact: ${error.message}`);

  return getFact(id);
}

/**
 * Delete a fact
 */
export async function deleteFact(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('facts').delete().eq('id', id);
  return !error;
}

/**
 * Mark a fact as verified
 */
export async function verifyFact(id: string): Promise<void> {
  const db = getDb();
  await db.from('facts').update({ verified_at: Date.now() }).eq('id', id);
}
