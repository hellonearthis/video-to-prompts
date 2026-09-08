/**
 * ============================================================================
 * TUTORIAL: PHASE B & C — CANDIDATE REFINER & PROMPT SYNTHESIS
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * For each candidate turning point identified in Phase A, this module:
 * 1. Slices a high-density temporal window (+/- 3 seconds around the candidate) at 4 FPS.
 * 2. Runs an isolated agentic zoom loop where the model selects the exact peak frame
 *    using integer frame-index grounding, or requests a narrower sub-second zoom.
 * 3. Extracts a lossless, uncompressed High-Resolution frame at the winning timestamp.
 * 4. Passes the high-res frame to the app's existing `analyzeFrame()` engine to generate
 *    production-ready image-generation prompts (Midjourney, Flux, SD).
 * 
 * ARCHITECTURAL PRINCIPLES:
 * 
 * 1. STRICT CONTEXT ISOLATION (NO TOKEN ACCUMULATION):
 *    In multi-turn chat applications, history typically appends indefinitely.
 *    If we appended Phase A's 16 frames + Candidate 1's 10 frames + Candidate 2's 10 frames,
 *    we would hit 40,000+ tokens by Candidate 3 and crash local VRAM!
 *    Instead, each candidate starts with a BRAND NEW conversation array containing ONLY
 *    the candidate's goal and that window's labeled frames. Context stays under 8,000 tokens.
 * 
 * 2. SEPARATION OF FRAME SELECTION AND PROMPT WRITING:
 *    Asking an 8B model to simultaneously decide which frame is best AND write a
 *    complex cinematic prompt in a single JSON payload increases hallucination rates.
 *    By separating Pinpointing (Phase B: "Pick frame 3") from Prompt Generation
 *    (Phase C: "Analyze frame 3 with Ultra Cinematic Detailed preset"), each model call
 *    has exactly one clear, low-complexity responsibility.
 */

import fs from 'fs';
import path from 'path';
import { extractWindowFrames, extractSingleHighResFrame } from '../ffmpeg.ts';
import { callLMStudioChat, analyzeFrame } from '../lmstudio.ts';
import { buildLabeledImageContent } from './coarsePass.ts';
import { parseRefinementResponse } from './promptToolParser.ts';
import {
  ZOOM_WINDOW_HALF_DURATION_SECONDS,
  ZOOM_WINDOW_SAMPLING_FPS,
  ZOOM_WINDOW_MAX_FRAMES_COUNT,
  MAX_ZOOM_ITERATIONS_PER_CANDIDATE,
  DEFAULT_PROMPT_PRESET_NAME,
  AGENT_SYSTEM_PROMPT_PREFIX,
} from './config.ts';
import { getLocalizedDialogueSnippet } from './transcriptImport.ts';
import type {
  Candidate,
  LabeledFrame,
  PinpointResult,
  StoryboardEntry,
  ExtractionProgress,
  TranscriptSegment,
} from './types.ts';

/**
 * Options supplied to the candidate refiner function.
 */
export interface CandidateRefinerOptions {
  /** The candidate turning point identified in Phase A */
  candidate: Candidate;
  /** 0-based index of this candidate in the candidate list */
  candidateIndex: number;
  /** Total number of candidates being processed in this run */
  totalCandidates: number;
  /** Path to the source video file */
  videoPath: string;
  /** Base project extraction directory */
  outputDir: string;
  /** Shared mutable budget tracking remaining zoom calls across the whole run */
  zoomCallBudget: { remaining: number };
  /** Prompt preset name from qwen_vl3_prompts.json (defaults to "Ultra Cinematic Detailed") */
  selectedPreset?: string;
  /** Optional normalized dialogue segments from an imported SRT file */
  transcriptSegments?: TranscriptSegment[] | null;
  /** Optional progress callback */
  onProgress?: (progress: ExtractionProgress) => void;
}

/**
 * Refines a single candidate beat to find the exact peak frame and generates prompt tokens.
 * 
 * @param options - CandidateRefinerOptions configuration
 * @returns Promise resolving to a fully enriched StoryboardEntry
 */
export async function refineCandidate({
  candidate,
  candidateIndex,
  totalCandidates,
  videoPath,
  outputDir,
  zoomCallBudget,
  selectedPreset = DEFAULT_PROMPT_PRESET_NAME,
  transcriptSegments = null,
  onProgress,
}: CandidateRefinerOptions): Promise<StoryboardEntry> {
  const approximateTimestampInSeconds = candidate.approxTimestampSec;

  // Extract compact localized dialogue snippet (+/- 8s) if transcript is available
  // As taught by the MyClaw Playbook, we avoid useless context by passing ONLY local lines.
  const localizedDialogueSnippetText = transcriptSegments && transcriptSegments.length > 0
    ? getLocalizedDialogueSnippet(transcriptSegments, approximateTimestampInSeconds)
    : '';

  console.log(
    `[CANDIDATE_REFINER] Initiating refinement for candidate ${candidateIndex + 1} of ${totalCandidates} ` +
    `around t=${approximateTimestampInSeconds.toFixed(1)}s ("${candidate.reason}")` +
    (localizedDialogueSnippetText ? ` [with localized dialogue]` : '')
  );

  // Notify UI of candidate refinement start
  onProgress?.({
    status: 'refining_candidate',
    index: candidateIndex + 1,
    total: totalCandidates,
    reason: candidate.reason,
    approxTimestampSec: approximateTimestampInSeconds,
  });

  // Dedicated scratch directory for this candidate's zoom iterations
  const candidateZoomDirectory = path.join(
    outputDir,
    'agent_zoom',
    `candidate_${candidateIndex}`
  );
  if (!fs.existsSync(candidateZoomDirectory)) {
    fs.mkdirSync(candidateZoomDirectory, { recursive: true });
  }

  // 1. Initial Zoom Window: +/- ZOOM_WINDOW_HALF_DURATION_SECONDS around candidate timestamp
  let windowStartTimestampSeconds = Math.max(0, approximateTimestampInSeconds - ZOOM_WINDOW_HALF_DURATION_SECONDS);
  let windowEndTimestampSeconds = approximateTimestampInSeconds + ZOOM_WINDOW_HALF_DURATION_SECONDS;

  console.log(
    `[CANDIDATE_REFINER] Slicing initial window [${windowStartTimestampSeconds.toFixed(1)}s - ` +
    `${windowEndTimestampSeconds.toFixed(1)}s] at ${ZOOM_WINDOW_SAMPLING_FPS} FPS`
  );

  const initialRawFrames = await extractWindowFrames(
    videoPath,
    path.join(candidateZoomDirectory, 'iteration_0'),
    windowStartTimestampSeconds,
    windowEndTimestampSeconds,
    ZOOM_WINDOW_SAMPLING_FPS,
    ZOOM_WINDOW_MAX_FRAMES_COUNT
  );

  let currentWindowLabeledFrames: LabeledFrame[] = initialRawFrames.map(
    (rawFrame, zeroBasedIndex) => ({
      frameIndex: zeroBasedIndex,
      timestampSec: rawFrame.time,
      framePath: rawFrame.path,
    })
  );

  let winningPinpointResult: PinpointResult | null = null;
  let zoomIterationCounter = 0;

  // 2. Bounded Zoom Loop (maximum 2 zoom iterations per candidate)
  while (zoomIterationCounter < MAX_ZOOM_ITERATIONS_PER_CANDIDATE) {
    if (currentWindowLabeledFrames.length === 0) break;

    const windowFirstTimestamp = currentWindowLabeledFrames[0].timestampSec.toFixed(1);
    const windowLastTimestamp = currentWindowLabeledFrames[currentWindowLabeledFrames.length - 1].timestampSec.toFixed(1);

    let promptText =
      `You are pinpointing the single best visual/dramatic frame near ${approximateTimestampInSeconds.toFixed(1)}s.\n` +
      `CANDIDATE GOAL: "${candidate.reason}"\n`;

    // Inject localized dialogue context if available (MyClaw context hygiene: local window only)
    if (localizedDialogueSnippetText) {
      promptText +=
        `\n--- LOCAL SPOKEN DIALOGUE (around this moment) ---\n` +
        `${localizedDialogueSnippetText}\n` +
        `--------------------------------------------------\n\n`;
    }

    promptText +=
      `You are viewing ${currentWindowLabeledFrames.length} frames from a window between ${windowFirstTimestamp}s and ${windowLastTimestamp}s.\n\n` +
      `INSTRUCTIONS:\n` +
      `1. If this window is too wide and you need to zoom closer to a specific sub-second moment, respond with ONLY:\n` +
      `   {"action": "zoom", "start_sec": number, "end_sec": number, "fps": number}\n` +
      `2. Otherwise, select the single best frame index capturing the PEAK ACTION, CLEAREST EMOTION, or DRAMATIC CLIMAX, and respond with ONLY:\n` +
      `   {"frameIndex": number, "reason": "why this exact frame was chosen", "confidence": "high"|"medium"|"low"}\n\n` +
      `CRITICAL: Respond ONLY with valid JSON. No conversational greetings or commentary.`;

    // FRESH CONVERSATION PAYLOAD:
    // 1. Context Isolation prevents VRAM explosion across candidates.
    // 2. AGENT_SYSTEM_PROMPT_PREFIX reuses LM Studio / llama.cpp KV-cache!
    const isolatedChatMessages = [
      {
        role: 'system',
        content: AGENT_SYSTEM_PROMPT_PREFIX,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: promptText },
          ...buildLabeledImageContent(currentWindowLabeledFrames),
        ],
      },
    ];

    console.log(
      `[CANDIDATE_REFINER] Calling LM Studio (Candidate ${candidateIndex + 1}, ` +
      `Iter ${zoomIterationCounter + 1}, Budget Remaining: ${zoomCallBudget.remaining})...`
    );

    let rawModelResponseText = '';
    try {
      rawModelResponseText = await callLMStudioChat(isolatedChatMessages, 0.2, 1024);
      console.log(`[CANDIDATE_REFINER] Model response:\n`, rawModelResponseText);
    } catch (modelCallError) {
      console.error(`[CANDIDATE_REFINER] LM Studio call failed on iteration ${zoomIterationCounter}:`, modelCallError);
      break;
    }

    const parsedAction = parseRefinementResponse(rawModelResponseText, currentWindowLabeledFrames);

    // Handle Zoom Request
    if (parsedAction.type === 'zoom' && zoomCallBudget.remaining > 0) {
      zoomCallBudget.remaining--;
      zoomIterationCounter++;

      windowStartTimestampSeconds = parsedAction.startSec;
      windowEndTimestampSeconds = parsedAction.endSec;

      onProgress?.({
        status: 'zoom_pass',
        candidateIndex: candidateIndex + 1,
        iteration: zoomIterationCounter,
        windowSec: [windowStartTimestampSeconds, windowEndTimestampSeconds],
      });

      console.log(
        `[CANDIDATE_REFINER] Model requested zoom to [${windowStartTimestampSeconds.toFixed(1)}s - ` +
        `${windowEndTimestampSeconds.toFixed(1)}s] at ${parsedAction.fps} FPS`
      );

      const reExtractedRawFrames = await extractWindowFrames(
        videoPath,
        path.join(candidateZoomDirectory, `iteration_${zoomIterationCounter}`),
        windowStartTimestampSeconds,
        windowEndTimestampSeconds,
        parsedAction.fps,
        ZOOM_WINDOW_MAX_FRAMES_COUNT
      );

      if (reExtractedRawFrames.length > 0) {
        currentWindowLabeledFrames = reExtractedRawFrames.map((rawFrame, zeroBasedIndex) => ({
          frameIndex: zeroBasedIndex,
          timestampSec: rawFrame.time,
          framePath: rawFrame.path,
        }));
        // Continue to next iteration with the zoomed window frames
        continue;
      }
    } else if (parsedAction.type === 'pinpoint') {
      // Model selected a winning frame index
      winningPinpointResult = parsedAction.result;
      console.log(
        `[CANDIDATE_REFINER] Pinpoint locked on frameIndex ${winningPinpointResult.frameIndex} ` +
        `(t=${winningPinpointResult.timestampSec.toFixed(2)}s)`
      );
      break;
    } else {
      // Invalid response or budget exhausted without pinpoint
      if (parsedAction.type === 'zoom' && zoomCallBudget.remaining <= 0) {
        console.warn(`[CANDIDATE_REFINER] Global zoom budget exhausted. Defaulting to center frame.`);
      }
      break;
    }
  }

  // 3. Fallback: If no pinpoint was locked, pick the window's midpoint frame
  if (!winningPinpointResult) {
    const fallbackIndex = Math.floor(currentWindowLabeledFrames.length / 2);
    const fallbackFrame = currentWindowLabeledFrames[fallbackIndex] || {
      frameIndex: 0,
      timestampSec: approximateTimestampInSeconds,
      framePath: '',
    };
    winningPinpointResult = {
      frameIndex: fallbackIndex,
      timestampSec: fallbackFrame.timestampSec,
      framePath: fallbackFrame.framePath,
      reason: candidate.reason,
      confidence: 'medium',
    };
  }

  // 4. High-Resolution Frame Extraction at Winning Timestamp
  const highResolutionOutputDirectory = path.join(outputDir, 'agent_hq');
  if (!fs.existsSync(highResolutionOutputDirectory)) {
    fs.mkdirSync(highResolutionOutputDirectory, { recursive: true });
  }

  let finalHighResolutionFramePath = winningPinpointResult.framePath;
  try {
    const extractedHqPath = await extractSingleHighResFrame(
      videoPath,
      winningPinpointResult.timestampSec,
      highResolutionOutputDirectory
    );
    if (fs.existsSync(extractedHqPath)) {
      finalHighResolutionFramePath = extractedHqPath;
      winningPinpointResult.framePath = extractedHqPath;
    }
  } catch (hqExtractionError) {
    console.warn(`[CANDIDATE_REFINER] HQ frame extraction failed; falling back to downscaled frame:`, hqExtractionError);
  }

  // 5. Phase C: Hand off to existing analyzeFrame() for high-fidelity prompt synthesis
  onProgress?.({
    status: 'generating_prompt',
    candidateIndex: candidateIndex + 1,
    timestampSec: winningPinpointResult.timestampSec,
  });

  console.log(`[CANDIDATE_REFINER] Handing off to analyzeFrame with prompt preset "${selectedPreset}"...`);
  let finalNarrativeDescription = candidate.reason;
  let finalPromptTokensText = candidate.reason;
  let extractedVisualAnalysisData: any = undefined;

  try {
    const analysisResponse = await analyzeFrame(finalHighResolutionFramePath, selectedPreset);
    if (analysisResponse.success && analysisResponse.analysis) {
      const frameAnalysis = analysisResponse.analysis;
      finalNarrativeDescription = frameAnalysis.summary || candidate.reason;
      finalPromptTokensText =
        frameAnalysis.styled_content ||
        frameAnalysis.summary ||
        candidate.reason;

      extractedVisualAnalysisData = {
        objects: frameAnalysis.objects || [],
        tags: frameAnalysis.tags || [],
        scene_type: frameAnalysis.scene_type || 'cinematic',
        visual_elements: frameAnalysis.visual_elements,
      };
    }
  } catch (promptSynthesisError) {
    console.warn(`[CANDIDATE_REFINER] analyzeFrame prompt synthesis failed, using candidate reason:`, promptSynthesisError);
  }

  // 6. Assemble complete StoryboardEntry
  const finalStoryboardEntry: StoryboardEntry = {
    id: `sb_${Date.now()}_${candidateIndex}`,
    frameIndex: winningPinpointResult.frameIndex,
    timestampSec: winningPinpointResult.timestampSec,
    framePath: finalHighResolutionFramePath,
    reason: winningPinpointResult.reason || candidate.reason,
    description: finalNarrativeDescription,
    promptText: finalPromptTokensText,
    confidence: winningPinpointResult.confidence,
    visualAnalysis: extractedVisualAnalysisData,
  };

  console.log(
    `[CANDIDATE_REFINER] Candidate ${candidateIndex + 1} finalized: ` +
    `t=${finalStoryboardEntry.timestampSec.toFixed(2)}s ("${finalStoryboardEntry.reason}")`
  );

  return finalStoryboardEntry;
}
