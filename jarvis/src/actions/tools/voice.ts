import type { ToolDefinition } from './registry.ts';

/**
 * Definition for the speak tool.
 * Enables the agent to proactively communicate using TTS.
 */
export const speakTool: ToolDefinition = {
  name: 'speak',
  category: 'communication',
  description: 'Speak a message aloud to the user. Use this for important notifications, status updates, or proactive check-ins.',
  parameters: {
    message: {
      type: 'string',
      description: 'The text message to be spoken aloud.',
      required: true,
    },
  },
  execute: async (args: any, context: any) => {
    if (!context.voiceCallback) {
      return {
        success: false,
        error: 'Voice subsystem not available in current context.',
      };
    }

    try {
      await context.voiceCallback(args.message);
      return {
        success: true,
        output: `Spoken: "${args.message}"`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};
