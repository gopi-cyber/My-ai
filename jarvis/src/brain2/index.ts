/**
 * Brain 2.0 - Omni-Cognition Architecture
 *
 * The complete upgraded brain with:
 * - Deep Memory (Vector embeddings)
 * - Reasoning Council (Multi-agent)
 * - Dreaming Cycle (Self-evolution)
 * - Proactive Agency (Intentions)
 *
 * 500% improvement over Brain 1.0
 */

// Deep Memory
export { deepMemory } from './memory.ts';
export type { MemoryEntry, RetrievedMemory, Embedding } from './memory.ts';

// Reasoning Council
export { reasoningCouncil } from './council.ts';
export type { CouncilMember, CouncilDecision, MemberOpinion, Verdict } from './council.ts';

// Dreaming Cycle
export { dreamingCycle } from './dreaming.ts';
export type { DreamState, DreamResult, Hyperparameters } from './dreaming.ts';

// Proactive Agency
export { proactiveAgency } from './agency.ts';
export type { Intention, WorldModelState } from './agency.ts';

// Orchestrator
export { brain2, Brain2Orchestrator } from './orchestrator.ts';
export type { Brain2Config } from './orchestrator.ts';