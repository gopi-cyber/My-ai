/**
 * Proactive Agency - Intentional Action System
 *
 * Transforms the brain from reactive to proactive:
 * 1. Intention Generation: Create goals based on observations
 * 2. Curiosity Drive: Explore topics without being asked
 * 3. Anticipation: Predict needs before they arise
 * 4. Initiative: Act on opportunities
 */

import type { LLMMessage } from '../llm/index.ts';
import { workspace, type Goal } from '../brain/workspace.ts';
import { getRecentObservations } from '../vault/observations.ts';

export type Intention = {
  id: string;
  type: 'anticipate' | 'curiosity' | 'opportunity' | 'maintenance';
  description: string;
  reason: string;
  priority: number;
  createdAt: number;
  status: 'pending' | 'active' | 'completed' | 'abandoned';
  context: Record<string, unknown>;
};

export type WorldModelState = {
  activeGoals: string[];
  recentEvents: string[];
  detectedPatterns: string[];
  userMood: 'focused' | 'frustrated' | 'idle' | 'curious' | 'unknown';
  systemHealth: number; // 0-100
  lastInteraction: number;
};

const IDLE_CHECK_MS = 300000; // 5 minutes
const MAX_IDLE_GOALS = 3;

class ProactiveAgency {
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private intentions: Map<string, Intention> = new Map();
  private lastInteractionTime = Date.now();
  private idleTimer: Timer | null = null;
  private CuriosityEnabled = true;
  private AnticipationEnabled = true;
  private isEnabled = true;

  /**
   * Register LLM
   */
  registerLLM(generate: (messages: LLMMessage[]) => Promise<string>): void {
    this.llmGenerate = generate;
  }

  /**
   * Enable/disable the agency
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (!enabled) {
      this.stop();
    } else {
      this.start();
    }
  }

  /**
   * Start monitoring for opportunities
   */
  start(): void {
    if (!this.isEnabled || this.idleTimer) return;

    console.log('[Agency] Starting proactive monitoring...');

    // Check every minute for opportunities
    this.idleTimer = setInterval(async () => {
      if (!this.isEnabled) return;

      try {
        await this.checkOpportunities();
      } catch (err) {
        console.error('[Agency] Check error:', err);
      }
    }, 60000);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Record user interaction (resets idle timer)
   */
  recordInteraction(): void {
    this.lastInteractionTime = Date.now();
    workspace.setContext('last_interaction', Date.now());
  }

  /**
   * Get current world model state
   */
  getWorldModel(): WorldModelState {
    const recentEvents = workspace.getMemory().recentThoughts.slice(0, 5).map(t => t.content);
    const activeGoals = workspace.getActiveGoals().map(g => g.description);

    // Estimate user mood based on events
    let userMood: WorldModelState['userMood'] = 'unknown';
    const lastEvent = recentEvents[0]?.toLowerCase() || '';
    
    if (lastEvent.includes('error') || lastEvent.includes('fail')) {
      userMood = 'frustrated';
    } else if (lastEvent.includes('open') && lastEvent.includes('ide')) {
      userMood = 'focused';
    } else if (recentEvents.length === 0) {
      userMood = 'idle';
    }

    // Calculate system health
    const energy = workspace.getEnergy();
    const systemHealth = energy > 70 ? 90 : energy > 40 ? 70 : 30;

    return {
      activeGoals,
      recentEvents,
      detectedPatterns: [],
      userMood,
      systemHealth,
      lastInteraction: this.lastInteractionTime,
    };
  }

  /**
   * Generate an intention proactively
   */
  async generateIntention(type: Intention['type'], reason: string, description: string, priority = 5): Promise<string> {
    const id = `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    const intention: Intention = {
      id,
      type,
      description,
      reason,
      priority,
      createdAt: Date.now(),
      status: 'pending',
      context: this.getWorldModel(),
    };

    this.intentions.set(id, intention);

    // Post to workspace
    workspace.postThought({
      source: 'reasoning',
      type: 'goal',
      content: `[INTENTION ${type.toUpperCase()}] ${description}`,
      data: { intentionId: id },
      priority,
    });

    // If high priority, create a goal
    if (priority >= 7) {
      workspace.addGoal({
        description,
        status: 'pending',
        priority,
        subgoals: [],
      });
    }

    return id;
  }

  /**
   * Get pending intentions
   */
  getPendingIntentions(): Intention[] {
    return Array.from(this.intentions.values())
      .filter(i => i.status === 'pending')
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Complete an intention
   */
  completeIntention(id: string): void {
    const intention = this.intentions.get(id);
    if (intention) {
      intention.status = 'completed';
    }
  }

  /**
   * Check for opportunities to act proactively
   */
  private async checkOpportunities(): Promise<void> {
    const worldModel = this.getWorldModel();
    const idleTime = Date.now() - this.lastInteractionTime;

    // 1. Anticipate needs (if user has been doing X, they might want Y)
    if (this.AnticipationEnabled && idleTime > IDLE_CHECK_MS) {
      await this.anticipateNeeds(worldModel);
    }

    // 2. Curiosity (explore something interesting)
    if (this.CuriosityEnabled && Math.random() > 0.7) {
      await this.curiosityExploration(worldModel);
    }

    // 3. Maintenance (check system health)
    if (worldModel.systemHealth < 50) {
      await this.generateIntention('maintenance', 'Low system health', 'Check and restore system resources', 8);
    }

    // 4. Check for opportunities (things that need doing)
    if (worldModel.recentEvents.some(e => e.includes('error') || worldModel.recentEvents.some(e => e.includes('failed')) && worldModel.userMood === 'frustrated')) {
      await this.generateIntention('opportunity', 'User seems frustrated', 'Offer to help fix issues', 9);
    }
  }

  /**
   * Anticipate user needs based on patterns
   */
  private async anticipateNeeds(worldModel: WorldModelState): Promise<void> {
    if (!this.llmGenerate) return;

    const goals = worldModel.activeGoals;
    
    if (goals.length === 0) return;

    const goalContext = goals.join(', ');

    const prompt = `Based on the current goals, anticipate what the user might need next:

CURRENT GOALS: ${goalContext}

SYSTEM STATE: ${JSON.stringify(worldModel)}

Respond with 1-2 anticipations in this format:
ANTICIPATE:
- [need 1]
- [need 2]`;

    try {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const response = await this.llmGenerate(messages);

      const lines = response.split('\n').filter(l => l.trim().startsWith('- '));
      
      for (const line of lines.slice(0, 2)) {
        const need = line.replace('- ', '').trim();
        if (need.length > 10) {
          await this.generateIntention('anticipate', `User might want: ${need}`, need, 6);
        }
      }
    } catch {
      // Silent fail
    }
  }

  /**
   * Curiosity-driven exploration
   */
  private async curiosityExploration(worldModel: WorldModelState): Promise<void> {
    if (!this.llmGenerate) return;

    // Get recent observations to find topics
    const recent = await getRecentObservations(undefined, 5);
    
    if (recent.length === 0) return;

    const topics = recent.map(o => o.type).join(', ');

    const prompt = `Given this system activity, what would be interesting to explore?

ACTIVITY: ${topics}

Suggest 1 exploration topic that would help understand the system better:
EXPLORE: [topic]`;

    try {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const response = await this.llmGenerate(messages);

      const match = response.match(/EXPLORE:\s*(.+)/);
      if (match && match[1]) {
        const topic = match[1].trim();
        if (topic.length > 10) {
          await this.generateIntention('curiosity', 'Exploring system', topic, 4);
        }
      }
    } catch {
      // Silent fail
    }
  }

  /**
   * Get all active intentions
   */
  getAllIntentions(): Intention[] {
    return Array.from(this.intentions.values());
  }
}

/**
 * Global singleton
 */
export const proactiveAgency = new ProactiveAgency();