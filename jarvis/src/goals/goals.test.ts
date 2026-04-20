import { test, expect, describe, beforeEach } from 'bun:test';
import { initDatabase } from '../vault/schema.ts';
import * as vault from '../vault/goals.ts';

describe('Vault — Goals', () => {
  beforeEach(() => initDatabase(':memory:'));

  // ── CRUD ──────────────────────────────────────────────────────────

  test('createGoal + getGoal', async () => {
    const goal = await vault.createGoal('Ship MVP', 'objective', {
      description: 'Launch the product',
      success_criteria: 'Product live with 100 users',
      time_horizon: 'quarterly',
      deadline: Date.now() + 86400000 * 90,
      tags: ['product', 'launch'],
      authority_level: 5,
    });

    expect(goal.id).toBeTruthy();
    expect(goal.title).toBe('Ship MVP');
    expect(goal.level).toBe('objective');
    expect(goal.description).toBe('Launch the product');
    expect(goal.success_criteria).toBe('Product live with 100 users');
    expect(goal.score).toBe(0.0);
    expect(goal.status).toBe('draft');
    expect(goal.health).toBe('on_track');
    expect(goal.tags).toEqual(['product', 'launch']);
    expect(goal.dependencies).toEqual([]);
    expect(goal.escalation_stage).toBe('none');
    expect(goal.parent_id).toBeNull();

    const fetched = await vault.getGoal(goal.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Ship MVP');
    expect(fetched!.tags).toEqual(['product', 'launch']);
  });

  test('createGoal with active status sets started_at', async () => {
    const goal = await vault.createGoal('Active goal', 'task', { status: 'active' });
    expect(goal.status).toBe('active');
    expect(goal.started_at).not.toBeNull();
  });

  test('getGoal returns null for non-existent', async () => {
    expect(await vault.getGoal('nonexistent')).toBeNull();
  });

  // ── Hierarchy ─────────────────────────────────────────────────────

  test('parent-child hierarchy', async () => {
    const obj = await vault.createGoal('Objective', 'objective');
    const kr1 = await vault.createGoal('KR 1', 'key_result', { parent_id: obj.id });
    const kr2 = await vault.createGoal('KR 2', 'key_result', { parent_id: obj.id });
    const milestone = await vault.createGoal('Milestone 1', 'milestone', { parent_id: kr1.id });

    const children = await vault.getGoalChildren(obj.id);
    expect(children.length).toBe(2);
    expect(children.map(c => c.title).sort()).toEqual(['KR 1', 'KR 2']);

    const kr1Children = await vault.getGoalChildren(kr1.id);
    expect(kr1Children.length).toBe(1);
    expect(kr1Children[0]!.title).toBe('Milestone 1');
  });

  test('getGoalTree returns full hierarchy', async () => {
    const obj = await vault.createGoal('Root', 'objective');
    const kr = await vault.createGoal('KR', 'key_result', { parent_id: obj.id });
    const ms = await vault.createGoal('Milestone', 'milestone', { parent_id: kr.id });
    const task = await vault.createGoal('Task', 'task', { parent_id: ms.id });

    const tree = await vault.getGoalTree(obj.id);
    expect(tree.length).toBe(4);
    expect(tree[0]!.title).toBe('Root');
    expect(tree.map(g => g.level)).toEqual(['objective', 'key_result', 'milestone', 'task']);
  });

  test('getGoalTree returns empty for non-existent root', async () => {
    expect(await vault.getGoalTree('nonexistent')).toEqual([]);
  });

  test('getRootGoals returns only top-level', async () => {
    await vault.createGoal('Root 1', 'objective');
    await vault.createGoal('Root 2', 'objective');
    const root3 = await vault.createGoal('Root 3', 'objective');
    await vault.createGoal('Child', 'key_result', { parent_id: root3.id });

    const roots = await vault.getRootGoals();
    expect(roots.length).toBe(3);
  });

  // ── Queries ───────────────────────────────────────────────────────

  test('findGoals with filters', async () => {
    await vault.createGoal('G1', 'objective', { status: 'active' });
    await vault.createGoal('G2', 'task', { status: 'active', tags: ['work'] });
    await vault.createGoal('G3', 'objective', { status: 'draft' });

    expect((await vault.findGoals({ status: 'active' })).length).toBe(2);
    expect((await vault.findGoals({ level: 'objective' })).length).toBe(2);
    expect((await vault.findGoals({ status: 'active', level: 'task' })).length).toBe(1);
    expect((await vault.findGoals({ tag: 'work' })).length).toBe(1);
  });

  test('findGoals with limit', async () => {
    for (let i = 0; i < 10; i++) {
      await vault.createGoal(`Goal ${i}`, 'task');
    }
    expect((await vault.findGoals({ limit: 5 })).length).toBe(5);
  });

  // ── Updates ───────────────────────────────────────────────────────

  test('updateGoal partial update', async () => {
    const goal = await vault.createGoal('Original', 'objective');

    const updated = await vault.updateGoal(goal.id, {
      title: 'Updated Title',
      description: 'New description',
      tags: ['updated'],
    });

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.description).toBe('New description');
    expect(updated!.tags).toEqual(['updated']);
    expect(updated!.updated_at).toBeGreaterThanOrEqual(goal.updated_at);
  });

  test('updateGoal returns null for non-existent', async () => {
    expect(await vault.updateGoal('nonexistent', { title: 'X' })).toBeNull();
  });

  test('updateGoal with empty updates returns existing', async () => {
    const goal = await vault.createGoal('Test', 'task');
    const same = await vault.updateGoal(goal.id, {});
    expect(same!.title).toBe('Test');
  });

  // ── Score ─────────────────────────────────────────────────────────

  test('updateGoalScore clamps and logs progress', async () => {
    const goal = await vault.createGoal('Scored goal', 'key_result');

    const updated = await vault.updateGoalScore(goal.id, 0.7, 'Good progress');
    expect(updated!.score).toBe(0.7);
    expect(updated!.score_reason).toBe('Good progress');

    // Check progress entry was created
    const history = await vault.getProgressHistory(goal.id);
    expect(history.length).toBe(1);
    expect(history[0]!.score_before).toBe(0.0);
    expect(history[0]!.score_after).toBe(0.7);
    expect(history[0]!.note).toBe('Good progress');
    expect(history[0]!.type).toBe('manual');
  });

  test('updateGoalScore clamps to 0-1 range', async () => {
    const goal = await vault.createGoal('Clamp test', 'task');
    await vault.updateGoalScore(goal.id, 1.5, 'Over max');
    expect((await vault.getGoal(goal.id))!.score).toBe(1.0);

    await vault.updateGoalScore(goal.id, -0.5, 'Under min');
    expect((await vault.getGoal(goal.id))!.score).toBe(0.0);
  });

  // ── Status ────────────────────────────────────────────────────────

  test('updateGoalStatus to active sets started_at', async () => {
    const goal = await vault.createGoal('Activating', 'objective');
    expect(goal.started_at).toBeNull();

    const active = await vault.updateGoalStatus(goal.id, 'active');
    expect(active!.status).toBe('active');
    expect(active!.started_at).not.toBeNull();
  });

  test('updateGoalStatus to completed sets completed_at', async () => {
    const goal = await vault.createGoal('Completing', 'task', { status: 'active' });
    const done = await vault.updateGoalStatus(goal.id, 'completed');
    expect(done!.status).toBe('completed');
    expect(done!.completed_at).not.toBeNull();
  });

  test('updateGoalStatus to failed sets completed_at', async () => {
    const goal = await vault.createGoal('Failing', 'task', { status: 'active' });
    const failed = await vault.updateGoalStatus(goal.id, 'failed');
    expect(failed!.status).toBe('failed');
    expect(failed!.completed_at).not.toBeNull();
  });

  test('updateGoalStatus to killed sets completed_at', async () => {
    const goal = await vault.createGoal('Killing', 'task', { status: 'active' });
    const killed = await vault.updateGoalStatus(goal.id, 'killed');
    expect(killed!.status).toBe('killed');
    expect(killed!.completed_at).not.toBeNull();
  });

  // ── Health ────────────────────────────────────────────────────────

  test('updateGoalHealth', async () => {
    const goal = await vault.createGoal('Health check', 'objective');
    expect(goal.health).toBe('on_track');

    const updated = await vault.updateGoalHealth(goal.id, 'at_risk');
    expect(updated!.health).toBe('at_risk');
  });

  // ── Escalation ────────────────────────────────────────────────────

  test('updateGoalEscalation sets stage and timestamp', async () => {
    const goal = await vault.createGoal('Escalating', 'key_result', { status: 'active' });
    expect(goal.escalation_stage).toBe('none');
    expect(goal.escalation_started_at).toBeNull();

    const pressured = await vault.updateGoalEscalation(goal.id, 'pressure');
    expect(pressured!.escalation_stage).toBe('pressure');
    expect(pressured!.escalation_started_at).not.toBeNull();

    const startedAt = pressured!.escalation_started_at;

    // Advancing stage should keep the original start time
    const rootCause = await vault.updateGoalEscalation(goal.id, 'root_cause');
    expect(rootCause!.escalation_stage).toBe('root_cause');
    expect(rootCause!.escalation_started_at).toBe(startedAt);

    // Resetting to none clears the timestamp
    const cleared = await vault.updateGoalEscalation(goal.id, 'none');
    expect(cleared!.escalation_stage).toBe('none');
    expect(cleared!.escalation_started_at).toBeNull();
  });

  // ── Delete ────────────────────────────────────────────────────────

  test('deleteGoal cascades to children', async () => {
    const parent = await vault.createGoal('Parent', 'objective');
    const child = await vault.createGoal('Child', 'key_result', { parent_id: parent.id });
    await vault.createGoal('Grandchild', 'milestone', { parent_id: child.id });

    expect(await vault.deleteGoal(parent.id)).toBe(true);
    expect(await vault.getGoal(parent.id)).toBeNull();
    expect(await vault.getGoal(child.id)).toBeNull();
  });

  test('deleteGoal returns false for non-existent', async () => {
    expect(await vault.deleteGoal('nonexistent')).toBe(false);
  });

  // ── Reorder ───────────────────────────────────────────────────────

  test('reorderGoals updates sort_order', async () => {
    const g1 = await vault.createGoal('First', 'task', { sort_order: 0 });
    const g2 = await vault.createGoal('Second', 'task', { sort_order: 1 });
    const g3 = await vault.createGoal('Third', 'task', { sort_order: 2 });

    await vault.reorderGoals([
      { id: g3.id, sort_order: 0 },
      { id: g1.id, sort_order: 1 },
      { id: g2.id, sort_order: 2 },
    ]);

    const goals = await vault.findGoals({ level: 'task' });
    expect(goals[0]!.title).toBe('Third');
    expect(goals[1]!.title).toBe('First');
    expect(goals[2]!.title).toBe('Second');
  });

  // ── Overdue & Escalation Queries ──────────────────────────────────

  test('getOverdueGoals', async () => {
    await vault.createGoal('Past due', 'task', {
      status: 'active',
      deadline: Date.now() - 86400000,
    });
    await vault.createGoal('Future', 'task', {
      status: 'active',
      deadline: Date.now() + 86400000,
    });
    await vault.createGoal('No deadline', 'task', { status: 'active' });

    const overdue = await vault.getOverdueGoals();
    expect(overdue.length).toBe(1);
    expect(overdue[0]!.title).toBe('Past due');
  });

  test('getGoalsNeedingEscalation', async () => {
    await vault.createGoal('Behind', 'task', { status: 'active' });
    await vault.updateGoalHealth(
      (await vault.findGoals({ status: 'active' }))[0]!.id,
      'behind',
    );

    await vault.createGoal('On track', 'task', { status: 'active' });

    const needEscalation = await vault.getGoalsNeedingEscalation();
    expect(needEscalation.length).toBe(1);
    expect(needEscalation[0]!.title).toBe('Behind');
  });

  test('getGoalsByDependency', async () => {
    const dep = await vault.createGoal('Dependency', 'milestone', { status: 'active' });
    await vault.createGoal('Dependent', 'task', {
      status: 'active',
      dependencies: [dep.id],
    });
    await vault.createGoal('Independent', 'task', { status: 'active' });

    const dependents = await vault.getGoalsByDependency(dep.id);
    expect(dependents.length).toBe(1);
    expect(dependents[0]!.title).toBe('Dependent');
  });

  // ── Progress History ──────────────────────────────────────────────

  test('progress history tracks score changes', async () => {
    const goal = await vault.createGoal('Progress test', 'key_result');

    await vault.updateGoalScore(goal.id, 0.3, 'Started work');
    await vault.updateGoalScore(goal.id, 0.5, 'Halfway there');
    await vault.updateGoalScore(goal.id, 0.7, 'Almost done');

    const history = await vault.getProgressHistory(goal.id);
    expect(history.length).toBe(3);

    // All three scores should be recorded
    const scores = history.map(h => h.score_after).sort();
    expect(scores).toEqual([0.3, 0.5, 0.7]);
  });

  // ── Check-Ins ─────────────────────────────────────────────────────

  test('createCheckIn + getRecentCheckIns', async () => {
    const morning = await vault.createCheckIn(
      'morning_plan',
      'Today focus on shipping the API',
      ['goal-1', 'goal-2'],
      ['Build endpoints', 'Write tests'],
    );

    expect(morning.type).toBe('morning_plan');
    expect(morning.summary).toBe('Today focus on shipping the API');
    expect(morning.goals_reviewed).toEqual(['goal-1', 'goal-2']);
    expect(morning.actions_planned).toEqual(['Build endpoints', 'Write tests']);

    const evening = await vault.createCheckIn(
      'evening_review',
      'Built endpoints but skipped tests',
      ['goal-1', 'goal-2'],
      [],
      ['Build endpoints'],
    );

    const all = await vault.getRecentCheckIns();
    expect(all.length).toBe(2);

    const mornings = await vault.getRecentCheckIns('morning_plan');
    expect(mornings.length).toBe(1);

    const evenings = await vault.getRecentCheckIns('evening_review');
    expect(evenings.length).toBe(1);
  });

  test('getTodayCheckIn', async () => {
    await vault.createCheckIn('morning_plan', 'Today plan', ['g1']);

    const today = await vault.getTodayCheckIn('morning_plan');
    expect(today).not.toBeNull();
    expect(today!.summary).toBe('Today plan');

    const noEvening = await vault.getTodayCheckIn('evening_review');
    expect(noEvening).toBeNull();
  });

  // ── Metrics ───────────────────────────────────────────────────────

  test('getGoalMetrics aggregates correctly', async () => {
    // Create a mix of goals
    const obj = await vault.createGoal('Obj', 'objective', { status: 'active' });
    await vault.updateGoalScore(obj.id, 0.6, 'In progress');

    await vault.createGoal('Done', 'task', { status: 'active' });
    await vault.updateGoalStatus(
      (await vault.findGoals({ level: 'task' }))[0]!.id,
      'completed',
    );

    await vault.createGoal('Behind', 'task', { status: 'active' });
    await vault.updateGoalHealth(
      (await vault.findGoals({ status: 'active', level: 'task' }))[0]!.id,
      'behind',
    );

    const metrics = await vault.getGoalMetrics();
    expect(metrics.total).toBe(3);
    expect(metrics.active).toBe(2);
    expect(metrics.completed).toBe(1);
    expect(metrics.avg_score).toBe(0.6); // only active objectives
    expect(metrics.behind).toBe(1);
  });
});
