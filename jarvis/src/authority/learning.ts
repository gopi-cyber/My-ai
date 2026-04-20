import { getDb, generateId } from '../vault/schema.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionCategory } from '../roles/authority.ts';
import type { PerActionOverride } from './engine.ts';

const DEFAULT_SUGGEST_THRESHOLD = 5;

export class AuthorityLearner {
  private threshold: number;
  private db: SupabaseClient;

  constructor(threshold: number = DEFAULT_SUGGEST_THRESHOLD) {
    this.threshold = threshold;
    this.db = getDb();
  }

  /**
   * Record an approval or denial decision.
   * Approvals increment the consecutive count; denials reset it.
   */
  async recordDecision(actionCategory: ActionCategory, toolName: string, approved: boolean): Promise<void> {
    const now = Date.now();

    if (approved) {
      // Try to increment existing pattern
      const { data: existing } = await this.db
        .from('approval_patterns')
        .select('id, consecutive_approvals')
        .eq('action_category', actionCategory)
        .eq('tool_name', toolName)
        .maybeSingle();

      if (existing) {
        await this.db
          .from('approval_patterns')
          .update({
            consecutive_approvals: (existing.consecutive_approvals || 0) + 1,
            last_approval_at: now
          })
          .eq('id', existing.id);
      } else {
        await this.db
          .from('approval_patterns')
          .insert([{
            id: generateId(),
            action_category: actionCategory,
            tool_name: toolName,
            consecutive_approvals: 1,
            last_approval_at: now,
            suggestion_sent: 0
          }]);
      }
    } else {
      // Denial resets the consecutive count
      await this.db
        .from('approval_patterns')
        .update({
          consecutive_approvals: 0,
          suggestion_sent: 0
        })
        .eq('action_category', actionCategory)
        .eq('tool_name', toolName);
    }
  }

  /**
   * Get patterns that have crossed the suggestion threshold.
   */
  async getSuggestions(): Promise<Array<{
    actionCategory: ActionCategory;
    toolName: string;
    consecutiveApprovals: number;
    suggestedRule: PerActionOverride;
  }>> {
    const { data, error } = await this.db
      .from('approval_patterns')
      .select('*')
      .gte('consecutive_approvals', this.threshold)
      .eq('suggestion_sent', 0)
      .order('consecutive_approvals', { ascending: false });

    if (error || !data) return [];

    return data.map(row => ({
      actionCategory: row.action_category as ActionCategory,
      toolName: row.tool_name,
      consecutiveApprovals: row.consecutive_approvals,
      suggestedRule: {
        action: row.action_category as ActionCategory,
        allowed: true,
        requires_approval: false, // Auto-approve
      },
    }));
  }

  /**
   * Mark a suggestion as sent so we don't re-suggest.
   */
  async markSuggestionSent(actionCategory: ActionCategory, toolName: string): Promise<void> {
    await this.db
      .from('approval_patterns')
      .update({ suggestion_sent: 1 })
      .eq('action_category', actionCategory)
      .eq('tool_name', toolName);
  }

  /**
   * Reset a pattern (e.g., when user dismisses a suggestion).
   */
  async resetPattern(actionCategory: ActionCategory, toolName: string): Promise<void> {
    await this.db
      .from('approval_patterns')
      .update({
        consecutive_approvals: 0,
        suggestion_sent: 0
      })
      .eq('action_category', actionCategory)
      .eq('tool_name', toolName);
  }
}
