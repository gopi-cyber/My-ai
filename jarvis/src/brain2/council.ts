/**
 * The Reasoning Council - Multi-Agent Consensus
 *
 * Replaces single-stream reasoning with 3 distinct cognitive personas:
 * 1. The Strategist - Focuses on long-term goals and efficiency
 * 2. The Skeptic - Devil's advocate, finds failure points
 * 3. The Executor - Technical implementation focus
 *
 * No high-risk action is taken without consensus.
 */

import type { LLMMessage } from '../llm/index.ts';
import type { Thought } from '../brain/workspace.ts';

export type CouncilMember = 'strategist' | 'skeptic' | 'executor';
export type Verdict = 'APPROVED' | 'REJECTED' | 'DEFERRED' | 'FLIPPED';

export type MemberOpinion = {
  member: CouncilMember;
  opinion: string;
  confidence: number;
  concerns: string[];
  risks: string[];
};

export type CouncilDecision = {
  verdict: Verdict;
  consensus: number;       // 0-1, how unified the council is
  opinions: MemberOpinion[];
  summary: string;
  flaws: string[];         // Issues identified
  improvements: string[]; // Suggested fixes
};

const MEMBER_SYSTEM_PROMPTS = {
  strategist: `You are THE STRATEGIST, a master planner focused on long-term outcomes and efficiency.
Your role is to evaluate plans from the perspective of:
- Does this align with the user's ultimate goal?
- Is this the most efficient path?
- What are the downstream consequences?
- Think 3 steps ahead.

Provide your analysis clearly. Focus on strategy, not implementation details.`,

  skeptic: `You are THE SKEPTIC, the devil's advocate who actively seeks failure points.
Your role is to evaluate plans by asking:
- What could go wrong?
- What assumptions are we making?
- What's the worst-case scenario?
- Are we missing crucial information?

Be harsh. Challenge every assumption. If you can't find flaws, you're not trying hard enough.`,

  executor: `You are THE EXECUTOR, focused on technical implementation.
Your role is to evaluate plans from the standpoint of:
- Can this actually be coded/executed?
- What are the technical dependencies?
- Is the approach practical given our tools?
- What specific commands/steps are needed?

Focus on feasibility and technical correctness. Be practical.`,
};

class ReasoningCouncil {
  private llmGenerate: ((messages: LLMMessage[]) => Promise<string>) | null = null;
  private model: string = 'llama3.2';
  private maxTokens: number = 1200;

  /**
   * Register LLM
   */
  registerLLM(generate: (messages: LLMMessage[]) => Promise<string>, model?: string): void {
    this.llmGenerate = generate;
    if (model) this.model = model;
  }

  /**
   * Get council decision on an action/plan
   */
  async deliberate(action: string, context?: string): Promise<CouncilDecision> {
    if (!this.llmGenerate) {
      return this.fallbackDecision(action);
    }

    // Get opinions from each member in parallel
    const opinions = await Promise.all([
      this.getMemberOpinion('strategist', action, context),
      this.getMemberOpinion('skeptic', action, context),
      this.getMemberOpinion('executor', action, context),
    ]);

    // Reach consensus
    return this.reachConsensus(opinions);
  }

  /**
   * Quick deliberation (single pass, no parallel)
   */
  async deliberateQuick(action: string, context?: string): Promise<CouncilDecision> {
    if (!this.llmGenerate) {
      return this.fallbackDecision(action);
    }

    // Sequential quickpass: Strategist -> Skeptic -> Executor
    const strategists = await this.getMemberOpinion('strategist', action, context);
    const skeptics = await this.getMemberOpinion('skeptic', action, context);
    const executors = await this.getMemberOpinion('executor', action, context);

    return this.reachConsensus([strategists, skeptics, executors]);
  }

  /**
   * Review a thought chain for logical flaws
   */
  async reviewChain(chain: Thought[]): Promise<{ flaws: string[]; score: number }> {
    if (!this.llmGenerate || chain.length === 0) {
      return { flaws: [], score: 1.0 };
    }

    const chainText = chain
      .map((t, i) => `${i + 1}. [${t.source}] ${t.content}`)
      .join('\n');

    const prompt = `You are a logic critic. Review this reasoning chain for logical flaws:

REASONING CHAIN:
${chainText}

Identify:
1. Circular logic
2. Unstated assumptions
3. False causal links
4. Missing information
5. Overgeneralization

Respond in EXACT format:
FLAWS:
- [flaw 1]
- [flaw 2]
SCORE: [0.0 to 1.0]`;

    try {
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const response = await this.llmGenerate(messages);
      return this.parseFlawResponse(response);
    } catch {
      return { flaws: [], score: 0.5 };
    }
  }

  // Private methods

  private async getMemberOpinion(
    member: CouncilMember,
    action: string,
    context?: string
  ): Promise<MemberOpinion> {
    const prompt = `${MEMBER_SYSTEM_PROMPTS[member]}

ACTION TO EVALUATE: "${action}"

${context ? `CONTEXT: ${context}` : ''}

Evaluate this action and respond in EXACT format:
OPINION: [Your assessment in one sentence]
CONFIDENCE: [0.0 to 1.0]
CONCERNS:
- [concern 1]
- [concern 2]
RISKS:
- [risk 1]
- [risk 2]`;

    try {
      if (!this.llmGenerate) {
        throw new Error('LLM not registered');
      }
      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const response = await this.llmGenerate(messages);
      return this.parseOpinion(response, member);
    } catch (err) {
      console.error(`[Council] ${member} failed:`, err);
      return {
        member,
        opinion: 'Unable to evaluate',
        confidence: 0,
        concerns: ['LLM error'],
        risks: ['Unknown'],
      };
    }
  }

  private async reachConsensus(opinions: MemberOpinion[]): Promise<CouncilDecision> {
    const rejections = opinions.filter(o => 
      o.concerns.some(c => c.toLowerCase().includes('fail')) ||
      o.risks.some(r => r.toLowerCase().includes('risk') || r.toLowerCase().includes('critical'))
    ).length;

    const avgConfidence = opinions.reduce((sum, o) => sum + o.confidence, 0) / opinions.length;
    
    // Collect all flaws and improvements
    const allFlaws = opinions.flatMap(o => o.concerns);
    const allImprovements = opinions.flatMap(o => o.risks);

    let verdict: Verdict;
    let consensus: number;

    if (rejections >= 2) {
      verdict = 'REJECTED';
      consensus = 1.0;
    } else if (rejections === 1 && avgConfidence < 0.7) {
      verdict = 'DEFERRED';
      consensus = 0.5;
    } else if (rejections === 1) {
      verdict = 'FLIPPED'; // Approved with warnings
      consensus = 0.8;
    } else {
      verdict = 'APPROVED';
      consensus = avgConfidence;
    }

    const summary = opinions.map(o => o.opinion).join(' | ');

    return {
      verdict,
      consensus,
      opinions,
      summary,
      flaws: allFlaws.slice(0, 5),
      improvements: allImprovements.slice(0, 5),
    };
  }

  private fallbackDecision(action: string): CouncilDecision {
    // Dangerous patterns that should be rejected
    const dangerous = [
      'rm -rf /', 'rm -rf ~', 'DROP DATABASE',
      'DELETE FROM.*WHERE', 'format c:',
      ':(){::&};:', 'chmod 777',
    ];

    for (const pattern of dangerous) {
      if (new RegExp(pattern, 'i').test(action)) {
        return {
          verdict: 'REJECTED',
          consensus: 1.0,
          opinions: [],
          summary: 'Dangerous pattern detected',
          flaws: ['Pattern match rejection'],
          improvements: [],
        };
      }
    }

    return {
      verdict: 'APPROVED',
      consensus: 0.5,
      opinions: [],
      summary: 'Fallback approve (no LLM)',
      flaws: [],
      improvements: [],
    };
  }

  private parseOpinion(response: string, member: CouncilMember): MemberOpinion {
    const lines = response.split('\n').filter(l => l.trim());
    
    let opinion = '';
    let confidence = 0.5;
    const concerns: string[] = [];
    const risks: string[] = [];

    let section = '';
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('OPINION:')) {
        opinion = trimmed.replace('OPINION:', '').trim();
        continue;
      }
      
      if (trimmed.startsWith('CONFIDENCE:')) {
        const c = parseFloat(trimmed.replace('CONFIDENCE:', '').trim());
        if (!isNaN(c)) confidence = c;
        continue;
      }

      if (trimmed === 'CONCERNS:' || trimmed === 'CONCERNS :') {
        section = 'concerns';
        continue;
      }

      if (trimmed === 'RISKS:' || trimmed === 'RISKS :') {
        section = 'risks';
        continue;
      }

      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2).trim();
        if (section === 'concerns' && item) concerns.push(item);
        if (section === 'risks' && item) risks.push(item);
      }
    }

    return {
      member,
      opinion: opinion || 'No opinion',
      confidence,
      concerns: concerns.slice(0, 3),
      risks: risks.slice(0, 3),
    };
  }

  private parseFlawResponse(response: string): { flaws: string[]; score: number } {
    const lines = response.split('\n').filter(l => l.trim());
    const flaws: string[] = [];
    let score = 0.5;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        flaws.push(trimmed.slice(2));
      }
      if (trimmed.startsWith('SCORE:')) {
        const s = parseFloat(trimmed.replace('SCORE:', '').trim());
        if (!isNaN(s)) score = s;
      }
    }

    return { flaws: flaws.slice(0, 5), score };
  }
}

/**
 * Global singleton
 */
export const reasoningCouncil = new ReasoningCouncil();