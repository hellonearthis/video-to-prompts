/**
 * LM Studio AI Integration Module
 * 
 * This module provides functions to analyze images using LM Studio's
 * OpenAI-compatible API with vision models.
 * 
 * LM Studio runs locally at http://localhost:1234 and provides an
 * API compatible with OpenAI's chat completions format.
 * 
 * Recommended model: qwen/qwen3-vl-4b
 */

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

// ============================================================================
// Configuration
// ============================================================================

/** LM Studio API endpoint (default local instance) */
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Analysis result from LM Studio vision model.
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
        const searchPaths = [
            path.join(app.getAppPath(), 'qwen_vl3_prompts.json'),
            path.join(app.getAppPath(), '..', 'qwen_vl3_prompts.json'),
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
                console.warn(`[LM-STUDIO] Warning: Module not found for key '${key}' in preset '${promptType}'`);
            }
        }

        assembledPrompt += "\nSynthesize these observations into a cohesive detailed description.";
        return assembledPrompt;
    }

    // 3. Fallback
    return DEFAULT_PROMPTS.qwenvl!["Simple Description"];
};

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyzes a single image frame using LM Studio's vision model.
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
    console.log(`[LM-STUDIO] Analyzing frame: ${imagePath} with prompt: ${promptType || 'Default'}`);

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
You are a computer vision expert. 
TASK: ${visionPromptText}

OUTPUT FORMAT:
Return ONLY a valid JSON object with this structure:
{
    "summary": "The main detailed description based on the task.",
    "objects": ["list", "of", "visible", "objects"],
    "tags": ["visual_tag1", "visual_tag2"],
    "scene_type": "indoor/outdoor/etc",
    "visual_elements": {
        "dominant_colors": ["#hex1", "#hex2"],
        "lighting": "concise lighting summary"
    }
}
NO markdown, NO explanations, NO extra text.
`;

        // 1. Call Vision Model
        const visionResponse = await fetch(LM_STUDIO_URL, {
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
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!visionResponse.ok) throw new Error(`LM Studio API Error (Vision): ${visionResponse.status}`);

        const visionResult = await visionResponse.json();
        let visionText = visionResult.choices[0].message.content;

        // Clean and Parse JSON
        visionText = visionText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        let analysis: FrameAnalysis;

        try {
            analysis = JSON.parse(visionText);
        } catch (e) {
            console.warn('[LM-STUDIO] Failed to parse JSON, using fallback.', e);
            analysis = {
                summary: visionText,
                objects: [],
                tags: [],
                scene_type: 'unknown',
                visual_elements: { dominant_colors: [], lighting: '' }
            };
        }

        // Deduplicate: remove tags that match objects
        if (analysis.objects && analysis.tags) {
            const objectsLower = analysis.objects.map(o => o.toLowerCase());
            analysis.tags = analysis.tags.filter(
                tag => !objectsLower.includes(tag.toLowerCase())
            );
        }

        // 2. Optional: Second Pass - AI Refinement / Style Transformation
        // Using the same model (assuming it has text capabilities, which Qwen-VL does)
        if (options?.style && prompts.styles && prompts.styles[options.style]) {
            console.log(`[LM-STUDIO] Applying style transformation: ${options.style}`);

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
                const styleRes = await fetch(LM_STUDIO_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(stylePayload)
                });

                if (styleRes.ok) {
                    const styleJson = await styleRes.json();
                    analysis.styled_content = styleJson.choices[0].message.content.trim();
                }
            } catch (err) {
                console.error('[LM-STUDIO] Style transformation failed:', err);
            }
        }

        // 3. Optional: Consistency Check
        if (options?.refinement && prompts.refinements && prompts.refinements[options.refinement]) {
            console.log(`[LM-STUDIO] Running refinement check: ${options.refinement}`);

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
                const refineRes = await fetch(LM_STUDIO_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(refinePayload)
                });

                if (refineRes.ok) {
                    const refineJson = await refineRes.json();
                    analysis.consistency_check = refineJson.choices[0].message.content.trim();
                }
            } catch (err) {
                console.error('[LM-STUDIO] Refinement check failed:', err);
            }
        }

        console.log('[LM-STUDIO] Analysis complete:', analysis.summary?.substring(0, 50) + '...');

        return {
            success: true,
            path: imagePath,
            analysis
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[LM-STUDIO] Error:', errorMessage);

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
    console.log('[LM-STUDIO] Comparing frames:', frame1Path, '->', frame2Path);

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

        // Build prompt for action analysis
        const prompt = `You are an expert video analyst. Analyze these two sequential video frames (Start Frame and End Frame).
Describe the action taking place between them, the flow of objects, and key differences.

Return ONLY a JSON object with this exact structure:
{
  "action_description": "Detailed description of the action occurring between these frames.",
  "object_flow": "Description of how objects have moved or changed.",
  "differences": ["List of specific visual differences", "Difference 2"],
  "confidence": 0.9
}
Do not include markdown formatting.`;

        // Send multi-image request to LM Studio
        // Note: This requires a model that supports multi-image input (like qwen-vl-chat or llava)
        const response = await fetch(LM_STUDIO_URL, {
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
                temperature: 0.6,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`LM Studio API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        let text = result.choices[0].message.content;

        console.log('[LM-STUDIO] Comparison response received');

        // Cleanup markdown
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Parse JSON
        let comparison: ComparisonResult;
        try {
            comparison = JSON.parse(text);
        } catch (jsonError) {
            console.error('[LM-STUDIO] JSON parse error:', jsonError);
            console.error('[LM-STUDIO] Response text:', text);
            throw new Error('Failed to parse AI response as JSON');
        }

        return {
            success: true,
            frame1_path: frame1Path,
            frame2_path: frame2Path,
            comparison
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[LM-STUDIO] Comparison Error:', errorMessage);

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
    console.log(`[LM-STUDIO] Starting batch analysis of ${imagePaths.length} frames with prompt: ${promptType || 'Default'}`);

    const results: AnalysisResult[] = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const result = await analyzeFrame(imagePaths[i], promptType);
        results.push(result);

        if (onProgress) {
            onProgress(i + 1, imagePaths.length, result);
        }
    }

    console.log(`[LM-STUDIO] Batch complete: ${results.filter(r => r.success).length}/${results.length} succeeded`);

    return results;
};

/**
 * Checks if LM Studio is running and accessible.
 * 
 * @returns Promise resolving to true if LM Studio is available
 */
export const checkLMStudioConnection = async (): Promise<boolean> => {
    try {
        const response = await fetch(LM_STUDIO_URL.replace('/chat/completions', '/models'), {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // 3 second timeout
        });
        return response.ok;
    } catch {
        return false;
    }
};

/**
/**
 * ============================================================================
 * TUTORIAL: DYNAMIC MODEL DISCOVERY VIA LM STUDIO API
 * ============================================================================
 * 
 * WHAT THIS DOES:
 * Queries LM Studio's `/v1/models` endpoint to discover which model is currently loaded
 * in active GPU/CPU memory on localhost:1234.
 * 
 * WHY DYNAMIC DISCOVERY IS BETTER THAN A HARDCODED MODEL STRING:
 * In LM Studio, users frequently switch between different vision models
 * (e.g. "qwen2.5-vl-7b-instruct", "qwen3-vl-8b", "llava-v1.6-34b").
 * If the application sent completions requests with a hardcoded model identifier,
 * LM Studio would reject the request with a 404/400 "Model Not Loaded" error.
 * By querying `/v1/models` first, we automatically bind to whatever vision model
 * the user has booted in the LM Studio GUI!
 */
export async function getCurrentModel(): Promise<string> {
    try {
        const modelsApiEndpointUrl = LM_STUDIO_URL.replace('/chat/completions', '/models');
        const response = await fetch(modelsApiEndpointUrl, {
            method: 'GET',
            signal: AbortSignal.timeout(3000) // Fast 3-second timeout
        });

        if (response.ok) {
            const parsedModelsResponse = await response.json();
            // LM Studio returns an array of loaded models under data: [{ id: "...", ... }]
            if (parsedModelsResponse.data && parsedModelsResponse.data.length > 0) {
                const activeLoadedModelId = parsedModelsResponse.data[0].id;
                console.log(`[LM-STUDIO] Dynamically discovered active model: ${activeLoadedModelId}`);
                return activeLoadedModelId;
            }
        }
    } catch (discoveryError) {
        console.warn('[LM-STUDIO] Dynamic model discovery failed; falling back to "local-model":', discoveryError);
    }
    return "local-model"; // Fallback identifier accepted by LM Studio
}

/**
 * ============================================================================
 * TUTORIAL: LOW-LEVEL MULTIMODAL CHAT COMPLETION CLIENT
 * ============================================================================
 * 
 * WHAT THIS DOES:
 * Sends an OpenAI-compatible POST request to LM Studio's `/v1/chat/completions` endpoint
 * with support for arbitrary multimodal message payloads (interleaved text and base64 images).
 * 
 * WHY WE DIRECTLY FETCH INSTEAD OF USING A HEAVY NPM CLIENT LIBRARY:
 * Electron's main process runs in Node 18+, where native `fetch()` is built-in.
 * By using native `fetch()` rather than the bulky `openai` npm package, we:
 * 1. Eliminate heavy node_modules dependencies.
 * 2. Avoid version conflicts with Node's native HTTP stream implementations.
 * 3. Have complete, unconstrained control over raw payload structure and timeouts.
 * 
 * @param conversationMessagesArray - Array of OpenAI-format messages [{ role: "system"|"user", content: [...] }]
 * @param samplingTemperature - Creativity parameter (0.0 to 1.0; low values like 0.2-0.4 ensure deterministic JSON output)
 * @param maximumGenerationTokens - Max output tokens for the response text
 * @returns Promise resolving to the model's generated text response
 */
export async function callLMStudioChat(
    conversationMessagesArray: any[],
    samplingTemperature = 0.4,
    maximumGenerationTokens = 4096
): Promise<string> {
    const currentlyActiveModelIdentifier = await getCurrentModel();

    const completionResponse = await fetch(LM_STUDIO_URL, {
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
            `LM Studio API Error (HTTP ${completionResponse.status}): ` +
            `${errorResponseBodyText || completionResponse.statusText}`
        );
    }

    const completionResponseBodyJson = await completionResponse.json();
    const generatedMessageTextContent = completionResponseBodyJson?.choices?.[0]?.message?.content;

    if (typeof generatedMessageTextContent !== 'string') {
        throw new Error('LM Studio returned empty or malformed message content in choice[0]');
    }

    return generatedMessageTextContent;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the MIME type for an image file based on extension.
 */
function getMimeType(filePath: string): string {
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
    console.log(`[LM-STUDIO] Analyzing sequence of ${framePaths.length} frames`);

    if (framePaths.length < 2) {
        return { success: false, error: "Sequence analysis requires at least 2 frames." };
    }

    try {
        // Prepare image content for the payload
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

RESPONSE FORMAT: JSON ONLY.

Analyze the sequence to produce:
1.  **Narrative Summary**:
    *   \`what_happened\`: Concise objective summary of the action.
    *   \`change\`: What state changed from start to end?
    *   \`implied\`: What actions likely happened *between* frames?
    *   \`uncertainty\`: What is ambiguous?

2.  **Key Entities**: Identify main characters/objects found in the frames.

3.  **Story Signals**:
    *   Importance (0-10): How critical is this moment?
    *   Agency: Who is driving the action?
    *   Emotional Shift: e.g., "Neutral -> Anxious"

4.  **Panel Guidance (Crucial)**:
    *   Propose a comic-book style panel layout.
    *   **Select the Best Frames**: You MUST choose which specific frame index (0, 1, 2...) best represents each narrative beat.
    *   **Selection Criteria**: 
        *   Choose the frame that contains the **PEAK ACTION** or **CLEAREST EMOTION**.
        *   Do NOT just pick the first available frame.
        *   If the provided frames don't perfectly match the beat, pick the closest one that provides visual evidence.
    *   Create enough panels to tell the full story shown in the images.

SCHEMA:
{
  "scene_id": "auto_generated_id",
  "summary": { "what_happened": "...", "change": "...", "implied": "...", "uncertainty": "..." },
  "key_entities": [ { "name": "...", "type": "person/object", "role": "protagonist/antagonist", "description": "..." } ],
  "story_signals": {
    "importance": 0-10,
    "agency": "string",
    "irreversible": boolean,
    "emotional_shift": { "from": "...", "to": "..." }
  },
  "panel_guidance": {
    "panel_count": number,
    "panels": [
       { 
         "panel_index": 0, 
         "role": "Setup/Action/Reaction", 
         "description": "Visual description of this panel", 
         "best_frame_index": number 
       }
    ],
    "omit_literal_action": boolean
  },
  "confidence": 0-1 (float)
}
`;

        // Consolidate System Prompt into User Message for better compatibility
        const finalContent = [
            { type: "text", text: storyWitnessPrompt },
            ...content
        ];

        console.log(`[LM-STUDIO] Sending request to ${LM_STUDIO_URL} with ${framePaths.length} frames`);

        const payload = JSON.stringify({
            model: await getCurrentModel(),
            messages: [
                {
                    role: "user",
                    content: finalContent
                }
            ],
            temperature: 0.7,
            max_tokens: 1000
        });

        console.log(`[LM-STUDIO] Payload size: ${(payload.length / 1024 / 1024).toFixed(2)} MB`);

        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[LM-STUDIO] API Error ${response.status}:`, errorText);
            throw new Error(`LM Studio API Error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        let text = result.choices[0].message.content;

        // Clean markdown
        text = text.replace(/```json\n ? /g, '').replace(/```\n?/g, '').trim();

        const analysis: SceneAnalysis = JSON.parse(text);

        // Generate a deterministic scene_id based on the source frames
        // This ensures that re-analyzing the same frames results in the same identity
        const crypto = await import('crypto');
        const sortedPaths = [...framePaths].sort();
        const hash = crypto.createHash('md5').update(sortedPaths.join(',')).digest('hex');
        analysis.scene_id = `scene_${hash.substring(0, 12)}`;

        console.log(`[LM-STUDIO] Sequence analysis complete. ID: ${analysis.scene_id}`);
        return { success: true, analysis };

    } catch (error) {
        console.error('[LM-STUDIO] Sequence analysis failed:', error);
        return { success: false, error: String(error) };
    }
};
