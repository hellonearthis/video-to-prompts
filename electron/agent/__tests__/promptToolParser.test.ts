/**
 * ============================================================================
 * UNIT TESTS: PROMPT TOOL PARSER & RESILIENT JSON EXTRACTION
 * ============================================================================
 * 
 * Tests the 3-tier resilient JSON extraction engine, integer frame-index
 * grounding, float timestamp hallucination fallbacks, and zoom tool parsing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCandidateResponse,
  parseRefinementResponse,
} from '../promptToolParser.ts';
import type { LabeledFrame } from '../types.ts';

// Mock coarse frames for testing
const mockCoarseFrames: LabeledFrame[] = [
  { frameIndex: 0, timestampSec: 0.0, framePath: '/mock/f0.png' },
  { frameIndex: 1, timestampSec: 10.0, framePath: '/mock/f1.png' },
  { frameIndex: 2, timestampSec: 20.0, framePath: '/mock/f2.png' },
  { frameIndex: 3, timestampSec: 30.0, framePath: '/mock/f3.png' },
  { frameIndex: 4, timestampSec: 40.0, framePath: '/mock/f4.png' },
];

test('parseCandidateResponse: Tier 1 - parses clean JSON array', () => {
  const jsonText = JSON.stringify([
    { frameIndex: 1, reason: 'First candidate' },
    { frameIndex: 3, reason: 'Second candidate' },
  ]);

  const candidates = parseCandidateResponse(jsonText, mockCoarseFrames, 5);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].frameIndex, 1);
  assert.equal(candidates[0].approxTimestampSec, 10.0);
  assert.equal(candidates[0].reason, 'First candidate');
  assert.equal(candidates[1].frameIndex, 3);
  assert.equal(candidates[1].approxTimestampSec, 30.0);
  assert.equal(candidates[1].reason, 'Second candidate');
});

test('parseCandidateResponse: Tier 2 - parses markdown code-fence wrapped JSON', () => {
  const rawResponse = "```json\n" +
    JSON.stringify([
      { frameIndex: 2, reason: 'Midpoint action climax' }
    ]) +
    "\n```";

  const candidates = parseCandidateResponse(rawResponse, mockCoarseFrames, 5);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].frameIndex, 2);
  assert.equal(candidates[0].approxTimestampSec, 20.0);
  assert.equal(candidates[0].reason, 'Midpoint action climax');
});

test('parseCandidateResponse: Tier 3 - extracts JSON embedded in conversational commentary', () => {
  const conversationalText =
    "Hello! Based on my review of the coarse frames, here are the narrative turning points:\n\n" +
    JSON.stringify([
      { frameIndex: 0, reason: 'Opening hook' },
      { frameIndex: 4, reason: 'Final conclusion' }
    ]) +
    "\n\nHope this helps you build your storyboard!";

  const candidates = parseCandidateResponse(conversationalText, mockCoarseFrames, 5);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].frameIndex, 0);
  assert.equal(candidates[1].frameIndex, 4);
});

test('parseCandidateResponse: recovers when model hallucinates float timestamp instead of integer index', () => {
  // Model hallucinates "time_sec": 21.4 instead of "frameIndex": 2
  const hallucinatedJson = JSON.stringify([
    { time_sec: 21.4, reason: 'Hallucinated float time close to frame 2' }
  ]);

  const candidates = parseCandidateResponse(hallucinatedJson, mockCoarseFrames, 5);
  assert.equal(candidates.length, 1);
  // Nearest frame to 21.4s is frameIndex 2 at 20.0s
  assert.equal(candidates[0].frameIndex, 2);
  assert.equal(candidates[0].approxTimestampSec, 20.0);
});

test('parseRefinementResponse: parses pinpoint response', () => {
  const rawModelResponse = JSON.stringify({
    frameIndex: 2,
    reason: 'Peak dramatic punch landed on protagonist',
    confidence: 'high',
  });

  const parsed = parseRefinementResponse(rawModelResponse, mockCoarseFrames);
  assert.equal(parsed.type, 'pinpoint');
  if (parsed.type === 'pinpoint') {
    assert.equal(parsed.result.frameIndex, 2);
    assert.equal(parsed.result.timestampSec, 20.0);
    assert.equal(parsed.result.reason, 'Peak dramatic punch landed on protagonist');
    assert.equal(parsed.result.confidence, 'high');
  }
});

test('parseRefinementResponse: parses zoom tool request', () => {
  const rawZoomResponse = JSON.stringify({
    action: 'zoom',
    start_sec: 18.5,
    end_sec: 22.5,
    fps: 4,
  });

  const parsed = parseRefinementResponse(rawZoomResponse, mockCoarseFrames);
  assert.equal(parsed.type, 'zoom');
  if (parsed.type === 'zoom') {
    assert.equal(parsed.startSec, 18.5);
    assert.equal(parsed.endSec, 22.5);
    assert.equal(parsed.fps, 4);
  }
});

test('parseRefinementResponse: handles malformed input with invalid action', () => {
  const gibberish = "I could not decide on any frame. There are no good moments.";
  const parsed = parseRefinementResponse(gibberish, mockCoarseFrames);
  assert.equal(parsed.type, 'invalid');
});
