import { getDb, generateId } from './schema.ts';
import type {
  Workflow, WorkflowVersion, WorkflowExecution, WorkflowStepResult,
  WorkflowDefinition, ExecutionStatus, StepStatus,
} from '../workflows/types.ts';
import type { ActionCategory } from '../roles/authority.ts';

// ── Row types (raw DB) ──

type WorkflowRow = Omit<Workflow, 'enabled' | 'authority_approved' | 'tags'> & {
  enabled: number;
  authority_approved: number;
  tags: string | null;
};

type VersionRow = Omit<WorkflowVersion, 'definition'> & { definition: string };
type ExecutionRow = Omit<WorkflowExecution, 'trigger_data' | 'variables'> & {
  trigger_data: string | null;
  variables: string | null;
};
type StepResultRow = Omit<WorkflowStepResult, 'input_data' | 'output_data'> & {
  input_data: string | null;
  output_data: string | null;
};

// ── Parsers ──

function parseWorkflow(row: WorkflowRow): Workflow {
  return {
    ...row,
    enabled: row.enabled === 1,
    authority_approved: row.authority_approved === 1,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

function parseVersion(row: VersionRow): WorkflowVersion {
  return { ...row, definition: JSON.parse(row.definition) };
}

function parseExecution(row: ExecutionRow): WorkflowExecution {
  return {
    ...row,
    trigger_data: row.trigger_data ? JSON.parse(row.trigger_data) : null,
    variables: row.variables ? JSON.parse(row.variables) : {},
  };
}

function parseStepResult(row: StepResultRow): WorkflowStepResult {
  return {
    ...row,
    input_data: row.input_data ? JSON.parse(row.input_data) : null,
    output_data: row.output_data ? JSON.parse(row.output_data) : null,
  };
}

// ── Workflows ──

export async function createWorkflow(
  name: string,
  opts?: {
    description?: string;
    authority_level?: number;
    tags?: string[];
    enabled?: boolean;
  }
): Promise<Workflow> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const { error } = await db.from('workflows').insert({
    id, name,
    description: opts?.description ?? '',
    enabled: opts?.enabled !== false ? 1 : 0,
    authority_level: opts?.authority_level ?? 3,
    authority_approved: 0,
    tags: opts?.tags ? JSON.stringify(opts.tags) : null,
    current_version: 1,
    execution_count: 0,
    created_at: now,
    updated_at: now,
  });

  if (error) throw new Error(`Failed to create workflow: ${error.message}`);

  return {
    id, name,
    description: opts?.description ?? '',
    enabled: opts?.enabled !== false,
    authority_level: opts?.authority_level ?? 3,
    authority_approved: false,
    approved_at: null,
    approved_by: null,
    tags: opts?.tags ?? [],
    current_version: 1,
    execution_count: 0,
    last_executed_at: null,
    last_success_at: null,
    last_failure_at: null,
    created_at: now,
    updated_at: now,
  };
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  const { data: row, error } = await getDb()
    .from('workflows')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error || !row) return null;
  return parseWorkflow(row as WorkflowRow);
}

export async function findWorkflows(query?: {
  enabled?: boolean;
  tag?: string;
  limit?: number;
}): Promise<Workflow[]> {
  const db = getDb();
  let q = db.from('workflows').select('*');

  if (query?.enabled !== undefined) {
    q = q.eq('enabled', query.enabled ? 1 : 0);
  }

  q = q.order('updated_at', { ascending: false });
  
  const limitVal = query?.limit ? Math.max(1, Math.min(parseInt(String(query.limit), 10) || 100, 1000)) : 100;
  q = q.limit(limitVal);

  const { data: rows, error } = await q;
  if (error || !rows) return [];

  let result = (rows as WorkflowRow[]).map(parseWorkflow);
  if (query?.tag) {
    result = result.filter(w => w.tags.includes(query.tag!));
  }
  return result;
}

export async function updateWorkflow(
  id: string,
  updates: Partial<Pick<Workflow, 'name' | 'description' | 'enabled' | 'authority_level' | 'authority_approved' | 'approved_at' | 'approved_by' | 'tags' | 'current_version' | 'execution_count' | 'last_executed_at' | 'last_success_at' | 'last_failure_at'>>
): Promise<Workflow | null> {
  const db = getDb();
  const rowUpdates: Record<string, any> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) rowUpdates.name = updates.name;
  if (updates.description !== undefined) rowUpdates.description = updates.description;
  if (updates.enabled !== undefined) rowUpdates.enabled = updates.enabled ? 1 : 0;
  if (updates.authority_level !== undefined) rowUpdates.authority_level = updates.authority_level;
  if (updates.authority_approved !== undefined) rowUpdates.authority_approved = updates.authority_approved ? 1 : 0;
  if (updates.approved_at !== undefined) rowUpdates.approved_at = updates.approved_at;
  if (updates.approved_by !== undefined) rowUpdates.approved_by = updates.approved_by;
  if (updates.tags !== undefined) rowUpdates.tags = JSON.stringify(updates.tags);
  if (updates.current_version !== undefined) rowUpdates.current_version = updates.current_version;
  if (updates.execution_count !== undefined) rowUpdates.execution_count = updates.execution_count;
  if (updates.last_executed_at !== undefined) rowUpdates.last_executed_at = updates.last_executed_at;
  if (updates.last_success_at !== undefined) rowUpdates.last_success_at = updates.last_success_at;
  if (updates.last_failure_at !== undefined) rowUpdates.last_failure_at = updates.last_failure_at;

  const { error } = await db.from('workflows').update(rowUpdates).eq('id', id);
  if (error) return null;
  
  return getWorkflow(id);
}

export async function deleteWorkflow(id: string): Promise<boolean> {
  const { error } = await getDb().from('workflows').delete().eq('id', id);
  return !error;
}

// ── Versions ──

export async function createVersion(
  workflowId: string,
  definition: WorkflowDefinition,
  changelog?: string,
  createdBy?: string,
): Promise<WorkflowVersion> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const { data: latest, error: fetchError } = await db
    .from('workflow_versions')
    .select('version')
    .eq('workflow_id', workflowId)
    .order('version', { ascending: false })
    .limit(1);
  
  if (fetchError) throw new Error(`Failed to fetch latest version: ${fetchError.message}`);
  
  const version = (latest && latest[0] ? latest[0].version : 0) + 1;

  const { error: insertError } = await db.from('workflow_versions').insert({
    id,
    workflow_id: workflowId,
    version,
    definition: JSON.stringify(definition),
    changelog: changelog ?? null,
    created_by: createdBy ?? 'user',
    created_at: now
  });

  if (insertError) throw new Error(`Failed to create version: ${insertError.message}`);

  await db.from('workflows').update({ current_version: version, updated_at: now }).eq('id', workflowId);

  return { id, workflow_id: workflowId, version, definition, changelog: changelog ?? null, created_by: createdBy ?? 'user', created_at: now };
}

export async function getVersion(workflowId: string, version: number): Promise<WorkflowVersion | null> {
  const { data: row, error } = await getDb()
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('version', version)
    .single();
  
  if (error || !row) return null;
  return parseVersion(row as VersionRow);
}

export async function getLatestVersion(workflowId: string): Promise<WorkflowVersion | null> {
  const { data: rows, error } = await getDb()
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('version', { ascending: false })
    .limit(1);
  
  if (error || !rows || rows.length === 0) return null;
  return parseVersion(rows[0] as VersionRow);
}

export async function getVersionHistory(workflowId: string): Promise<WorkflowVersion[]> {
  const { data: rows, error } = await getDb()
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('version', { ascending: false });
  
  if (error || !rows) return [];
  return (rows as VersionRow[]).map(parseVersion);
}

// ── Executions ──

export async function createExecution(
  workflowId: string,
  version: number,
  triggerType: string,
  triggerData?: Record<string, unknown>,
): Promise<WorkflowExecution> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const { error: insertError } = await db.from('workflow_executions').insert({
    id,
    workflow_id: workflowId,
    version,
    trigger_type: triggerType,
    trigger_data: triggerData ? JSON.stringify(triggerData) : null,
    status: 'running',
    variables: '{}',
    started_at: now
  });

  if (insertError) throw new Error(`Failed to create execution: ${insertError.message}`);

  const { data: wf } = await db.from('workflows').select('execution_count').eq('id', workflowId).single();
  const newCount = (wf?.execution_count ?? 0) + 1;
  await db.from('workflows').update({ 
    execution_count: newCount, 
    last_executed_at: now, 
    updated_at: now 
  }).eq('id', workflowId);

  return {
    id, workflow_id: workflowId, version, trigger_type: triggerType,
    trigger_data: triggerData ?? null, status: 'running', variables: {},
    error_message: null, started_at: now, completed_at: null, duration_ms: null,
  };
}

export async function getExecution(id: string): Promise<WorkflowExecution | null> {
  const { data: row, error } = await getDb().from('workflow_executions').select('*').eq('id', id).single();
  if (error || !row) return null;
  return parseExecution(row as ExecutionRow);
}

export async function updateExecution(
  id: string,
  updates: Partial<Pick<WorkflowExecution, 'status' | 'variables' | 'error_message' | 'completed_at' | 'duration_ms'>>
): Promise<WorkflowExecution | null> {
  const db = getDb();
  const rowUpdates: Record<string, any> = {};

  if (updates.status !== undefined) rowUpdates.status = updates.status;
  if (updates.variables !== undefined) rowUpdates.variables = JSON.stringify(updates.variables);
  if (updates.error_message !== undefined) rowUpdates.error_message = updates.error_message;
  if (updates.completed_at !== undefined) rowUpdates.completed_at = updates.completed_at;
  if (updates.duration_ms !== undefined) rowUpdates.duration_ms = updates.duration_ms;

  if (Object.keys(rowUpdates).length === 0) return getExecution(id);

  const { error } = await db.from('workflow_executions').update(rowUpdates).eq('id', id);
  if (error) return null;

  if (updates.status === 'completed' || updates.status === 'failed') {
    const exec = await getExecution(id);
    if (exec) {
      const field = updates.status === 'completed' ? 'last_success_at' : 'last_failure_at';
      const now = new Date().toISOString();
      await db.from('workflows').update({ [field]: now, updated_at: now }).eq('id', exec.workflow_id);
    }
  }

  return getExecution(id);
}

export async function findExecutions(query: {
  workflow_id?: string;
  status?: ExecutionStatus;
  limit?: number;
}): Promise<WorkflowExecution[]> {
  const db = getDb();
  let q = db.from('workflow_executions').select('*');

  if (query.workflow_id) q = q.eq('workflow_id', query.workflow_id);
  if (query.status) q = q.eq('status', query.status);

  q = q.order('started_at', { ascending: false });
  const limitVal = Math.max(1, Math.min(parseInt(String(query.limit ?? 100), 10) || 100, 1000));
  q = q.limit(limitVal);

  const { data: rows, error } = await q;
  if (error || !rows) return [];
  return (rows as ExecutionRow[]).map(parseExecution);
}

// ── Step Results ──

export async function createStepResult(
  executionId: string,
  nodeId: string,
  nodeType: string,
): Promise<WorkflowStepResult> {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  const { error } = await db.from('workflow_step_results').insert({
    id,
    execution_id: executionId,
    node_id: nodeId,
    node_type: nodeType,
    status: 'pending',
    retry_count: 0,
    started_at: now
  });

  if (error) throw new Error(`Failed to create step result: ${error.message}`);

  return {
    id, execution_id: executionId, node_id: nodeId, node_type: nodeType,
    status: 'pending', input_data: null, output_data: null, error_message: null,
    retry_count: 0, started_at: now, completed_at: null, duration_ms: null,
  };
}

export async function updateStepResult(
  id: string,
  updates: Partial<Pick<WorkflowStepResult, 'status' | 'input_data' | 'output_data' | 'error_message' | 'retry_count' | 'started_at' | 'completed_at' | 'duration_ms'>>
): Promise<WorkflowStepResult | null> {
  const db = getDb();
  const rowUpdates: Record<string, any> = {};

  if (updates.status !== undefined) rowUpdates.status = updates.status;
  if (updates.input_data !== undefined) rowUpdates.input_data = JSON.stringify(updates.input_data);
  if (updates.output_data !== undefined) rowUpdates.output_data = JSON.stringify(updates.output_data);
  if (updates.error_message !== undefined) rowUpdates.error_message = updates.error_message;
  if (updates.retry_count !== undefined) rowUpdates.retry_count = updates.retry_count;
  if (updates.started_at !== undefined) rowUpdates.started_at = updates.started_at;
  if (updates.completed_at !== undefined) rowUpdates.completed_at = updates.completed_at;
  if (updates.duration_ms !== undefined) rowUpdates.duration_ms = updates.duration_ms;

  const { error } = await db.from('workflow_step_results').update(rowUpdates).eq('id', id);
  if (error) return null;

  const { data: row } = await db.from('workflow_step_results').select('*').eq('id', id).single();
  return row ? parseStepResult(row as StepResultRow) : null;
}

export async function getStepResults(executionId: string): Promise<WorkflowStepResult[]> {
  const { data: rows, error } = await getDb()
    .from('workflow_step_results')
    .select('*')
    .eq('execution_id', executionId)
    .order('started_at', { ascending: true });
  
  if (error || !rows) return [];
  return (rows as StepResultRow[]).map(parseStepResult);
}

// ── Persistent Variables ──

export async function getVariable(workflowId: string, key: string): Promise<unknown | null> {
  const { data: row, error } = await getDb()
    .from('workflow_variables')
    .select('value')
    .eq('workflow_id', workflowId)
    .eq('key', key)
    .single();
  
  if (error || !row) return null;
  return JSON.parse(row.value);
}

export async function setVariable(workflowId: string, key: string, value: unknown): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  
  // Upsert for Supabase
  const { error } = await db.from('workflow_variables').upsert({
    workflow_id: workflowId,
    key,
    value: JSON.stringify(value),
    updated_at: now
  }, { onConflict: 'workflow_id, key' });

  if (error) throw new Error(`Failed to set variable: ${error.message}`);
}

export async function getVariables(workflowId: string): Promise<Record<string, unknown>> {
  const { data: rows, error } = await getDb()
    .from('workflow_variables')
    .select('key, value')
    .eq('workflow_id', workflowId);
  
  if (error || !rows) return {};
  
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value);
  }
  return result;
}

export async function deleteVariable(workflowId: string, key: string): Promise<boolean> {
  const { error } = await getDb()
    .from('workflow_variables')
    .delete()
    .eq('workflow_id', workflowId)
    .eq('key', key);
  return !error;
}

// ── Sub-workflow Execution ──

type SubWorkflowExecutor = (workflowId: string, inputs: Record<string, any>) => Promise<any>;
let subWorkflowExecutor: SubWorkflowExecutor | null = null;

export function registerSubWorkflowExecutor(executor: SubWorkflowExecutor) {
  subWorkflowExecutor = executor;
}

export async function executeSubWorkflow(workflowId: string, inputs: Record<string, any>) {
  if (!subWorkflowExecutor) {
    console.warn(`[Vault] executeSubWorkflow called for ${workflowId} but no executor registered.`);
    return null;
  }
  return subWorkflowExecutor(workflowId, inputs);
}
