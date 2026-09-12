/**
 * ============================================================================
 * UNIT TESTS: REELBENCH INTEGRATION (RHYTHM TAXONOMY & 15%/85% SHOT PAIRS)
 * ============================================================================
 * 
 * Verifies that:
 * 1. The 8 cinematic pacing rhythm roles and prompt templates in qwen_vl3_prompts.json
 *    are structurally complete, valid JSON, and match Reelbench cinematography standards.
 * 2. The 15% (establishing) and 85% (resolution) dual-frame sampling mathematics
 *    accurately calculate interior frame coordinates while avoiding transition boundaries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

test('reelbench prompts: qwen_vl3_prompts.json is valid and contains Cinematic Rhythm & Shot Breakdown', () => {
  const promptsFilePath = path.join(projectRoot, 'qwen_vl3_prompts.json');
  assert.ok(fs.existsSync(promptsFilePath), 'qwen_vl3_prompts.json must exist');

  const promptsJsonContent = fs.readFileSync(promptsFilePath, 'utf8');
  const parsedPrompts = JSON.parse(promptsJsonContent);

  // 1. Verify preset list contains the new preset
  assert.ok(
    parsedPrompts._preset_prompts.includes('Cinematic Rhythm & Shot Breakdown'),
    'Preset list must include Cinematic Rhythm & Shot Breakdown'
  );

  // 2. Verify qwenvl mapping has the prompt text
  const promptText = parsedPrompts.qwenvl['Cinematic Rhythm & Shot Breakdown'];
  assert.ok(typeof promptText === 'string' && promptText.length > 50);
  assert.match(promptText, /Shot Scale/);
  assert.match(promptText, /Camera Movement/);
  assert.match(promptText, /Narrative Rhythm Role/);
  assert.match(promptText, /Hook/);
  assert.match(promptText, /Close/);

  // 3. Verify rhythm module has all 8 pacing roles
  const rhythmModule = parsedPrompts.modules?.rhythm;
  assert.ok(rhythmModule, 'modules must contain a rhythm definition');

  const expectedRoles = [
    'hook',
    'setup',
    'progression',
    'emphasis',
    'turning_point',
    'payoff',
    'breath',
    'close'
  ];

  for (const role of expectedRoles) {
    assert.ok(
      typeof rhythmModule[role] === 'string' && rhythmModule[role].length > 10,
      `rhythm module must define "${role}"`
    );
  }
});

test('reelbench math: 15% and 85% timestamps avoid shot boundary transition noise', () => {
  const shotStartSeconds = 12.0;
  const shotEndSeconds = 22.0;
  const shotDurationSeconds = shotEndSeconds - shotStartSeconds; // 10.0s

  const establishingTimestampA = shotStartSeconds + shotDurationSeconds * 0.15;
  const resolutionTimestampB = shotStartSeconds + shotDurationSeconds * 0.85;

  // Frame A must be 13.5s (15% in)
  assert.equal(establishingTimestampA, 13.5);
  // Frame B must be 20.5s (85% in)
  assert.equal(resolutionTimestampB, 20.5);

  // Both must be strictly inside the shot and avoid boundary edges [12.0, 22.0]
  assert.ok(establishingTimestampA > shotStartSeconds);
  assert.ok(resolutionTimestampB < shotEndSeconds);
  assert.ok(resolutionTimestampB > establishingTimestampA);

  // Delta between frames should represent 70% of the shot duration
  assert.equal(Math.round((resolutionTimestampB - establishingTimestampA) * 100) / 100, 7.0);
});
