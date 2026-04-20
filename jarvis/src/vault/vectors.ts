import { getDb, generateId } from './schema.ts';

export type VectorRecord = {
  id: string;
  ref_type: string;
  ref_id: string;
  embedding: number[];
  model: string;
  created_at: string;
};

/**
 * Store a vector embedding for a reference entity or fact
 */
export async function storeVector(
  ref_type: string,
  ref_id: string,
  embedding: number[] | Float32Array,
  model: string
): Promise<VectorRecord> {
  const db = getDb();
  const id = generateId();
  const created_at = new Date().toISOString();

  // Ensure embedding is a standard array for Supabase JSONB/Array storage
  const vectorArray = Array.isArray(embedding) ? embedding : Array.from(embedding);

  const { data, error } = await db
    .from('vectors')
    .insert({
      id,
      ref_type,
      ref_id,
      embedding: vectorArray,
      model,
      created_at,
    })
    .select()
    .single();

  if (error) throw error;
  return data as VectorRecord;
}

/**
 * Find similar vectors using cosine similarity
 * 
 * NOTE: This is currently a stub. In a production environment with Supabase,
 * you would use pgvector and a call like:
 * 
 * const { data, error } = await supabase.rpc('match_vectors', {
 *   query_embedding: embedding,
 *   match_threshold: 0.78,
 *   match_count: limit,
 * });
 */
export async function findSimilar(
  embedding: number[] | Float32Array,
  limit: number = 10
): Promise<Array<{ ref_type: string; ref_id: string; similarity: number }>> {
  // TODO: Implement vector similarity search with Supabase RPC / pgvector
  return [];
}

/**
 * Delete all vectors for a given reference
 */
export async function deleteVectors(ref_type: string, ref_id: string): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from('vectors')
    .delete()
    .match({ ref_type, ref_id });
  
  if (error) throw error;
}
