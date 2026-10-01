/**
 * ============================================================================
 * TUTORIAL: UNIT TESTS FOR LOCAL AI CLIENT WITH DYNAMIC DISCOVERY
 * ============================================================================
 * 
 * WHAT THIS MODULE VERIFIES:
 * Tests that LocalAIClient correctly parses models API payloads from both
 * llama-server and LM Studio, handles multimodal vision capability detection,
 * infers vision compatibility from naming patterns, and safely rejects
 * malformed API responses.
 * 
 * WHY THIS IS CRITICAL:
 * Automatic endpoint agility requires reliable JSON parsing of varying `/v1/models`
 * schemas across different inference backends, preventing crashes when probing ports.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalAIClient } from '../../localAiClient.ts';

// WHAT: Verifying dynamic discovery parsing for llama-server responses with multimodal vision capabilities.
// WHY: Ensures capabilities arrays and context token metadata are correctly mapped to DiscoveredModelMetadata.
test('LocalAIClient: parses llama-server response with multimodal capabilities', () => {
    const local_ai_client_instance = new LocalAIClient();
    const sample_llama_server_response_payload = {
        models: [
            {
                name: 'qwen3.5-9b',
                model: 'qwen3.5-9b',
                capabilities: ['completion', 'multimodal']
            }
        ],
        object: 'list',
        data: [
            {
                id: 'qwen3.5-9b',
                aliases: ['qwen3.5-9b', 'default'],
                object: 'model',
                meta: {
                    n_ctx: 8192,
                    n_params: 8953803264
                }
            }
        ]
    };

    const discovered_model_metadata = local_ai_client_instance.parseModelsApiResponse(
        sample_llama_server_response_payload,
        'http://localhost:8080'
    );

    assert.ok(discovered_model_metadata !== null, 'Metadata should not be null');
    assert.equal(discovered_model_metadata.modelIdentifier, 'qwen3.5-9b');
    assert.equal(discovered_model_metadata.supportsMultimodalVision, true);
    assert.equal(discovered_model_metadata.contextWindowTokens, 8192);
    assert.equal(discovered_model_metadata.parameterCount, 8953803264);
    assert.equal(discovered_model_metadata.endpointBaseUrl, 'http://localhost:8080');
    assert.deepEqual(discovered_model_metadata.modelAliasesArray, ['qwen3.5-9b', 'default']);
});

// WHAT: Verifying that text-only models are correctly flagged as lacking multimodal vision.
// WHY: Prevents client workflows from attempting to send vision image payloads to non-vision models.
test('LocalAIClient: parses standard text-only model response', () => {
    const local_ai_client_instance = new LocalAIClient();
    const sample_text_only_response_payload = {
        models: [
            {
                name: 'deepseek-r1-8b',
                model: 'deepseek-r1-8b',
                capabilities: ['completion']
            }
        ],
        object: 'list',
        data: [
            {
                id: 'deepseek-r1-8b',
                aliases: ['deepseek-r1-8b'],
                object: 'model',
                meta: {
                    n_ctx: 16384,
                    n_params: 8000000000
                }
            }
        ]
    };

    const discovered_model_metadata = local_ai_client_instance.parseModelsApiResponse(
        sample_text_only_response_payload,
        'http://localhost:8080'
    );

    assert.ok(discovered_model_metadata !== null);
    assert.equal(discovered_model_metadata.modelIdentifier, 'deepseek-r1-8b');
    assert.equal(discovered_model_metadata.supportsMultimodalVision, false);
    assert.equal(discovered_model_metadata.contextWindowTokens, 16384);
});

// WHAT: Testing fallback vision inference from model identifier naming conventions (e.g. '-vl-').
// WHY: Some third-party server endpoints omit explicit capabilities arrays, so name heuristics provide essential resilience.
test('LocalAIClient: infers vision capability from model identifier naming', () => {
    const local_ai_client_instance = new LocalAIClient();
    const sample_vision_response_without_capabilities = {
        object: 'list',
        data: [
            {
                id: 'qwen2.5-vl-7b-instruct',
                object: 'model'
            }
        ]
    };

    const discovered_model_metadata = local_ai_client_instance.parseModelsApiResponse(
        sample_vision_response_without_capabilities,
        'http://localhost:1234'
    );

    assert.ok(discovered_model_metadata !== null);
    assert.equal(discovered_model_metadata.modelIdentifier, 'qwen2.5-vl-7b-instruct');
    assert.equal(discovered_model_metadata.supportsMultimodalVision, true);
    assert.equal(discovered_model_metadata.endpointBaseUrl, 'http://localhost:1234');
});

// WHAT: Testing graceful handling of empty, null, or malformed API responses.
// WHY: Server probes encounter incomplete TCP streams or 404 pages during startup, which must return null rather than throw.
test('LocalAIClient: returns null safely on malformed API responses', () => {
    const local_ai_client_instance = new LocalAIClient();

    assert.equal(local_ai_client_instance.parseModelsApiResponse(null, 'http://localhost:8080'), null);
    assert.equal(local_ai_client_instance.parseModelsApiResponse({}, 'http://localhost:8080'), null);
    assert.equal(local_ai_client_instance.parseModelsApiResponse({ data: [] }, 'http://localhost:8080'), null);
});
