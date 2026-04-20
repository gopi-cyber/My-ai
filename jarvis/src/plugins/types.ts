import type { ToolDefinition } from '../actions/tools/registry.ts';
export type { ToolDefinition };

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  repository?: string;
  permissions: PluginPermission[];
  settings?: PluginSetting[];
}

export interface PluginPermission {
  name: string;
  description: string;
  required: boolean;
}

export interface PluginSetting {
  key: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  description?: string;
}

export interface Plugin {
  manifest: PluginManifest;
  tools: ToolDefinition[];
  settings?: Record<string, unknown>;
}

export interface PluginHooks {
  onLoad?: () => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
  onConfigChange?: (config: Record<string, unknown>) => Promise<void> | void;
  onEvent?: (event: string, data?: unknown) => Promise<void> | void;
}

export type PluginState = 'loading' | 'loaded' | 'error' | 'unloaded';

export interface LoadedPlugin {
  name: string;
  plugin: Plugin;
  hooks?: PluginHooks;
  state: PluginState;
  error?: string;
  loadedAt: number;
}