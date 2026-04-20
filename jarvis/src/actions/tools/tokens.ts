/**
 * Token Management Tools
 *
 * Provides tools for the Token Specialist to manage API keys,
 * test provider connections, and optimize model routing.
 */

import { getSecret, setSecret, deleteSecret } from '../../vault/keychain.ts';
import type { LLMManager } from '../../llm/manager.ts';
import type { ToolDefinition } from './registry.ts';

export function createTokenTools(llmManager: LLMManager): ToolDefinition[] {
  return [
    {
      name: 'manage_keychain',
      description: 'Get, set, or delete an API key/secret in the system keychain.',
      category: 'security',
      parameters: {
        action: { 
          type: 'string', 
          required: true, 
          description: 'The action to perform on the keychain (get, set, delete, list)' 
        },
        name: { 
          type: 'string', 
          description: 'Name of the secret (e.g., OPENAI_API_KEY)', 
          required: false 
        },
        value: { 
          type: 'string', 
          description: 'Value to set (only for "set" action)', 
          required: false 
        },
      },
      execute: async (params: any) => {
        const { action, name, value } = params;

        switch (action) {
          case 'get':
            if (!name) throw new Error('Name required for "get"');
            const secret = await getSecret(name);
            return secret ? `Secret found: ${name}` : `Secret NOT found: ${name}`;
          case 'set':
            if (!name || !value) throw new Error('Name and value required for "set"');
            await setSecret(name, value);
            return `Secret "${name}" updated successfully.`;
          case 'delete':
            if (!name) throw new Error('Name required for "delete"');
            await deleteSecret(name);
            return `Secret "${name}" deleted.`;
          case 'list':
            // list_secrets logic could be added to keychain.ts, returning only keys
            return 'Security policy: Listing all secret names is restricted. Query specific names.';
          default:
            throw new Error(`Unknown action: ${action}`);
        }
      },
    },
    {
      name: 'test_connection',
      description: 'Test the connection status of an LLM provider.',
      category: 'security',
      parameters: {
        provider: { 
          type: 'string', 
          description: 'Provider ID (openai, anthropic, groq, gemini, ollama)', 
          required: true 
        },
      },
      execute: async (params: any) => {
        const p = llmManager.getProvider(params.provider);
        if (!p) return `Provider "${params.provider}" not registered.`;

        try {
          const start = Date.now();
          // Simple test call with tiny max_tokens
          const res = await p.chat([{ role: 'user', content: 'hi' }], { max_tokens: 1 });
          const latency = Date.now() - start;
          return `Connection SUCCESS to ${params.provider} (${latency}ms). Response: ${res.content.slice(0, 10)}`;
        } catch (err: any) {
          return `Connection FAILED to ${params.provider}: ${err.message}`;
        }
      },
    },
    {
      name: 'list_models',
      description: 'Lists currently registered LLM providers and the primary one.',
      category: 'security',
      parameters: {},
      execute: async () => {
        const primary = llmManager.getPrimary();
        const providers = llmManager.getProviderNames();
        const fallback = llmManager.getFallbackChain();
        return JSON.stringify({
          primary,
          registered: providers,
          fallback_sequence: fallback,
        }, null, 2);
      },
    },
    {
      name: 'set_primary_model',
      description: 'Sets the primary LLM provider for the system.',
      category: 'security',
      parameters: {
        provider: { 
          type: 'string', 
          required: true, 
          description: 'The provider ID to set as primary (e.g., "openai", "groq")' 
        },
      },
      execute: async (params: any) => {
        try {
          llmManager.setPrimary(params.provider);
          return `Primary provider updated to: ${params.provider}`;
        } catch (err: any) {
          return `Failed to set primary provider: ${err.message}`;
        }
      },
    },
  ];
}
