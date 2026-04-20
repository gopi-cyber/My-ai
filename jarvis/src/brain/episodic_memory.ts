/**
 * Episodic Memory - The "Experience" Store
 *
 * Stores sequences of events and their outcomes.
 * Enables the brain to remember: "Last time I tried X, Y happened."
 * Supports retrieval of similar past experiences (RAG-style).
 */

import { getDb } from '../vault/schema.ts';
import { workspace, type Thought, type Goal } from './workspace.ts';

export type Episode = {
  id: string;
  summary: string;
  events: EpisodeEvent[];
  outcome: 'success' | 'failure' | 'partial' | 'unknown';
  outcome_detail?: string;
  tags: string[];
  created_at: number;
  last_accessed?: number;
};

export type EpisodeEvent = {
  type: 'action' | 'thought' | 'event' | 'reflection';
  content: string;
  timestamp: number;
  data?: Record<string, unknown>;
};

export type RetrievedEpisode = {
  episode: Episode;
  relevance: number;
  similarity: number;
};

const MAX_EPISODES = 1000;
const RETRIEVE_TOP_K = 5;

class EpisodicMemory {
  private db = getDb();
  private currentEpisode: EpisodeEvent[] = [];
  private currentEpisodeId: string | null = null;
  private episodeStartTime = 0;
  public isRecording = false;

  /**
   * Start recording a new episode (action sequence)
   */
  startEpisode(trigger: string): void {
    if (this.isRecording) {
      this.endEpisode('unknown'); // End previous episode
    }

    this.currentEpisodeId = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.episodeStartTime = Date.now();
    this.currentEpisode = [];

    this.addEvent({
      type: 'event',
      content: `Episode started: ${trigger}`,
      timestamp: Date.now(),
    });

    this.isRecording = true;
  }

  /**
   * Record an event in the current episode
   */
  recordAction(content: string, data?: Record<string, unknown>): void {
    if (!this.isRecording) return;

    this.addEvent({
      type: 'action',
      content,
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Record a thought in the current episode
   */
  recordThought(thought: Thought): void {
    if (!this.isRecording) return;

    this.addEvent({
      type: 'thought',
      content: thought.content,
      timestamp: Date.now(),
      data: {
        source: thought.source,
        type: thought.type,
        priority: thought.priority,
      },
    });
  }

  /**
   * End the current episode and store it
   */
  endEpisode(outcome: Episode['outcome'], outcomeDetail?: string): void {
    if (!this.isRecording || !this.currentEpisodeId) return;

    // Create summary from events
    const summary = this.generateSummary();

    const episode: Episode = {
      id: this.currentEpisodeId,
      summary,
      events: [...this.currentEpisode],
      outcome,
      outcome_detail: outcomeDetail,
      tags: this.extractTags(summary),
      created_at: this.episodeStartTime,
    };

    // Store in database
    this.storeEpisode(episode);

    // Clear current episode
    this.currentEpisode = [];
    this.currentEpisodeId = null;
    this.isRecording = false;
  }

  /**
   * Retrieve relevant past experiences
   */
  async retrieve(query: string, K = RETRIEVE_TOP_K): Promise<RetrievedEpisode[]> {
    const queryWords = this.tokenize(query);
    
    const { data: episodes, error } = await this.db
      .from('episodes')
      .select('*')
      .order('last_accessed', { ascending: false })
      .limit(MAX_EPISODES);

    if (error || !episodes) {
      console.error('[EpisodicMemory] Retrieve error:', error);
      return [];
    }

    const scored: RetrievedEpisode[] = [];

    for (const ep of episodes) {
      const epWords = this.tokenize(ep.summary);
      const similarity = this.calculateSimilarity(queryWords, epWords);
      
      if (similarity > 0.1) {
        scored.push({
          episode: ep as unknown as Episode,
          relevance: similarity,
          similarity,
        });
      }
    }

    // Sort by relevance and return top K
    scored.sort((a, b) => b.relevance - a.relevance);
    
    const results = scored.slice(0, K);
    
    // Update access time
    for (const result of results) {
      this.updateAccess(result.episode.id);
    }

    return results;
  }

  /**
   * Inject relevant experiences into context (for LLM)
   */
  async injectContext(query: string): Promise<string> {
    const episodes = await this.retrieve(query);
    
    if (episodes.length === 0) {
      return '';
    }

    const contextParts = episodes.map(ep => {
      const outcome = ep.episode.outcome.toUpperCase();
      return `[PAST(${outcome})] ${ep.episode.summary}`;
    });

    return `## Relevant Past Experiences\n${contextParts.join('\n')}\n`;
  }

  /**
   * Learn from the current goal outcome
   */
  async learnFromGoal(goal: Goal, success: boolean, detail?: string): Promise<void> {
    if (this.isRecording && this.currentEpisode.length > 0) {
      this.endEpisode(success ? 'success' : 'failure', detail);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  private addEvent(event: EpisodeEvent): void {
    this.currentEpisode.push(event);
    
    // Also post to workspace
    workspace.postThought({
      source: 'memory',
      type: 'event',
      content: event.content,
      data: event.data,
      priority: 2,
    });
  }

  private generateSummary(): string {
    if (this.currentEpisode.length === 0) {
      return 'Empty episode';
    }

    // Use first event + last event for summary
    const first = this.currentEpisode[0];
    const last = this.currentEpisode[this.currentEpisode.length - 1];

    if (!first || !last) {
      return 'Incomplete episode';
    }

    let summary = first.content;
    
    if (first.content !== last.content) {
      summary += ` -> ... -> ${last.content}`;
    }

    return summary.slice(0, 500);
  }

  private extractTags(summary: string): string[] {
    const words = this.tokenize(summary);
    const tags: string[] = [];

    const importantTags = [
      'error', 'success', 'failed', 'npm', 'git', 'build', 'test',
      'deploy', 'api', 'database', 'http', 'websocket', 'browser',
      'terminal', 'file', 'config', 'install', 'update', 'delete',
    ];

    for (const word of words) {
      if (importantTags.includes(word) && !tags.includes(word)) {
        tags.push(word);
      }
    }

    return tags.slice(0, 10);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  private calculateSimilarity(wordsA: string[], wordsB: string[]): number {
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    
    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) {
        intersection++;
      }
    }

    const union = setA.size + setB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private async storeEpisode(episode: Episode): Promise<void> {
    const { error } = await this.db
      .from('episodes')
      .upsert({
        id: episode.id,
        summary: episode.summary,
        events: JSON.stringify(episode.events),
        outcome: episode.outcome,
        outcome_detail: episode.outcome_detail,
        tags: episode.tags,
        created_at: episode.created_at,
      });

    if (error) {
      console.error('[EpisodicMemory] Store error:', error);
    }
  }

  private async updateAccess(episodeId: string): Promise<void> {
    await this.db
      .from('episodes')
      .update({ last_accessed: Date.now() })
      .eq('id', episodeId);
  }
}

/**
 * Global singleton
 */
export const episodicMemory = new EpisodicMemory();