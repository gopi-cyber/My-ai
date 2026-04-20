import { getDb, generateId } from './schema.ts';

/** Escape SQL LIKE wildcard characters in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

export type EntityType = 'person' | 'project' | 'tool' | 'place' | 'concept' | 'event';

export type Entity = {
  id: string;
  type: EntityType;
  name: string;
  properties: Record<string, unknown> | null;
  created_at: number;
  updated_at: number;
  source: string | null;
};

type EntityRow = {
  id: string;
  type: EntityType;
  name: string;
  properties: string | null;
  created_at: number;
  updated_at: number;
  source: string | null;
};

/**
 * Parse entity row from database, deserializing JSON fields
 */
function parseEntity(row: EntityRow): Entity {
  return {
    ...row,
    properties: row.properties ? (typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties) : null,
  };
}

/**
 * Create a new entity in the knowledge graph
 */
export async function createEntity(
  type: EntityType,
  name: string,
  properties?: Record<string, unknown>,
  source?: string
): Promise<Entity> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('entities').insert({
    id,
    type,
    name,
    properties: properties ? JSON.stringify(properties) : null,
    created_at: now,
    updated_at: now,
    source: source ?? null,
  });

  if (error) throw new Error(`Failed to create entity: ${error.message}`);

  return {
    id,
    type,
    name,
    properties: properties ?? null,
    created_at: now,
    updated_at: now,
    source: source ?? null,
  };
}

/**
 * Get an entity by ID
 */
export async function getEntity(id: string): Promise<Entity | null> {
  const db = getDb();
  const { data: row, error } = await db.from('entities').select('*').eq('id', id).single();

  if (error || !row) return null;

  return parseEntity(row as EntityRow);
}

/**
 * Find entities matching query criteria
 */
export async function findEntities(query: {
  type?: EntityType;
  name?: string;
  nameContains?: string;
}): Promise<Entity[]> {
  const db = getDb();
  let q = db.from('entities').select('*');

  if (query.type) {
    q = q.eq('type', query.type);
  }

  if (query.name) {
    q = q.eq('name', query.name);
  }

  if (query.nameContains) {
    q = q.like('name', `%${escapeLike(query.nameContains)}%`);
  }

  const { data: rows, error } = await q.order('updated_at', { ascending: false });

  if (error || !rows) return [];

  return (rows as EntityRow[]).map(parseEntity);
}

/**
 * Update an entity's properties
 */
export async function updateEntity(
  id: string,
  updates: Partial<Pick<Entity, 'name' | 'properties' | 'type'>>
): Promise<Entity | null> {
  const db = getDb();
  
  const payload: any = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.properties !== undefined) payload.properties = JSON.stringify(updates.properties);
  
  if (Object.keys(payload).length === 0) return getEntity(id);

  payload.updated_at = Date.now();

  const { error } = await db.from('entities').update(payload).eq('id', id);

  if (error) throw new Error(`Failed to update entity: ${error.message}`);

  return getEntity(id);
}

/**
 * Delete an entity and all related facts/relationships (via cascade)
 */
export async function deleteEntity(id: string): Promise<boolean> {
  const db = getDb();
  const { error, count } = await db.from('entities').delete().eq('id', id);
  return !error;
}

/**
 * Search entities by name using LIKE query
 */
export async function searchEntitiesByName(query: string): Promise<Entity[]> {
  const db = getDb();
  const { data, error } = await db
    .from('entities')
    .select('*')
    .like('name', `%${escapeLike(query)}%`)
    .order('name', { ascending: true });

  if (error || !data) return [];
  return (data as EntityRow[]).map(parseEntity);
}
