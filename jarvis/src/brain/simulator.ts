/**
 * Mental Simulator - The "Foresight" Engine
 *
 * Uses the LLM to simulate the outcomes of proposed actions
 * before executing them. Acts as a "safety guard" for risky operations.
 *
 * This prevents the brain from blindly running dangerous commands
 * like `rm -rf /` or `DROP DATABASE`.
 */

import type { LLMMessage } from '../llm/index.ts';
import type { SimulationResult } from './workspace.ts';

export type SimulationConfig = {
  /** Number of simulations to run */
  numSimulations?: number;
  /** Temperature for creativity */
  temperature?: number;
  /** Enable risk scoring */
  enableRiskScore?: boolean;
};

const DEFAULT_CONFIG = {
  numSimulations: 3,
  temperature: 0.7,
  enableRiskScore: true,
};

export class MentalSimulator {
  private config: typeof DEFAULT_CONFIG;
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;

  constructor(config: SimulationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register LLM callback
   */
  registerLLM(generate: (messages: LLMMessage[]) => Promise<string>): void {
    this.llmGenerate = generate;
  }

  /**
   * Simulate the outcomes of a proposed action
   * Returns prediction + risk assessment
   */
  async simulate(action: string): Promise<SimulationResult> {
    if (!this.llmGenerate) {
      return {
        predicted_outcome: 'No LLM available for simulation',
        confidence: 0,
        risks: [],
        alternatives: [],
      };
    }

    const prompt = this.buildSimulationPrompt(action);
    const messages: LLMMessage[] = [
      { role: 'user', content: prompt },
    ];

    try {
      const response = await this.llmGenerate(messages);
      return this.parseSimulationResponse(response);
    } catch (err) {
      console.error('[MentalSimulator] Simulation failed:', err);
      return {
        predicted_outcome: 'Simulation error',
        confidence: 0,
        risks: ['Simulation failed'],
        alternatives: ['Skip action'],
      };
    }
  }

  /**
   * Quick risk check without full simulation
   */
  async quickRiskCheck(action: string): Promise<{ risky: boolean; reason?: string }> {
    const deadlyCommands = [
      'rm -rf /',
      'rm -rf ~',
      'DROP DATABASE',
      'DELETE FROM.*WHERE 1=1',
      'format c:',
      'mkfs',
      'dd if=',
      ':(){:|:&};:',
    ];

    for (const pattern of deadlyCommands) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(action)) {
        return { risky: true, reason: `Matched dangerous pattern: ${pattern}` };
      }
    }

    // Check for potential issues
    const warningPatterns = [
      { pattern: /npm install -g/, reason: 'Global npm install may require sudo' },
      { pattern: /sudo/, reason: 'Elevated privileges requested' },
      { pattern: /chmod 777/, reason: 'Insecure file permissions' },
      { pattern: /curl.*\|.*sh/, reason: 'Running remote script is dangerous' },
      { pattern: /wget.*\|.*sh/, reason: 'Running remote script is dangerous' },
    ];

    for (const { pattern, reason } of warningPatterns) {
      if (pattern.test(action)) {
        return { risky: true, reason };
      }
    }

    return { risky: false };
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  private buildSimulationPrompt(action: string): string {
    return `You are a mental simulator. Your job is to predict what will happen when the following action is executed.

ACTION: "${action}"

Think through the following:
1. What is the MOST LIKELY outcome?
2. What are 3 possible NEGATIVE outcomes?
3. What are 3 alternative approaches that might be safer?

Respond in this EXACT format:
OUTCOME: [one sentence]
CONFIDENCE: [0.0 to 1.0]
RISKS:
- [risk 1]
- [risk 2]
- [risk 3]
ALTERNATIVES:
- [alternative 1]
- [alternative 2]
- [alternative 3]

Be honest about uncertainty. If unsure, set CONFIDENCE lower.`;
  }

  private parseSimulationResponse(response: string): SimulationResult {
    const lines = response.split('\n').filter(l => l.trim());
    
    let outcome = 'Unknown outcome';
    let confidence = 0.5;
    const risks: string[] = [];
    const alternatives: string[] = [];

    let section = '';
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('OUTCOME:')) {
        outcome = trimmed.replace('OUTCOME:', '').trim();
        continue;
      }
      
      if (trimmed.startsWith('CONFIDENCE:')) {
        confidence = parseFloat(trimmed.replace('CONFIDENCE:', '').trim());
        if (!isNaN(confidence)) {
          confidence = Math.max(0, Math.min(1, confidence));
        }
        continue;
      }

      if (trimmed === 'RISKS:') {
        section = 'risks';
        continue;
      }

      if (trimmed === 'ALTERNATIVES:') {
        section = 'alternatives';
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2).trim();
        
        if (section === 'risks' && item) {
          risks.push(item);
        } else if (section === 'alternatives' && item) {
          alternatives.push(item);
        }
      }
    }

    return {
      predicted_outcome: outcome,
      confidence,
      risks: risks.slice(0, 3),
      alternatives: alternatives.slice(0, 3),
    };
  }
}

/**
 * Global singleton
 */
export const mentalSimulator = new MentalSimulator();