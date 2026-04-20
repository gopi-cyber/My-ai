import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Plugin, PluginManifest, LoadedPlugin, PluginState, PluginHooks } from './types.ts';
import { getToolRegistry, type ToolRegistry, type ToolDefinition } from '../actions/tools/registry.ts';

const PLUGINS_DIR = resolve(import.meta.dir, '../../plugins');

export class PluginManager {
  private plugins = new Map<string, LoadedPlugin>();
  private toolRegistry: ToolRegistry | null = null;
  private watcher: any = null;

  constructor() {
    this.toolRegistry = getToolRegistry();
  }

  async loadBuiltIn(): Promise<void> {
    if (!existsSync(PLUGINS_DIR)) return;
    
    const entries = readdirSync(PLUGINS_DIR).filter(e => statSync(join(PLUGINS_DIR, e)).isDirectory());
    
    for (const entry of entries) {
      try {
        await this.loadFromDir(join(PLUGINS_DIR, entry));
      } catch (err) {
        console.error(`[PluginManager] Failed to load plugin ${entry}:`, err);
      }
    }
  }

  async loadFromDir(pluginDir: string): Promise<void> {
    const manifestPath = join(pluginDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`No manifest.json in ${pluginDir}`);
    }

    const manifest: PluginManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const pluginModulePath = join(pluginDir, 'plugin.ts');

    let pluginModule: { default?: () => PluginHooks } | null = null;
    if (existsSync(pluginModulePath)) {
      pluginModule = await import(`file://${pluginModulePath}`);
    }

    const plugin: Plugin = {
      manifest,
      tools: [],
    };

    const hooks: PluginHooks | undefined = pluginModule?.default?.();

    const loadedPlugin: LoadedPlugin = {
      name: manifest.name,
      plugin,
      hooks,
      state: 'loading',
      loadedAt: Date.now(),
    };

    try {
      if (loadedPlugin.hooks?.onLoad) {
        await loadedPlugin.hooks.onLoad();
      }

      for (const tool of plugin.tools) {
        this.toolRegistry?.register(tool);
      }

      loadedPlugin.state = 'loaded';
      this.plugins.set(manifest.name, loadedPlugin);
      console.log(`[PluginManager] Loaded plugin: ${manifest.name} v${manifest.version}`);
    } catch (err) {
      loadedPlugin.state = 'error';
      loadedPlugin.error = err instanceof Error ? err.message : String(err);
      console.error(`[PluginManager] Error loading ${manifest.name}:`, loadedPlugin.error);
    }
  }

  async unload(name: string): Promise<void> {
    const loaded = this.plugins.get(name);
    if (!loaded) return;

    try {
      if (loaded.hooks?.onUnload) {
        await loaded.hooks.onUnload();
      }

      for (const tool of loaded.plugin.tools) {
        this.toolRegistry?.unregister(tool.name);
      }

      loaded.state = 'unloaded';
      this.plugins.delete(name);
      console.log(`[PluginManager] Unloaded plugin: ${name}`);
    } catch (err) {
      console.error(`[PluginManager] Error unloading ${name}:`, err);
    }
  }

  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  list(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  listTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const loaded of this.plugins.values()) {
      if (loaded.state === 'loaded') {
        tools.push(...loaded.plugin.tools);
      }
    }
    return tools;
  }

  async reload(name: string): Promise<void> {
    await this.unload(name);
    const dir = join(PLUGINS_DIR, name);
    await this.loadFromDir(dir);
  }
}

let instance: PluginManager | null = null;

export function getPluginManager(): PluginManager {
  if (!instance) {
    instance = new PluginManager();
  }
  return instance;
}

export async function initPlugins(): Promise<void> {
  const manager = getPluginManager();
  await manager.loadBuiltIn();
  console.log(`[PluginManager] Initialized with ${manager.list().length} plugins`);
}