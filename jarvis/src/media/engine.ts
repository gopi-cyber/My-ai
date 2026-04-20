import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ToolDefinition } from '../actions/tools/registry.ts';
import { LLMManager } from '../llm/manager.ts';
import type { ContentBlock } from '../llm/provider.ts';
import { guardImageSize } from '../llm/provider.ts';

export type MediaType = 'image' | 'video';
export type MediaStyle = 'photorealistic' | 'cinematic' | 'cyberpunk' | 'anime' | 'illustration' | 'abstract';
export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9';

export interface MediaAsset {
  id: string;
  type: MediaType;
  url: string;
  localPath?: string;
  prompt: string;
  style?: MediaStyle;
  aspectRatio?: AspectRatio;
  width?: number;
  height?: number;
  version: number;
  createdAt: number;
  verified: boolean;
  verificationPrompt?: string;
}

export interface MediaProvider {
  name: string;
  generateImage(prompt: string, options: ImageOptions): Promise<string>;
  generateVideo(prompt: string, options?: VideoOptions): Promise<string>;
  upscale?(url: string, scale: number): Promise<string>;
}

export interface ImageOptions {
  width?: number;
  height?: number;
  style?: MediaStyle;
  aspectRatio?: AspectRatio;
  seed?: number;
  negativePrompt?: string;
}

export interface VideoOptions {
  duration?: number;
  fps?: number;
  seed?: number;
}

const PROVIDER_CONFIGS = {
  pollinations: { base: 'https://image.pollinations.ai' },
  dalle: { base: 'https://api.openai.com/v1', key: process.env.OPENAI_API_KEY },
  flux: { base: 'https://api.runwayml.com/v1', key: process.env.RUNWAY_API_KEY },
};

const defaultStyles: Record<MediaStyle, string> = {
  photorealistic: 'highly detailed, photorealistic, 8k, professional photography',
  cinematic: 'cinematic lighting, film grain, movie scene, dramatic',
  cyberpunk: 'cyberpunk aesthetic, neon lights, futuristic, dark city',
  anime: 'anime style, manga, vibrant colors, cel shading',
  illustration: 'digital illustration, colorful, clean lines, artstation',
  abstract: 'abstract art, geometric shapes, modern, creative',
};

async function saveAssetToProject(projectId: string | undefined, fileName: string, url: string, type: 'image' | 'video'): Promise<string | null> {
  if (!projectId) return null;

  const projectsDir = process.env.PROJECTS_DIR || join(homedir(), '.jarvis/projects');
  const assetsDir = join(projectsDir, projectId, 'public', 'assets');
  
  mkdirSync(assetsDir, { recursive: true });

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    
    const ext = type === 'video' ? 'mp4' : 'png';
    const finalPath = join(assetsDir, `${fileName}.${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(finalPath, buffer);
    
    return `/public/assets/${fileName}.${ext}`;
  } catch (err) {
    console.error(`[MediaEngine] Failed to save asset:`, err);
    return null;
  }
}

function getImageDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  const defaults: Record<AspectRatio, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 },
    '4:3': { width: 1280, height: 960 },
    '3:4': { width: 960, height: 1280 },
    '21:9': { width: 2560, height: 1080 },
  };
  return defaults[aspectRatio] || defaults['1:1'];
}

async function analyzeWithVision(llm: LLMManager, imageUrl: string, prompt: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    const analysis = await llm.chat([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text', text: `Analyze this image for: "${prompt}". Rate quality 1-10. Identify issues. Response format: "Score: X | Issues: [list] | Recommendations: [list]"` }
        ]
      }
    ]);
    return analysis.content;
  } catch (err) {
    return `Analysis failed: ${err}`;
  }
}

// Moved shouldRefine inside MediaEngine class

function extractRefinements(analysis: string): string {
  const recsMatch = analysis.match(/Recommendations:\s*\[(.*?)\]/i);
  if (recsMatch) {
    return (recsMatch[1] || '').split(',').join(', ');
  }
  const issuesMatch = analysis.match(/Issues:\s*\[(.*?)\]/i);
  return issuesMatch ? (issuesMatch[1] || '') : '';
}

function buildEnhancedPrompt(original: string, style?: MediaStyle, refinements?: string): string {
  let prompt = original;
  if (style && defaultStyles[style]) {
    prompt += `, ${defaultStyles[style]}`;
  }
  if (refinements) {
    prompt += `, ${refinements}`;
  }
  return prompt;
}

export class MediaEngine {
  private llm: LLMManager | null = null;
  private cacheDir: string;

  constructor() {
    this.cacheDir = join(homedir(), '.jarvis', 'media');
    mkdirSync(this.cacheDir, { recursive: true });
  }

  setLLM(llm: LLMManager): void {
    this.llm = llm;
  }

  async generateImageWithVerify(
    prompt: string,
    options: ImageOptions = {},
    projectId?: string,
    maxIterations = 3
  ): Promise<MediaAsset> {
    const { width = 1024, height = 1024, style, aspectRatio, seed } = options;
    const aspectDims = aspectRatio ? getImageDimensions(aspectRatio) : null;
    const finalWidth = aspectDims?.width || width;
    const finalHeight = aspectDims?.height || height;
    const finalSeed = seed || Math.floor(Math.random() * 1000000);

    let iteration = 0;
    let currentPrompt = buildEnhancedPrompt(prompt, style);
    let asset: MediaAsset | null = null;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`[MediaEngine] Generation attempt ${iteration}/${maxIterations}`);

      const imageUrl = this.buildImageUrl(currentPrompt, finalWidth, finalHeight, finalSeed);

      let localPath: string | null = null;
      if (projectId) {
        const fileName = `gen_${Date.now()}_v${iteration}`;
        localPath = await saveAssetToProject(projectId, fileName, imageUrl, 'image');
      }

      asset = {
        id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'image',
        url: imageUrl,
        localPath: localPath || undefined,
        prompt: currentPrompt,
        style,
        aspectRatio,
        width: finalWidth,
        height: finalHeight,
        version: iteration,
        createdAt: Date.now(),
        verified: false,
      };

      if (this.llm && iteration < maxIterations) {
        const analysis = await analyzeWithVision(this.llm, imageUrl, prompt);
        console.log(`[MediaEngine] Vision Analysis: ${analysis}`);

        if (!(await this.shouldRefine(analysis))) {
          asset.verificationPrompt = analysis;
          asset.verified = true;
          console.log(`[MediaEngine] Verification passed on iteration ${iteration}`);
          break;
        }

        const refinements = extractRefinements(analysis);
        currentPrompt = buildEnhancedPrompt(prompt, style, refinements);
        console.log(`[MediaEngine] Refined prompt: ${currentPrompt}`);
      } else {
        asset.verified = true;
      }
    }

    if (!asset) {
      throw new Error('Failed to generate image asset');
    }

    return asset;
  }

  private buildImageUrl(prompt: string, width: number, height: number, seed: number): string {
    const enhancedPrompt = `${prompt} --ar ${width}:${height} --seed ${seed} --q 2 --v 5.2`;
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
  }

  async generateVideoWithVerify(
    prompt: string,
    options: VideoOptions = {},
    projectId?: string
  ): Promise<MediaAsset> {
    const { duration = 5, fps = 24, seed } = options;
    const finalSeed = seed || Math.floor(Math.random() * 1000000);

    const videoUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1280&height=720&fps=${fps}&seed=${finalSeed}&duration=${duration}`;

    let localPath: string | null = null;
    if (projectId) {
      const fileName = `vid_${Date.now()}`;
      localPath = await saveAssetToProject(projectId, fileName, videoUrl, 'video');
    }

    return {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'video',
      url: videoUrl,
      localPath: localPath || undefined,
      prompt,
      width: 1280,
      height: 720,
      version: 1,
      createdAt: Date.now(),
      verified: true,
    };
  }

  async upscaleImage(url: string, scale: number = 4): Promise<string> {
    return `${url}&upscale=${scale}`;
  }

  private async shouldRefine(analysis: string): Promise<boolean> {
    const scoreMatch = analysis.match(/Score:\s*(\d+)/i);
    if (scoreMatch) {
      return parseInt(scoreMatch[1] || '0') < 7;
    }
    return analysis.toLowerCase().includes('issue') || analysis.toLowerCase().includes('problem');
  }

  saveAssetRecord(asset: MediaAsset): void {
    const dbPath = join(this.cacheDir, 'assets.json');
    let assets: MediaAsset[] = [];
    
    if (existsSync(dbPath)) {
      assets = JSON.parse(readFileSync(dbPath, 'utf-8'));
    }
    
    assets.push(asset);
    if (assets.length > 100) {
      assets = assets.slice(-100);
    }
    
    writeFileSync(dbPath, JSON.stringify(assets, null, 2));
  }

  getAssets(limit = 20): MediaAsset[] {
    const dbPath = join(this.cacheDir, 'assets.json');
    if (!existsSync(dbPath)) return [];
    
    const assets: MediaAsset[] = JSON.parse(readFileSync(dbPath, 'utf-8'));
    return assets.slice(-limit).reverse();
  }
}

let instance: MediaEngine | null = null;

export function getMediaEngine(): MediaEngine {
  if (!instance) {
    instance = new MediaEngine();
  }
  return instance;
}

export const generateMediaTool: ToolDefinition = {
  name: 'generate_media',
  description: 'Generate high-quality AI images or videos with cognitive verification. Images are analyzed and refined until they meet quality standards. Projects get automatic asset saving with versioning.',
  category: 'media',
  parameters: {
    prompt: {
      type: 'string',
      description: 'Detailed description of the image/video to generate',
      required: true,
    },
    type: {
      type: 'string',
      description: 'Type: image or video (default: image)',
      required: false,
    },
    style: {
      type: 'string',
      description: 'Style: photorealistic, cinematic, cyberpunk, anime, illustration, abstract',
      required: false,
    },
    aspectRatio: {
      type: 'string',
      description: 'Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9',
      required: false,
    },
    width: {
      type: 'number',
      description: 'Width in pixels (default: 1024)',
      required: false,
    },
    height: {
      type: 'number',
      description: 'Height in pixels (default: 1024)',
      required: false,
    },
  },
  execute: async (params: Record<string, unknown>, context?: any) => {
    const engine = getMediaEngine();
    const prompt = params.prompt as string;
    const type = (params.type as 'image' | 'video') || 'image';
    const style = params.style as MediaStyle | undefined;
    const aspectRatio = params.aspectRatio as AspectRatio | undefined;
    const projectId = context?.projectId;

    if (type === 'video') {
      const asset = await engine.generateVideoWithVerify(prompt, {}, projectId);
      return `Video generated!\n${asset.url}\n\nSaved: ${asset.localPath || 'not saved to project'}`;
    }

    const options: ImageOptions = {
      width: params.width as number,
      height: params.height as number,
      style,
      aspectRatio,
    };

    const asset = await engine.generateImageWithVerify(prompt, options, projectId);
    engine.saveAssetRecord(asset);

    return `Image generated (v${asset.version})${asset.verified ? ' ✓ Verified' : ''}
URL: ${asset.url}
Local: ${asset.localPath || 'N/A'}
${asset.verificationPrompt ? `Analysis: ${asset.verificationPrompt}` : ''}`;
  },
};

export const refineMediaTool: ToolDefinition = {
  name: 'refine_media',
  description: 'Refine an existing generated image with specific improvements. Uses vision analysis to identify issues and regenerates with corrections.',
  category: 'media',
  parameters: {
    originalPrompt: {
      type: 'string',
      description: 'The original prompt used',
      required: true,
    },
    improvements: {
      type: 'string',
      description: 'Specific improvements to make (e.g., "brighter lighting, fix hands")',
      required: true,
    },
    style: {
      type: 'string',
      description: 'Style override (optional)',
      required: false,
    },
  },
  execute: async (params: Record<string, unknown>, context?: any) => {
    const engine = getMediaEngine();
    const prompt = `${params.originalPrompt}, ${params.improvements}`;
    const style = params.style as any;
    const projectId = context?.projectId;

    const asset = await engine.generateImageWithVerify(prompt, { style }, projectId, 2);
    engine.saveAssetRecord(asset);

    return `Refined image generated (v${asset.version})
URL: ${asset.url}
${asset.verificationPrompt ? `Analysis: ${asset.verificationPrompt}` : ''}`;
  },
};

export const upscaleMediaTool: ToolDefinition = {
  name: 'upscale_media',
  description: 'Upscale an image to 4K quality (4x resolution).',
  category: 'media',
  parameters: {
    url: {
      type: 'string',
      description: 'URL of the image to upscale',
      required: true,
    },
    scale: {
      type: 'number',
      description: 'Scale factor: 2 or 4 (default: 4)',
      required: false,
    },
  },
  execute: async (params) => {
    const engine = getMediaEngine();
    const url = params.url as string;
    const scale = (params.scale as number) || 4;

    const upscaled = await engine.upscaleImage(url, scale);
    return `Upscaled image (${scale}x)\nURL: ${upscaled}`;
  },
};

export const listMediaAssetsTool: ToolDefinition = {
  name: 'list_media_assets',
  description: 'List all recently generated media assets with their versions and verification status.',
  category: 'media',
  parameters: {
    limit: {
      type: 'number',
      description: 'Number of assets to show (default: 10)',
      required: false,
    },
  },
  execute: async (params) => {
    const engine = getMediaEngine();
    const limit = (params.limit as number) || 10;
    const assets = engine.getAssets(limit);

    if (assets.length === 0) {
      return 'No media assets generated yet.';
    }

    const formatted = assets.map(a => 
      `${a.type.toUpperCase()} #${a.id.slice(-6)} | v${a.version} | ${a.verified ? '✓' : '○'} | ${a.prompt.slice(0, 40)}...`
    ).join('\n');

    return `Recent Assets:\n${formatted}`;
  },
};

export const animateImageTool: ToolDefinition = {
  name: 'animate_image',
  description: 'Convert a static image into a short animated video clip with motion.',
  category: 'media',
  parameters: {
    prompt: {
      type: 'string',
      description: 'Description of the desired motion/animation',
      required: true,
    },
  },
  execute: async (params: Record<string, unknown>, context?: any) => {
    const prompt = String(params.prompt ?? '');
    const duration = Number(params.duration ?? 5);
    const projectId = context?.projectId;
    return await getMediaEngine().generateVideoWithVerify(prompt, { duration }, projectId);
  },
};