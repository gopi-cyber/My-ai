import { getDb, generateId } from '../vault/schema.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionCategory } from '../roles/authority.ts';

export type AuthorityDecisionType = 'allowed' | 'denied' | 'approval_required';

export type AuditEntry = {
  id: string;
  agent_id: string;
  agent_name: string;
  tool_name: string;
  action_category: ActionCategory;
  authority_decision: AuthorityDecisionType;
  approval_id: string | null;
  executed: number; // 0 or 1
  execution_time_ms: number | null;
  created_at: number;
};

export class AuditTrail {
  private db: SupabaseClient;

  constructor() {
    this.db = getDb();
  }

  /**
   * Log a tool execution decision.
   */
  async log(entry: {
    agent_id: string;
    agent_name: string;
    tool_name: string;
    action_category: ActionCategory;
    authority_decision: AuthorityDecisionType;
    approval_id?: string | null;
    executed: boolean;
    execution_time_ms?: number | null;
  }): Promise<AuditEntry> {
    const id = generateId();
    const now = Date.now();

    const auditRow = {
      id,
      agent_id: entry.agent_id,
      agent_name: entry.agent_name,
      tool_name: entry.tool_name,
      action_category: entry.action_category,
      authority_decision: entry.authority_decision,
      approval_id: entry.approval_id ?? null,
      executed: entry.executed ? 1 : 0,
      execution_time_ms: entry.execution_time_ms ?? null,
      created_at: now,
    };

    const { error } = await this.db.from('audit_trail').insert([auditRow]);
    if (error) throw new Error(`Failed to log audit entry: ${error.message}`);

    return auditRow;
  }

  /**
   * Query audit entries with filters.
   */
  async query(filters?: {
    agentId?: string;
    action?: ActionCategory;
    tool?: string;
    decision?: AuthorityDecisionType;
    since?: number;
    limit?: number;
  }): Promise<AuditEntry[]> {
    let query = this.db.from('audit_trail').select('*').order('created_at', { ascending: false });

    if (filters?.agentId) query = query.eq('agent_id', filters.agentId);
    if (filters?.action) query = query.eq('action_category', filters.action);
    if (filters?.tool) query = query.eq('tool_name', filters.tool);
    if (filters?.decision) query = query.eq('authority_decision', filters.decision);
    if (filters?.since) query = query.gte('created_at', filters.since);

    const { data, error } = await query.limit(filters?.limit ?? 100);

    if (error) return [];
    return data || [];
  }

  /**
   * Get aggregate statistics.
   */
  async getStats(since?: number): Promise<{
    total: number;
    allowed: number;
    denied: number;
    approvalRequired: number;
    byCategory: Record<string, number>;
  }> {
    let query = this.db.from('audit_trail').select('authority_decision, action_category');
    if (since) query = query.gte('created_at', since);

    const { data, error } = await query;

    const stats = {
      total: 0,
      allowed: 0,
      denied: 0,
      approvalRequired: 0,
      byCategory: {} as Record<string, number>,
    };

    if (error || !data) return stats;

    for (const row of data) {
      stats.total++;
      if (row.authority_decision === 'allowed') stats.allowed++;
      if (row.authority_decision === 'denied') stats.denied++;
      if (row.authority_decision === 'approval_required') stats.approvalRequired++;

      const category = row.action_category;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    }

    return stats;
  }
}
