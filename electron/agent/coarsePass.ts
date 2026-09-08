/**
 * ============================================================================
 * TUTORIAL: COARSE PASS EXTRACTION & MULTIMODAL GROUNDING ENGINE
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * 1. Samples evenly spaced video frames across the full duration of a video clip.
 * 2. Downscales them to 640x360 for memory-efficient vision-token encoding.
 * 3. Builds an enumerated multimodal OpenAI-compatible message payload where every
 *    single image is preceded by an explicit text anchor (e.g. "Frame 0 at 12.0s:").
 * 
 * WHY THIS ARCHITECTURE WAS CHOSEN:
 * 
 * 1. Evenly-Spaced Midpoint Intervals (Not Fixed FPS):
 *    A fixed 1 FPS on a 5-minute video produces 300 frames, completely blowing past
 *    the context window and causing CUDA Out-Of-Memory errors in LM Studio.
 *    By dividing the video duration into exactly 16 intervals and sampling the midpoint
 *    of each chunk, we get consistent, whole-video narrative coverage while guaranteeing
 *    predictable VRAM consumption (~8,000 to 12,000 tokens).
 * 
 * 2. Multimodal Payload Construction (How Local VLMs See Images):
 *    In the OpenAI Chat Completions API format, images are passed inside the "user"
 *    message content array as:
 *    `{ type: "image_url", image_url: { url: "data:image/png;base64,..." } }`
 *    By preceding each image block with `{ type: "text", text: "Frame 3 at 14.5s:" }`,
 *    we give the vision model a syntactic anchor. When the model reasons about the scene,
 *    it associates that visual patch with the integer index 3.
 */

import fs from 'fs';
import path from 'path';
import { extractEvenlySpacedFrames, getVideoInfo } from '../ffmpeg.ts';
import { COARSE_PASS_MAX_FRAMES_COUNT, MODEL_INPUT_FRAME_RESOLUTION } from './config.ts';
import type { LabeledFrame } from './types.ts';

/**
 * Result data returned by the coarse pass builder.
 */
export interface CoarsePassResult {
  /** Array of labeled frames with physical timestamps and disk paths */
  frames: LabeledFrame[];
  /** Total duration of the source video in seconds */
  durationSec: number;
  /** Absolute path to the source video file on disk */
  videoPath: string;
}

/**
 * Determines the proper MIME type header for base64 image data URLs.
 * 
 * @param filePath - The path to the image file
 * @returns MIME type string (e.g. "image/png", "image/jpeg")
 */
export function getImageMimeTypeFromExtension(filePath: string): string {
  const fileExtension = path.extname(filePath).toLowerCase();
  const mimeTypeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  };
  return mimeTypeMap[fileExtension] || 'image/png';
}

/**
 * Extracts evenly-spaced frames across the video and packages them into LabeledFrames.
 * 
 * WHAT IT DOES:
 * 1. Probes the video file using FFprobe to get exact duration in seconds.
 * 2. Calls FFmpeg to extract up to maxFrames evenly distributed across the duration.
 * 3. Maps raw frame objects into LabeledFrame objects with zero-based integer frameIndex values.
 * 
 * @param absoluteVideoPath - Absolute path to the video file
 * @param projectOutputDir - Base directory where extraction assets are stored
 * @param maximumFramesToExtract - Upper bound on coarse frames (defaults to 16)
 * @returns Promise resolving to CoarsePassResult
 */
export async function buildCoarsePass(
  absoluteVideoPath: string,
  projectOutputDir: string,
  maximumFramesToExtract: number = COARSE_PASS_MAX_FRAMES_COUNT
): Promise<CoarsePassResult> {
  const videoMetadata = await getVideoInfo(absoluteVideoPath);
  const videoDurationInSeconds = videoMetadata.duration || 0;

  // Create a dedicated subfolder for coarse pass frames
  const coarsePassOutputDirectory = path.join(projectOutputDir, 'agent_coarse');
  if (!fs.existsSync(coarsePassOutputDirectory)) {
    fs.mkdirSync(coarsePassOutputDirectory, { recursive: true });
  }

  console.log(
    `[COARSE_PASS] Sampling up to ${maximumFramesToExtract} frames across ` +
    `${videoDurationInSeconds.toFixed(1)}s video (Target Res: ${MODEL_INPUT_FRAME_RESOLUTION.width}x${MODEL_INPUT_FRAME_RESOLUTION.height})`
  );

  const extractedRawFrames = await extractEvenlySpacedFrames(
    absoluteVideoPath,
    coarsePassOutputDirectory,
    maximumFramesToExtract,
    MODEL_INPUT_FRAME_RESOLUTION.width,
    MODEL_INPUT_FRAME_RESOLUTION.height
  );

  // Transform raw frames into grounded LabeledFrames with integer indexes
  const labeledCoarseFrames: LabeledFrame[] = extractedRawFrames.map(
    (rawFrame, zeroBasedIndex) => ({
      frameIndex: zeroBasedIndex,
      timestampSec: rawFrame.time,
      framePath: rawFrame.path,
    })
  );

  console.log(`[COARSE_PASS] Completed extraction: ${labeledCoarseFrames.length} labeled frames ready for analysis`);

  return {
    frames: labeledCoarseFrames,
    durationSec: videoDurationInSeconds,
    videoPath: absoluteVideoPath,
  };
}

/**
 * Interleaves text label blocks before each base64 image block for unambiguous model grounding.
 * 
 * WHAT IT PRODUCES:
 * An array of content objects conforming to the OpenAI Chat Completions vision specification:
 * [
 *   { "type": "text", "text": "Frame 0 at 0.0s:" },
 *   { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } },
 *   { "type": "text", "text": "Frame 1 at 14.5s:" },
 *   { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } },
 *   ...
 * ]
 * 
 * WHY TEXT ANCHORS PREVENT HALLUCINATIONS:
 * If an array contains 10 consecutive image_url items without labels, the model has no way
 * of referring back to a specific image other than guessing its position. By prefixing every
 * image with an explicit "Frame {index} at {timestamp}s:", the LLM's attention heads bind
 * the visual tokens of that image to the integer identifier {index}.
 * 
 * @param labeledFrames - Array of LabeledFrames to encode
 * @returns Array of multimodal content objects for the user message
 */
export function buildLabeledImageContent(labeledFrames: LabeledFrame[]): any[] {
  const interleavedMultimodalContent: any[] = [];

  for (const labeledFrame of labeledFrames) {
    if (!fs.existsSync(labeledFrame.framePath)) {
      console.warn(`[FRAME_LABEL] Frame file missing from disk: ${labeledFrame.framePath}`);
      continue;
    }

    const imageMimeType = getImageMimeTypeFromExtension(labeledFrame.framePath);
    const imageBase64Data = fs.readFileSync(labeledFrame.framePath).toString('base64');
    const formattedTimestamp = labeledFrame.timestampSec.toFixed(1);

    // 1. Preceding text label
    interleavedMultimodalContent.push({
      type: 'text',
      text: `Frame ${labeledFrame.frameIndex} at ${formattedTimestamp}s:`,
    });

    // 2. Base64 image payload
    interleavedMultimodalContent.push({
      type: 'image_url',
      image_url: {
        url: `data:${imageMimeType};base64,${imageBase64Data}`,
      },
    });
  }

  return interleavedMultimodalContent;
}
