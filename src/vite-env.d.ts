/// <reference types="vite/client" />

/**
 * Video metadata returned by FFprobe analysis.
 */
interface VideoInfo {
    duration: number;
    fps: number;
    width: number;
    height: number;
    codec: string;
    totalFrames: number;
    bitrate: number;
}

/**
 * Analysis result from LM Studio vision model.
 */
interface FrameAnalysis {
    summary: string;
    objects: string[];
    tags: string[];
    scene_type: string;
    visual_elements: {
        dominant_colors: string[];
        lighting: string;
    };
}

/**
 * Result of an analysis attempt.
 */
interface AnalysisResult {
    success: boolean;
    path: string;
    analysis?: FrameAnalysis;
    error?: string;
}

/**
 * Progress update for batch analysis.
 */
interface AnalysisProgress {
    current: number;
    total: number;
    result: AnalysisResult;
}

/**
 * Result of comparing two frames.
 */
interface ComparisonResult {
    action_description: string;
    object_flow: string;
    differences: string[];
    confidence?: number;
}

/**
 * Result of a comparison attempt.
 */
interface FrameComparisonResult {
    success: boolean;
    frame1_path: string;
    frame2_path: string;
    comparison?: ComparisonResult;
    error?: string;
}

/**
 * Result of a single pair comparison in a sequential flow.
 */
interface FlowPairResult {
    index: number;
    frame1: string;
    frame2: string;
    comparison?: ComparisonResult;
    error?: string;
}

/**
 * complete result of a sequential flow analysis.
 */
interface FlowAnalysisResult {
    success: boolean;
    results?: FlowPairResult[];
    error?: string;
}

/**
 * Extend the global Window interface with our IPC APIs.
 */
interface Window {
    ipcRenderer: {
        selectFile: () => Promise<string | null>;
        extractTimeFrames: (filePath: string, outputDir: string, fps?: number) => Promise<string[]>;
        extractKeyframes: (filePath: string, outputDir: string) => Promise<string[]>;
        extractSceneChanges: (filePath: string, outputDir: string, threshold: number) => Promise<{ path: string; time: number; pts: number; frame: number }[]>;
        getVideoInfo: (filePath: string) => Promise<VideoInfo>;
        checkLMStudio: () => Promise<{ success: boolean; error?: string }>;
        initAI: (modelId: string) => Promise<{ success: boolean; error?: string }>;
        analyzeFrame: (imagePath: string) => Promise<AnalysisResult>;
        analyzeFramesBatch: (imagePaths: string[]) => Promise<AnalysisResult[]>;
        compareFrames: (frame1Path: string, frame2Path: string) => Promise<FrameComparisonResult>;
        compareSequential: (imagePaths: string[]) => Promise<FlowAnalysisResult>;
        exportAnalysisJson: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        exportComparisonJson: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        exportFlowReport: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void;
        off: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    }
}

