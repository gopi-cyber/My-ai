/**
 * The Dreaming Cycle - Self-Evolution & Consolidation
 *
 * When idle, the brain enters a "Dream State" where it:
 * 1. Reviews the day's episodes
 * 2. Identifies patterns
 * 3. Extracts beliefs from experiences
 * 4. Rewrites system prompts to optimize
 * 5. Adjusts its own hyperparameters
 */

import type { LLMMessage } from '../llm/index.ts';
import { episodicMemory } from '../brain/episodic_memory.ts';
import { workspace } from '../brain/workspace.ts';
import { deepMemory } from './memory.ts';

export type DreamState = 'idle' | 'consolidating' | 'extracting' | 'optimizing' | 'complete';

export type DreamResult = {
  patterns: string[];
  beliefs: string[];
  optimizations: string[];
  newBeliefs: number;
  updatedPrompts: number;
};

export type Hyperparameters = {
  tickInterval: number;    // ms between cognition ticks
  attentionThreshold: number;  // min priority to act
  simulationConfidence: number; // min confidence for action
  criticThreshold: number;     // min confidence for critic
  energyDrainRate: number;    // energy lost per tick
  energyRestoration: number;  // energy gained when idle
};

const DEFAULT_HYPERPARAMETERS: Hyperparameters = {
  tickInterval: 2000,
  attentionThreshold: 6,
  simulationConfidence: 0.6,
  criticThreshold: 0.7,
  energyDrainRate: 1,
  energyRestoration: 20,
};

export class DreamingCycle {
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private state: DreamState = 'idle';
  private lastDream: number = 0;
  private dreamInterval: number = 3600000; // 1 hour
  private timer: Timer | null = null;
  private hyperparameters: Hyperparameters = { ...DEFAULT_HYPERPARAMETERS };
  private successHistory: number[] = [];
  private maxHistory = 100;

  /**
   * Register LLM for dreaming
   */
  registerLLM(generate: (messages: LLMMessage[]) => Promise<string>): void {
    this.llmGenerate = generate;
  }

  /**
   * Start the dreaming scheduler
   */
  start(): void {
    if (this.timer) return;
    
    console.log('[Dreaming] Starting dream scheduler...');
    
    // Run first dream after 10 minutes
    this.timer = setTimeout(() => {
      this.dream().catch(err => console.error('[Dreaming] Error:', err));
    }, 600000); // 10 min

    // Subsequent dreams every hour
    this.timer = setInterval(() => {
      if (workspace.getEnergy() > 50) {
        this.dream().catch(err => console.error('[Dreaming] Error:', err));
      }
    }, this.dreamInterval);
  }

  /**
   * Stop dreaming
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state = 'idle';
  }

  /**
   * Force a dream cycle now
   */
  async dream(): Promise<DreamResult> {
    if (this.state !== 'idle') {
      return { patterns: [], beliefs: [], optimizations: [], newBeliefs: 0, updatedPrompts: 0 };
    }

    this.state = 'consolidating';
    const startTime = Date.now();
    
    console.log('[Dreaming] Entering dream state...');

    try {
      // PHASE 1: Consolidate memories
      this.state = 'consolidating';
      const patterns = await this.identifyPatterns();

      // PHASE 2: Extract beliefs
      this.state = 'extracting';
      const beliefs = await this.extractBeliefs();

      // PHASE 3: Optimize hyperparameters
      this.state = 'optimizing';
      const optimizations = await this.optimizeSelf();

      this.state = 'complete';
      this.lastDream = Date.now();

      // Log result
      const duration = Date.now() - startTime;
      console.log(`[Dreaming] Dream complete in ${duration}ms. Found ${patterns.length} patterns, ${beliefs.length} beliefs.`);

      // Restore energy after dream
      workspace.restoreEnergy(30);

      return {
        patterns,
        beliefs,
        optimizations,
        newBeliefs: beliefs.length,
        updatedPrompts: optimizations.length,
      };
    } catch (err) {
      console.error('[Dreaming] Dream failed:', err);
      this.state = 'idle';
      throw err;
    }
  }

  /**
   * Record a success/failure for learning
   */
  recordOutcome(success: boolean): void {
    this.successHistory.push(success ? 1 : 0);
    
    if (this.successHistory.length > this.maxHistory) {
      this.successHistory.shift();
    }

    // Adjust hyperparameters based on success rate
    if (this.successHistory.length >= 10) {
      this.adjustFromHistory();
    }
  }

  /**
   * Get current hyperparameters
   */
  getHyperparameters(): Hyperparameters {
    return { ...this.hyperparameters };
  }

  /**
   * Manually adjust hyperparameters
   */
  setHyperparameters(updates: Partial<Hyperparameters>): void {
    this.hyperparameters = { ...this.hyperparameters, ...updates };
    console.log('[Dreaming] Hyperparameters updated:', this.hyperparameters);
  }

  // Private methods

  private async identifyPatterns(): Promise<string[]> {
    if (!this.llmGenerate) return [];

    // Get recent episodes
    const episodes = await episodicMemory.retrieve('', 20);
    
    if (episodes.length < 3) return [];

    const summaries = episodes.map(e => e.episode.summary).join('\n- ');

    const prompt = `You are analyzing patterns in recent experiences. Identify recurring themes or patterns:

EXPERIENCES:
- ${summaries}

Respond with a list of patterns found (max 5):
PATTERNS:
- [pattern 1]
- [pattern 2]`;

    try {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const response = await this.llmGenerate(messages);
      
      const lines = response.split('\n').filter(l => l.trim().startsWith('- '));
      return lines.map(l => l.replace('- ', '').trim());
    } catch {
      return [];
    }
  }

  private async extractBeliefs(): Promise<string[]> {
    if (!this.llmGenerate) return [];

    // Get experiences to consolidate
    const experiences = await episodicMemory.retrieve('', 10);
    
    if (experiences.length < 3) return [];

    const failed = experiences.filter(e => e.episode.outcome === 'failure');
    
    if (failed.length === 0) return [];

    // Convert failures into beliefs
    const beliefs: string[] = [];

    for (const f of failed.slice(0, 3)) {
      const belief = `BELIEF: ${f.episode.summary} -> ${f.episode.outcome_detail || 'failed'}`;
      
      await deepMemory.store({
        content: belief,
        type: 'belief',
        metadata: { source: f.episode.id },
        strength: 0.7,
      });
      
      beliefs.push(belief);
    }

    return beliefs;
  }

  private async optimizeSelf(): Promise<string[]> {
    if (!this.llmGenerate) return [];

    const optimizations: string[] = [];

    // Calculate success rate
    const recent = this.successHistory.slice(-20);
    const successRate = recent.length > 0 
      ? recent.reduce((a, b) => a + b, 0) / recent.length 
      : 0.5;

    // Adjust based on performance
    if (successRate < 0.3) {
      // Failing too much - slow down, be more careful
      this.hyperparameters.tickInterval = Math.min(5000, this.hyperparameters.tickInterval + 500);
      this.hyperparameters.simulationConfidence = Math.min(0.9, this.hyperparameters.simulationConfidence + 0.1);
      optimizations.push('Reduced speed + increased caution');
    } else if (successRate > 0.8) {
      // Doing great - speed up
      this.hyperparameters.tickInterval = Math.max(500, this.hyperparameters.tickInterval - 200);
      this.hyperparameters.simulationConfidence = Math.max(0.3, this.hyperparameters.simulationConfidence - 0.05);
      optimizations.push('Increased speed + reduced caution');
    }

    // Check if energy is low
    if (workspace.getEnergy() < 20) {
      this.hyperparameters.tickInterval = Math.min(5000, this.hyperparameters.tickInterval + 1000);
      optimizations.push('Low energy - reduced tick rate');
    }

    // Store the optimization event
    if (optimizations.length > 0) {
      await deepMemory.store({
        content: `OPTIMIZATION: ${optimizations.join(', ')}`,
        type: 'pattern',
        metadata: { successRate, energy: workspace.getEnergy() },
        strength: 0.5,
      });
    }

    return optimizations;
  }

  private adjustFromHistory(): void {
    const recent = this.successHistory.slice(-20);
    const successRate = recent.reduce((a, b) => a + b, 0) / recent.length;

    // Auto-adjust if we're clearly failing or succeeding
    if (successRate < 0.2 && this.hyperparameters.tickInterval < 10000) {
      this.hyperparameters.tickInterval += 500;
    } else if (successRate > 0.9 && this.hyperparameters.tickInterval > 500) {
      this.hyperparameters.tickInterval = Math.max(500, this.hyperparameters.tickInterval - 200);
    }
  }
}

/**
 * Global singleton
 */
export const dreamingCycle = new DreamingCycle();