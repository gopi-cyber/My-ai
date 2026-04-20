import { test, expect, describe, beforeEach } from 'bun:test';
import { initDatabase } from '../vault/schema.ts';
import * as vault from '../vault/workflows.ts';
import { topologicalSort, getOutgoingEdges } from './executor.ts';
import { resolveExpression, resolveTemplateString, resolveAllTemplates, type TemplateContext } from './template.ts';
import { VariableScope } from './variables.ts';
import { NodeRegistry, type NodeDefinition } from './nodes/registry.ts';
import type { WorkflowDefinition } from './types.ts';
import { DEFAULT_WORKFLOW_SETTINGS } from './types.ts';

// ── Vault CRUD Tests ──

describe('Vault — Workflows', () => {
  beforeEach(async () => await initDatabase(':memory:'));

  test('createWorkflow + getWorkflow', async () => {
    const wf = await vault.createWorkflow('My Workflow', {
      description: 'Test workflow',
      tags: ['test', 'demo'],
      authority_level: 2,
    });

    expect(wf.id).toBeTruthy();
    expect(wf.name).toBe('My Workflow');
    expect(wf.description).toBe('Test workflow');
    expect(wf.enabled).toBe(true);
    expect(wf.authority_level).toBe(2);
    expect(wf.authority_approved).toBe(false);
    expect(wf.tags).toEqual(['test', 'demo']);
    expect(wf.current_version).toBe(1);

    const fetched = await vault.getWorkflow(wf.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('My Workflow');
    expect(fetched!.tags).toEqual(['test', 'demo']);
  });

  test('findWorkflows', async () => {
    await vault.createWorkflow('WF-1');
    await vault.createWorkflow('WF-2', { enabled: false });
    await vault.createWorkflow('WF-3', { tags: ['auto'] });

    const all = await vault.findWorkflows();
    expect(all.length).toBe(3);

    const enabled = await vault.findWorkflows({ enabled: true });
    expect(enabled.length).toBe(2);

    const tagged = await vault.findWorkflows({ tag: 'auto' });
    expect(tagged.length).toBe(1);
    expect(tagged[0]!.name).toBe('WF-3');
  });

  test('updateWorkflow', async () => {
    const wf = await vault.createWorkflow('Original');
    const updated = await vault.updateWorkflow(wf.id, { name: 'Renamed', enabled: false });
    expect(updated!.name).toBe('Renamed');
    expect(updated!.enabled).toBe(false);
  });

  test('deleteWorkflow', async () => {
    const wf = await vault.createWorkflow('ToDelete');
    expect(await vault.deleteWorkflow(wf.id)).toBe(true);
    expect(await vault.getWorkflow(wf.id)).toBeNull();
  });
});

describe('Vault — Versions', () => {
  beforeEach(async () => await initDatabase(':memory:'));

  const sampleDef: WorkflowDefinition = {
    nodes: [{ id: 'n1', type: 'trigger.manual', label: 'Start', position: { x: 0, y: 0 }, config: {} }],
    edges: [],
    settings: DEFAULT_WORKFLOW_SETTINGS,
  };

  test('createVersion + getLatestVersion', async () => {
    const wf = await vault.createWorkflow('Versioned');
    const v1 = await vault.createVersion(wf.id, sampleDef, 'Initial');

    expect(v1.version).toBe(1);
    expect(v1.changelog).toBe('Initial');
    expect(v1.definition.nodes).toHaveLength(1);

    const latest = await vault.getLatestVersion(wf.id);
    expect(latest!.version).toBe(1);
  });

  test('version history', async () => {
    const wf = await vault.createWorkflow('Multi-version');
    await vault.createVersion(wf.id, sampleDef, 'v1');
    await vault.createVersion(wf.id, { ...sampleDef, nodes: [...sampleDef.nodes, { id: 'n2', type: 'action.notify', label: 'Notify', position: { x: 100, y: 0 }, config: {} }] }, 'v2');

    const history = await vault.getVersionHistory(wf.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.version).toBe(2); // newest first
    expect(history[1]!.version).toBe(1);

    const v1 = await vault.getVersion(wf.id, 1);
    expect(v1!.definition.nodes).toHaveLength(1);

    const v2 = await vault.getVersion(wf.id, 2);
    expect(v2!.definition.nodes).toHaveLength(2);
  });
});

describe('Vault — Executions', () => {
  beforeEach(async () => await initDatabase(':memory:'));

  test('execution lifecycle', async () => {
    const wf = await vault.createWorkflow('Exec test');
    const exec = await vault.createExecution(wf.id, 1, 'manual', { key: 'val' });

    expect(exec.status).toBe('running');
    expect(exec.trigger_type).toBe('manual');
    expect(exec.trigger_data).toEqual({ key: 'val' });

    // Workflow execution_count should bump
    const updated = await vault.getWorkflow(wf.id);
    expect(updated!.execution_count).toBe(1);

    // Complete
    await vault.updateExecution(exec.id, { status: 'completed', completed_at: Date.now(), duration_ms: 500 });
    const completed = await vault.getExecution(exec.id);
    expect(completed!.status).toBe('completed');
    expect(completed!.duration_ms).toBe(500);
  });

  test('step results', async () => {
    const wf = await vault.createWorkflow('Steps test');
    const exec = await vault.createExecution(wf.id, 1, 'manual');

    const step = await vault.createStepResult(exec.id, 'node-1', 'action.http_request');
    expect(step.status).toBe('pending');

    await vault.updateStepResult(step.id, {
      status: 'completed',
      output_data: { response: 'ok' },
      started_at: Date.now(),
      completed_at: Date.now(),
      duration_ms: 100,
    });

    const steps = await vault.getStepResults(exec.id);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.status).toBe('completed');
    expect(steps[0]!.output_data).toEqual({ response: 'ok' });
  });

  test('findExecutions', async () => {
    const wf = await vault.createWorkflow('Find exec');
    await vault.createExecution(wf.id, 1, 'cron');
    await vault.createExecution(wf.id, 1, 'webhook');

    const all = await vault.findExecutions({ workflow_id: wf.id });
    expect(all).toHaveLength(2);
  });
});

describe('Vault — Variables', () => {
  beforeEach(async () => await initDatabase(':memory:'));

  test('persistent variables CRUD', async () => {
    const wf = await vault.createWorkflow('Vars test');

    await vault.setVariable(wf.id, 'counter', 0);
    expect(await vault.getVariable(wf.id, 'counter')).toBe(0);

    await vault.setVariable(wf.id, 'counter', 5);
    expect(await vault.getVariable(wf.id, 'counter')).toBe(5);

    await vault.setVariable(wf.id, 'name', 'test');
    const all = await vault.getVariables(wf.id);
    expect(all).toEqual({ counter: 5, name: 'test' });

    expect(await vault.deleteVariable(wf.id, 'counter')).toBe(true);
    expect(await vault.getVariable(wf.id, 'counter')).toBeNull();
  });
});

// ── Graph Executor Tests ──

describe('GraphExecutor — topologicalSort', () => {
  test('linear chain', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 'a', type: 'trigger.manual', label: 'A', position: { x: 0, y: 0 }, config: {} },
        { id: 'b', type: 'action.log', label: 'B', position: { x: 1, y: 0 }, config: {} },
        { id: 'c', type: 'action.log', label: 'C', position: { x: 2, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'c' },
      ],
      settings: DEFAULT_WORKFLOW_SETTINGS,
    };

    const levels = topologicalSort(def);
    expect(levels).toHaveLength(3);
    expect(levels[0]!).toEqual(['a']);
    expect(levels[1]!).toEqual(['b']);
    expect(levels[2]!).toEqual(['c']);
  });

  test('parallel branches', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 'trigger', type: 'trigger.manual', label: 'Start', position: { x: 0, y: 0 }, config: {} },
        { id: 'left', type: 'action.a', label: 'Left', position: { x: 1, y: -1 }, config: {} },
        { id: 'right', type: 'action.b', label: 'Right', position: { x: 1, y: 1 }, config: {} },
        { id: 'merge', type: 'logic.merge', label: 'Merge', position: { x: 2, y: 0 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'trigger', target: 'left' },
        { id: 'e2', source: 'trigger', target: 'right' },
        { id: 'e3', source: 'left', target: 'merge' },
        { id: 'e4', source: 'right', target: 'merge' },
      ],
      settings: DEFAULT_WORKFLOW_SETTINGS,
    };

    const levels = topologicalSort(def);
    expect(levels).toHaveLength(3);
    expect(levels[0]!).toEqual(['trigger']);
    expect(levels[1]!.sort()).toEqual(['left', 'right']);
    expect(levels[2]!).toEqual(['merge']);
  });

  test('getOutgoingEdges with route filter', () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: 'if', type: 'logic.if_else', label: 'If', position: { x: 0, y: 0 }, config: {} },
        { id: 'yes', type: 'action.a', label: 'Yes', position: { x: 1, y: -1 }, config: {} },
        { id: 'no', type: 'action.b', label: 'No', position: { x: 1, y: 1 }, config: {} },
      ],
      edges: [
        { id: 'e1', source: 'if', target: 'yes', sourceHandle: 'true' },
        { id: 'e2', source: 'if', target: 'no', sourceHandle: 'false' },
      ],
      settings: DEFAULT_WORKFLOW_SETTINGS,
    };

    expect(getOutgoingEdges(def, 'if', 'true')).toEqual(['yes']);
    expect(getOutgoingEdges(def, 'if', 'false')).toEqual(['no']);
    expect(getOutgoingEdges(def, 'if')).toEqual(['yes', 'no']);
  });
});

// ── Template Tests ──

describe('Template Engine', () => {
  const ctx: TemplateContext = {
    variables: { counter: 5, nested: { deep: 'value' } },
    nodeOutputs: new Map([['HTTP Request', { status: 200, body: 'hello' }]]),
    triggerData: { event: 'email', from: 'user@test.com' },
    env: { NODE_ENV: 'test' },
  };

  test('resolveExpression — variables', () => {
    expect(resolveExpression('counter', ctx)).toBe(5);
    expect(resolveExpression('nested.deep', ctx)).toBe('value');
    expect(resolveExpression('missing', ctx)).toBeUndefined();
  });

  test('resolveExpression — $trigger', () => {
    expect(resolveExpression('$trigger.event', ctx)).toBe('email');
    expect(resolveExpression('$trigger.from', ctx)).toBe('user@test.com');
  });

  test('resolveExpression — $node', () => {
    expect(resolveExpression('$node["HTTP Request"].status', ctx)).toBe(200);
    expect(resolveExpression('$node["HTTP Request"].body', ctx)).toBe('hello');
  });

  test('resolveExpression — $env', () => {
    expect(resolveExpression('$env.NODE_ENV', ctx)).toBe('test');
  });

  test('resolveTemplateString — single expression returns raw value', () => {
    expect(resolveTemplateString('{{counter}}', ctx)).toBe(5);
  });

  test('resolveTemplateString — interpolated string', () => {
    expect(resolveTemplateString('Count is {{counter}} and env is {{$env.NODE_ENV}}', ctx)).toBe('Count is 5 and env is test');
  });

  test('resolveAllTemplates — nested object', () => {
    const config = {
      url: 'https://api.com/{{$trigger.event}}',
      headers: { from: '{{$trigger.from}}' },
      count: '{{counter}}',
    };
    const resolved = resolveAllTemplates(config, ctx);
    expect(resolved.url).toBe('https://api.com/email');
    expect((resolved.headers as any).from).toBe('user@test.com');
    expect(resolved.count).toBe(5);
  });
});

// ── VariableScope Tests ──

describe('VariableScope', () => {
  beforeEach(async () => await initDatabase(':memory:'));

  test('execution-scoped vars', async () => {
    const wf = await vault.createWorkflow('scope-test');
    const scope = new VariableScope(wf.id);
    scope.set('temp', 42);
    expect(scope.get('temp')).toBe(42);
  });

  test('persistent vars', async () => {
    const wf = await vault.createWorkflow('persist-test');
    const scope = new VariableScope(wf.id);
    await scope.setPersistent('saved', 'hello');
    expect(scope.get('saved')).toBe('hello');

    // New scope should still see persistent var if we load them
    const persistentVars = await vault.getVariables(wf.id);
    const scope2 = new VariableScope(wf.id, persistentVars);
    expect(scope2.get('saved')).toBe('hello');
  });

  test('execution scope takes precedence', async () => {
    const wf = await vault.createWorkflow('precedence-test');
    await vault.setVariable(wf.id, 'key', 'persistent');

    const persistentVars = await vault.getVariables(wf.id);
    const scope = new VariableScope(wf.id, persistentVars);
    expect(scope.get('key')).toBe('persistent');

    scope.set('key', 'execution');
    expect(scope.get('key')).toBe('execution');
  });

  test('toObject merges both scopes', async () => {
    const wf = await vault.createWorkflow('merge-test');
    await vault.setVariable(wf.id, 'a', 1);

    const persistentVars = await vault.getVariables(wf.id);
    const scope = new VariableScope(wf.id, persistentVars);
    scope.set('b', 2);

    const obj = scope.toObject();
    expect(obj.a).toBe(1);
    expect(obj.b).toBe(2);
  });
});

// ── NodeRegistry Tests ──

describe('NodeRegistry', () => {
  test('register + get + list', () => {
    const registry = new NodeRegistry();
    const nodeDef: NodeDefinition = {
      type: 'trigger.test',
      label: 'Test Trigger',
      description: 'A test trigger',
      category: 'trigger',
      icon: 'T',
      color: '#000',
      configSchema: {},
      inputs: [],
      outputs: ['default'],
      execute: async () => ({ data: {} }),
    };

    registry.register(nodeDef);
    expect(registry.has('trigger.test')).toBe(true);
    expect(registry.get('trigger.test')!.label).toBe('Test Trigger');
    expect(registry.count()).toBe(1);
    expect(registry.list('trigger')).toHaveLength(1);
    expect(registry.list('action')).toHaveLength(0);
  });

  test('duplicate registration throws', () => {
    const registry = new NodeRegistry();
    const nodeDef: NodeDefinition = {
      type: 'test.dup', label: 'Dup', description: '', category: 'trigger',
      icon: '', color: '', configSchema: {}, inputs: [], outputs: [],
      execute: async () => ({ data: {} }),
    };
    registry.register(nodeDef);
    expect(() => registry.register(nodeDef)).toThrow();
  });
});
