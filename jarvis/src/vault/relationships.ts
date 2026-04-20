import { getDb, generateId } from './schema.ts';
import type { Entity } from './entities.ts';

export type Relationship = {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  properties: Record<string, unknown> | null;
  created_at: number;
};

type RelationshipRow = {
  id: string;
  from_id: string;
  to_id: string;
  type: string;
  properties: string | null;
  created_at: number;
};

/**
 * Parse relationship row from database, deserializing JSON fields
 */
function parseRelationship(row: RelationshipRow): Relationship {
  return {
    ...row,
    properties: row.properties ? (typeof row.properties === 'string' ? JSON.parse(row.properties) : row.properties) : null,
  };
}

/**
 * Create a new relationship between entities
 */
export async function createRelationship(
  from_id: string,
  to_id: string,
  type: string,
  properties?: Record<string, unknown>
): Promise<Relationship> {
  const db = getDb();
  const id = generateId();
  const now = Date.now();

  const { error } = await db.from('relationships').insert({
    id,
    from_id,
    to_id,
    type,
    properties: properties ? JSON.stringify(properties) : null,
    created_at: now,
  });

  if (error) throw new Error(`Failed to create relationship: ${error.message}`);

  return {
    id,
    from_id,
    to_id,
    type,
    properties: properties ?? null,
    created_at: now,
  };
}

/**
 * Get a relationship by ID
 */
export async function getRelationship(id: string): Promise<Relationship | null> {
  const db = getDb();
  const { data: row, error } = await db.from('relationships').select('*').eq('id', id).single();

  if (error || !row) return null;

  return parseRelationship(row as RelationshipRow);
}

/**
 * Find relationships matching query criteria
 */
export async function findRelationships(query: {
  from_id?: string;
  to_id?: string;
  type?: string;
}): Promise<Relationship[]> {
  const db = getDb();
  let q = db.from('relationships').select('*');

  if (query.from_id) {
    q = q.eq('from_id', query.from_id);
  }

  if (query.to_id) {
    q = q.eq('to_id', query.to_id);
  }

  if (query.type) {
    q = q.eq('type', query.type);
  }

  const { data: rows, error } = await q.order('created_at', { ascending: false });

  if (error || !rows) return [];

  return (rows as RelationshipRow[]).map(parseRelationship);
}

/**
 * Get all relationships for an entity (both incoming and outgoing) with full entity details
 */
export async function getEntityRelationships(
  entityId: string
): Promise<Array<Relationship & { from_entity: Entity; to_entity: Entity }>> {
  const db = getDb();

  // We perform a manual join here since complex joins with multiple aliases for the same table
  // are tricky in the Supabase JS client depending on how foreign keys are named.
  const { data: relationships, error: relError } = await db
    .from('relationships')
    .select('*')
    .or(`from_id.eq.${entityId},to_id.eq.${entityId}`)
    .order('created_at', { ascending: false });

  if (relError || !relationships) return [];

  // Get unique entity IDs to fetch
  const entityIds = new Set<string>();
  for (const rel of relationships) {
    entityIds.add(rel.from_id);
    entityIds.add(rel.to_id);
  }

  // Fetch all related entities in bulk
  const { data: entities, error: entError } = await db
    .from('entities')
    .select('*')
    .in('id', Array.from(entityIds));

  if (entError || !entities) return [];

  const entityMap = new Map<string, Entity>();
  for (const ent of entities) {
    entityMap.set(ent.id, {
      ...ent,
      properties: ent.properties ? (typeof ent.properties === 'string' ? JSON.parse(ent.properties) : ent.properties) : null
    });
  }

  return relationships.map((row): Relationship & { from_entity: Entity; to_entity: Entity } => {
    const rel = parseRelationship(row as RelationshipRow);
    const from_entity = entityMap.get(rel.from_id)!;
    const to_entity = entityMap.get(rel.to_id)!;

    return {
      ...rel,
      from_entity,
      to_entity,
    };
  });
}

/**
 * Delete a relationship
 */
export async function deleteRelationship(id: string): Promise<boolean> {
  const db = getDb();
  const { error } = await db.from('relationships').delete().eq('id', id);
  return !error;
}
