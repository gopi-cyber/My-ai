/**
 * The Critic - Meta-Cognitive Quality Control
 *
 * A separate LLM process that monitors the primary agent's
 * thoughts for hallucinations, logic errors, or dangerous assumptions.
 * Can force the brain to "re-think" before acting.
 */

import type { LLMMessage } from '../llm/index.ts';
import type { Thought } from './workspace.ts';

export type CritiqueResult = {
  verdict: 'APPROVE' | 'REJECT' | 'REVIEW';
  confidence: number;
  concerns: string[];
  suggestions: string[];
  logicGaps: string[];
};

export class TheCritic {
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private autoApprove = false;

  /**
   * Register LLM callback
   */
  registerLLM(generate: (messages: LLMMessage[]) => Promise<string>): void {
    this.llmGenerate = generate;
  }

  /**
   * Set auto-approve for low-risk thoughts
   */
  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  /**
   * Review a thought or action plan
   * Returns critique with approve/reject/review recommendation
   */
  async review(thought: Thought): Promise<CritiqueResult> {
    // Auto-approve trivial thoughts
    if (this.autoApprove && thought.priority < 5) {
      return {
        verdict: 'APPROVE',
        confidence: 1.0,
        concerns: [],
        suggestions: [],
        logicGaps: [],
      };
    }

    if (!this.llmGenerate) {
      // No LLM - approve with low confidence
      return {
        verdict: 'APPROVE',
        confidence: 0.3,
        concerns: ['No critic LLM available'],
        suggestions: [],
        logicGaps: [],
      };
    }

    const prompt = this.buildCritiquePrompt(thought);
    const messages: LLMMessage[] = [
      { role: 'user', content: prompt },
    ];

    try {
      const response = await this.llmGenerate(messages);
      return this.parseCritiqueResponse(response);
    } catch (err) {
      console.error('[Critic] Review failed:', err);
      return {
        verdict: 'REVIEW',
        confidence: 0.0,
        concerns: ['Critic error'],
        suggestions: ['Manual review required'],
        logicGaps: [],
      };
    }
  }

  /**
   * Review a chain of reasoning (multiple thoughts)
   */
  async reviewReasoningChain(thoughts: Thought[]): Promise<CritiqueResult> {
    if (!this.llmGenerate || thoughts.length === 0) {
      const firstThought = thoughts[0];
      if (firstThought) return this.review(firstThought);
      return {
        verdict: 'APPROVE',
        confidence: 1.0,
        concerns: ['Empty chain'],
        suggestions: [],
        logicGaps: [],
      };
    }

    const chainText = thoughts
      .map((t, i) => `${i + 1}. ${t.content}`)
      .join('\n');

    const prompt = `You are a logic critic. Review the following reasoning chain for logical fallacies, hidden assumptions, or errors:

REASONING CHAIN:
${chainText}

Check for:
1. Circular reasoning
2. Unstated assumptions
3. False causal links
4. Missing information
5. Overgeneralization

Respond in this EXACT format:
VERDICT: [APPROVE | REJECT | REVIEW]
CONFIDENCE: [0.0 to 1.0]
CONCERNS:
- [concern 1]
- [concern 2]
SUGGESTIONS:
- [suggestion 1]
- [suggestion 2]
LOGIC_GAPS:
- [gap 1]
- [gap 2]`;

    const messages: LLMMessage[] = [
      { role: 'user', content: prompt },
    ];

    try {
      const response = await this.llmGenerate(messages);
      return this.parseCritiqueResponse(response);
    } catch (err) {
      return {
        verdict: 'REVIEW',
        confidence: 0.0,
        concerns: ['Critic error'],
        suggestions: [],
        logicGaps: [],
      };
    }
  }

  /**
   * Quick syntactic check (no LLM needed)
   */
  quickCheck(thought: Thought): { ok: boolean; issues: string[] } {
    const issues: string[] = [];
    const content = thought.content;

    // Check for empty content
    if (!content || content.trim().length === 0) {
      issues.push('Empty content');
    }

    // Check for excessive length (possible token waste)
    if (content.length > 5000) {
      issues.push('Excessive length - may waste tokens');
    }

    // Check for commands that need sudo without acknowledgment
    if (content.includes('sudo') && !content.toLowerCase().includes('sudo')) {
      // This is fine actually
    }

    // Check for very confident language that's actually uncertain
    const overconfident = [
      'definitely',
      'absolutely',
      'certainly',
      'always',
      'never',
    ];

    for (const word of overconfident) {
      if (content.toLowerCase().includes(word)) {
        issues.push(`Overconfident word: "${word}"`);
      }
    }

    return {
      ok: issues.length === 0,
      issues,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  private buildCritiquePrompt(thought: Thought): string {
    return `You are a quality control critic. Your job is to review this thought for correctness, safety, and logic.

THOUGHT:
Source: ${thought.source}
Type: ${thought.type}
Priority: ${thought.priority}/10
Content: "${thought.content}"

Evaluate:
1. Is this thought FACTUALLY correct?
2. Is it SAFE to act on?
3. Is the LOGIC sound?
4. Are there any HALLUCINATIONS?
5. Is any important information MISSING?

Respond in this EXACT format:
VERDICT: [APPROVE | REJECT | REVIEW]
CONFIDENCE: [0.0 to 1.0]
CONCERNS:
- [concern 1]
- [concern 2]
SUGGESTIONS:
- [suggestion 1]
- [suggestion 2]
LOGIC_GAPS:
- [gap 1]
- [gap 2]

Be strict. It's better to REJECT than to approve faulty reasoning.`;
  }

  private parseCritiqueResponse(response: string): CritiqueResult {
    const lines = response.split('\n').filter(l => l.trim());
    
    let verdict: CritiqueResult['verdict'] = 'REVIEW';
    let confidence = 0.5;
    const concerns: string[] = [];
    const suggestions: string[] = [];
    const logicGaps: string[] = [];

    let section = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('VERDICT:')) {
        const v = trimmed.replace('VERDICT:', '').trim().toUpperCase();
        if (v === 'APPROVE' || v === 'REJECT' || v === 'REVIEW') {
          verdict = v;
        }
        continue;
      }

      if (trimmed.startsWith('CONFIDENCE:')) {
        const c = parseFloat(trimmed.replace('CONFIDENCE:', '').trim());
        if (!isNaN(c)) {
          confidence = Math.max(0, Math.min(1, c));
        }
        continue;
      }

      if (trimmed === 'CONCERNS:') {
        section = 'concerns';
        continue;
      }

      if (trimmed === 'SUGGESTIONS:') {
        section = 'suggestions';
        continue;
      }

      if (trimmed === 'LOGIC_GAPS:') {
        section = 'logicGaps';
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2).trim();
        
        if (section === 'concerns' && item) {
          concerns.push(item);
        } else if (section === 'suggestions' && item) {
          suggestions.push(item);
        } else if (section === 'logicGaps' && item) {
          logicGaps.push(item);
        }
      }
    }

    return {
      verdict,
      confidence,
      concerns: concerns.slice(0, 5),
      suggestions: suggestions.slice(0, 5),
      logicGaps: logicGaps.slice(0, 5),
    };
  }
}

/**
 * Global singleton
 */
export const theCritic = new TheCritic();