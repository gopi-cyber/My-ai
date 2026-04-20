/**
 * Cognitive Loop - The "Heartbeat" of the Brain
 *
 * Runs a continuous loop: Perceive -> Integrate -> Reason -> Act -> Reflect -> Learn
 * Each cycle is called a "Cognition."
 */

import { workspace, type Thought, type Goal } from './workspace.ts';
import type { SimulationResult } from './workspace.ts';
import { getRecentObservations } from '../vault/observations.ts';
import type { ObserverEvent } from '../observers/index.ts';

/**
 * Get events from vault (wrapper for compatibility)
 */
function getRecentEvents(limit: number): ObserverEvent[] {
  return []; // Will be filled by event loop
}

export type CognitiveConfig = {
  /** How often to run the loop (ms). Default: 2000ms (2 seconds) */
  tickInterval?: number;
  /** Max events to process per tick */
  maxEventsPerTick?: number;
  /** Minimum priority to trigger action */
  actionThreshold?: number;
  /** Enable mental simulation before acting */
  enableSimulation?: boolean;
  /** Enable critic before acting */
  enableCritic?: boolean;
};

const DEFAULT_CONFIG: Required<CognitiveConfig> = {
  tickInterval: 2000,
  maxEventsPerTick: 10,
  actionThreshold: 6,
  enableSimulation: true,
  enableCritic: true,
};

export class CognitiveLoop {
  private config: Required<CognitiveConfig>;
  private running = false;
  private timer: Timer | null = null;
  private tickCount = 0;
  private lastCognition: number = 0;
  private eventBuffer: ObserverEvent[] = [];
  private onAction: ((action: Thought) => Promise<void>) | null = null;
  private simulate: ((action: Thought) => Promise<SimulationResult>) | null = null;
  private criticize: ((thought: Thought) => Promise<string>) | null = null;

  constructor(config: CognitiveConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<CognitiveConfig>;
  }

  /**
   * Register callbacks (set by the daemon)
   */
  registerCallbacks(config: {
    onAction?: (action: Thought) => Promise<void>;
    simulate?: (action: Thought) => Promise<SimulationResult>;
    criticize?: (thought: Thought) => Promise<string>;
  }): void {
    this.onAction = config.onAction ?? null;
    this.simulate = config.simulate ?? null;
    this.criticize = config.criticize ?? null;
  }

  /**
   * Start the cognitive loop
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    
    console.log('[CognitiveLoop] Starting brain heartbeat...');
    
    this.timer = setInterval(() => {
      this.tick().catch(err => {
        console.error('[CognitiveLoop] Tick error:', err);
      });
    }, this.config.tickInterval);
  }

  /**
   * Stop the cognitive loop
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[CognitiveLoop] Brain stopped');
  }

  /**
   * Is the brain running?
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      running: this.running,
      tickCount: this.tickCount,
      lastCognition: this.lastCognition,
      energy: workspace.getEnergy(),
      activeGoals: workspace.getActiveGoals().length,
      pendingActions: workspace.getPendingActions().length,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // The Cognitive Cycle
  // ─────────────────────────────────────────────────────────────

  /**
   * One complete cognition cycle
   */
  private async tick(): Promise<void> {
    this.tickCount++;
    const tickStart = Date.now();

    try {
      // PHASE 1: Perceive
      await this.perceive();

      // PHASE 2: Integrate
      await this.integrate();

      // PHASE 3: Reason
      await this.reason();

      // PHASE 4: Act (if approved)
      await this.act();

      // PHASE 5: Reflect
      await this.reflect();

      // PHASE 6: Learn (handled by EpisodicMemory)
      
      this.lastCognition = Date.now() - tickStart;
      
      // Energy management - drain a small amount each tick
      workspace.drainEnergy(1);
      
      // Restore energy if idle
      if (workspace.getEnergy() < 30) {
        workspace.restoreEnergy(20);
      }

    } catch (err) {
      console.error('[CognitiveLoop] Cognition error:', err);
    }
  }

  /**
   * PHASE 1: Perceive - Gather sensory input
   */
  private async perceive(): Promise<void> {
    // Get recent events from the observer buffer
    const recentEvents = getRecentEvents(this.config.maxEventsPerTick);
    
    for (const event of recentEvents) {
      // Convert observer event to thought
      const priority = this.calculateEventPriority(event);
      
      if (priority >= 3) {
        workspace.postThought({
          source: 'perception',
          type: 'event',
          content: `[${event.type}] ${JSON.stringify(event.data).slice(0, 100)}`,
          data: event as any,
          priority,
        });
      }
    }
  }

  /**
   * Calculate priority based on event type
   */
  private calculateEventPriority(event: ObserverEvent): number {
    const type = event.type;
    
    // High priority events
    if (type === 'error_detected' || type === 'stuck_detected') return 9;
    if (type === 'notification' && (event.data as any)?.urgency === 'critical') return 8;
    
    // Medium priority
    if (type === 'process_stopped') return 6;
    if (type === 'session_started') return 5;
    if (type === 'clipboard' && (event.data as any)?.length > 50) return 4;
    
    // Low priority
    if (type === 'file_change') return 3;
    if (type === 'calendar' || type === 'email') return 2;
    
    return 1;
  }

  /**
   * PHASE 2: Integrate - Build understanding
   */
  private async integrate(): Promise<void> {
    const attention = workspace.getAttention();
    
    if (attention) {
      workspace.setFocus(attention.id);
      
      // If this is a new event, try to match with existing goals
      if (attention.type === 'event' && attention.source === 'perception') {
        const activeGoals = workspace.getActiveGoals();
        
        // Check if any goal is relevant to this event
        for (const goal of activeGoals) {
          if (this.isRelevant(attention.content, goal.description)) {
            workspace.postThought({
              source: 'memory',
              type: 'belief',
              content: `Event relates to goal: ${goal.description}`,
              data: { goalId: goal.id },
              priority: attention.priority,
            });
          }
        }
      }
    }
  }

  /**
   * PHASE 3: Reason - Generate action plan
   */
  private async reason(): Promise<void> {
    const attention = workspace.getAttention();
    if (!attention || attention.priority < this.config.actionThreshold) {
      return;
    }

    // If we don't have a goal yet, create one
    const activeGoals = workspace.getActiveGoals();
    if (activeGoals.length === 0 && attention.priority >= 7) {
      const goalId = workspace.addGoal({
        description: `Handle: ${attention.content.slice(0, 100)}`,
        status: 'active',
        priority: attention.priority,
        subgoals: [],
      });

      workspace.postThought({
        source: 'reasoning',
        type: 'goal',
        content: `Goal created: ${goalId}`,
        data: { goalId },
        priority: attention.priority - 1,
      });
    }
  }

  /**
   * PHASE 4: Act - Execute approved actions
   */
  private async act(): Promise<void> {
    const pendingActions = workspace.getPendingActions();
    
    for (const action of pendingActions) {
      // Mental Simulation
      if (this.config.enableSimulation && this.simulate) {
        try {
          const simResult = await this.simulate(action);
          
          if (simResult.risks.length > 0 && simResult.confidence < 0.6) {
            workspace.validateAction(action.id, false, `Risks: ${simResult.risks.join(', ')}`);
            continue;
          }
        } catch {
          // Continue without simulation
        }
      }

      // Critic Review
      if (this.config.enableCritic && this.criticize) {
        try {
          const critique = await this.criticize(action);
          
          if (critique.includes('REJECT')) {
            workspace.validateAction(action.id, false, critique);
            continue;
          }
        } catch {
          // Continue without critic
        }
      }

      // Approve and execute
      workspace.validateAction(action.id, true, 'Approved by cognitive loop');
      
      if (this.onAction) {
        try {
          await this.onAction(action);
        } catch (err) {
          console.error('[CognitiveLoop] Action failed:', err);
        }
      }
    }
  }

  /**
   * PHASE 5: Reflect - Self-review
   */
  private async reflect(): Promise<void> {
    const memory = workspace.getMemory();
    
    // Check if we're stuck in a loop
    if (memory.recentThoughts.length >= 3) {
      const last3 = memory.recentThoughts.slice(0, 3);
      const similar = last3.filter(t => 
        t.content.slice(0, 50) === last3[0]?.content.slice(0, 50)
      );
      
      if (similar.length >= 3) {
        // We're repeating ourselves - force a pause
        workspace.postThought({
          source: 'reflection',
          type: 'reflection',
          content: 'Detected repetitive thought pattern - forcing reset',
          priority: 10,
        });
        
        workspace.drainEnergy(30); // Force rest
      }
    }

    // Energy-based reflection
    if (memory.energy < 20) {
      workspace.postThought({
        source: 'reflection',
        type: 'reflection',
        content: 'Low energy - switching to low-power mode',
        priority: 8,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────

  private isRelevant(eventContent: string, goalDescription: string): boolean {
    const eventWords = new Set(eventContent.toLowerCase().split(/\s+/));
    const goalWords = new Set(goalDescription.toLowerCase().split(/\s+/));
    
    for (const word of goalWords) {
      if (word.length > 3 && eventWords.has(word)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Global singleton
 */
export const cognitiveLoop = new CognitiveLoop();