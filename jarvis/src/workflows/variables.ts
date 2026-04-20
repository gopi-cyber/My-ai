/**
 * Variable Scope — execution-scoped + persistent
 *
 * Execution-scoped variables live in memory for the current run.
 * Persistent variables survive across executions (stored in vault).
 */

import * as vault from '../vault/workflows.ts';
import type { VariableScopeInterface } from './nodes/registry.ts';

export class VariableScope implements VariableScopeInterface {
  private executionVars: Map<string, unknown> = new Map();
  private workflowId: string;

  constructor(workflowId: string, initialVars?: Record<string, unknown>) {
    this.workflowId = workflowId;
    if (initialVars) {
      for (const [k, v] of Object.entries(initialVars)) {
        this.executionVars.set(k, v);
      }
    }
  }

  /**
   * Get variable — checks execution scope first, then persistent vault.
   * Note: Persistent variables must be pre-loaded into executionVars or handled async.
   * To maintain the synchronous interface for nodes, we rely on pre-loading.
   */
  get(key: string): unknown {
    return this.executionVars.get(key);
  }

  /**
   * Set execution-scoped variable (in-memory only).
   */
  set(key: string, value: unknown): void {
    this.executionVars.set(key, value);
  }

  /**
   * Set persistent variable (async save to vault).
   */
  async setPersistent(key: string, value: unknown): Promise<void> {
    // Save to vault in background? No, better to await in the node if possible, 
    // but the interface currently says void. 
    // We'll update the interface to Promise<void>.
    await vault.setVariable(this.workflowId, key, value);
    this.executionVars.set(key, value);
  }

  /**
   * Get all variables (merged).
   */
  toObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [k, v] of this.executionVars) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Serialize execution variables for storage.
   */
  serialize(): string {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.executionVars) {
      obj[k] = v;
    }
    return JSON.stringify(obj);
  }
}
