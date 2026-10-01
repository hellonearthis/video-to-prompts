/**
 * Model Context Protocol (MCP) Server for Video to Prompts
 * 
 * Exposes video processing, frame extraction, llama-server vision prompt generation,
 * and autonomous storyboard extraction tools to AI assistants via MCP stdio.
 */

// Critical: Redirect standard logs to stderr so stdout is reserved exclusively for MCP JSON-RPC protocol
console.log = (...args: any[]) => {
  console.error('[MCP-LOG]', ...args);
};

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';

import {
  getVideoInfo,
  extractTimeFrames,
  extractKeyframes,
  extractSceneChanges
} from './ffmpeg.ts';

import {
  checkLlamaServerConnection,
  getCurrentModel,
  getAvailablePrompts,
  analyzeFrame,
  compareFrames,
  LLAMA_SERVER_URL
} from './llamaServer.ts';

import { extractStoryboard } from './agent/storyboardExtractor.ts';

// Helper to resolve output directory
function resolveOutputDir(customDir?: string, prefix = 'v2p_frames'): string {
  if (customDir && customDir.trim().length > 0) {
    if (!fs.existsSync(customDir)) {
      fs.mkdirSync(customDir, { recursive: true });
    }
    return path.resolve(customDir);
  }
  const tempDir = path.join(os.tmpdir(), `${prefix}_${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

const server = new McpServer({
  name: 'video-to-prompts',
  version: '1.0.0'
});

// ============================================================================
// TOOL: probe_video
// ============================================================================
server.tool(
  'probe_video',
  'Inspect a video file using ffprobe to obtain duration, resolution, frame rate, codec, and bitrate.',
  {
    videoPath: z.string().describe('Absolute or relative path to the target video file')
  },
  async ({ videoPath }) => {
    try {
      const resolvedPath = path.resolve(videoPath);
      if (!fs.existsSync(resolvedPath)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: Video file not found at ${resolvedPath}` }]
        };
      }

      const info = await getVideoInfo(resolvedPath);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to probe video: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// TOOL: extract_frames
// ============================================================================
server.tool(
  'extract_frames',
  'Extract frames from a video file using time intervals, keyframes, or scene detection.',
  {
    videoPath: z.string().describe('Path to the target video file'),
    mode: z.enum(['time', 'keyframes', 'scene']).optional().default('time').describe('Extraction strategy: time (sampled at fps intervals), keyframes (I-frames), or scene (visual change threshold)'),
    fps: z.number().optional().default(1).describe('Frames per second to sample when mode is "time"'),
    sceneThreshold: z.number().optional().default(0.3).describe('Sensitivity threshold (0.0 - 1.0) when mode is "scene"'),
    outputDir: z.string().optional().describe('Optional directory to save extracted PNG frames. Defaults to a temporary directory.')
  },
  async ({ videoPath, mode, fps, sceneThreshold, outputDir }) => {
    try {
      const resolvedVideo = path.resolve(videoPath);
      if (!fs.existsSync(resolvedVideo)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: Video file not found at ${resolvedVideo}` }]
        };
      }

      const targetDir = resolveOutputDir(outputDir, 'v2p_extracted');
      let resultFrames: any[] = [];

      if (mode === 'scene') {
        resultFrames = await extractSceneChanges({
          filePath: resolvedVideo,
          outputDir: targetDir,
          threshold: sceneThreshold
        });
      } else if (mode === 'keyframes') {
        resultFrames = await extractKeyframes({
          filePath: resolvedVideo,
          outputDir: targetDir
        });
      } else {
        resultFrames = await extractTimeFrames({
          filePath: resolvedVideo,
          outputDir: targetDir,
          fps
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: resultFrames.length,
              outputDirectory: targetDir,
              frames: resultFrames
            }, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Frame extraction failed: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// TOOL: check_llama_server
// ============================================================================
server.tool(
  'check_llama_server',
  'Check connection to local llama-server instance (default http://localhost:8081) and get the active vision model.',
  {},
  async () => {
    try {
      const isConnected = await checkLlamaServerConnection();
      let currentModel: string | null = null;
      if (isConnected) {
        currentModel = await getCurrentModel();
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              connected: isConnected,
              endpoint: LLAMA_SERVER_URL.replace('/chat/completions', ''),
              currentModel: currentModel || 'None / Not loaded'
            }, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `llama-server check failed: ${err.message || String(err)}` }]
      };
    }
  }
);

// Backward-compatibility tool alias
server.tool(
  'check_lm_studio',
  'Alias for check_llama_server.',
  {},
  async () => {
    const isConnected = await checkLlamaServerConnection();
    let currentModel: string | null = null;
    if (isConnected) {
      currentModel = await getCurrentModel();
    }
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            connected: isConnected,
            endpoint: LLAMA_SERVER_URL.replace('/chat/completions', ''),
            currentModel: currentModel || 'None / Not loaded'
          }, null, 2)
        }
      ]
    };
  }
);

// ============================================================================
// TOOL: list_prompt_templates
// ============================================================================
server.tool(
  'list_prompt_templates',
  'List all available vision prompt presets, style transformations, and refinement filters configured in qwen_vl3_prompts.json.',
  {},
  async () => {
    try {
      const promptsData = getAvailablePrompts();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              presets: promptsData.prompts,
              styles: promptsData.styles,
              refinements: promptsData.refinements
            }, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to load prompt templates: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// TOOL: generate_frame_prompt
// ============================================================================
server.tool(
  'generate_frame_prompt',
  'Analyze a video frame image with local LM Studio vision model and generate structured prompts and scene descriptions.',
  {
    imagePath: z.string().describe('Path to the image frame (PNG, JPG, WebP)'),
    promptType: z.string().optional().describe('Preset prompt name (e.g., "Detailed Description", "Simple Description", "Ultra Cinematic Detailed"). Defaults to "Simple Description"'),
    style: z.string().optional().describe('Optional style transformation (e.g., "Cinematic", "Anime", "Cyberpunk", "Poetic")'),
    refinement: z.string().optional().describe('Optional refinement check (e.g., "Conflict Check")')
  },
  async ({ imagePath, promptType, style, refinement }) => {
    try {
      const resolvedImage = path.resolve(imagePath);
      if (!fs.existsSync(resolvedImage)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: Image frame not found at ${resolvedImage}` }]
        };
      }

      const analysis = await analyzeFrame(resolvedImage, promptType, { style, refinement });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Vision frame analysis failed: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// TOOL: compare_consecutive_frames
// ============================================================================
server.tool(
  'compare_consecutive_frames',
  'Compare two video frames to determine motion, camera transition, and narrative action between beats.',
  {
    frame1Path: z.string().describe('Path to the starting frame'),
    frame2Path: z.string().describe('Path to the subsequent frame')
  },
  async ({ frame1Path, frame2Path }) => {
    try {
      const f1 = path.resolve(frame1Path);
      const f2 = path.resolve(frame2Path);
      if (!fs.existsSync(f1) || !fs.existsSync(f2)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: One or both frame images were not found.' }]
        };
      }

      const comparison = await compareFrames(f1, f2);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(comparison, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Frame comparison failed: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// TOOL: extract_storyboard
// ============================================================================
server.tool(
  'extract_storyboard',
  'Autonomous multi-stage storyboard extractor: performs coarse scanning, AI turning-point detection, zoom refinement, and prompt generation across an entire video.',
  {
    videoPath: z.string().describe('Path to the input video file'),
    transcriptPath: z.string().optional().describe('Optional path to an SRT subtitle file to guide turning point detection with spoken dialogue cues'),
    outputDir: z.string().optional().describe('Directory where extracted frames and agent_storyboard.json will be saved'),
    maxCandidates: z.number().optional().default(4).describe('Maximum number of narrative turning points to extract (default 4)'),
    promptType: z.string().optional().describe('Prompt preset to apply to each winning frame (defaults to "Ultra Cinematic Detailed")')
  },
  async ({ videoPath, transcriptPath, outputDir, maxCandidates, promptType }) => {
    try {
      const resolvedVideo = path.resolve(videoPath);
      if (!fs.existsSync(resolvedVideo)) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error: Video file not found at ${resolvedVideo}` }]
        };
      }

      const targetDir = resolveOutputDir(outputDir, 'v2p_storyboard');
      const results = await extractStoryboard({
        videoPath: resolvedVideo,
        outputDir: targetDir,
        transcriptPath: transcriptPath ? path.resolve(transcriptPath) : undefined,
        maxCandidates,
        promptType
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              outputDirectory: targetDir,
              storyboardCount: results.length,
              entries: results
            }, null, 2)
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Storyboard extraction pipeline failed: ${err.message || String(err)}` }]
      };
    }
  }
);

// ============================================================================
// Connect to Stdio Transport
// ============================================================================
export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[MCP] Video to Prompts MCP Server running on stdio');
}

export { server };

const isMainModule = typeof process !== 'undefined' && process.argv[1] && (
  process.argv[1].endsWith('mcpServer.ts') || process.argv[1].endsWith('mcpServer.js')
);

if (isMainModule) {
  startServer().catch((error) => {
    console.error('[MCP-FATAL] Server error:', error);
    process.exit(1);
  });
}
