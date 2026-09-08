/**
 * ============================================================================
 * TUTORIAL: PHASE A — CANDIDATE TURNING POINT IDENTIFIER
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * Phase A is the macro-level "director's pass" across the entire video.
 * It sends up to 16 coarse, evenly-spaced frames (plus optional spoken dialogue
 * from an SRT transcript) to the vision-language model in a SINGLE inference call,
 * instructing the model to identify the top N narrative turning points.
 * 
 * WHY PHASE A IS STRICTLY BOUNDED TO ONE MODEL CALL:
 * In early design drafts, we considered letting the model call zoom tools immediately
 * during Phase A. However:
 * 1. An agent that zooms during whole-video scanning gets lost down rabbit holes before
 *    it even sees the ending of the video.
 * 2. By forcing Phase A to complete in exactly ONE call, we establish the global
 *    narrative structure (setup, conflict, climax, resolution) up front.
 * 3. Temporal refinement is deferred entirely to Phase B, where each candidate
 *    is zoomed in on with fresh, isolated context.
 * 
 * HOW DIALOGUE TRANSCRIPTS ENHANCE LONG VIDEO DISCOVERY (>5 MINUTES):
 * For a 10-minute video, 16 coarse frames mean 1 frame every ~37 seconds.
 * Visual action can easily happen between frames. But if a dialogue transcript
 * is present, character lines like "He's got a weapon!" provide an exact timecode anchor.
 * The model reads the dialogue, identifies the timecode, matches it to the nearest
 * coarse frameIndex, and passes it to Phase B for high-speed zoom extraction.
 */

import { callLMStudioChat } from '../lmstudio.ts';
import { buildLabeledImageContent, type CoarsePassResult } from './coarsePass.ts';
import { formatTranscriptSegmentsForPrompt } from './transcriptImport.ts';
import { parseCandidateResponse } from './promptToolParser.ts';
import {
  LONG_VIDEO_THRESHOLD_SECONDS,
  MAX_CANDIDATES_DEFAULT,
  AGENT_SYSTEM_PROMPT_PREFIX,
} from './config.ts';
import type { Candidate, TranscriptSegment } from './types.ts';

/**
 * Identifies the top N dramatic turning points across the whole video.
 * 
 * @param coarsePassResult - The 16 evenly spaced coarse frames and duration metadata
 * @param transcriptSegments - Optional normalized dialogue segments from an SRT file
 * @param maximumCandidatesCount - Number of storyboard beats to extract (defaults to 5)
 * @returns Promise resolving to an array of validated Candidate objects
 */
export async function identifyCandidates(
  coarsePassResult: CoarsePassResult,
  transcriptSegments: TranscriptSegment[] | null = null,
  maximumCandidatesCount: number = MAX_CANDIDATES_DEFAULT
): Promise<Candidate[]> {
  const { frames: labeledCoarseFrames, durationSec: videoDurationInSeconds } = coarsePassResult;

  if (labeledCoarseFrames.length === 0) {
    throw new Error('[CANDIDATE_IDENTIFIER] No coarse frames available for candidate identification');
  }

  const isLongDurationVideo = videoDurationInSeconds > LONG_VIDEO_THRESHOLD_SECONDS;
  const hasDialogueTranscript = Boolean(transcriptSegments && transcriptSegments.length > 0);

  // 1. Build the system & task prompt
  let constructedInstructionPrompt =
    `You are an expert film director, cinematographer, and storyboard artist analyzing a video of ${videoDurationInSeconds.toFixed(1)} seconds.\n` +
    `You are provided with ${labeledCoarseFrames.length} evenly-spaced frames indexed from 0 to ${labeledCoarseFrames.length - 1}.\n\n`;

  // Inject dialogue transcript if present
  if (hasDialogueTranscript && transcriptSegments) {
    constructedInstructionPrompt += `--- SPOKEN DIALOGUE TRANSCRIPT ---\n`;
    constructedInstructionPrompt += formatTranscriptSegmentsForPrompt(transcriptSegments, 4000);
    constructedInstructionPrompt += `\n----------------------------------\n\n`;

    if (isLongDurationVideo) {
      constructedInstructionPrompt +=
        `NOTE FOR LONG VIDEOS (>5 minutes): Pay close attention to dialogue shifts, conflict escalations, ` +
        `and topic changes in the transcript as your PRIMARY cues for key moments, using the coarse frames ` +
        `as visual anchor context.\n\n`;
    }
  }

  constructedInstructionPrompt +=
    `TASK:\n` +
    `Identify up to ${maximumCandidatesCount} distinct moments that represent the strongest narrative turning points, ` +
    `dramatic beats, emotional reveals, or visually compelling scene transitions for a storyboard.\n\n` +
    `OUTPUT FORMAT REQUIREMENTS:\n` +
    `Respond with ONLY a valid JSON array containing objects with:\n` +
    `- "frameIndex": The integer index (0 to ${labeledCoarseFrames.length - 1}) of the coarse frame closest to this moment.\n` +
    `- "reason": A concise description of the dramatic action, character emotion, or visual significance.\n\n` +
    `EXAMPLE FORMAT:\n` +
    `[\n` +
    `  { "frameIndex": 1, "reason": "Protagonist enters the darkened research facility" },\n` +
    `  { "frameIndex": 7, "reason": "Sudden security alarm sounds as the containment fails" }\n` +
    `]\n\n` +
    `CRITICAL: Output ONLY the valid JSON array. Do not include markdown preamble or conversational explanations.`;

  // 2. Build multimodal payload: text instructions followed by labeled base64 frames
  const multimodalUserMessageContent: any[] = [
    { type: 'text', text: constructedInstructionPrompt },
    ...buildLabeledImageContent(labeledCoarseFrames),
  ];

  const chatMessagesPayload = [
    {
      role: 'system',
      content: AGENT_SYSTEM_PROMPT_PREFIX,
    },
    {
      role: 'user',
      content: multimodalUserMessageContent,
    },
  ];

  console.log(
    `[CANDIDATE_IDENTIFIER] Calling LM Studio with ${labeledCoarseFrames.length} coarse frames ` +
    `(hasTranscript: ${hasDialogueTranscript}, maxCandidates: ${maximumCandidatesCount})...`
  );

  const rawModelResponseText = await callLMStudioChat(chatMessagesPayload, 0.4, 2048);
  console.log(`[CANDIDATE_IDENTIFIER] Raw model response received:\n`, rawModelResponseText);

  // 3. Parse candidates and map frameIndex -> physical timestamp
  let identifiedCandidateTurningPoints = parseCandidateResponse(
    rawModelResponseText,
    labeledCoarseFrames,
    maximumCandidatesCount
  );

  // 4. Defensive Fallback: If the model failed to return parseable JSON, distribute candidates evenly
  if (identifiedCandidateTurningPoints.length === 0) {
    console.warn('[CANDIDATE_IDENTIFIER] Model response yielded 0 parseable candidates. Employing fallback distribution.');
    const targetFallbackCount = Math.min(maximumCandidatesCount, Math.max(1, Math.min(labeledCoarseFrames.length, 3)));
    const fallbackCandidateIntervalStep = Math.floor(labeledCoarseFrames.length / (targetFallbackCount + 1));

    for (let fallbackIndex = 1; fallbackIndex <= targetFallbackCount; fallbackIndex++) {
      const coarseIndex = Math.min(labeledCoarseFrames.length - 1, fallbackIndex * fallbackCandidateIntervalStep);
      const coarseFrame = labeledCoarseFrames[coarseIndex];
      identifiedCandidateTurningPoints.push({
        frameIndex: coarseIndex,
        approxTimestampSec: coarseFrame.timestampSec,
        reason: `Key scene moment at ${coarseFrame.timestampSec.toFixed(1)}s`,
      });
    }
  }

  console.log(`[CANDIDATE_IDENTIFIER] Successfully finalized ${identifiedCandidateTurningPoints.length} candidate turning points`);
  return identifiedCandidateTurningPoints;
}
