/**
 * llama-server (llama.cpp) Local AI Integration Module
 * 
 * This module provides functions to analyze images using llama-server (llama.cpp)
 * with multimodal vision projector (--mmproj).
 * 
 * Default port: http://localhost:8081 (configurable via LLAMA_SERVER_PORT or LOCAL_AI_URL)
 * Recommended model: Qwen2.5-VL or Qwen3-VL
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import * as electron from 'electron';

// WHAT: Safely extracting the Electron app reference across both Electron and standalone Node / MCP runtimes.
// WHY: When running inside Electron, electron.app provides the getAppPath() API. When running under standalone Node/MCP,
// electron.app is undefined and our fallback paths in cwd() will be utilized instead of crashing.
const electronApp: any = electron.app || (electron as any).default?.app || null;

// ============================================================================
// Configuration
// ============================================================================

const LLAMA_PORT = (typeof process !== 'undefined' && process.env?.LLAMA_SERVER_PORT) || '8081';
export const LLAMA_SERVER_URL = (typeof process !== 'undefined' && process.env?.LOCAL_AI_URL)
    ? `${process.env.LOCAL_AI_URL.replace(/\/+$/, '')}/v1/chat/completions`
    : `http://localhost:${LLAMA_PORT}/v1/chat/completions`;

// Backward-compatible alias
export const LM_STUDIO_URL = LLAMA_SERVER_URL;

// ============================================================================
// Type Definitions
// ============================================================================

export interface OnScreenTextItem {
    text: string;
    placement?: string;
    is_diegetic?: boolean;
}

export interface EvidenceBreakdown {
    observable_facts: string[];
    inferred_intent?: string;
}

/**
 * Analysis result from llama-server vision model.
 */
export interface FrameAnalysis {
    /** Brief description of the image content */
    summary: string;
    /** Output from a specific style transformation (e.g. Poetic, Glitch) */
    styled_content?: string;
    /** Result of a conflict/consistency check */
    consistency_check?: string;
    /** List of detected objects */
    objects: string[];
    /** Descriptive tags */
    tags: string[];
    /** Scene classification (indoor, outdoor, portrait, etc.) */
    scene_type: string;
    /** Visual elements analysis */
    visual_elements: {
        dominant_colors: string[];
        lighting: string;
    };
    /** Cinematic pacing role (hook, setup, progression, emphasis, turning-point, payoff, breath, close) */
    rhythm_role?: string;
    /** Camera movement type (static, push-in, pull-out, pan-left, tracking, etc.) */
    camera_movement?: string;
    /** Shot scale (extreme-wide, wide, medium, close-up, etc.) */
    shot_scale?: string;
    /** Dedicated on-screen text extraction (diegetic vs digital overlay) */
    on_screen_text?: OnScreenTextItem[];
    /** Epistemic grounding: separating observable facts from inferred intent */
    evidence_breakdown?: EvidenceBreakdown;
}

/**
 * Result of an analysis attempt.
 */
export interface AnalysisResult {
    success: boolean;
    path: string;
    analysis?: FrameAnalysis;
    error?: string;
}

/**
 * Options for analysis.
 */
export interface AnalysisOptions {
    style?: string; // e.g., "Poetic", "Glitch"
    refinement?: string; // e.g., "Conflict Check"
}

// ============================================================================
// Comparison Types
// ============================================================================

/**
 * Result of comparing two frames.
 */
export interface ComparisonResult {
    /** Description of action occurring between frames */
    action_description: string;
    /** Camera movement between frames (static, push-in, pull-out, pan-left, tracking, etc.) */
    camera_movement?: string;
    /** Cinematic narrative rhythm role (hook, setup, progression, emphasis, turning-point, payoff, breath, close) */
    rhythm_role?: string;
    /** Shot scale classification (extreme-wide, wide, medium, close-up, etc.) */
    shot_scale?: string;
    /** Analysis of object movement/flow */
    object_flow: string;
    /** Key differences between start and end state */
    differences: string[];
    /** AI confidence score (optional) */
    confidence?: number;
}

/**
 * Result of a comparison attempt.
 */
export interface FrameComparisonResult {
    success: boolean;
    frame1_path: string;
    frame2_path: string;
    comparison?: ComparisonResult;
    error?: string;
}

// ============================================================================
// Prompt Management
// ============================================================================

interface PromptsConfig {
    _preset_prompts: string[];
    modules?: Record<string, Record<string, string>>;
    presets?: Record<string, string[]>;
    styles?: Record<string, string | { system_prompt: string }>;
    refinements?: Record<string, string>;
    qwenvl?: Record<string, string>;
}

const DEFAULT_PROMPTS: PromptsConfig = {
    "_preset_prompts": [
        "Simple Description",
        "Detailed Description"
    ],
    "qwenvl": {
        "Simple Description": "Analyze the image and write a single concise sentence that describes the main subject and setting.",
        "Detailed Description": "Write ONE detailed paragraph regarding the image."
    }
};

let PROMPTS_CACHE: PromptsConfig | null = null;
let LAST_SEARCH_LOGS: string[] = [];

const loadPrompts = (): PromptsConfig | null => {
    if (PROMPTS_CACHE) return PROMPTS_CACHE;
    try {
        const appPath = typeof electronApp?.getAppPath === 'function' ? electronApp.getAppPath() : null;
        const searchPaths = [
            ...(appPath ? [
                path.join(appPath, 'qwen_vl3_prompts.json'),
                path.join(appPath, '..', 'qwen_vl3_prompts.json')
            ] : []),
            path.join(process.cwd(), 'qwen_vl3_prompts.json'),
            path.join(__dirname, 'qwen_vl3_prompts.json'),
            path.join(__dirname, '../qwen_vl3_prompts.json'),
            path.join(__dirname, '../../qwen_vl3_prompts.json'),
            path.join(__dirname, '../../../qwen_vl3_prompts.json'),
            // Fallback for packaged app
            path.join(process.cwd(), 'resources', 'qwen_vl3_prompts.json')
        ];

        LAST_SEARCH_LOGS.push(`Searching for prompts file... (CWD: ${process.cwd()}, __dirname: ${__dirname})`);

        for (const p of searchPaths) {
            LAST_SEARCH_LOGS.push(`Checking path: ${p}`);
            if (fs.existsSync(p)) {
                LAST_SEARCH_LOGS.push(`Found prompts file at: ${p}`);
                const data = fs.readFileSync(p, 'utf-8');
                try {
                    PROMPTS_CACHE = JSON.parse(data);
                    LAST_SEARCH_LOGS.push(`Successfully parsed prompts config`);
                    return PROMPTS_CACHE;
                } catch (jsonErr) {
                    LAST_SEARCH_LOGS.push(`JSON Parse Error for ${p}: ${String(jsonErr)}`);
                    throw jsonErr;
                }
            }
        }
        LAST_SEARCH_LOGS.push('Prompts file not found in any search path');
        return null;
    } catch (e) {
        LAST_SEARCH_LOGS.push(`Failed to load prompts: ${String(e)}`);
        return null;
    }
};

export const getAvailablePrompts = (): {
    prompts: string[],
    styles: string[],
    refinements: string[],
    logs: string[]
} => {
    LAST_SEARCH_LOGS = [];
    const data = loadPrompts();

    const prompts = data?._preset_prompts || DEFAULT_PROMPTS._preset_prompts;
    const styles = data?.styles ? Object.keys(data.styles) : [];
    const refinements = data?.refinements ? Object.keys(data.refinements) : [];

    return { prompts, styles, refinements, logs: LAST_SEARCH_LOGS };
};

/**
 * Resolves a prompt type (string) into a full prompt text string.
 * Handles Legacy prompts and New Modular Presets.
 */
const resolvePromptText = (promptType: string, config: PromptsConfig): string => {
    // 1. Check Legacy (qwenvl)
    if (config.qwenvl && config.qwenvl[promptType]) {
        return config.qwenvl[promptType];
    }

    // 2. Check Modular Presets
    if (config.presets && config.presets[promptType]) {
        const moduleKeys = config.presets[promptType]; // e.g. ["theme.noir", "lighting.cinematic"]
        let assembledPrompt = "Analyze this image with the following specific focus points:\n\n";

        for (const key of moduleKeys) {
            // key format: "category.moduleName" e.g. "lighting.cinematic"
            const [category, moduleName] = key.split('.');
            if (config.modules && config.modules[category] && config.modules[category][moduleName]) {
                assembledPrompt += `- ${config.modules[category][moduleName]}\n`;
            } else if (key.startsWith("modules.") && config.modules) {
                // Handle explicit "modules.category.name" just in case
                const parts = key.split('.');
                if (parts.length === 3 && config.modules[parts[1]] && config.modules[parts[1]][parts[2]]) {
                    assembledPrompt += `- ${config.modules[parts[1]][parts[2]]}\n`;
                }
            } else {
                console.warn(`[LLAMA-SERVER] Warning: Module not found for key '${key}' in preset '${promptType}'`);
            }
        }

        assembledPrompt += "\nSynthesize these observations into a cohesive detailed description.";
        return assembledPrompt;
    }

    // 3. Fallback
    return DEFAULT_PROMPTS.qwenvl!["Simple Description"];
};

// ============================================================================
// Helper Functions & Resilient JSON Parser
// ============================================================================

/**
 * Gets the MIME type for an image file based on extension.
 */
export function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    };
    return mimeTypes[ext] || 'image/png';
}

/**
 * ============================================================================
 * TUTORIAL: RESILIENT JSON RECOVERY & PARSING ENGINE
 * ============================================================================
 */

// WHAT: Scans a potentially truncated JSON string, tracking unclosed braces and brackets,
// and appends the necessary closing delimiters to form syntactically valid JSON.
// WHY: Local Vision-Language Models frequently reach token generation limits or terminate early
// during dense storyboard analyses, leaving unclosed JSON arrays or objects that crash standard JSON.parse.
export function closeUnclosedJson(target_json_string: string): string {
    let unclosed_brace_count = 0;
    let unclosed_bracket_count = 0;
    let is_inside_string_literal = false;
    let is_character_escaped = false;

    // WHAT: Iterate character by character across the string to track string literals and balance counters.
    // WHY: We must distinguish between structural braces ({, }) and braces that appear inside quoted strings.
    for (let character_index = 0; character_index < target_json_string.length; character_index++) {
        const current_character = target_json_string[character_index];

        // WHAT: Handle backslash escape sequences inside string literals.
        // WHY: An escaped quote (\") should not toggle the is_inside_string_literal flag.
        if (is_character_escaped) {
            is_character_escaped = false;
            continue;
        }
        if (current_character === '\\') {
            is_character_escaped = true;
            continue;
        }

        // WHAT: Toggle string literal state upon encountering unescaped double quotes.
        // WHY: Any brackets or braces inside quotation marks belong to content data and must not count as structural syntax.
        if (current_character === '"') {
            is_inside_string_literal = !is_inside_string_literal;
            continue;
        }
        if (is_inside_string_literal) {
            continue;
        }

        // WHAT: Increment and decrement bracket and brace counters based on opening/closing structural tokens.
        // WHY: Keeps track of exactly how many levels of nesting remain unclosed at the end of the text stream.
        if (current_character === '{') {
            unclosed_brace_count++;
        } else if (current_character === '}') {
            unclosed_brace_count = Math.max(0, unclosed_brace_count - 1);
        } else if (current_character === '[') {
            unclosed_bracket_count++;
        } else if (current_character === ']') {
            unclosed_bracket_count = Math.max(0, unclosed_bracket_count - 1);
        }
    }

    let repaired_json_result = target_json_string;

    // WHAT: Close an open string literal if the generator died in the middle of a string value.
    // WHY: An unclosed string literal will invalidate all following closing delimiters.
    if (is_inside_string_literal) {
        repaired_json_result += '"';
    }

    // WHAT: Strip trailing commas right before closing brackets or braces.
    // WHY: In JSON syntax (unlike JavaScript), trailing commas (e.g. {"key": "val",}) are strict syntax errors.
    repaired_json_result = repaired_json_result.replace(/,\s*$/, '');

    // WHAT: Append missing closing square brackets for arrays.
    // WHY: Closes all nested array structures from inside out.
    while (unclosed_bracket_count > 0) {
        repaired_json_result += ']';
        unclosed_bracket_count--;
    }

    // WHAT: Append missing closing curly braces for objects.
    // WHY: Closes all outermost and nested object structures.
    while (unclosed_brace_count > 0) {
        repaired_json_result += '}';
        unclosed_brace_count--;
    }

    return repaired_json_result;
}

// WHAT: Multi-tier resilient JSON parser designed for local Vision-Language Model outputs.
// WHY: Local models output conversational markdown fences, reasoning blocks (<think>),
// unquoted keys, and trailing commas. This function recovers valid data without failing the user workflow.
export function safeParseJson<ParsedResultType>(
    raw_json_input_string: string,
    fallback_default_value?: ParsedResultType
): ParsedResultType {
    // WHAT: Guard against null, undefined, or non-string input payloads.
    // WHY: Prevents runtime TypeError when upstream network responses are empty.
    if (!raw_json_input_string || typeof raw_json_input_string !== 'string') {
        if (fallback_default_value !== undefined) {
            return fallback_default_value;
        }
        throw new Error('Empty or non-string response received from AI model');
    }

    // WHAT: Strip reasoning blocks (<think>...</think>) produced by reasoning models (DeepSeek R1, Qwen 2.5/3 reasoning variants).
    // WHY: Models output chain-of-thought blocks before their JSON payload, which breaks JSON.parse immediately.
    let sanitized_json_string = raw_json_input_string.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // WHAT: Strip markdown code fences (```json ... ``` or ``` ... ```).
    // WHY: LLMs wrap structured outputs in markdown code fences by default unless explicitly instructed otherwise.
    const markdown_code_block_match = sanitized_json_string.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdown_code_block_match && markdown_code_block_match[1]) {
        sanitized_json_string = markdown_code_block_match[1].trim();
    } else {
        sanitized_json_string = sanitized_json_string.replace(/^```[a-zA-Z]*\n?/gm, '').replace(/```$/gm, '').trim();
    }

    // WHAT: Tier 1 parse attempt - standard native JSON.parse on sanitized text.
    // WHY: If the model adhered to strict formatting, native parsing is the fastest and cleanest path.
    try {
        return JSON.parse(sanitized_json_string) as ParsedResultType;
    } catch (_initial_parse_error) {
        // Continue to resilient boundary extraction
    }

    // WHAT: Tier 2 - Extract balanced outermost JSON envelope ({...} or [...]).
    // WHY: Models often include conversational preamble ("Here is your analysis:") or postscripts.
    const first_brace_index = sanitized_json_string.indexOf('{');
    const first_bracket_index = sanitized_json_string.indexOf('[');
    let target_json_substring = sanitized_json_string;

    if (first_brace_index !== -1 && (first_bracket_index === -1 || first_brace_index < first_bracket_index)) {
        const last_brace_index = sanitized_json_string.lastIndexOf('}');
        if (last_brace_index > first_brace_index) {
            target_json_substring = sanitized_json_string.substring(first_brace_index, last_brace_index + 1);
        } else {
            target_json_substring = closeUnclosedJson(sanitized_json_string.substring(first_brace_index));
        }
    } else if (first_bracket_index !== -1) {
        const last_bracket_index = sanitized_json_string.lastIndexOf(']');
        if (last_bracket_index > first_bracket_index) {
            target_json_substring = sanitized_json_string.substring(first_bracket_index, last_bracket_index + 1);
        } else {
            target_json_substring = closeUnclosedJson(sanitized_json_string.substring(first_bracket_index));
        }
    }

    // WHAT: Try native parse on the extracted boundary substring.
    // WHY: Often stripping conversational preamble alone resolves the syntax error.
    try {
        return JSON.parse(target_json_substring) as ParsedResultType;
    } catch (_boundary_parse_error) {
        // Continue to syntax repairs
    }

    // WHAT: Tier 3 - Repair common local AI syntax flaws (unquoted keys, single quotes, comments, trailing commas).
    // WHY: Small local quantized models frequently omit quotes around keys or emit JavaScript-style single quotes.
    const syntactically_repaired_json_string = target_json_substring
        // Strip single-line and multi-line comments
        .replace(/\/\/[^\n\r]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Fix unquoted property names like { foo: "bar" } or , foo: "bar"
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/g, '$1"$2":')
        // Fix single-quoted property names {'foo': "bar"}
        .replace(/(^|[{,]\s*)'([a-zA-Z0-9_-]+)'\s*:/g, '$1"$2":')
        // Fix single-quoted string values
        .replace(/:\s*'([^']*)'/g, ': "$1"')
        // Fix schema placeholder types if the LLM outputted them literally
        .replace(/:\s*boolean\b/gi, ': false')
        .replace(/:\s*number\b/gi, ': 0')
        .replace(/:\s*0-10\b/g, ': 5')
        .replace(/:\s*0-1\s*\(float\)/gi, ': 0.5')
        .replace(/:\s*string\b/gi, ': ""')
        // Remove trailing commas before closing braces/brackets
        .replace(/,\s*([}\]])/g, '$1');

    try {
        return JSON.parse(syntactically_repaired_json_string) as ParsedResultType;
    } catch (_repaired_parse_error) {
        // WHAT: Tier 4 - Try closing unclosed brackets/braces on repaired string.
        // WHY: Handles cases where truncation occurred alongside unquoted keys or trailing commas.
        try {
            return JSON.parse(closeUnclosedJson(syntactically_repaired_json_string)) as ParsedResultType;
        } catch (final_parsing_error) {
            if (fallback_default_value !== undefined) {
                console.warn('[LLAMA-SERVER] JSON parse failed, returning fallback structure.', final_parsing_error);
                return fallback_default_value;
            }
            throw new Error(
                `Failed to parse AI response as JSON: ${final_parsing_error instanceof Error ? final_parsing_error.message : String(final_parsing_error)}\nRaw text: ${raw_json_input_string.substring(0, 300)}...`
            );
        }
    }
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyzes a single image frame using llama-server's vision model.
 * 
 * @param imagePath - Absolute path to the image file
 * @param promptType - Key for the prompt (Preset or Legacy)
 * @param options - Additional options for Styles and Refinement
 */
export const analyzeFrame = async (
    imagePath: string,
    promptType?: string,
    options?: AnalysisOptions
): Promise<AnalysisResult> => {
    console.log(`[LLAMA-SERVER] Analyzing frame: ${imagePath} with prompt: ${promptType || 'Default'}`);

    try {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        const imageBuffer = fs.readFileSync(imagePath);
        const base64Data = imageBuffer.toString('base64');
        const mimeType = getMimeType(imagePath);
        const currentModel = await getCurrentModel();

        // Load prompts
        let prompts = loadPrompts();
        if (!prompts) prompts = DEFAULT_PROMPTS;

        // Resolve Main Vision Prompt
        let visionPromptText = resolvePromptText(promptType || "Simple Description", prompts);

        // Force JSON structure for the main analysis to ensure consistent UI parsing
        // We wrap the resolved text prompt in a JSON-enforcing wrapper.
        const systemWrapper = `
You are an expert computer vision and video analyst following strict evidence-based methodology. 
TASK: ${visionPromptText}

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure:
{
    "summary": "Concrete, detailed description based on the task.",
    "objects": ["list", "of", "visible", "objects"],
    "tags": ["visual_tag1", "visual_tag2"],
    "scene_type": "indoor/outdoor/portrait/etc",
    "visual_elements": {
        "dominant_colors": ["#hex1", "#hex2"],
        "lighting": "concise lighting summary"
    },
    "on_screen_text": [
        { "text": "Exact quote of visible text", "placement": "lower-third/header/center/sign", "is_diegetic": false }
    ],
    "evidence_breakdown": {
        "observable_facts": ["Physical visible action or object 1", "Fact 2"],
        "inferred_intent": "Plausible inference or motivation if applicable (hedged with 'appears to' or 'consistent with')"
    }
}
NO markdown, NO explanations, NO extra text.
`;

        // 1. Call Vision Model
        const visionResponse = await fetch(LLAMA_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: currentModel,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: systemWrapper },
                            {
                                type: "image_url",
                                image_url: { url: `data:${mimeType};base64,${base64Data}` }
                            }
                        ]
                    }
                ],
                temperature: 0.3,
                max_tokens: 4096
            })
        });

        if (!visionResponse.ok) throw new Error(`llama-server API Error (Vision): ${visionResponse.status}`);

        const visionResult = await visionResponse.json();
        const visionText = visionResult?.choices?.[0]?.message?.content || '';

        const fallbackAnalysis: FrameAnalysis = {
            summary: visionText.substring(0, 300) || 'Analyzed frame',
            objects: [],
            tags: [],
            scene_type: 'unknown',
            visual_elements: { dominant_colors: [], lighting: '' },
            on_screen_text: [],
            evidence_breakdown: { observable_facts: [], inferred_intent: '' }
        };

        const analysis = safeParseJson<FrameAnalysis>(visionText, fallbackAnalysis);

        // Deduplicate: remove tags that match objects
        if (analysis.objects && analysis.tags) {
            const objectsLower = analysis.objects.map(o => o.toLowerCase());
            analysis.tags = analysis.tags.filter(
                tag => !objectsLower.includes(tag.toLowerCase())
            );
        }

        // 2. Optional: Second Pass - AI Refinement / Style Transformation
        if (options?.style && prompts.styles && prompts.styles[options.style]) {
            console.log(`[LLAMA-SERVER] Applying style transformation: ${options.style}`);

            const styleDef = prompts.styles[options.style];
            const stylePrompt = typeof styleDef === 'string' ? styleDef : styleDef.system_prompt;

            const stylePayload = {
                model: currentModel,
                messages: [
                    {
                        role: "system",
                        content: "You are a professional creative writer and editor."
                    },
                    {
                        role: "user",
                        content: `${stylePrompt}\n\nOriginal Description:\n"${analysis.summary}"`
                    }
                ],
                temperature: 0.8,
                max_tokens: 2000
            };

            try {
                const styleRes = await fetch(LLAMA_SERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stylePayload)
                });

                if (styleRes.ok) {
                    const styleJson = await styleRes.json();
                    analysis.styled_content = styleJson?.choices?.[0]?.message?.content?.trim();
                }
            } catch (err) {
                console.error('[LLAMA-SERVER] Style transformation failed:', err);
            }
        }

        // 3. Optional: Consistency Check
        if (options?.refinement && prompts.refinements && prompts.refinements[options.refinement]) {
            console.log(`[LLAMA-SERVER] Running refinement check: ${options.refinement}`);

            const refinePrompt = prompts.refinements[options.refinement];

            const refinePayload = {
                model: currentModel,
                messages: [
                    { role: "system", content: "You are a logic enforcement engine." },
                    {
                        role: "user",
                        content: `${refinePrompt}\n\nAnalyzed Content:\n"${analysis.summary}"`
                    }
                ],
                temperature: 0.1
            };

            try {
                const refineRes = await fetch(LLAMA_SERVER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(refinePayload)
                });

                if (refineRes.ok) {
                    const refineJson = await refineRes.json();
                    analysis.consistency_check = refineJson?.choices?.[0]?.message?.content?.trim();
                }
            } catch (err) {
                console.error('[LLAMA-SERVER] Refinement check failed:', err);
            }
        }

        console.log('[LLAMA-SERVER] Analysis complete:', analysis.summary?.substring(0, 50) + '...');

        return {
            success: true,
            path: imagePath,
            analysis
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[LLAMA-SERVER] Error:', errorMessage);

        return {
            success: false,
            path: imagePath,
            error: errorMessage
        };
    }
};

/**
 * Compares two frames to analyze action and flow.
 * 
 * @param frame1Path - Path to the first (start) frame
 * @param frame2Path - Path to the second (end) frame
 * @returns Promise resolving to comparison result
 */
export const compareFrames = async (frame1Path: string, frame2Path: string): Promise<FrameComparisonResult> => {
    console.log('[LLAMA-SERVER] Comparing frames:', frame1Path, '->', frame2Path);

    try {
        if (!fs.existsSync(frame1Path) || !fs.existsSync(frame2Path)) {
            throw new Error(`One or both image files not found`);
        }

        // Prepare images
        const img1Buffer = fs.readFileSync(frame1Path);
        const img1Base64 = img1Buffer.toString('base64');
        const img1Mime = getMimeType(frame1Path);

        const img2Buffer = fs.readFileSync(frame2Path);
        const img2Base64 = img2Buffer.toString('base64');
        const img2Mime = getMimeType(frame2Path);

        const prompt = `You are an expert cinematography and video analyst. Analyze these two sequential video frames (Start Frame and End Frame).
Describe the action taking place between them, the camera movement, the flow of objects, key differences, and the dramatic pacing beat.

Taxonomy Guidelines:
- camera_movement: Choose from ["static", "push-in", "pull-out", "pan-left", "pan-right", "tilt-up", "tilt-down", "tracking", "handheld", "whip-pan", "drone"]
- rhythm_role: Choose from ["hook", "setup", "progression", "emphasis", "turning-point", "payoff", "breath", "close"]
- shot_scale: Choose from ["extreme-wide", "wide", "medium-wide", "medium", "medium-close", "close-up", "extreme-close-up"]

Return ONLY a JSON object with this exact structure:
{
  "action_description": "Detailed description of the action occurring between these frames.",
  "camera_movement": "push-in",
  "rhythm_role": "progression",
  "shot_scale": "medium",
  "object_flow": "Description of how objects have moved or changed.",
  "differences": ["List of specific visual differences", "Difference 2"],
  "confidence": 0.9
}
Do not include markdown formatting.`;

        // Send multi-image request to llama-server
        const response = await fetch(LLAMA_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: await getCurrentModel(),
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: prompt },
                            { type: "text", text: "Start Frame:" },
                            {
                                type: "image_url",
                                image_url: { url: `data:${img1Mime};base64,${img1Base64}` }
                            },
                            { type: "text", text: "End Frame:" },
                            {
                                type: "image_url",
                                image_url: { url: `data:${img2Mime};base64,${img2Base64}` }
                            }
                        ]
                    }
                ],
                temperature: 0.2,
                max_tokens: 2048
            })
        });

        if (!response.ok) {
            throw new Error(`llama-server API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content || '';

        console.log('[LLAMA-SERVER] Comparison response received');

        const fallbackComparison: ComparisonResult = {
            action_description: text.substring(0, 300) || 'Action progression between frames',
            camera_movement: 'static',
            rhythm_role: 'progression',
            shot_scale: 'medium',
            object_flow: 'Visual transition between frame 1 and frame 2',
            differences: ['Transition between frames'],
            confidence: 0.6
        };

        const comparison = safeParseJson<ComparisonResult>(text, fallbackComparison);

        return {
            success: true,
            frame1_path: frame1Path,
            frame2_path: frame2Path,
            comparison
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[LLAMA-SERVER] Comparison Error:', errorMessage);

        return {
            success: false,
            frame1_path: frame1Path,
            frame2_path: frame2Path,
            error: errorMessage
        };
    }
};

/**
 * Analyzes multiple frames in sequence.
 * 
 * @param imagePaths - Array of image file paths
 * @param onProgress - Optional callback for progress updates
 * @returns Promise resolving to array of analysis results
 */
export const analyzeFramesBatch = async (
    imagePaths: string[],
    promptType?: string,
    onProgress?: (current: number, total: number, result: AnalysisResult) => void
): Promise<AnalysisResult[]> => {
    console.log(`[LLAMA-SERVER] Starting batch analysis of ${imagePaths.length} frames with prompt: ${promptType || 'Default'}`);

    const results: AnalysisResult[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const result = await analyzeFrame(imagePaths[i], promptType);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, imagePaths.length, result);
        }
    }

    console.log(`[LLAMA-SERVER] Batch complete: ${results.filter(r => r.success).length}/${results.length} succeeded`);

    return results;
};

/**
 * Checks if llama-server is running and accessible.
 * 
 * @returns Promise resolving to true if llama-server is available
 */
export const checkLlamaServerConnection = async (): Promise<boolean> => {
    try {
        const response = await fetch(LLAMA_SERVER_URL.replace('/chat/completions', '/models'), {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // 3 second timeout
        });
        return response.ok;
    } catch {
        return false;
    }
};

// Backward-compatible alias
export const checkLMStudioConnection = checkLlamaServerConnection;

/**
 * ============================================================================
 * DYNAMIC MODEL DISCOVERY VIA OPENAI-COMPATIBLE API
 * ============================================================================
 * 
 * Queries llama-server's `/v1/models` endpoint to discover which model is currently loaded
 * in active GPU/CPU memory on localhost:8081.
 */
export async function getCurrentModel(): Promise<string> {
    try {
        const modelsApiEndpointUrl = LLAMA_SERVER_URL.replace('/chat/completions', '/models');
        const response = await fetch(modelsApiEndpointUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // Fast 3-second timeout
        });

        if (response.ok) {
            const parsedModelsResponse = await response.json();
            // llama-server returns an array of loaded models under data: [{ id: "...", ... }]
            if (parsedModelsResponse.data && parsedModelsResponse.data.length > 0) {
                const activeLoadedModelId = parsedModelsResponse.data[0].id;
                console.log(`[LLAMA-SERVER] Dynamically discovered active model: ${activeLoadedModelId}`);
                return activeLoadedModelId;
            }
        }
    } catch (discoveryError) {
        console.warn('[LLAMA-SERVER] Dynamic model discovery failed; falling back to "default":', discoveryError);
    }
    return "default";
}

/**
 * ============================================================================
 * LOW-LEVEL MULTIMODAL CHAT COMPLETION CLIENT
 * ============================================================================
 * 
 * Sends an OpenAI-compatible POST request to llama-server's `/v1/chat/completions` endpoint
 * with support for arbitrary multimodal message payloads (interleaved text and base64 images).
 * 
 * @param conversationMessagesArray - Array of OpenAI-format messages [{ role: "system"|"user", content: [...] }]
 * @param samplingTemperature - Creativity parameter (0.0 to 1.0; low values like 0.2-0.4 ensure deterministic JSON output)
 * @param maximumGenerationTokens - Max output tokens for the response text
 * @returns Promise resolving to the model's generated text response
 */
export async function callLlamaServerChat(
    conversationMessagesArray: any[],
    samplingTemperature = 0.4,
    maximumGenerationTokens = 4096
): Promise<string> {
    const currentlyActiveModelIdentifier = await getCurrentModel();

    const completionResponse = await fetch(LLAMA_SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: currentlyActiveModelIdentifier,
            messages: conversationMessagesArray,
            temperature: samplingTemperature,
            max_tokens: maximumGenerationTokens,
        }),
    });

    if (!completionResponse.ok) {
        const errorResponseBodyText = await completionResponse.text().catch(() => '');
        throw new Error(
            `llama-server API Error (HTTP ${completionResponse.status}): ` +
            `${errorResponseBodyText || completionResponse.statusText}`
        );
    }

    const completionResponseBodyJson = await completionResponse.json();
    const generatedMessageTextContent = completionResponseBodyJson?.choices?.[0]?.message?.content;

    if (typeof generatedMessageTextContent !== 'string') {
        throw new Error('llama-server returned empty or malformed message content in choice[0]');
    }

    return generatedMessageTextContent;
}

// Backward-compatible alias
export const callLMStudioChat = callLlamaServerChat;


// ============================================================================
// Narrative Storyboard Analysis
// ============================================================================

export interface KeyEntity {
    name: string;
    type: "person" | "object" | "animal";
    role: "protagonist" | "antagonist" | "context";
    description: string;
}

export interface StoryboardSignal {
    importance: number; // 0-10
    agency: "none" | "reaction" | "decision" | "action" | "failure" | "realisation";
    irreversible: boolean;
    emotional_shift: { from: string; to: string };
}

export interface PanelGuidance {
    panel_count: number;
    panels: {
        panel_index: number;
        role: string;
        description: string;
        best_frame_index: number; // 0-based index of the input frame that best represents this panel
    }[];
    omit_literal_action: boolean;
}

export interface SceneAnalysis {
    scene_id: string;
    summary: {
        what_happened: string;
        change: string;
        implied: string;
        uncertainty: string;
    };
    key_entities: KeyEntity[];
    story_signals: StoryboardSignal;
    panel_guidance: PanelGuidance;
    confidence: number;
}

export interface SequenceAnalysisResult {
    success: boolean;
    analysis?: SceneAnalysis;
    error?: string;
}

/**
 * Analyzes a sequence of frames to infer narrative beats and generate storyboard guidance.
 * This uses the "Story Witness" prompting strategy.
 * 
 * @param framePaths - Array of 3-6 ordered image paths representing a scene
 */
export const analyzeSequence = async (framePaths: string[]): Promise<SequenceAnalysisResult> => {
    console.log(`[LLAMA-SERVER] Analyzing sequence of ${framePaths.length} frames`);

    if (framePaths.length < 2) {
        return { success: false, error: "Sequence analysis requires at least 2 frames." };
    }

    try {
        // Prepare image content for the payload
        const content: any[] = [
            { type: "text", text: "Analyze this sequence of frames." }
        ];

        const imageContent = framePaths.map((fp, index) => {
            if (!fs.existsSync(fp)) throw new Error(`File not found: ${fp}`);
            const mime = getMimeType(fp);
            const b64 = fs.readFileSync(fp).toString('base64');

            return [
                { type: "text", text: `Frame ${index + 1}:` },
                {
                    type: "image_url",
                    image_url: { url: `data:${mime};base64,${b64}` }
                }
            ];
        }).flat();

        content.push(...imageContent);

        const storyWitnessPrompt = `You are a STORY WITNESS and EXPERT CINEMATOGRAPHER.
You are viewing a sequence of ${framePaths.length} frames (indexed 0 to ${framePaths.length - 1}) from a video scene.
Your task is to analyze the narrative flow, character actions, and story beats.

RESPONSE FORMAT: JSON ONLY. Return valid JSON without markdown wrapping or comments.

Analyze the sequence to produce:
1. Narrative Summary:
   - what_happened: Concise objective summary of the action.
   - change: What state changed from start to end?
   - implied: What actions likely happened between frames?
   - uncertainty: What is ambiguous?

2. Key Entities: Identify main characters/objects found in the frames.

3. Story Signals:
   - importance: Integer 0 to 10 evaluating how critical this moment is.
   - agency: String from ("none", "reaction", "decision", "action", "failure", "realisation").
   - irreversible: Boolean true or false.
   - emotional_shift: Object with "from" and "to" strings (e.g. from "Neutral" to "Anxious").

4. Panel Guidance (Crucial):
   - Propose a comic-book style panel layout.
   - Select the Best Frames: Choose which specific frame index (0, 1, 2...) best represents each narrative beat.
   - Choose the frame containing PEAK ACTION or CLEAREST EMOTION.
   - Create enough panels to tell the full story shown in the images.

Strictly adhere to this valid JSON structure (fill in your own analysis values):
{
  "scene_id": "scene_01",
  "summary": {
    "what_happened": "A character reacts to an unexpected motion in the scene.",
    "change": "Initial observation escalates into active focus.",
    "implied": "Movement occurred just out of frame between beats.",
    "uncertainty": "Exact identity of distant background elements."
  },
  "key_entities": [
    {
      "name": "Subject",
      "type": "person",
      "role": "protagonist",
      "description": "Primary figure in the foreground"
    }
  ],
  "story_signals": {
    "importance": 7,
    "agency": "reaction",
    "irreversible": false,
    "emotional_shift": {
      "from": "Neutral",
      "to": "Focused"
    }
  },
  "panel_guidance": {
    "panel_count": 2,
    "panels": [
      {
        "panel_index": 0,
        "role": "Setup",
        "description": "Initial frame establishing subject framing",
        "best_frame_index": 0
      },
      {
        "panel_index": 1,
        "role": "Action",
        "description": "Dynamic shift in movement or gaze",
        "best_frame_index": 1
      }
    ],
    "omit_literal_action": false
  },
  "confidence": 0.85
}
`;

        // Consolidate System Prompt into User Message for better compatibility
        const finalContent = [
            { type: "text", text: storyWitnessPrompt },
            ...content
        ];

        console.log(`[LLAMA-SERVER] Sending request to ${LLAMA_SERVER_URL} with ${framePaths.length} frames`);

        const payload = JSON.stringify({
            model: await getCurrentModel(),
            messages: [
                {
                    role: "user",
                    content: finalContent
                }
            ],
            temperature: 0.2,
            max_tokens: 4096
        });

        console.log(`[LLAMA-SERVER] Payload size: ${(payload.length / 1024 / 1024).toFixed(2)} MB`);

        const response = await fetch(LLAMA_SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LLAMA-SERVER] API Error ${response.status}:`, errorText);
            throw new Error(`llama-server API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const text = result?.choices?.[0]?.message?.content || '';

        const fallbackAnalysis: SceneAnalysis = {
            scene_id: `scene_${Date.now()}`,
            summary: {
                what_happened: text.substring(0, 300) || 'Analyzed sequence of frames',
                change: 'State progression observed across the sequence.',
                implied: 'Continuous action between frames.',
                uncertainty: 'Subtle transitions inferred from visual cues.'
            },
            key_entities: [
                {
                    name: 'Subject',
                    type: 'person',
                    role: 'protagonist',
                    description: 'Primary visual subject in sequence'
                }
            ],
            story_signals: {
                importance: 7,
                agency: 'action',
                irreversible: false,
                emotional_shift: { from: 'Neutral', to: 'Engaged' }
            },
            panel_guidance: {
                panel_count: Math.min(framePaths.length, 3),
                panels: framePaths.slice(0, Math.min(framePaths.length, 3)).map((_, idx) => ({
                    panel_index: idx,
                    role: idx === 0 ? 'Setup' : idx === 1 ? 'Action' : 'Payoff',
                    description: `Scene beat ${idx + 1}`,
                    best_frame_index: idx
                })),
                omit_literal_action: false
            },
            confidence: 0.6
        };

        const analysis: SceneAnalysis = safeParseJson<SceneAnalysis>(text, fallbackAnalysis);

        // Defensive normalization to ensure nested fields exist
        if (!analysis.summary) {
            analysis.summary = fallbackAnalysis.summary;
        }
        if (!analysis.panel_guidance || !Array.isArray(analysis.panel_guidance.panels)) {
            analysis.panel_guidance = fallbackAnalysis.panel_guidance;
        }
        if (!Array.isArray(analysis.key_entities)) {
            analysis.key_entities = fallbackAnalysis.key_entities;
        }
        if (!analysis.story_signals) {
            analysis.story_signals = fallbackAnalysis.story_signals;
        }

        // Generate a deterministic scene_id based on the source frames
        const crypto = await import('crypto');
        const sortedPaths = [...framePaths].sort();
        const hash = crypto.createHash('md5').update(sortedPaths.join(',')).digest('hex');
        analysis.scene_id = `scene_${hash.substring(0, 12)}`;

        console.log(`[LLAMA-SERVER] Sequence analysis complete. ID: ${analysis.scene_id}`);
        return { success: true, analysis };

    } catch (error) {
        console.error('[LLAMA-SERVER] Sequence analysis failed:', error);
        return { success: false, error: String(error) };
    }
};
