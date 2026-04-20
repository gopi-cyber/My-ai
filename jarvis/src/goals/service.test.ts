import { test, expect, describe, beforeEach } from 'bun:test';
import { initDatabase } from '../vault/schema.ts';
import { GoalService } from './service.ts';
import type { GoalEvent } from './events.ts';
import type { GoalConfig } from '../config/types.ts';

const defaultConfig: GoalConfig = {
  enabled: true,
  morning_window: { start: 7, end: 9 },
  evening_window: { start: 20, end: 22 },
  accountability_style: 'drill_sergeant',
  escalation_weeks: { pressure: 1, root_cause: 3, suggest_kill: 4 },
  auto_decompose: true,
  calendar_ownership: false,
};

describe('GoalService', () => {
  let service: GoalService;
  let events: GoalEvent[];

  beforeEach(async () => {
    initDatabase(':memory:');
    service = new GoalService(defaultConfig);
    events = [];
    service.setEventCallback((e) => events.push(e));
  });

  test('start and stop lifecycle', async () => {
    expect(service.status()).toBe('stopped');
    await service.start();
    expect(service.status()).toBe('running');
    await service.stop();
    expect(service.status()).toBe('stopped');
  });

  test('disabled config skips start', async () => {
    const disabled = new GoalService({ ...defaultConfig, enabled: false });
    await disabled.start();
    expect(disabled.status()).toBe('stopped');
  });

  test('createGoal emits goal_created event', async () => {
    const goal = await service.createGoal('Test Goal', 'objective');
    expect(goal.title).toBe('Test Goal');
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_created');
    expect(events[0]!.goalId).toBe(goal.id);
  });

  test('updateGoal emits goal_updated event', async () => {
    const goal = await service.createGoal('Original', 'task');
    events = [];

    const updated = await service.updateGoal(goal.id, { title: 'Changed' });
    expect(updated!.title).toBe('Changed');
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_updated');
  });

  test('scoreGoal emits goal_scored event', async () => {
    const goal = await service.createGoal('Scored', 'key_result');
    events = [];

    await service.scoreGoal(goal.id, 0.5, 'halfway');
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_scored');
    expect(events[0]!.data.score).toBe(0.5);
  });

  test('updateStatus emits correct event type', async () => {
    const goal = await service.createGoal('Status test', 'task', { status: 'active' });
    events = [];

    await service.updateStatus(goal.id, 'completed');
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_completed');

    const g2 = await service.createGoal('Fail test', 'task', { status: 'active' });
    events = [];
    await service.updateStatus(g2.id, 'failed');
    expect(events[0]!.type).toBe('goal_failed');

    const g3 = await service.createGoal('Kill test', 'task', { status: 'active' });
    events = [];
    await service.updateStatus(g3.id, 'killed');
    expect(events[0]!.type).toBe('goal_killed');

    const g4 = await service.createGoal('Pause test', 'task', { status: 'active' });
    events = [];
    await service.updateStatus(g4.id, 'paused');
    expect(events[0]!.type).toBe('goal_status_changed');
  });

  test('updateHealth emits goal_health_changed event', async () => {
    const goal = await service.createGoal('Health test', 'objective');
    events = [];

    await service.updateHealth(goal.id, 'at_risk');
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_health_changed');
    expect(events[0]!.data.health).toBe('at_risk');
  });

  test('deleteGoal emits goal_deleted event', async () => {
    const goal = await service.createGoal('Delete me', 'task');
    events = [];

    await service.deleteGoal(goal.id);
    expect(events.length).toBe(1);
    expect(events[0]!.type).toBe('goal_deleted');
    expect(events[0]!.goalId).toBe(goal.id);
  });

  test('getGoal returns null for non-existent', async () => {
    expect(await service.getGoal('nope')).toBeNull();
  });

  test('getMetrics returns aggregated data', async () => {
    await service.createGoal('Active', 'task', { status: 'active' });
    await service.createGoal('Draft', 'task');

    const metrics = await service.getMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.active).toBe(1);
  });

  test('no events when update returns null', async () => {
    events = [];
    await service.updateGoal('nonexistent', { title: 'X' });
    await service.scoreGoal('nonexistent', 0.5, 'nope');
    await service.updateHealth('nonexistent', 'behind');
    await service.deleteGoal('nonexistent');
    expect(events.length).toBe(0);
  });
});
