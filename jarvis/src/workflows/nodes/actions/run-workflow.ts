import type { NodeDefinition } from '../registry.ts';

export type RunWorkflowConfig = {
  workflow_id: string;
  inputs?: Record<string, unknown>;
};

export const runWorkflowAction: NodeDefinition = {
  type: 'action.run_workflow',
  label: 'Run Workflow',
  description: 'Execute another workflow as a sub-workflow.',
  category: 'action',
  icon: '🔀',
  color: '#8b5cf6',
  configSchema: {
    workflow_id: {
      type: 'string',
      label: 'Workflow ID',
      description: 'ID of the workflow to execute.',
      required: true,
      placeholder: 'my-other-workflow',
    },
    inputs: {
      type: 'json',
      label: 'Inputs',
      description: 'JSON object of inputs to pass to the sub-workflow.',
      required: false,
      default: {},
    },
  },
  inputs: ['default'],
  outputs: ['default', 'result'],
  execute: async (input, config, ctx) => {
    const workflowId = String(config.workflow_id ?? '');
    if (!workflowId) throw new Error('workflow_id is required');

    const workflowInputs = config.inputs && typeof config.inputs === 'object' && !Array.isArray(config.inputs)
      ? config.inputs as Record<string, unknown>
      : {};

    ctx.logger.info(`Running sub-workflow: ${workflowId}`);

    try {
      const { executeSubWorkflow } = await import('../../../vault/workflows.ts');
      const result = await executeSubWorkflow(workflowId, workflowInputs);

      return {
        data: {
          ...input.data,
          workflow_id: workflowId,
          workflow_result: result,
        },
      };
    } catch (err) {
      ctx.logger.error(`Sub-workflow ${workflowId} failed: ${err}`);
      throw new Error(`Sub-workflow failed: ${err}`);
    }
  },
};