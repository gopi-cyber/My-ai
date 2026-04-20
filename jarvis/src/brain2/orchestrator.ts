/**
 * Brain 2.0 - The Omni-Cognition Orchestrator
 *
 * Integrates all Brain 2.0 modules:
 * - Deep Memory (Vector-based semantic storage)
 * - Reasoning Council (Multi-agent consensus)
 * - Dreaming Cycle (Self-evolution)
 * - Proactive Agency (Intentional action)
 *
 * This IS the AETHER Brain - the complete cognitive architecture.
 */

import type { Service, ServiceStatus } from '../daemon/services.ts';
import type { LLMMessage } from '../llm/index.ts';
import type { ToolRegistry } from '../actions/tools/registry.ts';
import type { Goal, SimulationResult } from '../brain/workspace.ts';

import { workspace } from '../brain/workspace.ts';
import { cognitiveLoop } from '../brain/loop.ts';
import { episodicMemory } from '../brain/episodic_memory.ts';
import { mentalSimulator } from '../brain/simulator.ts';
import { theCritic } from '../brain/critic.ts';

import { deepMemory } from './memory.ts';
import { reasoningCouncil } from './council.ts';
import { dreamingCycle, type Hyperparameters } from './dreaming.ts';
import { proactiveAgency, type Intention, type WorldModelState } from './agency.ts';

export type Brain2Config = {
  /** Enable deep memory */
  enableDeepMemory?: boolean;
  /** Enable reasoning council */
  enableCouncil?: boolean;
  /** Enable dreaming */
  enableDreaming?: boolean;
  /** Enable proactive agency */
  enableAgency?: boolean;
  /** Ollama URL for embeddings */
  ollamaUrl?: string;
};

const DEFAULT_CONFIG: Required<Brain2Config> = {
  enableDeepMemory: true,
  enableCouncil: true,
  enableDreaming: true,
  enableAgency: true,
  ollamaUrl: 'http://localhost:11434',
};

export class Brain2Orchestrator implements Service {
  name = 'brain2';
  private _status: ServiceStatus = 'stopped';
  private config: Required<Brain2Config>;
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private llmModel: string = 'llama3.2';
  private toolRegistry: ToolRegistry | null = null;

  constructor(config: Brain2Config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register dependencies
   */
  register(config: {
    llmGenerate?: (messages: LLMMessage[]) => Promise<string>;
    llmModel?: string;
    toolRegistry?: ToolRegistry;
  }): void {
    this.llmGenerate = config.llmGenerate ?? null;
    this.llmModel = config.llmModel ?? 'llama3.2';
    this.toolRegistry = config.toolRegistry ?? null;

    // Initialize all brain modules with LLM
    if (this.llmGenerate) {
      mentalSimulator.registerLLM(this.llmGenerate);
      theCritic.registerLLM(this.llmGenerate);
      reasoningCouncil.registerLLM(this.llmGenerate, this.llmModel);
      dreamingCycle.registerLLM(this.llmGenerate);
      proactiveAgency.registerLLM(this.llmGenerate);

      // Start cognitive loop
      cognitiveLoop.registerCallbacks({
        onAction: this.handleAction.bind(this),
        simulate: this.simulateAction.bind(this),
        criticize: this.criticizeAction.bind(this),
      });
    }
  }

  /**
   * Start the brain
   */
  async start(): Promise<void> {
    this._status = 'starting';

    console.log('[Brain2] Starting Omni-Cognition...');

    try {
      // Initialize deep memory
      if (this.config.enableDeepMemory) {
        await deepMemory.init();
      }

      // Start cognitive loop (base brain)
      cognitiveLoop.start();

      // Start proactive agency
      if (this.config.enableAgency) {
        proactiveAgency.start();
      }

      // Start dreaming cycle
      if (this.config.enableDreaming) {
        dreamingCycle.start();
      }

      this._status = 'running';
      console.log('[Brain2] Omni-Cognition active');

    } catch (err) {
      this._status = 'error';
      throw err;
    }
  }

  /**
   * Stop the brain
   */
  async stop(): Promise<void> {
    this._status = 'stopping';

    cognitiveLoop.stop();
    proactiveAgency.stop();
    dreamingCycle.stop();

    this._status = 'stopped';
    console.log('[Brain2] Offline');
  }

  status(): ServiceStatus {
    return this._status;
  }

  /**
   * Process a request with full brain power
   */
  async process(prompt: string): Promise<string> {
    if (!this.llmGenerate) {
      return 'Brain not ready - no LLM';
    }

    // Record interaction
    proactiveAgency.recordInteraction();
    episodicMemory.startEpisode(prompt.slice(0, 100));

    // Get semantic context from deep memory
    let semanticContext = '';
    if (this.config.enableDeepMemory) {
      semanticContext = await deepMemory.injectContext(prompt);
    }

    // Get episodic context
    let episodicContext = '';
    episodicContext = await episodicMemory.injectContext(prompt);

    // Get active intentions
    const intentions = proactiveAgency.getPendingIntentions();
    let intentionContext = '';
    if (intentions.length > 0) {
      const top = intentions.slice(0, 3).map(i => `- ${i.description}`).join('\n');
      intentionContext = `\n## Active Intentions\n${top}\n`;
    }

    // Build system prompt with all context
    const systemContent = `You are AETHER, an autonomous AI with Omni-Cognition capabilities.

## Your Capabilities
- Semantic memory with understanding
- Episodic learning from past experiences
- Multi-agent reasoning (Strategist + Skeptic + Executor)
- Proactive intention generation

${semanticContext}
${episodicContext}
${intentionContext}

Respond with full cognitive capability.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt },
    ];

    try {
      const response = await this.llmGenerate(messages);
      episodicMemory.endEpisode('success');
      return response;
    } catch (err) {
      episodicMemory.endEpisode('failure', String(err));
      return `Error: ${err}`;
    }
  }

  /**
   * Get complete brain status
   */
  getStatus() {
    const cognitive = cognitiveLoop.getStatus();
    const hyperparams = dreamingCycle.getHyperparameters();
    const memoryStats = this.config.enableDeepMemory ? deepMemory.getStats() : null;
    const worldModel = proactiveAgency.getWorldModel();
    const intentions = proactiveAgency.getAllIntentions();

    return {
      status: this._status,
      cognitive,
      hyperparameters: hyperparams,
      deepMemory: memoryStats,
      worldModel,
      intentions: intentions.filter(i => i.status === 'pending').length,
      council: this.config.enableCouncil ? 'active' : 'disabled',
      dreaming: this.config.enableDreaming ? 'active' : 'disabled',
      agency: this.config.enableAgency ? 'active' : 'disabled',
    };
  }

  /**
   * Create a goal with council approval
   */
  async createGoalWithApproval(description: string, priority = 5): Promise<{ goalId: string; approved: boolean; reason: string }> {
    if (this.config.enableCouncil) {
      // Get council decision
      const decision = await reasoningCouncil.deliberate(description);
      
      if (decision.verdict === 'REJECTED') {
        return {
          goalId: '',
          approved: false,
          reason: decision.summary,
        };
      }
    }

    // Approved or no council - create goal
    const goalId = workspace.addGoal({
      description,
      status: 'active',
      priority,
      subgoals: [],
    });

    return {
      goalId,
      approved: true,
      reason: 'Approved',
    };
  }

  /**
   * Get hyperparameters
   */
  getHyperparameters(): Hyperparameters {
    return dreamingCycle.getHyperparameters();
  }

  /**
   * Adjust hyperparameters
   */
  tune(updates: Partial<Hyperparameters>): void {
    dreamingCycle.setHyperparameters(updates);
  }

  /**
   * Get world model
   */
  getWorldModel(): WorldModelState {
    return proactiveAgency.getWorldModel();
  }

  // Private

  private async handleAction(action: { content: string; data?: Record<string, unknown> }): Promise<void> {
    // Use council for important decisions
    if (this.config.enableCouncil && action.data?.tool_name) {
      const decision = await reasoningCouncil.deliberateQuick(action.content);
      
      if (decision.verdict === 'REJECTED') {
        console.log('[Brain2] Council rejected action:', decision.summary);
        return;
      }
    }

    // Execute
    if (action.data?.tool_name && this.toolRegistry) {
      try {
        await this.toolRegistry.execute(action.data.tool_name as string, action.data.tool_args as Record<string, unknown>);
        dreamingCycle.recordOutcome(true);
      } catch (err) {
        dreamingCycle.recordOutcome(false);
        throw err;
      }
    }
  }

  private async simulateAction(action: { content: string }): Promise<SimulationResult> {
    if (this.config.enableCouncil) {
      // Use council for simulation
      const decision = await reasoningCouncil.deliberateQuick(action.content);
      
      return {
        predicted_outcome: decision.summary,
        confidence: decision.consensus,
        risks: decision.flaws,
        alternatives: decision.improvements,
      };
    }

    return mentalSimulator.simulate(action.content);
  }

  private async criticizeAction(action: { content: string; source: string; type: string; priority: number }): Promise<string> {
    const result = await theCritic.review(action as any);
    return result.verdict === 'REJECT' ? 'REJECT' : 'APPROVE';
  }
}

/**
 * Global singleton
 */
export const brain2 = new Brain2Orchestrator();