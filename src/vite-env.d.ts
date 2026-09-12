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
    camera_movement?: string;
    rhythm_role?: string;
    shot_scale?: string;
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
        extractTimeFrames: (filePath: string, outputDir: string, fps?: number) => Promise<{ path: string; time: number }[]>;
        extractKeyframes: (filePath: string, outputDir: string) => Promise<{ path: string; time: number }[]>;
        extractSceneChanges: (filePath: string, outputDir: string, threshold: number) => Promise<{ path: string; time: number; pts: number; frame: number }[]>;
        extractSceneShotPairs: (filePath: string, outputDir: string, threshold: number) => Promise<{
            shotIndex: number;
            shotIdentifier: string;
            startTimeSeconds: number;
            endTimeSeconds: number;
            durationSeconds: number;
            frameAPath: string;
            frameATimestamp: number;
            frameBPath: string;
            frameBTimestamp: number;
        }[]>;
        getVideoInfo: (filePath: string) => Promise<VideoInfo>;
        checkExtractionExists: (outputDir: string) => Promise<{ exists: boolean; hasFrames?: boolean; count?: number; error?: string }>;
        listFrames: (outputDir: string) => Promise<{ success: boolean; frames: string[]; error?: string }>;
        saveStoryTimeline: (outputDir: string, timelineData: any) => Promise<{ success: boolean; path?: string; error?: string }>;
        loadStoryTimeline: (outputDir: string) => Promise<{ success: boolean; timeline?: any; error?: string }>;
        saveFramesData: (outputDir: string, data: any[]) => Promise<{ success: boolean; error?: string }>;
        loadFramesData: (outputDir: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        checkLMStudio: () => Promise<{ success: boolean; error?: string }>;
        getAvailablePrompts: () => Promise<{ prompts: string[]; styles?: string[]; refinements?: string[]; logs?: string[] }>;
        initAI: (modelId: string) => Promise<{ success: boolean; error?: string }>;
        analyzeFrame: (imagePath: string, promptType?: string, videoPath?: string, timestamp?: number, options?: { style?: string, refinement?: string }) => Promise<AnalysisResult>;
        analyzeFramesBatch: (batchData: { path: string, videoPath?: string, time?: number }[], promptType?: string) => Promise<any>;
        compareFrames: (f1: string, f2: string) => Promise<any>;
        compareSequential: (paths: string[]) => Promise<{ success: boolean; results?: any[]; error?: string }>;
        analyzeStorySequence: (paths: string[]) => Promise<{ success: boolean; analysis?: any; error?: string }>;
        onAiProgress: (callback: (data: any) => void) => void;
        onAnalysisProgress: (callback: (data: any) => void) => void;
        exportAnalysisJson: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        exportComparisonJson: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        exportFlowReport: (outputDir: string, data: object) => Promise<{ success: boolean; path?: string; error?: string }>;
        getRecentProjects: () => Promise<{ success: boolean; projects: any[]; error?: string }>;
        saveRecentProject: (projectData: { path: string; name: string }) => Promise<{ success: boolean; error?: string }>;
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => () => void;
        off: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
        getPathForFile: (file: File) => string;
        selectTranscriptFile: () => Promise<string | null>;
        extractAgenticStoryboard: (options: {
            videoPath: string;
            outputDir: string;
            transcriptPath?: string | null;
            maxCandidates?: number;
            promptType?: string;
        }) => Promise<{ success: boolean; entries?: any[]; error?: string }>;
    }
}

