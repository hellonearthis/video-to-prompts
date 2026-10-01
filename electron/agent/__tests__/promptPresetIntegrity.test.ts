/**
 * ============================================================================
 * TUTORIAL: UNIT TESTS FOR PROMPT PRESET & MODULAR SYSTEM INTEGRITY
 * ============================================================================
 * 
 * WHAT THIS TEST SUITE VERIFIES:
 * 1. All composite presets in qwen_vl3_prompts.json have valid references to defined atomic modules.
 * 2. All presets listed in _preset_prompts resolve to a concrete prompt either in qwenvl or presets.
 * 3. All styles and refinements have substantive, non-empty instruction texts.
 * 
 * WHY THIS IS ESSENTIAL:
 * The modular prompt system decouples domain instructions into atomic building blocks.
 * A typo in a module key or preset definition would produce empty prompts at runtime,
 * severely degrading Vision-Language Model inference quality without an explicit error.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const current_module_filename = fileURLToPath(import.meta.url);
const current_directory_path = path.dirname(current_module_filename);
const project_root_directory_path = path.resolve(current_directory_path, '../../../');

// WHAT: Verifying that every composite preset references valid atomic modules.
// WHY: Ensures prompt assembly in llamaServer.ts never encounters undefined keys.
test('prompt preset integrity: all modular presets point to existing modules', () => {
    const prompts_configuration_file_path = path.join(project_root_directory_path, 'qwen_vl3_prompts.json');
    assert.ok(fs.existsSync(prompts_configuration_file_path), 'qwen_vl3_prompts.json must exist');

    const loaded_prompts_configuration_object = JSON.parse(fs.readFileSync(prompts_configuration_file_path, 'utf8'));
    const available_module_dictionary = loaded_prompts_configuration_object.modules || {};
    const declared_preset_collection = loaded_prompts_configuration_object.presets || {};

    for (const [current_preset_name, composite_module_keys_array] of Object.entries(declared_preset_collection)) {
        assert.ok(
            Array.isArray(composite_module_keys_array),
            `Preset ${current_preset_name} must be an array of module keys`
        );
        assert.ok(
            composite_module_keys_array.length > 0,
            `Preset ${current_preset_name} must have at least one module key`
        );

        for (const atomic_module_lookup_key of composite_module_keys_array as string[]) {
            const key_components_array = atomic_module_lookup_key.split('.');
            let category_identifier = key_components_array[0];
            let module_identifier = key_components_array[1];

            // Handle optional "modules.category.name" prefixing
            if (category_identifier === 'modules' && key_components_array.length === 3) {
                category_identifier = key_components_array[1];
                module_identifier = key_components_array[2];
            }

            assert.ok(
                available_module_dictionary[category_identifier],
                `Preset "${current_preset_name}" references unknown module category "${category_identifier}" from key "${atomic_module_lookup_key}"`
            );
            assert.ok(
                available_module_dictionary[category_identifier][module_identifier],
                `Preset "${current_preset_name}" references unknown module "${module_identifier}" in category "${category_identifier}" from key "${atomic_module_lookup_key}"`
            );
            assert.ok(
                typeof available_module_dictionary[category_identifier][module_identifier] === 'string' &&
                available_module_dictionary[category_identifier][module_identifier].length > 10,
                `Module "${category_identifier}.${module_identifier}" must have a descriptive instruction string`
            );
        }
    }
});

// WHAT: Verifying that all presets declared in _preset_prompts exist as runnable prompts.
// WHY: The UI dropdown is populated directly from _preset_prompts; missing entries would cause UI selection errors.
test('prompt preset integrity: all presets in _preset_prompts exist in qwenvl or presets', () => {
    const prompts_configuration_file_path = path.join(project_root_directory_path, 'qwen_vl3_prompts.json');
    const loaded_prompts_configuration_object = JSON.parse(fs.readFileSync(prompts_configuration_file_path, 'utf8'));

    const declared_prompt_presets_array: string[] = loaded_prompts_configuration_object._preset_prompts || [];
    const legacy_qwenvl_prompts_dictionary = loaded_prompts_configuration_object.qwenvl || {};
    const modular_presets_dictionary = loaded_prompts_configuration_object.presets || {};

    for (const current_preset_name of declared_prompt_presets_array) {
        if (current_preset_name.startsWith('---')) {
            continue; // Skip UI section divider entries
        }
        const preset_exists_in_configuration = Boolean(
            legacy_qwenvl_prompts_dictionary[current_preset_name] || modular_presets_dictionary[current_preset_name]
        );
        assert.ok(
            preset_exists_in_configuration,
            `Declared preset "${current_preset_name}" is neither in qwenvl nor in presets`
        );
    }
});

// WHAT: Verifying that second-pass styles and refinements contain valid prompt strings.
// WHY: Empty style definitions would trigger second-pass LLM requests that return no stylistic changes.
test('prompt preset integrity: styles and refinements are non-empty', () => {
    const prompts_configuration_file_path = path.join(project_root_directory_path, 'qwen_vl3_prompts.json');
    const loaded_prompts_configuration_object = JSON.parse(fs.readFileSync(prompts_configuration_file_path, 'utf8'));

    for (const [style_option_name, style_definition_object] of Object.entries(loaded_prompts_configuration_object.styles || {})) {
        if (typeof style_definition_object === 'string') {
            assert.ok(style_definition_object.length > 10, `Style "${style_option_name}" must have a non-empty string definition`);
        } else if (typeof style_definition_object === 'object' && style_definition_object !== null) {
            assert.ok(
                typeof (style_definition_object as any).system_prompt === 'string' &&
                (style_definition_object as any).system_prompt.length > 10,
                `Style "${style_option_name}" must have a valid system_prompt string`
            );
        }
    }

    for (const [refinement_option_name, refinement_prompt_instruction_string] of Object.entries(loaded_prompts_configuration_object.refinements || {})) {
        assert.ok(
            typeof refinement_prompt_instruction_string === 'string' && refinement_prompt_instruction_string.length > 10,
            `Refinement "${refinement_option_name}" must have a non-empty string prompt`
        );
    }
});
