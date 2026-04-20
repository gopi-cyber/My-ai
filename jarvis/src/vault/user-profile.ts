import { deleteSetting, getSetting, setSetting } from './settings.ts';
import { createEntity, updateEntity, getEntity } from './entities.ts';
import { createFact } from './facts.ts';
import { getDb } from './schema.ts';
import {
  USER_PROFILE_QUESTIONS,
  USER_PROFILE_SETTING_KEY,
  createEmptyUserProfile,
  countAnsweredUserProfileQuestions,
  normalizeUserProfileAnswers,
  type UserProfileRecord,
} from '../user/profile.ts';

export const USER_PROFILE_VAULT_SOURCE = 'user_profile';
const USER_PROFILE_FOLLOWUP_STATE_KEY = 'user.profile.followup.v1';

/**
 * Get the current user profile from settings
 */
export async function getUserProfile(): Promise<UserProfileRecord | null> {
  const raw = await getSetting(USER_PROFILE_SETTING_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<UserProfileRecord>;
    const base = createEmptyUserProfile();
    return {
      version: 1,
      answers: normalizeUserProfileAnswers((parsed.answers ?? {}) as Record<string, unknown>),
      created_at: typeof parsed.created_at === 'number' ? parsed.created_at : base.created_at,
      updated_at: typeof parsed.updated_at === 'number' ? parsed.updated_at : base.updated_at,
      completed_at: typeof parsed.completed_at === 'number' ? parsed.completed_at : null,
    };
  } catch {
    return null;
  }
}

/**
 * Save the user profile to settings and sync with knowledge graph
 */
export async function saveUserProfile(input: Record<string, unknown>): Promise<UserProfileRecord> {
  const existing = await getUserProfile();
  const now = Date.now();
  const answers = normalizeUserProfileAnswers(input);
  const profile: UserProfileRecord = {
    version: 1,
    answers,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    completed_at: countAnsweredUserProfileQuestions({
      version: 1,
      answers,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      completed_at: null,
    }) > 0 ? now : null,
  };

  await setSetting(USER_PROFILE_SETTING_KEY, JSON.stringify(profile));
  await syncUserProfileKnowledge(profile);
  return profile;
}

/**
 * Clear the user profile and associated knowledge
 */
export async function clearUserProfile(): Promise<void> {
  await deleteSetting(USER_PROFILE_SETTING_KEY);
  await clearUserProfileKnowledge();
  await deleteSetting(USER_PROFILE_FOLLOWUP_STATE_KEY);
}

/**
 * Sync profile data to entities and facts in the vault
 */
async function syncUserProfileKnowledge(profile: UserProfileRecord): Promise<void> {
  if (countAnsweredUserProfileQuestions(profile) === 0) {
    await clearUserProfileKnowledge();
    return;
  }

  const db = getDb();
  const entityName = profile.answers.preferred_name?.trim() || 'User';
  const entityProperties = {
    is_current_user: true,
    profile_version: profile.version,
    profile_updated_at: profile.updated_at,
  };

  // Find existing profile entity
  const { data: entityRow, error } = await db
    .from('entities')
    .select('id')
    .eq('source', USER_PROFILE_VAULT_SOURCE)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const entity = entityRow
    ? await updateEntity(entityRow.id, { name: entityName, properties: entityProperties })
    : await createEntity('person', entityName, entityProperties, USER_PROFILE_VAULT_SOURCE);

  if (!entity) {
    throw new Error('Failed to sync user profile entity to vault');
  }

  // Clear old facts before adding new ones
  await db.from('facts').delete().eq('subject_id', entity.id).eq('source', USER_PROFILE_VAULT_SOURCE);

  // Add facts for answered questions
  for (const question of USER_PROFILE_QUESTIONS) {
    const answer = (profile.answers[question.id] as string | undefined)?.trim();
    if (!answer) continue;
    await createFact(entity.id, question.id, answer, {
      confidence: 1,
      source: USER_PROFILE_VAULT_SOURCE,
    });
  }

  // Add derived facts
  for (const fact of getDerivedUserProfileFacts(profile)) {
    await createFact(entity.id, fact.predicate, fact.object, {
      confidence: 1,
      source: USER_PROFILE_VAULT_SOURCE,
    });
  }
}

/**
 * Clear user profile knowledge from the vault
 */
async function clearUserProfileKnowledge(): Promise<void> {
  const db = getDb();
  const { data: rows, error } = await db
    .from('entities')
    .select('id')
    .eq('source', USER_PROFILE_VAULT_SOURCE);

  if (error || !rows) return;

  await db.from('facts').delete().eq('source', USER_PROFILE_VAULT_SOURCE);
  for (const row of rows) {
    await db.from('entities').delete().eq('id', row.id);
  }
}

/**
 * Derive high-level facts from profile answers
 */
function getDerivedUserProfileFacts(profile: UserProfileRecord): Array<{ predicate: string; object: string }> {
  const facts: Array<{ predicate: string; object: string }> = [];
  const seen = new Set<string>();

  const preferredName = (profile.answers.preferred_name as string | undefined)?.trim();
  if (preferredName) {
    pushFact(facts, seen, 'name', preferredName);
  }

  const aliasSources = [
    profile.answers.important_people,
    profile.answers.anything_else,
    profile.answers.work_role,
    profile.answers.communication_preferences,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  for (const source of aliasSources) {
    for (const alias of extractAliases(source)) {
      pushFact(facts, seen, 'alias', alias);
      pushFact(facts, seen, 'username', alias);
    }
  }

  return facts;
}

function pushFact(
  facts: Array<{ predicate: string; object: string }>,
  seen: Set<string>,
  predicate: string,
  object: string,
): void {
  const value = object.trim();
  if (!value) return;
  const key = `${predicate}\u0000${value.toLowerCase()}`;
  if (seen.has(key)) return;
  seen.add(key);
  facts.push({ predicate, object: value });
}

function extractAliases(text: string): string[] {
  const aliases = new Set<string>();
  const patterns = [
    /\b(?:alias|username|user\s*name|handle)\s*(?:is|=|:)?\s*["']?([A-Za-z0-9._-]{2,32})["']?/gi,
    /\bgo by\s+["']?([A-Za-z0-9._-]{2,32})["']?/gi,
    /\bcalled\s+["']?([A-Za-z0-9._-]{2,32})["']?/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const alias = match[1]?.trim().replace(/[.,!?;:]+$/g, '');
      if (alias) aliases.add(alias);
    }
  }

  return [...aliases];
}
