import type { SupabaseClient } from '@supabase/supabase-js';
import { getDb } from '../vault/schema.ts';

export type EvolutionType = 'optimization' | 'crash_fix' | 'learning' | 'failover';
export type EvolutionStatus = 'pending' | 'success' | 'failed' | 'rolled_back';

export interface EvolutionEvent {
  type: EvolutionType;
  target?: string;
  summary: string;
  details?: string;
  status?: EvolutionStatus;
  stability_impact?: number;
}

// In-memory fallback when the evolution_log table doesn't exist yet
const memoryLog: Array<EvolutionEvent & { id: string; timestamp: string }> = [];

export class EvolutionLogger {
  private static instance: EvolutionLogger;
  private db: SupabaseClient;
  private tableExists = true; // Assume it exists; flip on first failure

  private constructor() {
    this.db = getDb();
  }

  public static getInstance(): EvolutionLogger {
    if (!EvolutionLogger.instance) {
      EvolutionLogger.instance = new EvolutionLogger();
    }
    return EvolutionLogger.instance;
  }

  /**
   * Log a new evolution event to the database.
   * Falls back to in-memory storage if the table doesn't exist.
   */
  async log(event: EvolutionEvent): Promise<string | null> {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // If we already know the table doesn't exist, skip DB call
    if (!this.tableExists) {
      memoryLog.unshift({ ...event, id, timestamp });
      if (memoryLog.length > 100) memoryLog.pop();
      return id;
    }

    try {
      const { data, error } = await this.db
        .from('evolution_log')
        .insert([{ ...event, timestamp }])
        .select()
        .single();

      if (error) {
        // If the table doesn't exist, switch to in-memory mode silently
        if (error.code === 'PGRST205' || error.message?.includes('evolution_log')) {
          console.warn('[EvolutionLogger] Table not found — using in-memory fallback. Run migrations/add_evolution_log.sql to fix.');
          this.tableExists = false;
          memoryLog.unshift({ ...event, id, timestamp });
          return id;
        }
        console.error('[EvolutionLogger] Error logging event:', error);
        return null;
      }
      
      console.log(`[EvolutionLogger] Logged event: ${event.type} - ${event.summary}`);
      return data.id;
    } catch (err) {
      console.error('[EvolutionLogger] Exception logging event:', err);
      memoryLog.unshift({ ...event, id, timestamp });
      return id;
    }
  }

  /**
   * Update the status of an existing evolution event.
   */
  async updateStatus(id: string, status: EvolutionStatus, details?: string): Promise<void> {
    // Check in-memory log first
    const memEntry = memoryLog.find(e => e.id === id);
    if (memEntry) {
      memEntry.status = status;
      if (details) memEntry.details = details;
      return;
    }

    if (!this.tableExists) return;

    try {
      const { error } = await this.db
        .from('evolution_log')
        .update({ status, details })
        .eq('id', id);

      if (error) {
        console.error('[EvolutionLogger] Error updating event status:', error);
      }
    } catch (err) {
      console.error('[EvolutionLogger] Exception updating event status:', err);
    }
  }

  /**
   * Get recent evolution logs (DB + in-memory merged).
   */
  async getRecent(limit = 50) {
    let dbLogs: any[] = [];

    if (this.tableExists) {
      try {
        const { data, error } = await this.db
          .from('evolution_log')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(limit);

        if (error) {
          if (error.code === 'PGRST205' || error.message?.includes('evolution_log')) {
            this.tableExists = false;
          } else {
            console.error('[EvolutionLogger] Error fetching logs:', error);
          }
        } else {
          dbLogs = data ?? [];
        }
      } catch (err) {
        console.error('[EvolutionLogger] Exception fetching logs:', err);
      }
    }

    // Merge in-memory logs with DB logs, most recent first
    const allLogs = [...memoryLog, ...dbLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return allLogs;
  }
}
