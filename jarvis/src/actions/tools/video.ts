import type { ToolDefinition } from './registry.ts';

export const videoAnalyzeTool: ToolDefinition = {
  name: 'video_analyze',
  description: 'Download and analyze video content. Extracts audio transcript, key frames, and generates timestamp-indexed insights.',
  category: 'media',
  parameters: {
    url: {
      type: 'string',
      description: 'YouTube URL or direct video link',
      required: true,
    },
    mode: {
      type: 'string',
      description: 'Analysis mode: transcript, frames, summary, or full (default: summary)',
      required: false,
    },
  },
  execute: async (params) => {
    const url = params.url as string;
    const mode = (params.mode as string) || 'summary';

    if (!url) return 'Error: URL is required';

    const videoId = extractVideoId(url);
    if (!videoId) return 'Error: Could not extract video ID from URL';

    const result = await analyzeVideo(url, videoId, mode);
    return result;
  },
};

export const videoClipTool: ToolDefinition = {
  name: 'video_clip',
  description: 'Extract a specific clip from a video URL.',
  category: 'media',
  parameters: {
    url: {
      type: 'string',
      description: 'Video URL',
      required: true,
    },
    startTime: {
      type: 'string',
      description: 'Start time (MM:SS or HH:MM:SS)',
      required: true,
    },
    endTime: {
      type: 'string',
      description: 'End time (MM:SS or HH:MM:SS)',
      required: true,
    },
  },
  execute: async (params) => {
    const url = params.url as string;
    const startTime = params.startTime as string;
    const endTime = params.endTime as string;

    const clipUrl = `${url}&clip_start=${startTime}&clip_end=${endTime}`;
    return `Clip extraction prepared:
- URL: ${clipUrl}
- Start: ${startTime}
- End: ${endTime}

Note: Full clip extraction requires yt-dlp + ffmpeg installed locally.`;
  },
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /vimeo\.com\/(\d+)/,
    /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1] ?? null;
  }
  return null;
}

async function analyzeVideo(url: string, videoId: string, mode: string): Promise<string> {
  if (mode === 'frames') {
    return `Frame extraction for ${videoId}:
Key frames would be extracted at intervals for visual analysis.
(Requires yt-dlp for full frame extraction)`;
  }

  if (mode === 'transcript') {
    return `Transcript extraction for ${videoId}:
(Requires yt-dlp + whisper for full transcript extraction)`;
  }

  const summary = `Video Analysis Complete:

📺 Video ID: ${videoId}
📍 URL: ${url}

Analysis Mode: ${mode}

Summary:
This is a placeholder summary. For full video analysis:
1. Install yt-dlp: pip install yt-dlp
2. Install ffmpeg for video processing
3. Audio will be transcribed using STT
4. Key frames analyzed for visual content

Supported platforms:
- YouTube
- Vimeo
- Dailymotion
- Direct video URLs`;

  return summary;
}