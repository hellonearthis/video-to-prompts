/**
 * ============================================================================
 * UNIT TESTS: CONFIGURATION & TOKEN HYGIENE BOUNDARIES
 * ============================================================================
 * 
 * Verifies that the VRAM-safe caps, sampling parameters, prompt-caching prefix,
 * and localized dialogue window sizes strictly follow the MyClaw Playbook guidelines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COARSE_PASS_MAX_FRAMES_COUNT,
  ZOOM_WINDOW_MAX_FRAMES_COUNT,
  ZOOM_WINDOW_SAMPLING_FPS,
  ZOOM_WINDOW_HALF_DURATION_SECONDS,
  MAX_CANDIDATES_DEFAULT,
  MAX_ZOOM_ITERATIONS_PER_CANDIDATE,
  MAX_GLOBAL_ZOOM_CALLS_BUDGET,
  MODEL_INPUT_FRAME_RESOLUTION,
  DEFAULT_PROMPT_PRESET_NAME,
  LONG_VIDEO_THRESHOLD_SECONDS,
  AGENT_SYSTEM_PROMPT_PREFIX,
  LOCAL_DIALOGUE_HALF_WINDOW_SECONDS,
} from '../config.ts';

test('config: Coarse pass frame count is bounded for 16GB VRAM safety', () => {
  // Must be <= 16 frames so whole-video vision tokens stay under ~12,000
  assert.equal(COARSE_PASS_MAX_FRAMES_COUNT, 16);
});

test('config: Zoom pass frame count and FPS are bounded', () => {
  // Max 10 frames per zoom window at 4 FPS across 6 seconds
  assert.equal(ZOOM_WINDOW_MAX_FRAMES_COUNT, 10);
  assert.equal(ZOOM_WINDOW_SAMPLING_FPS, 4);
  assert.equal(ZOOM_WINDOW_HALF_DURATION_SECONDS, 3);
});

test('config: Global budgets prevent runaway agent loops', () => {
  // Maximum global zooms ceiling across entire run
  assert.equal(MAX_GLOBAL_ZOOM_CALLS_BUDGET, 8);
  // Maximum zoom iterations per individual candidate
  assert.equal(MAX_ZOOM_ITERATIONS_PER_CANDIDATE, 2);
  // Default candidate beats
  assert.equal(MAX_CANDIDATES_DEFAULT, 5);
});

test('config: Resolution downscale bounds image patch token explosion', () => {
  // 640x360 downscale preserves faces and composition while keeping tokens < 400 per frame
  assert.deepEqual(MODEL_INPUT_FRAME_RESOLUTION, { width: 640, height: 360 });
});

test('config: MyClaw Playbook prompt prefix is static and valid JSON instruction', () => {
  // Prefix must be non-empty and specify valid JSON
  assert.ok(AGENT_SYSTEM_PROMPT_PREFIX.length > 20);
  assert.match(AGENT_SYSTEM_PROMPT_PREFIX, /valid JSON/);
  assert.match(AGENT_SYSTEM_PROMPT_PREFIX, /autonomous video understanding agent/);
});

test('config: Local dialogue half-window is 8 seconds', () => {
  // Bounded window prevents carrying entire video transcript into Phase B
  assert.equal(LOCAL_DIALOGUE_HALF_WINDOW_SECONDS, 8);
});

test('config: Long video threshold is 5 minutes (300s)', () => {
  assert.equal(LONG_VIDEO_THRESHOLD_SECONDS, 300);
});

test('config: Default prompt preset matches Ultra Cinematic Detailed', () => {
  assert.equal(DEFAULT_PROMPT_PRESET_NAME, 'Ultra Cinematic Detailed');
});
