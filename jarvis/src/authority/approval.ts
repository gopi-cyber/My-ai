import { getDb, generateId, nowIso } from '../vault/schema.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionCategory } from '../roles/authority.ts';

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'executed';
export type ApprovalUrgency = 'urgent' | 'normal';

export type ApprovalRequest = {
  id: string;
  agent_id: string;
  agent_name: string;
  tool_name: string;
  tool_arguments: string; // JSON string
  action_category: ActionCategory;
  urgency: ApprovalUrgency;
  reason: string;
  context: string;
  status: ApprovalStatus;
  decided_at: string | null;
  decided_by: string | null;
  executed_at: string | null;
  execution_result: string | null;
  created_at: string;
};

export class ApprovalManager {
  private db: SupabaseClient;

  constructor() {
    this.db = getDb();
  }

  /**
   * Create a new approval request and persist to DB.
   */
  async createRequest(params: {
    agentId: string;
    agentName: string;
    toolName: string;
    toolArguments: Record<string, unknown>;
    actionCategory: ActionCategory;
    urgency: ApprovalUrgency;
    reason: string;
    context: string;
  }): Promise<ApprovalRequest> {
    const id = generateId();
    const now = nowIso();
    const toolArgs = JSON.stringify(params.toolArguments);

    const { error } = await this.db.from('approval_requests').insert([{
      id,
      agent_id: params.agentId,
      agent_name: params.agentName,
      tool_name: params.toolName,
      tool_arguments: toolArgs,
      action_category: params.actionCategory,
      urgency: params.urgency,
      reason: params.reason,
      context: params.context,
      status: 'pending',
      created_at: now
    }]);

    if (error) throw new Error(`Failed to create approval request: ${error.message}`);

    return {
      id,
      agent_id: params.agentId,
      agent_name: params.agentName,
      tool_name: params.toolName,
      tool_arguments: toolArgs,
      action_category: params.actionCategory as ActionCategory,
      urgency: params.urgency,
      reason: params.reason,
      context: params.context,
      status: 'pending',
      decided_at: null,
      decided_by: null,
      executed_at: null,
      execution_result: null,
      created_at: now,
    };
  }

  /**
   * Get a request by ID.
   */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    const { data, error } = await this.db
      .from('approval_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  /**
   * Find a request by short ID prefix (for Telegram/Discord commands).
   */
  async findByShortId(shortId: string): Promise<ApprovalRequest | null> {
    const { data, error } = await this.db
      .from('approval_requests')
      .select('*')
      .ilike('id', `${shortId}%`)
      .eq('status', 'pending')
      .maybeSingle();

    if (error) return null;
    return data;
  }

  /**
   * Approve a pending request.
   */
  async approve(requestId: string, decidedBy: string): Promise<ApprovalRequest | null> {
    const { error } = await this.db
      .from('approval_requests')
      .update({
        status: 'approved',
        decided_at: nowIso(),
        decided_by: decidedBy
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) return null;
    return this.getRequest(requestId);
  }

  /**
   * Deny a pending request.
   */
  async deny(requestId: string, decidedBy: string): Promise<ApprovalRequest | null> {
    const { error } = await this.db
      .from('approval_requests')
      .update({
        status: 'denied',
        decided_at: nowIso(),
        decided_by: decidedBy
      })
      .eq('id', requestId)
      .eq('status', 'pending');

    if (error) return null;
    return this.getRequest(requestId);
  }

  /**
   * Mark an approved request as executed with its result.
   */
  async markExecuted(requestId: string, executionResult: string): Promise<void> {
    const { error } = await this.db
      .from('approval_requests')
      .update({
        status: 'executed',
        executed_at: nowIso(),
        execution_result: executionResult
      })
      .eq('id', requestId);

    if (error) console.error(`Failed to mark request as executed: ${error.message}`);
  }

  /**
   * Get all pending requests.
   */
  async getPending(): Promise<ApprovalRequest[]> {
    const { data, error } = await this.db
      .from('approval_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) return [];
    return data || [];
  }

  /**
   * Get approval history with optional filters.
   */
  async getHistory(opts?: {
    limit?: number;
    action?: ActionCategory;
    agentId?: string;
    status?: ApprovalStatus;
  }): Promise<ApprovalRequest[]> {
    let query = this.db.from('approval_requests').select('*').order('created_at', { ascending: false });

    if (opts?.action) query = query.eq('action_category', opts.action);
    if (opts?.agentId) query = query.eq('agent_id', opts.agentId);
    if (opts?.status) query = query.eq('status', opts.status);

    const { data, error } = await query.limit(opts?.limit ?? 50);

    if (error) return [];
    return data || [];
  }

  /**
   * Expire old pending requests.
   */
  async expireOld(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

    const { data, error } = await this.db
      .from('approval_requests')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .select();

    if (error) return 0;
    return data?.length || 0;
  }
}
