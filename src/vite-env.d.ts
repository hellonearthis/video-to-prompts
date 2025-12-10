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
 * Extend the global Window interface with our IPC APIs.
 */
interface Window {
    ipcRenderer: {
        selectFile: () => Promise<string | null>;
        extractTimeFrames: (filePath: string, outputDir: string, fps?: number) => Promise<string[]>;
        extractKeyframes: (filePath: string, outputDir: string) => Promise<string[]>;
        extractSceneChanges: (filePath: string, outputDir: string, threshold: number) => Promise<{ path: string; time: number; pts: number; frame: number }[]>;
        getVideoInfo: (filePath: string) => Promise<VideoInfo>;
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
        off: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    }
}
