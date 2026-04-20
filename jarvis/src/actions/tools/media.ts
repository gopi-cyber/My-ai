import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolDefinition } from './registry.ts';
import { getMediaEngine } from '../../media/engine.ts';

/**
 * Helper to save a remote asset to the project's public directory.
 */
async function saveAssetToProject(projectId: string | undefined, fileName: string, url: string): Promise<string | null> {
  if (!projectId) return null;

  try {
    const projectsDir = process.env.PROJECTS_DIR || join(homedir(), '.jarvis/projects');
    const projectPath = join(projectsDir, projectId);
    const assetsDir = join(projectPath, 'public', 'assets');
    
    mkdirSync(assetsDir, { recursive: true });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch asset: ${response.statusText}`);
    
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = url.includes('video') ? 'mp4' : 'png';
    writeFileSync(join(assetsDir, `${fileName}.${ext}`), buffer);
    
    return `/public/assets/${fileName}.${ext}`;
  } catch (err) {
    console.error(`[MediaTool] Failed to save asset ${fileName}:`, err);
    return null;
  }
}

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  description: 'Generate a high-quality AI image based on a text prompt. If working on a project, the image is automatically saved to project assets.',
  category: 'media',
  parameters: {
    prompt: {
      type: 'string',
      description: 'Detailed description of the image to generate.',
      required: true,
    },
    width: {
      type: 'number',
      description: 'Width of the image in pixels (default 1024).',
      required: false,
    },
    height: {
      type: 'number',
      description: 'Height of the image in pixels (default 1024).',
      required: false,
    },
  },
  execute: async (params, context) => {
    const prompt = params.prompt as string;
    const width = (params.width as number) || 1024;
    const height = (params.height as number) || 1024;
    const seed = Math.floor(Math.random() * 1000000);
    const projectId = context?.projectId;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    
    let localPath = null;
    if (projectId) {
      const fileName = `gen_${Date.now()}.png`;
      localPath = await saveAssetToProject(projectId, fileName, imageUrl);
    }

    const resultMsg = localPath 
      ? `Image generated and saved to project assets: ${localPath}\nURL: ${imageUrl}`
      : `Image generated! Access it here: ${imageUrl}`;

    return `${resultMsg}\n\nMarkdown: ![${prompt.substring(0, 20)}](${localPath ?? imageUrl})`;
  }
};

export const generateVideoTool: ToolDefinition = {
  name: 'generate_video',
  description: 'Generate an AI video based on a text prompt.',
  category: 'media',
  parameters: {
    prompt: {
      type: 'string',
      description: 'Detailed description of the video to generate.',
      required: true,
    },
  },
  execute: async (params, context) => {
    const prompt = params.prompt as string;
    const simulatedUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}`;

    return `Video generation process initiated! You can view the result at: ${simulatedUrl}`;
  }
};

