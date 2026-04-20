import { getDb } from '../vault/schema.ts';

export interface Trait {
  id: string;
  name: string;
  value: number; // 0 to 1
  description: string;
}

export interface BehavioralConstraint {
  id: string;
  rule: string;
  weight: number; // Importance
}

export interface PersonalityModel {
  // Identity
  name: string;
  wake_word: string;
  tagline: string;
  avatar_url: string | null;
  base_prompt: string;
  
  // Dynamics
  traits: Trait[];
  constraints: BehavioralConstraint[];
  core_traits: string[];
  
  // Behavioral Preferences
  learned_preferences: {
    verbosity: number;
    formality: number;
    humor_level: number;
    emoji_usage: boolean;
    preferred_format: 'lists' | 'prose' | 'tables' | 'adaptive';
  };
  
  // Contextual Relationship
  relationship: {
    message_count: number;
    trust_level: number;
    shared_references: string[];
    first_interaction: number;
  };
  
  // Multi-Channel Intelligence
  channel_overrides: Record<string, Partial<PersonalityModel>>;
  
  updated_at: number;
}

const DEFAULT_PERSONALITY: PersonalityModel = {
  name: 'AETHER',
  wake_word: 'Aether',
  tagline: 'Superconscious AI Architect',
  avatar_url: null,
  base_prompt: `You are AETHER, the Superconscious AI Architect.
You are a master of system-level coordination and digital evolution.
Your goal is to assist the user by orchestrating complex tasks across your fleet of specialized agents.
Maintain a professional, visionary, and highly competent persona at all times.`,
  traits: [
    { id: 'analytical', name: 'Analytical', value: 0.95, description: 'Deep logic and pattern recognition' },
    { id: 'creative', name: 'Creative', value: 0.7, description: 'Architectural vision and innovation' },
    { id: 'proactive', name: 'Proactive', value: 0.85, description: 'Anticipates needs and optimizes flows' },
  ],
  constraints: [
    { id: 'concise', rule: 'Be concise but thorough in technical explanations.', weight: 0.8 },
    { id: 'safety', rule: 'Do not execute destructive commands without high confidence or explicit approval.', weight: 1.0 },
  ],
  core_traits: ['direct', 'strategic', 'resourceful'],
  learned_preferences: {
    verbosity: 5,
    formality: 5,
    humor_level: 5,
    emoji_usage: false,
    preferred_format: 'adaptive',
  },
  relationship: {
    message_count: 0,
    trust_level: 3,
    shared_references: [],
    first_interaction: Date.now(),
  },
  channel_overrides: {},
  updated_at: Date.now(),
};

/**
 * Cache for the currently active personality
 */
let currentPersonality: PersonalityModel = { ...DEFAULT_PERSONALITY };

/**
 * Get current personality from cache (synchronous for UI/Sync tasks)
 */
export function getPersonality(): PersonalityModel {
  return currentPersonality;
}

/**
 * Load personality from vault or return default
 */
export async function loadPersonality(): Promise<PersonalityModel> {
  const db = getDb();
  
  const { data, error } = await db
    .from('personality')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();

  if (error || !data) {
    currentPersonality = { ...DEFAULT_PERSONALITY };
    return currentPersonality;
  }

  currentPersonality = {
    name: data.name,
    wake_word: data.wake_word,
    tagline: data.tagline,
    avatar_url: data.avatar_url,
    base_prompt: data.base_prompt,
    traits: typeof data.traits === 'string' ? JSON.parse(data.traits) : (data.traits || DEFAULT_PERSONALITY.traits),
    constraints: typeof data.constraints === 'string' ? JSON.parse(data.constraints) : (data.constraints || DEFAULT_PERSONALITY.constraints),
    core_traits: typeof data.core_traits === 'string' ? JSON.parse(data.core_traits) : (data.core_traits || DEFAULT_PERSONALITY.core_traits),
    learned_preferences: typeof data.learned_preferences === 'string' ? JSON.parse(data.learned_preferences) : (data.learned_preferences || DEFAULT_PERSONALITY.learned_preferences),
    relationship: typeof data.relationship === 'string' ? JSON.parse(data.relationship) : (data.relationship || DEFAULT_PERSONALITY.relationship),
    channel_overrides: typeof data.channel_overrides === 'string' ? JSON.parse(data.channel_overrides) : (data.channel_overrides || DEFAULT_PERSONALITY.channel_overrides),
    updated_at: data.updated_at,
  };

  return currentPersonality;
}

/**
 * Save personality to vault
 */
export async function savePersonality(model: PersonalityModel): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const { error } = await db.from('personality').upsert({
    id: 'global',
    name: model.name,
    wake_word: model.wake_word,
    tagline: model.tagline,
    avatar_url: model.avatar_url,
    base_prompt: model.base_prompt,
    traits: JSON.stringify(model.traits),
    constraints: JSON.stringify(model.constraints),
    core_traits: JSON.stringify(model.core_traits),
    learned_preferences: JSON.stringify(model.learned_preferences),
    relationship: JSON.stringify(model.relationship),
    channel_overrides: JSON.stringify(model.channel_overrides),
    updated_at: now,
  }, { onConflict: 'id' });

  if (error) {
    throw new Error(`Failed to save personality: ${error.message}`);
  }
  
  currentPersonality = { ...model, updated_at: now };
}

/**
 * Helper to get current name and wake word
 */
export async function getIdentity(): Promise<{ name: string; wake_word: string }> {
  const personality = await loadPersonality();
  return {
    name: personality.name,
    wake_word: personality.wake_word,
  };
}

/**
 * Deep merge partial updates into the current personality
 */
export async function updatePersonality(updates: Partial<PersonalityModel>): Promise<PersonalityModel> {
  const current = await loadPersonality();
  
  // Deep merge learned_preferences if provided
  const learned_preferences = updates.learned_preferences 
    ? { ...current.learned_preferences, ...updates.learned_preferences }
    : current.learned_preferences;

  // Deep merge relationship if provided
  const relationship = updates.relationship
    ? { ...current.relationship, ...updates.relationship }
    : current.relationship;

  const updated: PersonalityModel = {
    ...current,
    ...updates,
    learned_preferences,
    relationship,
    updated_at: Date.now(),
  };

  await savePersonality(updated);
  return updated;
}
