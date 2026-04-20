/**
 * Brain Service - The "Conscious Entity"
 *
 * Integrates all brain modules into the AETHER daemon.
 * This turns JARVIS from a reactive assistant into a proactive,
 * self-reflecting entity with continuous cognition.
 */

import type { Service, ServiceStatus } from '../daemon/services.ts';
import type { LLMMessage } from '../llm/index.ts';
import type { ToolRegistry } from '../actions/tools/registry.ts';
import type { Goal } from './workspace.ts';

import { workspace } from './workspace.ts';
import { cognitiveLoop } from './loop.ts';
import type { CognitiveConfig } from './loop.ts';
import type { SimulationResult } from './workspace.ts';
import { episodicMemory } from './episodic_memory.ts';
import { mentalSimulator } from './simulator.ts';
import { theCritic } from './critic.ts';
import type { CritiqueResult } from './critic.ts';

export type BrainConfig = {
  /** Enable the cognitive loop */
  enableLoop?: boolean;
  /** Loop tick interval (ms) */
  tickInterval?: number;
  /** Enable mental simulation */
  enableSimulation?: boolean;
  /** Enable the critic */
  enableCritic?: boolean;
  /** Enable episodic memory */
  enableMemory?: boolean;
  /** Max goals to track */
  maxGoals?: number;
};

const DEFAULT_CONFIG: Required<BrainConfig> = {
  enableLoop: true,
  tickInterval: 2000,
  enableSimulation: true,
  enableCritic: true,
  enableMemory: true,
  maxGoals: 10,
};

export class BrainService implements Service {
  name = 'brain';
  private _status: ServiceStatus = 'stopped';
  private config: Required<BrainConfig>;
  private toolRegistry: ToolRegistry | null = null;
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private goalCallbacks: ((goal: Goal) => Promise<void>)[] = [];

  constructor(config: BrainConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register dependencies
   */
  register(config: {
    toolRegistry?: ToolRegistry;
    llmGenerate?: (messages: LLMMessage[]) => Promise<string>;
  }): void {
    this.toolRegistry = config.toolRegistry ?? null;
    this.llmGenerate = config.llmGenerate ?? null;

    // Register with brain modules
    if (this.llmGenerate) {
      mentalSimulator.registerLLM(this.llmGenerate);
      theCritic.registerLLM(this.llmGenerate);
    }

    // Setup cognitive loop callbacks
    cognitiveLoop.registerCallbacks({
      onAction: this.handleAction.bind(this),
      simulate: this.simulateAction.bind(this),
      criticize: this.criticizeAction.bind(this),
    });
  }

  /**
   * Goal execution callback
   */
  onGoalExec(callback: (goal: Goal) => Promise<void>): void {
    this.goalCallbacks.push(callback);
  }

  /**
   * Start the brain
   */
  async start(): Promise<void> {
    this._status = 'starting';

    console.log('[BrainService] Starting cognitive architecture...');

    // Initialize workspace
    workspace.setContext('started_at', Date.now());
    workspace.setContext('name', 'AETHER');
    workspace.setContext('version', '2.0');

    // Start cognitive loop
    if (this.config.enableLoop) {
      cognitiveLoop.start();
    }

    this._status = 'running';
    console.log('[BrainService] Brain online - cognition active');
  }

  /**
   * Stop the brain
   */
  async stop(): Promise<void> {
    this._status = 'stopping';

    if (this.config.enableLoop) {
      cognitiveLoop.stop();
    }

    this._status = 'stopped';
    console.log('[BrainService] Brain offline');
  }

  status(): ServiceStatus {
    return this._status;
  }

  /**
   * Get brain status
   */
  getStatus() {
    return {
      ...cognitiveLoop.getStatus(),
      memory: workspace.getMemory(),
      episodeRecording: episodicMemory.isRecording,
    };
  }

  /**
   * Process a user request (pass through to brain)
   */
  async processRequest(prompt: string): Promise<string> {
    if (!this.llmGenerate) {
      return 'Brain not fully initialized - no LLM available';
    }

    // Start a new episode for this request
    if (this.config.enableMemory) {
      episodicMemory.startEpisode(prompt.slice(0, 100));
    }

    // Retrieve relevant past experiences
    let context = '';
    if (this.config.enableMemory) {
      context = await episodicMemory.injectContext(prompt);
    }

    // Build messages
    const messages: LLMMessage[] = [];

    if (context) {
      messages.push({
        role: 'system',
        content: `You are AETHER, an autonomous AI assistant with episodic memory.\n${context}\n\nRespond helpfully.`,
      });
    } else {
      messages.push({
        role: 'system',
        content: 'You are AETHER, an autonomous AI assistant. Respond helpfully.',
      });
    }

    messages.push({ role: 'user', content: prompt });

    try {
      const response = await this.llmGenerate(messages);
      return response;
    } catch (err) {
      console.error('[BrainService] Request failed:', err);
      return `Error: ${err}`;
    } finally {
      if (this.config.enableMemory) {
        episodicMemory.endEpisode('success');
      }
    }
  }

  /**
   * Create a new goal
   */
  createGoal(description: string, priority = 5): string {
    return workspace.addGoal({
      description,
      status: 'pending',
      priority,
      subgoals: [],
    });
  }

  /**
   * Update goal status
   */
  updateGoal(goalId: string, status: Goal['status']): void {
    workspace.updateGoal(goalId, status);
  }

  /**
   * Get active goals
   */
  getGoals(): Goal[] {
    return workspace.getActiveGoals();
  }

  /**
   * Simulate an action (for tool execution)
   */
  async simulateAction(action: { content: string }): Promise<SimulationResult> {
    // Quick risk check first
    const riskCheck = await mentalSimulator.quickRiskCheck(action.content);
    if (riskCheck.risky) {
      return {
        predicted_outcome: riskCheck.reason || 'Risky action',
        confidence: 0.9,
        risks: [riskCheck.reason || 'Risky'],
        alternatives: [],
      };
    }

    // Full simulation
    return await mentalSimulator.simulate(action.content);
  }

  /**
   * Criticize an action
   */
  async criticizeAction(action: { content: string; source: string; type: string; priority: number }): Promise<string> {
    const result = await theCritic.review(action as any);
    return result.verdict === 'REJECT' ? 'REJECT' : 'APPROVE';
  }

  /**
   * Handle approved action
   */
  private async handleAction(action: { content: string; data?: Record<string, unknown> }): Promise<void> {
    const toolName = action.data?.tool_name as string | undefined;
    const toolArgs = action.data?.tool_args as Record<string, unknown> | undefined;

    if (toolName && this.toolRegistry) {
      try {
        // Record in episodic memory
        if (this.config.enableMemory) {
          episodicMemory.recordAction(`Executing: ${toolName}`, toolArgs);
        }

        // Execute via tool registry
        await this.toolRegistry.execute(toolName, toolArgs ?? {});
      } catch (err) {
        console.error('[BrainService] Action failed:', err);
      }
    }
  }
}

/**
 * Global singleton
 */
export const brainService = new BrainService();