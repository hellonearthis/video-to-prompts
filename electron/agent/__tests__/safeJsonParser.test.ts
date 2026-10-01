/**
 * ============================================================================
 * TUTORIAL: UNIT TESTS FOR RESILIENT JSON RECOVERY ENGINE
 * ============================================================================
 * 
 * WHAT THIS TEST SUITE VERIFIES:
 * Ensures the multi-tier safeParseJson and closeUnclosedJson utility functions
 * recover well-formed JSON from typical local Vision-Language Model artifacts
 * including markdown code blocks, reasoning chains (<think>), unquoted keys,
 * single quotes, trailing commas, and truncated stream responses.
 * 
 * WHY THIS MATTERS:
 * Small local quantizations and edge reasoning models frequently break strict
 * JSON compliance. A resilient parser prevents crashes and maintains continuous
 * desktop storyboard workflow without user intervention.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { safeParseJson, closeUnclosedJson } from '../../llamaServer.ts';

// WHAT: Verifying standard well-formed JSON parsing.
// WHY: Ensures native parsing fast-path works without regression for clean outputs.
test('safeParseJson: parses clean standard JSON', () => {
    const raw_json_input_string = JSON.stringify({ scene_id: 'scene_01', count: 42 });
    const parsed_json_result = safeParseJson<{ scene_id: string; count: number }>(raw_json_input_string);
    assert.deepEqual(parsed_json_result, { scene_id: 'scene_01', count: 42 });
});

// WHAT: Testing markdown code fence stripping.
// WHY: LLMs wrap structured outputs in ```json ... ``` blocks by default.
test('safeParseJson: extracts from markdown code fences', () => {
    const raw_json_with_code_fences = '```json\n{\n  "summary": "Action beat in hallway"\n}\n```';
    const parsed_json_result = safeParseJson<{ summary: string }>(raw_json_with_code_fences);
    assert.equal(parsed_json_result.summary, 'Action beat in hallway');
});

// WHAT: Stripping reasoning tokens (<think>...</think>) before parsing.
// WHY: Reasoning models (e.g. DeepSeek R1, Qwen reasoning variants) output chain-of-thought blocks first.
test('safeParseJson: strips <think> reasoning tokens before parsing', () => {
    const raw_json_with_thinking_block = '<think>I should analyze the frames and return JSON</think>{"action": "zoom"}';
    const parsed_json_result = safeParseJson<{ action: string }>(raw_json_with_thinking_block);
    assert.equal(parsed_json_result.action, 'zoom');
});

// WHAT: Quoting unquoted object keys in model output.
// WHY: Compact local models often emit JavaScript object literal syntax instead of strict JSON.
test('safeParseJson: repairs unquoted property keys', () => {
    const raw_json_with_unquoted_keys = '{\n  what_happened: "A person turns around",\n  importance: 8\n}';
    const parsed_json_result = safeParseJson<{ what_happened: string; importance: number }>(raw_json_with_unquoted_keys);
    assert.equal(parsed_json_result.what_happened, 'A person turns around');
    assert.equal(parsed_json_result.importance, 8);
});

// WHAT: Converting single-quoted keys and string values to standard double quotes.
// WHY: Python and JavaScript style single quotes fail in standard JSON parsers.
test('safeParseJson: repairs single-quoted keys and strings', () => {
    const raw_json_with_single_quotes = "{'name': 'Subject', 'role': 'protagonist'}";
    const parsed_json_result = safeParseJson<{ name: string; role: string }>(raw_json_with_single_quotes);
    assert.equal(parsed_json_result.name, 'Subject');
    assert.equal(parsed_json_result.role, 'protagonist');
});

// WHAT: Normalizing literal schema placeholder tokens (0-10, boolean, number, float).
// WHY: Models occasionally echo type placeholders back instead of instantiating real values.
test('safeParseJson: repairs schema placeholder tokens (0-10, boolean, number, float)', () => {
    const raw_json_with_placeholder_types = `
{
  "importance": 0-10,
  "irreversible": boolean,
  "count": number,
  "confidence": 0-1 (float)
}
`;
    const parsed_json_result = safeParseJson<any>(raw_json_with_placeholder_types);
    assert.ok(parsed_json_result);
    assert.equal(typeof parsed_json_result.importance, 'number');
    assert.equal(typeof parsed_json_result.irreversible, 'boolean');
    assert.equal(typeof parsed_json_result.count, 'number');
    assert.equal(typeof parsed_json_result.confidence, 'number');
});

// WHAT: Removing trailing commas before closing braces and brackets.
// WHY: Trailing commas are invalid in JSON and are commonly produced by list-generating models.
test('safeParseJson: strips trailing commas', () => {
    const raw_json_with_trailing_commas = '{"items": ["a", "b",], "nested": {"property_number": 1,},}';
    const parsed_json_result = safeParseJson<any>(raw_json_with_trailing_commas);
    assert.deepEqual(parsed_json_result.items, ['a', 'b']);
    assert.equal(parsed_json_result.nested.property_number, 1);
});

// WHAT: Reconstructing closing delimiters when the AI output was truncated mid-generation.
// WHY: Prevents token length limits from discarding a multi-frame storyboard response.
test('safeParseJson: recovers truncated JSON via closeUnclosedJson', () => {
    const truncated_json_input_string = '{"scene_id": "scene_01", "summary": {"what_happened": "Looking';
    const closed_json_reconstructed_string = closeUnclosedJson(truncated_json_input_string);
    assert.ok(closed_json_reconstructed_string.endsWith('"}}'));

    const parsed_json_result = safeParseJson<any>(truncated_json_input_string, { fallbackUsed: true });
    assert.ok(parsed_json_result);
});

// WHAT: Returning an explicit fallback object when output is completely unparseable.
// WHY: Ensures the desktop application continues gracefully rather than crashing on conversational refusal.
test('safeParseJson: returns fallback safely when raw output is unparseable junk', () => {
    const fallback_default_object = { fallbackUsed: true };
    const parsed_json_result = safeParseJson<any>('Sorry, as an AI I cannot analyze this video.', fallback_default_object);
    assert.deepEqual(parsed_json_result, fallback_default_object);
});

// WHAT: Parsing structured on-screen text and epistemic evidence breakdown.
// WHY: Ensures newly integrated vision analysis schema models validate correctly.
test('safeParseJson: parses on_screen_text and evidence_breakdown structures', () => {
    const raw_json_with_evidence_breakdown = `
{
  "summary": "Presenter speaking in studio",
  "on_screen_text": [
    { "text": "CHAPTER 1: INTRODUCTION", "placement": "lower-third", "is_diegetic": false }
  ],
  "evidence_breakdown": {
    "observable_facts": ["Person in suit sitting at wooden desk", "Blue background"],
    "inferred_intent": "Delivering an instructional news update"
  }
}
`;
    const parsed_json_result = safeParseJson<any>(raw_json_with_evidence_breakdown);
    assert.equal(parsed_json_result.on_screen_text.length, 1);
    assert.equal(parsed_json_result.on_screen_text[0].text, 'CHAPTER 1: INTRODUCTION');
    assert.equal(parsed_json_result.on_screen_text[0].is_diegetic, false);
    assert.equal(parsed_json_result.evidence_breakdown.observable_facts.length, 2);
    assert.equal(parsed_json_result.evidence_breakdown.inferred_intent, 'Delivering an instructional news update');
});
