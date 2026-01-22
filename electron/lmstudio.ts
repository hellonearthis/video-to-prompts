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

// ============================================================================
// Analysis Functions
// ============================================================================

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
// Analysis Functions
// ============================================================================

// ============================================================================
// Prompt Management
// ============================================================================

const DEFAULT_PROMPTS = {
    "_preset_prompts": [
        "Tags",
        "Simple Description",
        "Detailed Description",
        "Ultra Detailed Description",
        "Cinematic Description",
        "Detailed Analysis",
        "Video Summary",
        "Short Story",
        "Prompt Refine & Expand",
        "Ultra Cinematic Detailed"
    ],
    "qwenvl": {
        "Tags": "Your task is to generate a clean list of comma-separated tags for a text-to-image AI, based *only* on the visual information in the image. Limit the output to a maximum of 50 unique tags. Strictly describe visual elements like subject, clothing, environment, colors, lighting, and composition. Do not include abstract concepts, interpretations, marketing terms, or technical jargon (e.g., no 'SEO', 'brand-aligned', 'viral potential'). The goal is a concise list of visual descriptors. Avoid repeating tags.",
        "Simple Description": "Analyze the image and write a single concise sentence that describes the main subject and setting. Keep it grounded in visible details only.",
        "Detailed Description": "Write ONE detailed paragraph (6 to 10 sentences). Describe only what is visible: subject(s) and actions; people details if present (approx age group, gender expression if clear, hair, facial expression, pose, clothing, accessories); environment (location type, background elements, time cues); lighting (source, direction, softness/hardness, color temperature, shadows); camera viewpoint (eye-level/low/high, distance) and composition (framing, focal emphasis). No preface, no reasoning, no <think>.",
        "Ultra Detailed Description": "Write ONE ultra-detailed paragraph (10 to 16 sentences, or 180 to 320 words). Stay grounded in visible details. Include: subject micro-details (materials, textures, patterns, wear, reflections); people details if present (hair, skin tones, makeup, jewelry, fabric types, fit); environment depth (foreground/midground/background, signage/props, surface materials); lighting analysis (key/fill/back light, direction, softness, highlights, shadow shape); camera perspective (angle, lens feel, depth of field) and composition (leading lines, negative space, symmetry/asymmetry, visual hierarchy). No preface, no reasoning, no <think>.",
        "Cinematic Description": "Write ONE cinematic paragraph (8 to 12 sentences). Describe the scene like a film still: subject(s) and action; environment and atmosphere; lighting design (practical lights vs ambient, direction, contrast); camera language (shot type, angle, lens feel, depth of field, motion implied); composition and mood. Keep it vivid but factual (no made-up story). No preface, no reasoning, no <think>.",
        "Detailed Analysis": "Output ONLY these sections with short labels (no bullets): Subject; People (if any); Environment; Lighting; Camera/Composition; Color/Texture. In each section, write 2 to 4 sentences of concrete visible details. If something is not visible, write 'not visible'. No preface, no reasoning, no <think>.",
        "Video Summary": "Summarize the key events and narrative points in this video.",
        "Short Story": "Write a short, imaginative story inspired by this image or video.",
        "Prompt Refine & Expand": "Refine and enhance the following user prompt for creative text-to-image generation. Keep the meaning and keywords, make it more expressive and visually rich. Output ONLY the improved prompt text (no preface, no bullets, no JSON, no <think>, no commentary).",
        "Ultra Cinematic Detailed": "Analyze this image with EXTREME focus on visual micro-details. Describe every texture (fabric weave, skin pores, surface weathering), lighting nuance (exact color temperature, shadow fall-off, practical sources), and material quality (reflectivity, roughness). Break down the composition, depth of field, and camera lens characteristics. Output ONE dense, highly descriptive paragraph suitable for high-end generative reproduction. No narrative fluff, just pure visual data."
    }
};

let PROMPTS_CACHE: any = null;
let LAST_SEARCH_LOGS: string[] = [];

const loadPrompts = () => {
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
                    LAST_SEARCH_LOGS.push(`Successfully parsed ${PROMPTS_CACHE._preset_prompts?.length || 0} prompts`);
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

export const getAvailablePrompts = (): { prompts: string[], logs: string[] } => {
    LAST_SEARCH_LOGS = [];
    const data = loadPrompts();
    if (data && data._preset_prompts) {
        return { prompts: data._preset_prompts, logs: LAST_SEARCH_LOGS };
    }
    // Return default prompts if file load failed
    return { prompts: DEFAULT_PROMPTS._preset_prompts, logs: LAST_SEARCH_LOGS };
};

/**
 * Analyzes a single image frame using LM Studio's vision model.
 * 
 * @param imagePath - Absolute path to the image file
 * @param promptType - Optional key for the prompt to use (from qwen_vl3_prompts.json)
 * @returns Promise resolving to analysis result
 */
export const analyzeFrame = async (imagePath: string, promptType?: string): Promise<AnalysisResult> => {
    console.log(`[LM-STUDIO] Analyzing frame: ${imagePath} with prompt: ${promptType || 'Default'}`);

    try {
        // Read image file and convert to base64
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }

        const imageBuffer = fs.readFileSync(imagePath);
        const base64Data = imageBuffer.toString('base64');
        const mimeType = getMimeType(imagePath);

        console.log(`[LM-STUDIO] Image size: ${imageBuffer.length} bytes, type: ${mimeType}`);

        // Load prompts
        let prompts = loadPrompts();
        if (!prompts) prompts = DEFAULT_PROMPTS;
        let promptText = "";

        // Determine prompt to use
        if (promptType && prompts && prompts.qwenvl && prompts.qwenvl[promptType]) {
            promptText = prompts.qwenvl[promptType];

            // If it's the "Detailed Analysis" prompt, we need to guide the JSON output specifically
            // Or if the user expects JSON, we should wrap it.
            // The existing code expects a specific JSON structure.
            // PROMPT ADAPTATION:
            // If the custom prompt doesn't ask for JSON, the parser will fail.
            // We need to decide: does the user want PURE text output for these new prompts?
            // "simple description" says "write a single concise sentence".
            // The existing return type `FrameAnalysis` EXPECTS structure.
            // We might need to adjust the return type or wrap the prompt.

            // STRATEGY: 
            // 1. If strict JSON structure is required (original behavior), we interpret the prompt instructions 
            //    embedded in our system prompt.
            // 2. BUT the new prompts are "Text descriptions".
            //    "Tags", "Simple Description", "Detailed Description" etc.
            //    They return TEXT.
            //    We should probably place this text into the `summary` field or `description` field of the analysis.

            // So we will construct a prompt that asks the model to output JSON where the specific field is populated by the prompt's result.
            // Actually, simpler: Let's ask for JSON, but tell the model to use the "User Prompt" logic to fill the "summary".

            const basePrompt = `Analyze the provided image based on this specific task:
### Task
${promptText}

### Output Requirement
Return ONLY a valid JSON object. Do not include any conversational filler, preface, or markdown code blocks. 

Structure:
{
    "summary": "MANDATORY: Populate this field with the full result of the Task specified above. Do not truncate or summarize.",
    "objects": ["primary object", "secondary object", ...],
    "tags": ["visual tag 1", "visual tag 2", ...],
    "scene_type": "cinematic/portrait/wide/etc",
    "visual_elements": {
        "dominant_colors": ["#hex1", "#hex2"],
        "lighting": "concise lighting summary"
    }
}
Final JSON object:`;

            promptText = basePrompt;

        } else {
            // Default hardcoded prompt
            promptText = `Analyze this image and return ONLY a JSON object with this exact structure:
{
"summary": "A concise description of the image content.",
"objects": ["list", "of", "visible", "objects"],
"tags": ["list", "of", "descriptive", "tags"],
"scene_type": "indoor/outdoor/portrait/etc",
"visual_elements": {
"dominant_colors": ["color1", "color2"],
"lighting": "description of lighting"
}
}
Do not include markdown formatting or explanations.`;
        }


        // Send request to LM Studio
        const response = await fetch(LM_STUDIO_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: await getCurrentModel(),
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: promptText },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:${mimeType};base64,${base64Data}`
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.7,
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            throw new Error(`LM Studio API Error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        let text = result.choices[0].message.content;

        console.log('[LM-STUDIO] Response received');

        // Remove markdown formatting if present
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        // Parse JSON response
        let analysis: FrameAnalysis;
        try {
            analysis = JSON.parse(text);
        } catch (jsonError) {
            console.error('[LM-STUDIO] JSON parse error:', jsonError);
            console.error('[LM-STUDIO] Response text:', text);

            // Fallback for non-JSON responses (if model ignored instructions)
            // We put the whole text into summary
            analysis = {
                summary: text,
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
 * Gets the currently loaded model ID from LM Studio.
 */
async function getCurrentModel(): Promise<string> {
    try {
        const response = await fetch(LM_STUDIO_URL.replace('/chat/completions', '/models'), {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
        });

        if (response.ok) {
            const data = await response.json();
            // LM Studio usually returns the loaded model as the first item or specifically active
            if (data.data && data.data.length > 0) {
                const modelId = data.data[0].id;
                console.log(`[LM-STUDIO] Using model: ${modelId}`);
                return modelId;
            }
        }
    } catch (e) {
        console.warn('[LM-STUDIO] Failed to fetch current model, using fallback');
    }
    return "local-model"; // Fallback
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
