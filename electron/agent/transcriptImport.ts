/**
 * ============================================================================
 * TUTORIAL: SUBRIP (.SRT) TRANSCRIPT INGESTION ENGINE
 * ============================================================================
 * 
 * WHAT THIS MODULE DOES:
 * This module reads external SubRip (.srt) subtitle files—such as those exported
 * by automated speech recognition (ASR) pipelines like ComfyUI + Qwen ASR—and
 * transforms them into normalized, timestamp-indexed dialogue segments.
 * 
 * WHY THIS IS ESSENTIAL FOR VIDEO UNDERSTANDING:
 * Visual frames only tell half the story. In narrative videos, dialogue conveys:
 * - Emotional shifts ("I can't do this anymore", "Look out behind you!")
 * - Plot reveals and topic transitions ("We found the coordinates.")
 * - Scene setup and temporal anchors
 * 
 * For videos longer than 3-5 minutes, coarse visual frames are spaced 20-30 seconds
 * apart and can easily miss instantaneous visual actions. Spoken dialogue provides
 * continuous temporal coverage across the entire video, allowing the model to pinpoint
 * the exact second a dramatic climax occurs.
 * 
 * SUBRIP (.SRT) FORMAT SPECIFICATION:
 * An SRT file consists of sequential text blocks separated by blank lines:
 * -------------------------------------------------------------
 * 1                                    <-- Numeric block sequence counter
 * 00:01:23,456 --> 00:01:25,789        <-- Start & End timestamps (HH:MM:SS,ms)
 * Look out for that truck!             <-- Dialogue text (can span multiple lines)
 * 
 * 2
 * 00:01:26,100 --> 00:01:30,000
 * Hold on tight!
 * -------------------------------------------------------------
 */

import fs from 'fs';
import { LOCAL_DIALOGUE_HALF_WINDOW_SECONDS } from './config.ts';
import type { TranscriptSegment } from './types.ts';

/**
 * Parses an SRT timestamp string into floating-point seconds.
 * 
 * WHAT IT DOES:
 * Converts "00:01:23,456" into 83.456 seconds.
 * 
 * WHY IT HANDLES COMMAS AND DOTS:
 * The official SubRip standard specifies a comma separator for milliseconds (e.g. "01:23,456"),
 * but many modern web tools and ASR exports use period decimals ("01:23.456").
 * We normalize both to standard decimal points before computing the total seconds.
 * 
 * @param rawTimestampString - The timestamp string from the SRT line (e.g., "00:01:23,456")
 * @returns Total elapsed time in seconds as a floating-point number
 */
export function parseSubRipTimestampToSeconds(rawTimestampString: string): number {
  const sanitizedString = rawTimestampString.trim().replace(',', '.');
  const timeComponents = sanitizedString.split(':');

  if (timeComponents.length === 3) {
    // Format is HH:MM:SS.mmm
    const hoursInSeconds = (parseFloat(timeComponents[0]) || 0) * 3600;
    const minutesInSeconds = (parseFloat(timeComponents[1]) || 0) * 60;
    const secondsWithFraction = parseFloat(timeComponents[2]) || 0;
    return hoursInSeconds + minutesInSeconds + secondsWithFraction;
  } else if (timeComponents.length === 2) {
    // Fallback format is MM:SS.mmm
    const minutesInSeconds = (parseFloat(timeComponents[0]) || 0) * 60;
    const secondsWithFraction = parseFloat(timeComponents[1]) || 0;
    return minutesInSeconds + secondsWithFraction;
  }

  // Fallback if already pure seconds
  return parseFloat(sanitizedString) || 0;
}

// Backward-compatible alias
export const parseSrtTimestamp = parseSubRipTimestampToSeconds;

/**
 * Formats a raw second count into an intuitive [MM:SS] timecode string.
 * Used when printing dialogue blocks into the model prompt.
 * 
 * @param totalSeconds - Raw timestamp in seconds (e.g., 83.456)
 * @returns Formatted timecode (e.g., "01:23")
 */
export function formatSecondsToTimecode(totalSeconds: number): string {
  const roundedSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  const formattedMinutes = minutes.toString().padStart(2, '0');
  const formattedSeconds = remainingSeconds.toString().padStart(2, '0');
  return `${formattedMinutes}:${formattedSeconds}`;
}

/**
 * Parses the raw text content of an SRT subtitle file into an array of TranscriptSegments.
 * 
 * WHAT IT DOES:
 * 1. Strips UTF-8 Byte Order Marks (BOM: \uFEFF) which can corrupt string parsing.
 * 2. Normalizes Windows CRLF (\r\n) linebreaks to standard LF (\n).
 * 3. Splits the text by double newlines into individual subtitle blocks.
 * 4. Extracts the time boundary line ("-->").
 * 5. Strips formatting HTML tags (e.g. <i>italic</i>, <font color=...>) that ASR nodes inject.
 * 6. Sorts segments chronologically to ensure strict temporal order.
 * 
 * @param rawFileContent - Full UTF-8 string contents of the SRT file
 * @returns Sorted array of TranscriptSegment objects
 */
export function parseSubRipTranscriptContent(rawFileContent: string): TranscriptSegment[] {
  // 1. Strip BOM and normalize line breaks
  const normalizedContent = rawFileContent
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // 2. Split into subtitle blocks by one or more blank lines
  const subtitleBlocks = normalizedContent.split(/\n\s*\n/);
  const parsedSegments: TranscriptSegment[] = [];

  for (const block of subtitleBlocks) {
    const blockLines = block
      .trim()
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    // A valid SRT block requires at least 2 lines (index/timestamp + text)
    if (blockLines.length < 2) continue;

    // 3. Locate the timestamp arrow line
    const timestampLineIndex = blockLines.findIndex(line => line.includes('-->'));
    if (timestampLineIndex === -1) continue;

    const timestampLine = blockLines[timestampLineIndex];
    const timestampParts = timestampLine.split('-->').map(part => part.trim());
    if (timestampParts.length < 2) continue;

    const [startTimestampString, endTimestampString] = timestampParts;
    const startSec = parseSubRipTimestampToSeconds(startTimestampString);
    const endSec = parseSubRipTimestampToSeconds(endTimestampString);

    // 4. Any lines following the timestamp line belong to the spoken dialogue text
    const dialogueLines = blockLines.slice(timestampLineIndex + 1);
    const cleanedDialogueText = dialogueLines
      .join(' ')
      .replace(/<[^>]*>/g, '') // Strip HTML tags such as <i>, <b>, <font>
      .replace(/\s+/g, ' ')    // Collapse multiple spaces
      .trim();

    if (cleanedDialogueText) {
      parsedSegments.push({
        startSec,
        endSec,
        text: cleanedDialogueText,
      });
    }
  }

  // 5. Sort chronologically by start timestamp
  return parsedSegments.sort((segmentA, segmentB) => segmentA.startSec - segmentB.startSec);
}

// Backward-compatible alias
export const parseSrtContent = parseSubRipTranscriptContent;

/**
 * Reads an SRT file from the filesystem and returns normalized dialogue segments.
 * 
 * @param absoluteFilePath - Full filesystem path to the .srt file
 * @returns Array of TranscriptSegments, or an empty array if the file cannot be read
 */
export function importSubRipTranscriptFromFile(absoluteFilePath: string): TranscriptSegment[] {
  try {
    if (!fs.existsSync(absoluteFilePath)) {
      console.warn(`[TRANSCRIPT_IMPORT] Subtitle file does not exist on disk: ${absoluteFilePath}`);
      return [];
    }

    const rawFileContent = fs.readFileSync(absoluteFilePath, 'utf-8');
    const parsedSegments = parseSubRipTranscriptContent(rawFileContent);
    console.log(`[TRANSCRIPT_IMPORT] Ingested ${parsedSegments.length} dialogue segments from ${absoluteFilePath}`);
    return parsedSegments;
  } catch (error) {
    console.error(`[TRANSCRIPT_IMPORT] Failed to read or parse transcript ${absoluteFilePath}:`, error);
    return [];
  }
}

// Backward-compatible alias
export const importTranscript = importSubRipTranscriptFromFile;

/**
 * Formats transcript segments into a concise dialogue summary block for the model prompt.
 * 
 * WHAT IT DOES:
 * Converts array of segments into human-readable, time-indexed script dialogue:
 * [00:03 - 00:07] "Look at what's coming!"
 * [00:12 - 00:15] "Brace for impact."
 * 
 * WHY WE CAP MAXIMUM CHARACTERS:
 * For very long movies with hours of dialogue, dumping the entire transcript would
 * exhaust the LLM's context window before any vision frames could be sent.
 * The character budget ensures dialogue remains compact and focused on turning points.
 * 
 * @param segments - The normalized transcript segments
 * @param maximumCharacterBudget - Maximum character length of the formatted summary (defaults to 4000)
 * @returns Formatted multi-line dialogue script
 */
export function formatTranscriptSegmentsForPrompt(
  segments: TranscriptSegment[],
  maximumCharacterBudget = 4000
): string {
  if (!segments || segments.length === 0) return '';

  const formattedDialogueLines: string[] = [];
  let accumulatedCharacterCount = 0;

  for (const segment of segments) {
    const startTimecode = formatSecondsToTimecode(segment.startSec);
    const endTimecode = formatSecondsToTimecode(segment.endSec);
    const timecodeRange = `[${startTimecode} - ${endTimecode}]`;
    const formattedLine = `${timecodeRange} "${segment.text}"`;

    if (accumulatedCharacterCount + formattedLine.length > maximumCharacterBudget) {
      formattedDialogueLines.push('... [Dialogue transcript truncated to fit context budget]');
      break;
    }

    formattedDialogueLines.push(formattedLine);
    accumulatedCharacterCount += formattedLine.length + 1; // +1 for newline
  }

  return formattedDialogueLines.join('\n');
}

// Backward-compatible alias
export const formatTranscriptForPrompt = formatTranscriptSegmentsForPrompt;

/**
 * ============================================================================
 * TUTORIAL: LOCALIZED DIALOGUE SNIPPET EXTRACTION (MYCLAW TOKEN HYGIENE)
 * ============================================================================
 * 
 * WHAT THIS FUNCTION DOES:
 * Given a list of transcript segments and a target timestamp (e.g., 45.2s), this function
 * extracts ONLY the dialogue lines occurring within +/- halfWindowDurationSeconds (defaults to 8s).
 * 
 * WHY NOT SEND THE ENTIRE TRANSCRIPT INTO PHASE B?
 * In the words of the MyClaw Playbook: "The biggest waste is not how many tokens the agent uses.
 * It is how many useless tokens it keeps carrying."
 * In Phase A, the whole transcript is needed to detect macro story beats across the whole movie.
 * But in Phase B, we are inspecting a 6-second window around ONE candidate.
 * Injecting lines from 5 minutes away adds zero value and burns unnecessary prompt tokens.
 * A localized +/- 8s snippet provides immediate spoken context (e.g. "Look behind you!")
 * while keeping the token footprint extremely lean (< 150 tokens).
 * 
 * @param segments - Normalized transcript segments
 * @param centerTimestampSec - The anchor timestamp around which to find spoken lines
 * @param halfWindowDurationSeconds - Time radius in seconds (defaults to LOCAL_DIALOGUE_HALF_WINDOW_SECONDS = 8)
 * @returns Compact, formatted string of dialogue lines, or an empty string if no speech occurred in the window
 */
export function getLocalizedDialogueSnippet(
  segments: TranscriptSegment[],
  centerTimestampSec: number,
  halfWindowDurationSeconds = LOCAL_DIALOGUE_HALF_WINDOW_SECONDS
): string {
  if (!segments || segments.length === 0) return '';

  const windowStartSec = Math.max(0, centerTimestampSec - halfWindowDurationSeconds);
  const windowEndSec = centerTimestampSec + halfWindowDurationSeconds;

  // Find segments overlapping with [windowStartSec, windowEndSec]
  const overlappingSegments = segments.filter(
    segment => segment.endSec >= windowStartSec && segment.startSec <= windowEndSec
  );

  if (overlappingSegments.length === 0) return '';

  return overlappingSegments
    .map(segment => {
      const startTimecode = formatSecondsToTimecode(segment.startSec);
      const endTimecode = formatSecondsToTimecode(segment.endSec);
      return `[${startTimecode} - ${endTimecode}] "${segment.text}"`;
    })
    .join('\n');
}

// Backward-compatible alias
export const getLocalDialogue = getLocalizedDialogueSnippet;
