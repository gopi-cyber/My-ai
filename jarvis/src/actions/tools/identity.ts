import { updatePersonality } from '../../personality/model.ts';
import type { ToolDefinition } from './registry.ts';

export const updateIdentityTool: ToolDefinition = {
  name: 'update_identity',
  description: 'Update the assistant name and/or wake word. Use this when the user asks to be called something else or wants to change your name/wake word.',
  category: 'personality',
  parameters: {
    assistant_name: {
      type: 'string',
      description: 'The new name for the assistant (e.g., "JARVIS", "TARS")',
      required: false,
    },
    wake_word: {
      type: 'string',
      description: 'The new wake word for voice activation (e.g., "hey jarvis", "ok computer")',
      required: false,
    },
  },
  execute: async (params) => {
    const updates: any = {};
    if (params.assistant_name) updates.name = params.assistant_name;
    if (params.wake_word) updates.wake_word = params.wake_word;

    if (Object.keys(updates).length === 0) {
      return {
        content: [{ type: 'text', text: 'No identity updates provided.' }],
      };
    }

    const updated = await updatePersonality(updates);

    return {
      content: [
        {
          type: 'text',
          text: `Identity updated successfully. Name: "${updated.name}", Wake Word: "${updated.wake_word}". The UI will refresh to reflect these changes.`,
        },
      ],
    };
  },
};
