/**
 * ============================================================================
 * TUTORIAL: UNIT TESTS FOR MCP SERVER TOOL REGISTRATION & CONTRACTS
 * ============================================================================
 * 
 * WHAT THIS TEST SUITE VERIFIES:
 * Ensures the desktop application's Model Context Protocol (MCP) server
 * exposes all required tool endpoints for pairing with AI agents (Antigravity,
 * Claude Code, Cursor), allowing autonomous video probing and frame analysis.
 * 
 * WHY THIS MATTERS:
 * If a tool signature is accidentally renamed or dropped, external AI agents
 * will fail during automated multi-stage video extraction pipelines.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../../mcpServer.ts';

// WHAT: Validating that all required video analysis and server inspection tools are registered.
// WHY: Ensures the MCP interface remains contract-compatible with AI agent callers.
test('mcpServer: initializes and defines required tool surface', () => {
    assert.ok(server, 'mcpServer instance must exist');

    // @ts-ignore - access internal registered tools for verification
    const registered_tool_identifiers_array: string[] = Object.keys(server._registeredTools || {});

    const expected_mcp_tool_identifiers_array = [
        'probe_video',
        'extract_frames',
        'check_llama_server',
        'check_lm_studio',
        'list_prompt_templates',
        'generate_frame_prompt',
        'compare_consecutive_frames',
        'extract_storyboard',
    ];

    for (const current_expected_tool_name of expected_mcp_tool_identifiers_array) {
        assert.ok(
            registered_tool_identifiers_array.includes(current_expected_tool_name),
            `MCP server must register tool: ${current_expected_tool_name}`
        );
    }
});
