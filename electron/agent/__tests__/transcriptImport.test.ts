/**
 * ============================================================================
 * UNIT TESTS: TRANSCRIPT INGESTION & LOCALIZED DIALOGUE WINDOWING
 * ============================================================================
 * 
 * Tests the SubRip (.srt) subtitle parser, decimal normalization, dialogue
 * truncation, and the MyClaw Playbook localized dialogue windowing algorithm.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSubRipTimestampToSeconds,
  parseSubRipTranscriptContent,
  formatSecondsToTimecode,
  formatTranscriptSegmentsForPrompt,
  getLocalizedDialogueSnippet,
} from '../transcriptImport.ts';
import type { TranscriptSegment } from '../types.ts';

test('parseSubRipTimestampToSeconds: parses standard comma and period decimals', () => {
  // Comma-separated milliseconds (official SubRip standard)
  assert.equal(parseSubRipTimestampToSeconds('00:01:23,456'), 83.456);
  assert.equal(parseSubRipTimestampToSeconds('01:00:00,000'), 3600);

  // Period-separated decimals (modern web / ASR exports)
  assert.equal(parseSubRipTimestampToSeconds('00:01:23.456'), 83.456);

  // MM:SS format fallback
  assert.equal(parseSubRipTimestampToSeconds('02:30.500'), 150.5);

  // Plain seconds fallback
  assert.equal(parseSubRipTimestampToSeconds('45.2'), 45.2);
});

test('formatSecondsToTimecode: formats seconds to [MM:SS]', () => {
  assert.equal(formatSecondsToTimecode(0), '00:00');
  assert.equal(formatSecondsToTimecode(83.456), '01:23');
  assert.equal(formatSecondsToTimecode(3600), '60:00');
});

test('parseSubRipTranscriptContent: parses blocks and strips HTML tags', () => {
  const sampleSrt = `1
00:00:05,000 --> 00:00:08,000
<i>Look out!</i> There is danger ahead.

2
00:00:10.500 --> 00:00:14.000
<font color="#ff0000"><b>Hold on tight!</b></font>
`;

  const segments = parseSubRipTranscriptContent(sampleSrt);
  assert.equal(segments.length, 2);

  // Check first segment
  assert.equal(segments[0].startSec, 5);
  assert.equal(segments[0].endSec, 8);
  assert.equal(segments[0].text, 'Look out! There is danger ahead.');

  // Check second segment
  assert.equal(segments[1].startSec, 10.5);
  assert.equal(segments[1].endSec, 14);
  assert.equal(segments[1].text, 'Hold on tight!');
});

test('formatTranscriptSegmentsForPrompt: respects character truncation limit', () => {
  const segments: TranscriptSegment[] = [
    { startSec: 0, endSec: 5, text: 'First line of dialogue' },
    { startSec: 10, endSec: 15, text: 'Second line of dialogue' },
    { startSec: 20, endSec: 25, text: 'Third line of dialogue' },
  ];

  // Budget sufficient for only first line
  const formatted = formatTranscriptSegmentsForPrompt(segments, 45);
  assert.match(formatted, /First line of dialogue/);
  assert.match(formatted, /Dialogue transcript truncated/);
  assert.doesNotMatch(formatted, /Third line of dialogue/);
});

test('getLocalizedDialogueSnippet: strictly extracts +/- 8s window around candidate', () => {
  const segments: TranscriptSegment[] = [
    { startSec: 5, endSec: 8, text: 'Opening scene dialogue' },
    { startSec: 40, endSec: 43, text: 'Target scene approaching' },
    { startSec: 45, endSec: 48, text: 'Look out behind you!' },
    { startSec: 51, endSec: 53, text: 'That was close!' },
    { startSec: 180, endSec: 185, text: 'Far away dialogue at 3 minutes' },
  ];

  // Target timestamp: 46.0s. Default window is +/- 8s => [38.0s, 54.0s]
  const snippet = getLocalizedDialogueSnippet(segments, 46.0, 8);

  // Should include dialogue from 40s, 45s, 51s
  assert.match(snippet, /Target scene approaching/);
  assert.match(snippet, /Look out behind you!/);
  assert.match(snippet, /That was close!/);

  // Should EXCLUDE opening dialogue (5s) and far dialogue (180s)
  assert.doesNotMatch(snippet, /Opening scene dialogue/);
  assert.doesNotMatch(snippet, /Far away dialogue/);
});

test('getLocalizedDialogueSnippet: returns empty string when no dialogue is nearby', () => {
  const segments: TranscriptSegment[] = [
    { startSec: 5, endSec: 8, text: 'Opening scene dialogue' },
    { startSec: 180, endSec: 185, text: 'Closing dialogue' },
  ];

  // Looking at 60s (window [52s, 68s]) - no lines present
  const snippet = getLocalizedDialogueSnippet(segments, 60.0, 8);
  assert.equal(snippet, '');
});
