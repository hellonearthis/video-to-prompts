/**
 * ============================================================================
 * TUTORIAL & DATA CONTRACT GUIDE: AGENTIC STORYBOARD TYPE SYSTEM
 * ============================================================================
 * 
 * WHAT THIS FILE DOES:
 * This file defines the TypeScript interfaces and discriminated unions that govern
 * the entire lifecycle of an autonomous storyboard extraction run.
 * 
 * THE CORE DATA PIPELINE (HOW DATA FLOWS):
 * 
 * 1. INPUTS:
 *    Video File + Optional Subtitle File (.srt)
 *      │
 *      ▼
 * 2. TRANSCRIPT INGESTION (electron/agent/transcriptImport.ts):
 *    Produces: TranscriptSegment[]
 *    Normalized timestamps in floating-point seconds + cleaned dialogue text.
 *      │
 *      ▼
 * 3. COARSE WHOLE-VIDEO PASS (electron/agent/coarsePass.ts):
 *    Produces: LabeledFrame[]
 *    16 evenly-spaced frames, each tagged with an integer frameIndex and timestampSec.
 *      │
 *      ▼
 * 4. PHASE A: CANDIDATE IDENTIFICATION (electron/agent/candidateIdentifier.ts):
 *    Produces: Candidate[]
 *    Model inspects coarse frames & transcript, returning integer frameIndex values.
 *    TypeScript maps frameIndex -> approxTimestampSec.
 *      │
 *      ▼
 * 5. PHASE B: ZOOM REFINEMENT (electron/agent/candidateRefiner.ts):
 *    Produces: PinpointResult
 *    Model zooms into a +/- 3-second window at 4 FPS and picks the winning frameIndex.
 *      │
 *      ▼
 * 6. PHASE C: PROMPT SYNTHESIS (electron/lmstudio.ts -> analyzeFrame):
 *    Produces: StoryboardEntry
 *    High-resolution frame is extracted and analyzed using customizable prompt presets.
 *      │
 *      ▼
 * 7. USER INTERFACE (src/components/SmartStoryboardModal.tsx):
 *    Consumes StoryboardEntry[] and streams real-time ExtractionProgress events.
 */

/**
 * Represents a single timed subtitle/dialogue entry parsed from an external SRT file.
 */
export interface TranscriptSegment {
  /** The starting timestamp of the dialogue in seconds (e.g. 83.456) */
  startSec: number;
  /** The ending timestamp of the dialogue in seconds (e.g. 85.789) */
  endSec: number;
  /** The sanitized spoken dialogue text with tags and extra whitespace stripped */
  text: string;
}

/**
 * A physical frame on disk paired with explicit numeric grounding.
 * 
 * WHY THIS IS CRITICAL (FRAME-INDEX GROUNDING):
 * LLMs cannot accurately determine floating-point timestamps from visual pixels alone.
 * If you ask a model "At what second does the car flip?", it will hallucinate arbitrary numbers.
 * Instead, we label each image: "Frame 3 at 14.5s:". The model is only asked to return the
 * integer index 3. Our TypeScript code looks up `labeledFrames[3].timestampSec`.
 * This guarantees 100% mathematical accuracy and completely eliminates temporal hallucination.
 */
export interface LabeledFrame {
  /** The 0-based integer index assigned to this image in the multimodal prompt payload */
  frameIndex: number;
  /** The exact physical timestamp in seconds where FFmpeg extracted this frame */
  timestampSec: number;
  /** The absolute path to the downscaled image on local disk */
  framePath: string;
}

/**
 * A candidate narrative turning point identified in Phase A.
 */
export interface Candidate {
  /** The integer index corresponding to the coarse-pass frame list */
  frameIndex: number;
  /** The physical timestamp in seconds, deterministically looked up from coarseFrames[frameIndex] */
  approxTimestampSec: number;
  /** The model's reasoning for why this moment is a significant turning point */
  reason: string;
}

/**
 * The output of Phase B refinement: the single best frame chosen for a candidate.
 * 
 * NOTE: Phase B does NOT write the final prompt! It only pinpoints the exact frame.
 * This decoupling reduces model error rate and prevents generic prompt hallucination.
 */
export interface PinpointResult {
  /** The integer index within that candidate's zoom window (e.g., 0 to 9) */
  frameIndex: number;
  /** The exact physical timestamp of the winning frame */
  timestampSec: number;
  /** The path to the winning frame on disk */
  framePath: string;
  /** The model's explanation for why this exact moment captures the peak action/emotion */
  reason: string;
  /** Model confidence assessment */
  confidence: "high" | "medium" | "low";
}

/**
 * The final, enriched storyboard beat ready for export or addition to the Storyboard Timeline.
 */
export interface StoryboardEntry extends PinpointResult {
  /** Unique identifier for React rendering and persistence (e.g. "sb_1725800000_0") */
  id: string;
  /** A concise narrative description synthesized by the vision model */
  description: string;
  /** High-fidelity prompt tokens formatted for image generation (Midjourney / Flux / SD) */
  promptText: string;
  /** Optional visual breakdown (detected objects, aesthetic tags, lighting analysis) */
  visualAnalysis?: {
    objects: string[];
    tags: string[];
    scene_type: string;
    visual_elements?: {
      dominant_colors: string[];
      lighting: string;
    };
  };
}

/**
 * Discriminated union of real-time progress events streamed over IPC.
 * 
 * WHY STREAMING EVENTS MATTER:
 * A full agentic run takes 1.5 to 2.5 minutes across 7 to 13 model inference calls.
 * Emitting structured events at each stage prevents the UI from looking frozen,
 * allowing the user to follow the agent's real-time reasoning and zoom decisions.
 */
export type ExtractionProgress =
  | {
      status: "coarse_pass";
      /** Descriptive human-readable status message */
      message: string;
    }
  | {
      status: "candidates_found";
      /** Number of candidate moments identified in Phase A */
      count: number;
      /** The full list of candidate moments */
      candidates?: Candidate[];
    }
  | {
      status: "refining_candidate";
      /** 1-based index of the candidate currently being refined */
      index: number;
      /** Total number of candidates to refine */
      total: number;
      /** The narrative reason being refined */
      reason: string;
      /** The anchor timestamp around which the zoom window is centered */
      approxTimestampSec: number;
    }
  | {
      status: "zoom_pass";
      /** 1-based index of the candidate undergoing zoom */
      candidateIndex: number;
      /** Iteration number of the zoom loop (1 or 2) */
      iteration: number;
      /** The time boundaries [startSec, endSec] of the newly extracted zoom window */
      windowSec: [number, number];
    }
  | {
      status: "generating_prompt";
      /** 1-based index of the candidate undergoing final prompt synthesis */
      candidateIndex: number;
      /** Timestamp of the winning frame */
      timestampSec: number;
    }
  | {
      status: "done";
      /** The final array of fully enriched storyboard entries */
      entries: StoryboardEntry[];
    }
  | {
      status: "error";
      /** Human-readable error message */
      message: string;
    };

/**
 * Execution parameters supplied to the storyboardExtractor orchestrator.
 */
export interface ExtractorOptions {
  /** Absolute path to the source video file */
  videoPath: string;
  /** Base directory where extracted frames and output JSON will be stored */
  outputDir: string;
  /** Optional absolute path to an external .srt transcript file */
  transcriptPath?: string | null;
  /** Maximum number of storyboard beats to extract (defaults to 5) */
  maxCandidates?: number;
  /** Prompt preset name from qwen_vl3_prompts.json (defaults to "Ultra Cinematic Detailed") */
  promptType?: string;
  /** Optional callback for listening to streaming progress events */
  onProgress?: (progress: ExtractionProgress) => void;
}
