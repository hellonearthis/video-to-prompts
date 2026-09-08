/**
 * ============================================================================
 * TUTORIAL: MASTER ORCHESTRATOR — AUTONOMOUS STORYBOARD EXTRACTOR
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * This is the central entry point that coordinates the entire multi-phase
 * agentic extraction pipeline from start to finish:
 * 
 * STEP 1: TRANSCRIPT INGESTION (Optional)
 *   If the user attached an SRT subtitle file (e.g. from ComfyUI Qwen ASR),
 *   we parse and normalize the dialogue with timestamps.
 * 
 * STEP 2: WHOLE-VIDEO COARSE PASS
 *   FFmpeg extracts 16 evenly-spaced midpoint frames across the video and
 *   packages them into labeled multimodal message blocks.
 * 
 * STEP 3: PHASE A — CANDIDATE TURNING POINT IDENTIFICATION
 *   A single call to LM Studio evaluates the coarse frames + dialogue cues
 *   to establish the overarching narrative structure and propose the top N beats.
 * 
 * STEP 4: PHASE B & C — PER-CANDIDATE ZOOM REFINEMENT & PROMPT SYNTHESIS
 *   Each candidate turning point is refined in an isolated zoom window.
 *   A shared global zoom budget guarantees bounded execution.
 *   The winning high-res frame is extracted and passed to the existing preset engine.
 * 
 * STEP 5: CHRONOLOGICAL SORTING & DISK PERSISTENCE
 *   The final entries are sorted by timestamp and saved to `agent_storyboard.json`.
 */

import fs from 'fs';
import path from 'path';
import { buildCoarsePass } from './coarsePass.ts';
import { identifyCandidates } from './candidateIdentifier.ts';
import { refineCandidate } from './candidateRefiner.ts';
import { importSubRipTranscriptFromFile } from './transcriptImport.ts';
import {
  COARSE_PASS_MAX_FRAMES_COUNT,
  MAX_CANDIDATES_DEFAULT,
  MAX_GLOBAL_ZOOM_CALLS_BUDGET,
  DEFAULT_PROMPT_PRESET_NAME,
} from './config.ts';
import type {
  ExtractorOptions,
  StoryboardEntry,
  TranscriptSegment,
} from './types.ts';

/**
 * Runs the complete autonomous storyboard extraction pipeline.
 * 
 * @param options - ExtractorOptions containing video path, output directory, and settings
 * @returns Promise resolving to the final array of StoryboardEntry objects
 */
export async function extractStoryboard({
  videoPath,
  outputDir,
  transcriptPath,
  maxCandidates = MAX_CANDIDATES_DEFAULT,
  promptType = DEFAULT_PROMPT_PRESET_NAME,
  onProgress,
}: ExtractorOptions): Promise<StoryboardEntry[]> {
  console.log(`[STORYBOARD_EXTRACTOR] Commencing agentic pipeline for video: ${videoPath}`);

  // Guard: Verify video file exists on disk
  if (!fs.existsSync(videoPath)) {
    throw new Error(`[STORYBOARD_EXTRACTOR] Target video file does not exist: ${videoPath}`);
  }

  // Ensure root output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // --------------------------------------------------------------------------
  // STEP 1: Optional Dialogue Transcript Ingestion
  // --------------------------------------------------------------------------
  let parsedTranscriptSegments: TranscriptSegment[] | null = null;
  if (transcriptPath && fs.existsSync(transcriptPath)) {
    console.log(`[STORYBOARD_EXTRACTOR] Parsing dialogue transcript from: ${transcriptPath}`);
    parsedTranscriptSegments = importSubRipTranscriptFromFile(transcriptPath);
  }

  // --------------------------------------------------------------------------
  // STEP 2: Whole-Video Coarse Pass (16 Evenly-Spaced Frames)
  // --------------------------------------------------------------------------
  onProgress?.({
    status: 'coarse_pass',
    message: `Scanning full video with up to ${COARSE_PASS_MAX_FRAMES_COUNT} evenly-spaced frames...`,
  });

  const coarsePassResult = await buildCoarsePass(
    videoPath,
    outputDir,
    COARSE_PASS_MAX_FRAMES_COUNT
  );

  // --------------------------------------------------------------------------
  // STEP 3: Phase A — Candidate Turning Point Identification
  // --------------------------------------------------------------------------
  const identifiedCandidates = await identifyCandidates(
    coarsePassResult,
    parsedTranscriptSegments,
    maxCandidates
  );

  onProgress?.({
    status: 'candidates_found',
    count: identifiedCandidates.length,
    candidates: identifiedCandidates,
  });

  // --------------------------------------------------------------------------
  // STEP 4: Phase B & C — Per-Candidate Refinement & Prompt Synthesis Loop
  // --------------------------------------------------------------------------
  // Mutable budget shared across all candidates to enforce an absolute ceiling on zoom calls
  const sharedGlobalZoomBudgetState = { remaining: MAX_GLOBAL_ZOOM_CALLS_BUDGET };
  const autonomousStoryboardEntries: StoryboardEntry[] = [];

  for (let candidateIndex = 0; candidateIndex < identifiedCandidates.length; candidateIndex++) {
    const currentCandidate = identifiedCandidates[candidateIndex];

    try {
      const refinedStoryboardEntry = await refineCandidate({
        candidate: currentCandidate,
        candidateIndex,
        totalCandidates: identifiedCandidates.length,
        videoPath,
        outputDir,
        zoomCallBudget: sharedGlobalZoomBudgetState,
        selectedPreset: promptType,
        transcriptSegments: parsedTranscriptSegments,
        onProgress,
      });

      autonomousStoryboardEntries.push(refinedStoryboardEntry);
    } catch (candidateProcessingError) {
      console.error(
        `[STORYBOARD_EXTRACTOR] Failed to refine candidate beat ${candidateIndex + 1}:`,
        candidateProcessingError
      );
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: Chronological Ordering & Disk Persistence
  // --------------------------------------------------------------------------
  // Sort entries chronologically so they read naturally as a storyboard narrative
  autonomousStoryboardEntries.sort(
    (entryA, entryB) => entryA.timestampSec - entryB.timestampSec
  );

  const finalResultJsonPath = path.join(outputDir, 'agent_storyboard.json');
  try {
    fs.writeFileSync(
      finalResultJsonPath,
      JSON.stringify(autonomousStoryboardEntries, null, 2),
      'utf-8'
    );
    console.log(`[STORYBOARD_EXTRACTOR] Persisted agent storyboard to: ${finalResultJsonPath}`);
  } catch (persistenceError) {
    console.warn(`[STORYBOARD_EXTRACTOR] Could not save agent_storyboard.json to disk:`, persistenceError);
  }

  // Notify UI that pipeline has completed
  onProgress?.({
    status: 'done',
    entries: autonomousStoryboardEntries,
  });

  console.log(`[STORYBOARD_EXTRACTOR] Pipeline complete: ${autonomousStoryboardEntries.length} beats delivered`);
  return autonomousStoryboardEntries;
}
