import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

/**
 * Standardized ISO-8601 timestamp helpers for PostgreSQL TIMESTAMPTZ compatibility
 */
export function toIso(timestamp?: number | string | Date): string {
  if (!timestamp) return new Date().toISOString();
  // If it's already an ISO string (contains T and Z/offset), return it
  if (typeof timestamp === 'string' && timestamp.includes('T')) return timestamp;
  return new Date(timestamp).toISOString();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Generate a short unique ID for database records
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get the current Supabase database instance (singleton)
 */
export function getDb(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;

    // For tests running in environments where Supabase isn't configured,
    // we allow the instance to be null initially and hope it's injected.
    if (!url || !key) {
      if (process.env.NODE_ENV === 'test') return null as any;
      throw new Error("SUPABASE_URL and SUPABASE_KEY must be set in environment.");
    }

    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

/**
 * Manually set the database instance (useful for testing)
 */
export function setDb(client: any): void {
  supabaseInstance = client as SupabaseClient;
}

/**
 * Initialization - sets up the database instance.
 * If dbPath is ':memory:', it implies a test environment and we use MockSupabaseClient if available.
 */
export async function initDatabase(dbPath?: string): Promise<any> {
  if (dbPath === ':memory:') {
    try {
      const { mockDb } = await import('./test-utils.ts');
      mockDb.reset();
      setDb(mockDb);
      console.log("Memory database mock initialized for testing.");
    } catch {
      console.warn("MockSupabaseClient not found, falling back to real Supabase (if configured).");
    }
  }
  console.log("Supabase initialization complete (on-demand via environment).");
  return getDb();
}

/**
 * Close the database connection (no-op for Supabase REST client)
 */
export function closeDb(): void {
  supabaseInstance = null;
}
