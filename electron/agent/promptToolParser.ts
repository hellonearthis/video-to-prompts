/**
 * ============================================================================
 * TUTORIAL: RESILIENT PSEUDO-TOOL & STRUCTURED JSON PARSER
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * This module extracts and validates structured JSON actions from raw LLM text responses,
 * mapping integer frame indexes directly to physical LabeledFrame objects.
 * 
 * WHY WE USE PROMPT-DRIVEN PSEUDO-TOOLS INSTEAD OF NATIVE OPENAI FUNCTION CALLING:
 * In an ideal world, we would use the OpenAI API's `tools` and `tool_calls` parameters.
 * However, in local LLM deployments (LM Studio running Qwen-VL via llama.cpp):
 * 1. Multi-modal function calling in GGUF quants is notoriously brittle; models often
 *    mix function call tokens into normal text generation or drop them entirely.
 * 2. LM Studio's OpenAI compatibility layer does not reliably support returning
 *    multi-modal base64 images inside a message with `role: "tool"`.
 * 3. By prompting the model to output strict JSON into normal message content, we
 *    achieve 100% cross-model compatibility across any local or cloud vision model.
 * 
 * THE 3-STAGE RESILIENT JSON EXTRACTION STRATEGY:
 * Local models frequently disobey instructions to "Return ONLY JSON" and prepend:
 * "Certainly! Here are the dramatic beats I found:" followed by ```json [...] ```.
 * To handle this gracefully without failing the pipeline:
 * - Tier 1: Attempt direct JSON.parse() on the trimmed string.
 * - Tier 2: Search for markdown code fences (```json ... ``` or ``` ... ```).
 * - Tier 3: Balanced bracket/brace search: locate the first '{' or '[' and the
 *   matching last '}' or ']', extracting the substring.
 */

import type { Candidate, LabeledFrame, PinpointResult } from './types.ts';
import { ZOOM_MAX_FPS } from './config.ts';

/**
 * Discriminated union representing the model's decision in Phase B refinement.
 */
export type RefinementAction =
  | {
      /** The model requested a narrower zoom window at a specific frame rate */
      type: 'zoom';
      startSec: number;
      endSec: number;
      fps: number;
    }
  | {
      /** The model successfully pinpointed the single best frame */
      type: 'pinpoint';
      result: PinpointResult;
    }
  | {
      /** The response could not be parsed into either a zoom or pinpoint action */
      type: 'invalid';
      rawText: string;
      error: string;
    };

/**
 * Robustly extracts the first well-formed JSON object or array from raw model text.
 * 
 * @param rawModelResponseText - Unfiltered string returned by LM Studio
 * @returns Parsed JavaScript object/array, or null if no valid JSON could be extracted
 */
export function extractJsonFromText(rawModelResponseText: string): any {
  if (!rawModelResponseText || typeof rawModelResponseText !== 'string') {
    return null;
  }

  const trimmedText = rawModelResponseText.trim();

  // Tier 1: Direct JSON parsing attempt
  try {
    return JSON.parse(trimmedText);
  } catch (_) {
    // Continue to Tier 2 if direct parse fails
  }

  // Tier 2: Extract content from markdown code fences (```json ... ```)
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const codeBlockMatch = trimmedText.match(codeBlockRegex);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (_) {
      // Continue to Tier 3 if code fence contents are malformed
    }
  }

  // Tier 3: Balanced bracket / brace heuristic search
  const firstOpeningBraceIndex = trimmedText.indexOf('{');
  const firstOpeningBracketIndex = trimmedText.indexOf('[');

  let searchStartIndex = -1;
  let matchingClosingCharacter = '';

  // Determine whether an object '{' or an array '[' appears first
  if (
    firstOpeningBraceIndex !== -1 &&
    (firstOpeningBracketIndex === -1 || firstOpeningBraceIndex < firstOpeningBracketIndex)
  ) {
    searchStartIndex = firstOpeningBraceIndex;
    matchingClosingCharacter = '}';
  } else if (firstOpeningBracketIndex !== -1) {
    searchStartIndex = firstOpeningBracketIndex;
    matchingClosingCharacter = ']';
  }

  if (searchStartIndex !== -1) {
    const lastClosingIndex = trimmedText.lastIndexOf(matchingClosingCharacter);
    if (lastClosingIndex > searchStartIndex) {
      const extractedJsonSubstring = trimmedText.substring(
        searchStartIndex,
        lastClosingIndex + 1
      );
      try {
        return JSON.parse(extractedJsonSubstring);
      } catch (_) {
        // Fallback search failed
      }
    }
  }

  return null;
}

/**
 * Parses Phase A Candidate Identification response into validated Candidate objects.
 * 
 * WHAT IT DOES:
 * 1. Extracts JSON array of candidates from the model's response.
 * 2. Validates each candidate's frameIndex against the coarseFrames array bounds.
 * 3. DEFENSIVE FALLBACK: If the model accidentally gave an approxTimestampSec float
 *    instead of an integer frameIndex, this function finds the closest coarse frame
 *    and assigns its index, ensuring zero temporal hallucination.
 * 4. Resolves approxTimestampSec directly from coarseFrames[frameIndex].timestampSec.
 * 
 * @param rawResponseText - Model response text
 * @param coarseFrames - The grounded coarse frames passed in Phase A
 * @param maximumCandidatesCount - Upper bound on candidates to retain
 * @returns Array of validated Candidate objects
 */
export function parseCandidateResponse(
  rawResponseText: string,
  coarseFrames: LabeledFrame[],
  maximumCandidatesCount: number = 5
): Candidate[] {
  const parsedJsonPayload = extractJsonFromText(rawResponseText);
  if (!parsedJsonPayload) {
    console.warn('[PROMPT_PARSER] Failed to extract any valid JSON from candidate response:', rawResponseText);
    return [];
  }

  // Normalize: handle bare array or object wrapper { candidates: [...] } / { moments: [...] }
  let candidateItemList: any[] = [];
  if (Array.isArray(parsedJsonPayload)) {
    candidateItemList = parsedJsonPayload;
  } else if (typeof parsedJsonPayload === 'object') {
    candidateItemList =
      parsedJsonPayload.candidates ||
      parsedJsonPayload.moments ||
      parsedJsonPayload.turning_points ||
      parsedJsonPayload.results ||
      [];
  }

  if (!Array.isArray(candidateItemList)) {
    console.warn('[PROMPT_PARSER] Candidate payload is not an array:', parsedJsonPayload);
    return [];
  }

  const validatedCandidates: Candidate[] = [];
  const maximumValidFrameIndex = coarseFrames.length - 1;

  for (const rawItem of candidateItemList) {
    if (typeof rawItem !== 'object' || rawItem === null) continue;

    // Check for integer frame index under common aliases
    let resolvedFrameIndex =
      rawItem.frameIndex ??
      rawItem.frame_index ??
      rawItem.index;

    // DEFENSIVE RECOVERY: If model hallucinated a float timestamp instead of index,
    // find the closest coarse frame timestamp on disk.
    const rawTimestampValue =
      rawItem.approxTimestampSec ??
      rawItem.timestampSec ??
      rawItem.time_sec ??
      rawItem.timestamp ??
      rawItem.time;

    if (resolvedFrameIndex === undefined && typeof rawTimestampValue === 'number') {
      const targetTimestampInSeconds = rawTimestampValue;
      let nearestIndex = 0;
      let smallestTemporalDifference = Infinity;

      coarseFrames.forEach((frame, index) => {
        const temporalDifference = Math.abs(frame.timestampSec - targetTimestampInSeconds);
        if (temporalDifference < smallestTemporalDifference) {
          smallestTemporalDifference = temporalDifference;
          nearestIndex = index;
        }
      });
      resolvedFrameIndex = nearestIndex;
    }

    const parsedFrameIndexInteger = parseInt(String(resolvedFrameIndex), 10);
    if (
      isNaN(parsedFrameIndexInteger) ||
      parsedFrameIndexInteger < 0 ||
      parsedFrameIndexInteger > maximumValidFrameIndex
    ) {
      // Out-of-bounds or non-numeric index, skip item
      continue;
    }

    const matchedCoarseFrame = coarseFrames[parsedFrameIndexInteger];
    if (!matchedCoarseFrame) continue;

    const narrativeReason = String(
      rawItem.reason || rawItem.description || 'Key dramatic turning point'
    ).trim();

    validatedCandidates.push({
      frameIndex: parsedFrameIndexInteger,
      approxTimestampSec: matchedCoarseFrame.timestampSec,
      reason: narrativeReason,
    });

    if (validatedCandidates.length >= maximumCandidatesCount) {
      break;
    }
  }

  return validatedCandidates;
}

/**
 * Parses Phase B Candidate Refinement response.
 * 
 * WHAT IT DOES:
 * Detects whether the model decided to:
 * 1. ZOOM: {"action": "zoom", "start_sec": 12.0, "end_sec": 15.0, "fps": 4}
 * 2. PINPOINT: {"frameIndex": 3, "reason": "...", "confidence": "high"}
 * 
 * DEFENSIVE MEASURES:
 * - Clamps FPS to ZOOM_MAX_FPS to prevent the model from requesting 1000 FPS and crashing FFmpeg.
 * - Ensures endSec > startSec.
 * - Validates that frameIndex exists in windowFrames.
 * - If the model returned an explanation but dropped frameIndex, defaults to the window's midpoint.
 * 
 * @param rawResponseText - Model response text
 * @param windowFrames - The labeled frames currently shown in this zoom iteration
 * @returns RefinementAction discriminated union
 */
export function parseRefinementResponse(
  rawResponseText: string,
  windowFrames: LabeledFrame[]
): RefinementAction {
  const parsedJsonPayload = extractJsonFromText(rawResponseText);

  if (!parsedJsonPayload || typeof parsedJsonPayload !== 'object') {
    return {
      type: 'invalid',
      rawText: rawResponseText,
      error: 'Model response did not contain a valid JSON object',
    };
  }

  // 1. Check for zoom request
  const requestedActionType = parsedJsonPayload.action || parsedJsonPayload.type;
  if (requestedActionType === 'zoom') {
    const rawStartSec = parseFloat(
      parsedJsonPayload.start_sec ?? parsedJsonPayload.startSec ?? parsedJsonPayload.start
    );
    const rawEndSec = parseFloat(
      parsedJsonPayload.end_sec ?? parsedJsonPayload.endSec ?? parsedJsonPayload.end
    );
    let requestedFps = parseFloat(
      parsedJsonPayload.fps ?? parsedJsonPayload.frameRate ?? 4
    );

    if (!isNaN(rawStartSec) && !isNaN(rawEndSec) && rawEndSec > rawStartSec) {
      // Clamp FPS defensively between 1 and ZOOM_MAX_FPS (4)
      const clampedFps = Math.min(ZOOM_MAX_FPS, Math.max(1, isNaN(requestedFps) ? 4 : requestedFps));
      return {
        type: 'zoom',
        startSec: rawStartSec,
        endSec: rawEndSec,
        fps: clampedFps,
      };
    }
  }

  // 2. Check for pinpoint decision
  const rawPinpointIndex =
    parsedJsonPayload.frameIndex ??
    parsedJsonPayload.best_frame_index ??
    parsedJsonPayload.frame_index ??
    parsedJsonPayload.index;

  if (rawPinpointIndex !== undefined) {
    const parsedIndexInteger = parseInt(String(rawPinpointIndex), 10);
    if (!isNaN(parsedIndexInteger) && parsedIndexInteger >= 0 && parsedIndexInteger < windowFrames.length) {
      const selectedWinningFrame = windowFrames[parsedIndexInteger];
      const selectedReason = String(
        parsedJsonPayload.reason || parsedJsonPayload.description || 'Pinpointed key moment'
      ).trim();
      const rawConfidenceString = String(parsedJsonPayload.confidence || 'high').toLowerCase();
      const normalizedConfidence: 'high' | 'medium' | 'low' =
        rawConfidenceString === 'medium' || rawConfidenceString === 'low'
          ? rawConfidenceString
          : 'high';

      return {
        type: 'pinpoint',
        result: {
          frameIndex: parsedIndexInteger,
          timestampSec: selectedWinningFrame.timestampSec,
          framePath: selectedWinningFrame.framePath,
          reason: selectedReason,
          confidence: normalizedConfidence,
        },
      };
    }
  }

  // 3. Fallback: If model outputted a descriptive reason but invalid index, pick window midpoint
  if (windowFrames.length > 0) {
    const midpointIndex = Math.floor(windowFrames.length / 2);
    const midpointFrame = windowFrames[midpointIndex];
    return {
      type: 'pinpoint',
      result: {
        frameIndex: midpointIndex,
        timestampSec: midpointFrame.timestampSec,
        framePath: midpointFrame.framePath,
        reason: parsedJsonPayload.reason || parsedJsonPayload.description || 'Best detected turning point',
        confidence: 'medium',
      },
    };
  }

  return {
    type: 'invalid',
    rawText: rawResponseText,
    error: 'Could not extract zoom request or valid frameIndex from response',
  };
}
