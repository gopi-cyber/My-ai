import { afterEach, describe, expect, test } from 'bun:test';
import { closeDb, initDatabase } from '../vault/schema.ts';
import { getUserProfile, saveUserProfile } from '../vault/user-profile.ts';
import {
  clearUserProfileFollowupState,
  maybeCreateUserProfileFollowupPrompt,
  recordUserProfileTurn,
} from './profile-followup.ts';

describe('User Profile Followup', () => {
  afterEach(async () => {
    await closeDb();
  });

  test('asks an occasional followup for unanswered profile fields', async () => {
    await initDatabase(':memory:');
    await saveUserProfile({
      preferred_name: 'Alex',
      interests: 'AI',
    });

    for (let i = 0; i < 5; i++) {
      await recordUserProfileTurn(`message ${i}`);
    }
    expect(await maybeCreateUserProfileFollowupPrompt()).toBeNull();

    await recordUserProfileTurn('message 5');
    const prompt = await maybeCreateUserProfileFollowupPrompt();
    expect(prompt).toContain('One quick question so I can personalize better:');
  });

  test('captures a pending followup answer into the profile', async () => {
    await initDatabase(':memory:');
    await saveUserProfile({
      preferred_name: 'Alex',
      interests: 'AI',
    });

    for (let i = 0; i < 6; i++) {
      await recordUserProfileTurn(`message ${i}`);
    }
    const prompt = await maybeCreateUserProfileFollowupPrompt();
    expect(prompt).toBeString();

    const result = await recordUserProfileTurn('Blunt, concise, and actionable.');
    expect(result.answeredQuestion).toBeDefined();

    const profile = await getUserProfile();
    expect(profile?.answers.communication_preferences).toBe('Blunt, concise, and actionable.');
  });

  test('skip clears the pending followup without writing an answer', async () => {
    await initDatabase(':memory:');
    await saveUserProfile({
      preferred_name: 'Alex',
      interests: 'AI',
    });

    for (let i = 0; i < 6; i++) {
      await recordUserProfileTurn(`message ${i}`);
    }
    await maybeCreateUserProfileFollowupPrompt();

    const result = await recordUserProfileTurn('skip');
    expect(result.skippedQuestion).toBeDefined();
    const profile = await getUserProfile();
    expect(profile?.answers.communication_preferences).toBeUndefined();
  });

  test('clear resets followup state', async () => {
    await initDatabase(':memory:');
    await saveUserProfile({
      preferred_name: 'Alex',
      interests: 'AI',
    });

    for (let i = 0; i < 6; i++) {
      await recordUserProfileTurn(`message ${i}`);
    }
    expect(await maybeCreateUserProfileFollowupPrompt()).toBeString();

    await clearUserProfileFollowupState();
    expect(await maybeCreateUserProfileFollowupPrompt()).toBeNull();
  });
});
