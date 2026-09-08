/**
 * ============================================================================
 * TUTORIAL & ARCHITECTURAL GUIDE: AGENTIC STORYBOARD CONFIGURATION
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * This module defines the global configuration constants, sampling thresholds,
 * token budgets, and safety caps for the autonomous "Smart Storyboard Extractor" pipeline.
 * 
 * WHY THESE NUMBERS MATTER (THE 16GB VRAM LOCAL MODEL REALITY):
 * Local Vision-Language Models (such as Qwen2.5-VL and Qwen3-VL 8B) hosted inside
 * LM Studio run on top of llama.cpp. In local multi-modal inference:
 * 1. Each image frame downscaled to 640x360 consumes ~400 to 800 vision tokens.
 * 2. A coarse pass of 16 frames already consumes ~8,000 to 12,000 context tokens.
 * 3. A zoom window of 10 frames consumes an additional ~5,000 to 8,000 context tokens.
 * 
 * If context sizes balloon beyond 20k-24k tokens on an 8B model with 4-bit or 8-bit
 * quantization on consumer GPUs (e.g., RTX 3080/4070 with 16GB VRAM), inference
 * either throws Out-Of-Memory (CUDA OOM) or spills KV-cache into system RAM,
 * causing generation latency to drop from 30 tokens/sec down to 0.5 tokens/sec.
 * 
 * Therefore, these values are mathematically tuned to keep every single model call
 * safely under 16,000 context tokens while maintaining maximum temporal precision.
 */

/**
 * The base URL for the local LM Studio server.
 * LM Studio provides an OpenAI-compatible REST API.
 */
export const LM_STUDIO_BASE_URL = "http://localhost:1234/v1";

/**
 * The specific chat completions endpoint used for multi-modal inference.
 */
export const LM_STUDIO_CHAT_COMPLETIONS_URL = "http://localhost:1234/v1/chat/completions";
export const LM_STUDIO_URL = LM_STUDIO_CHAT_COMPLETIONS_URL; // Backward-compatible alias

/**
 * ============================================================================
 * PHASE A: WHOLE-VIDEO COARSE PASS CONFIGURATION
 * ============================================================================
 * 
 * WHAT:
 * The maximum number of frames extracted during the initial whole-video scan.
 * 
 * WHY 16 FRAMES (AND NOT A FIXED 1 FPS)?
 * - If we extracted at a fixed 1 FPS on a 4-minute video, we would send 240 images,
 *   which would require ~150,000 vision tokens and instantly crash local VRAM.
 * - By extracting exactly 16 evenly-spaced interval midpoints, the cost and context
 *   growth remain 100% predictable regardless of whether the video is 30 seconds
 *   or 5 minutes long (~10,000 tokens total for Phase A).
 */
export const COARSE_PASS_MAX_FRAMES_COUNT = 16;
export const COARSE_MAX_FRAMES = COARSE_PASS_MAX_FRAMES_COUNT; // Backward-compatible alias

/**
 * ============================================================================
 * PHASE B: PER-CANDIDATE ZOOM REFINEMENT CONFIGURATION
 * ============================================================================
 * 
 * WHAT:
 * Defines the temporal window and frame-rate when zooming into a candidate turning point.
 * 
 * WHY +/- 3 SECONDS AT 4 FPS?
 * - Human dramatic actions (a reaction, a vehicle crash, an object reveal) typically
 *   unfold over 2 to 4 seconds. A 6-second total window (+/- 3s around the anchor)
 *   guarantees that the critical peak action is captured.
 * - Sampling at 4 FPS across 6 seconds produces ~10 frames when capped at ZOOM_MAX_FRAMES.
 *   This provides 250-millisecond temporal resolution, which is more than enough
 *   for an editor to pick the peak dramatic frame, while keeping vision tokens under 8,000.
 */
export const ZOOM_WINDOW_MAX_FRAMES_COUNT = 10;
export const ZOOM_MAX_FRAMES = ZOOM_WINDOW_MAX_FRAMES_COUNT;

export const ZOOM_WINDOW_SAMPLING_FPS = 4;
export const ZOOM_MAX_FPS = ZOOM_WINDOW_SAMPLING_FPS;

export const ZOOM_WINDOW_HALF_DURATION_SECONDS = 3;
export const ZOOM_DEFAULT_WINDOW_SEC = ZOOM_WINDOW_HALF_DURATION_SECONDS;

/**
 * ============================================================================
 * SAFETY CAPS & BUDGET CONTROLS
 * ============================================================================
 * 
 * WHAT:
 * Strict upper bounds on iterations, candidates, and zoom calls.
 * 
 * WHY WE NEED STRICT GLOBAL BUDGETS:
 * Autonomous agents can enter infinite loops if the model repeatedly requests zooms.
 * 1. MAX_CANDIDATES_DEFAULT limits how many storyboard beats are analyzed (typically 4-5).
 * 2. MAX_ZOOM_ITERATIONS_PER_CANDIDATE ensures the model only gets up to 2 zoom attempts
 *    before forced convergence.
 * 3. MAX_GLOBAL_ZOOM_CALLS_BUDGET enforces an absolute ceiling across the entire run.
 *    Even if all candidates request zooms, the total run will never exceed 8 zoom calls.
 */
export const MAX_CANDIDATES_DEFAULT = 5;
export const MAX_CANDIDATES = MAX_CANDIDATES_DEFAULT;

export const MAX_ZOOM_ITERATIONS_PER_CANDIDATE = 2;

export const MAX_GLOBAL_ZOOM_CALLS_BUDGET = 8;
export const MAX_TOTAL_ZOOM_CALLS = MAX_GLOBAL_ZOOM_CALLS_BUDGET;

/**
 * ============================================================================
 * RESOLUTION & DOWN-SCALING
 * ============================================================================
 * 
 * WHAT:
 * The maximum bounding box for frames sent to the vision-language model.
 * 
 * WHY 640x360?
 * Feeding full 4K or 1080p images into local VLMs provides almost zero extra narrative
 * comprehension while consuming 4x to 8x more vision patch tokens and VRAM.
 * Downscaling to 640x360 preserves character faces, gestures, and cinematic composition
 * with minimal token overhead. Full-resolution frames are only extracted at the very end
 * when saving the winning storyboard entry!
 */
export const MODEL_INPUT_FRAME_RESOLUTION = { width: 640, height: 360 };
export const FRAME_RESOLUTION = MODEL_INPUT_FRAME_RESOLUTION;

/**
 * ============================================================================
 * PROMPT PRESETS & VIDEO DURATION THRESHOLDS
 * ============================================================================
 */

/**
 * Default prompt preset from qwen_vl3_prompts.json used for the final prompt generation pass.
 */
export const DEFAULT_PROMPT_PRESET_NAME = "Ultra Cinematic Detailed";
export const DEFAULT_PROMPT_PRESET = DEFAULT_PROMPT_PRESET_NAME;

/**
 * Videos longer than 5 minutes (300 seconds) have too much temporal sparsity
 * with only 16 coarse frames. If a video exceeds this threshold, the pipeline
 * alerts the user and prioritizes transcript dialogue timestamps as candidate cues.
 */
export const LONG_VIDEO_THRESHOLD_SECONDS = 300;
export const LONG_VIDEO_THRESHOLD_SEC = LONG_VIDEO_THRESHOLD_SECONDS;

/**
 * ============================================================================
 * PROMPT CACHE & TOKEN HYGIENE (MYCLAW PLAYBOOK OPTIMIZATIONS)
 * ============================================================================
 * 
 * WHAT:
 * Standardized system prompt prefix and localized context boundaries.
 * 
 * WHY PROMPT CACHE PREFIX STABILITY MATTERS:
 * Local LLM inference engines like llama.cpp / LM Studio support prefix prompt caching.
 * When the beginning tokens of consecutive chat requests are byte-for-byte identical,
 * the model reuses the existing KV-cache directly from VRAM instead of re-evaluating
 * the entire system prompt. Keeping this prefix static across Phase A and Phase B
 * saves significant processing time and prevents KV cache churn.
 */
export const AGENT_SYSTEM_PROMPT_PREFIX =
  "You are an autonomous video understanding agent. You always respond in valid JSON.";

/**
 * WHAT:
 * The half-window duration (in seconds) used to extract localized dialogue snippets
 * in Phase B candidate refinement.
 * 
 * WHY A +/- 8 SECOND WINDOW?
 * Instead of dumping the entire video's transcript into Phase B (which creates useless
 * context accumulation as warned by the MyClaw Playbook), a +/- 8s window extracts ONLY
 * the spoken lines directly preceding and following the candidate turning point.
 */
export const LOCAL_DIALOGUE_HALF_WINDOW_SECONDS = 8;
