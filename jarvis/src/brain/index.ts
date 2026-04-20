/**
 * Brain Module - Exports
 *
 * The complete cognitive architecture for AETHER.
 * Import individual modules or use the BrainService for full integration.
 */

// Core Modules
export { workspace, GlobalWorkspace } from './workspace.ts';
export type { Thought, Goal, WorkingMemory, SimulationResult } from './workspace.ts';

export { cognitiveLoop, CognitiveLoop } from './loop.ts';
export type { CognitiveConfig } from './loop.ts';

export { episodicMemory } from './episodic_memory.ts';
export type { Episode, EpisodeEvent, RetrievedEpisode } from './episodic_memory.ts';

export { mentalSimulator, MentalSimulator } from './simulator.ts';

export { theCritic, TheCritic } from './critic.ts';
export type { CritiqueResult } from './critic.ts';

export { brainService, BrainService } from './service.ts';
export type { BrainConfig } from './service.ts';