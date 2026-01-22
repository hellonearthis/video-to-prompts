/**
 * FFmpeg Video Processing Module
 * 
 * This module provides functions to extract frames from video files using FFmpeg.
 * It handles three types of extraction:
 * 1. Time-based extraction: Extracts frames at regular time intervals (fps-based)
 * 2. Keyframe extraction: Extracts actual video keyframes (I-frames)
 * 3. Scene change detection: Extracts frames where significant visual changes occur
 * 
 * FFmpeg is bundled via the ffmpeg-static package for cross-platform compatibility.
 */

import ffmpegPath from 'ffmpeg-static';
// @ts-ignore - ffprobe-static doesn't have type declarations
import ffprobePath from 'ffprobe-static';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// ============================================================================
// FFmpeg Path Configuration
// ============================================================================

/**
 * Gets the correct path to the FFmpeg binary.
 * In production (packaged app), the binary is in an unpacked asar directory.
 */
const getFfmpegPath = (): string => {
    if (ffmpegPath) {
        return ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    }
    throw new Error('FFmpeg path not found!');
};

/**
 * Gets the path to FFprobe from ffprobe-static package.
 * FFprobe is used for analyzing video metadata.
 */
const getFFprobePath = (): string => {
    // ffprobe-static exports an object with a 'path' property
    const probePath = typeof ffprobePath === 'string' ? ffprobePath : ffprobePath.path;
    if (probePath) {
        return probePath.replace('app.asar', 'app.asar.unpacked');
    }
    throw new Error('FFprobe path not found!');
};

// ============================================================================
// Video Info Types
// ============================================================================

/**
 * Video metadata returned by FFprobe analysis.
 */
export interface VideoInfo {
    /** Video duration in seconds */
    duration: number;
    /** Frame rate (frames per second) */
    fps: number;
    /** Video width in pixels */
    width: number;
    /** Video height in pixels */
    height: number;
    /** Video codec name (e.g., "h264") */
    codec: string;
    /** Total number of frames (calculated) */
    totalFrames: number;
    /** Bitrate in kb/s */
    bitrate: number;
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Options for frame extraction operations.
 */
export type ExtractionOptions = {
    /** Absolute path to the input video file */
    filePath: string;
    /** Directory where extracted frames will be saved */
    outputDir: string;
    /** Scene detection sensitivity (0.0-1.0, lower = more sensitive) */
    threshold?: number;
    /** Frames per second to extract (e.g., 1 = one frame per second) */
    fps?: number;
};

// ============================================================================
// Time-Based Frame Extraction
// ============================================================================

/**
 * Extracts frames from a video at regular time intervals.
 * 
 * Uses FFmpeg's fps filter to sample frames at a consistent rate.
 * Default is 1 frame per second, but can be adjusted via the fps option.
 * This is NOT extracting actual video keyframes (I-frames), but rather
 * sampling frames at fixed time intervals regardless of video encoding.
 * 
 * @param options - Extraction options including file path and output directory
 * @returns Promise resolving to an array of extracted frame file paths
 * 
 * @example
 * // Extract 1 frame per second
 * const frames = await extractTimeFrames({ filePath: 'video.mp4', outputDir: './frames' });
 * 
 * @example
 * // Extract 2 frames per second
 * const frames = await extractTimeFrames({ filePath: 'video.mp4', outputDir: './frames', fps: 2 });
 */
// ... imports ...

export interface FrameData {
    path: string;
    time: number;
}

// ... existing types ...

// ... Time-Based Frame Extraction ...

export const extractTimeFrames = async ({ filePath, outputDir, fps = 1 }: ExtractionOptions): Promise<FrameData[]> => {
    return new Promise((resolve, reject) => {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputPattern = path.join(outputDir, 'time_%04d.png');
        const args = [
            '-i', filePath,
            '-vf', `fps=${fps},scale='if(gt(iw,ih),640,360)':'if(gt(iw,ih),360,640)':force_original_aspect_ratio=decrease`,
            '-an',
            '-f', 'image2',
            outputPattern
        ];

        console.log('Running FFmpeg with args:', args.join(' '));
        const proc = spawn(getFfmpegPath(), args);

        proc.stderr.on('data', (data) => {
            console.log('FFmpeg stderr:', data.toString());
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('Time-based frame extraction finished');
                const files = fs.readdirSync(outputDir)
                    .filter(f => f.startsWith('time_') && f.endsWith('.png'))
                    .sort();

                // Calculate time based on index and fps
                const result: FrameData[] = files.map((f, i) => ({
                    path: path.join(outputDir, f),
                    time: i / fps
                }));

                console.log('Found time-based frame files:', result.length);
                resolve(result);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            reject(err);
        });
    });
};

// ============================================================================
// Scene Change Detection
// ============================================================================

/**
 * Extracts frames where significant scene changes are detected.
 * 
 * Uses FFmpeg's select filter with scene change detection. The threshold
 * controls sensitivity: lower values detect more subtle changes, higher
 * values only detect major scene transitions.
 * 
 * Also uses the showinfo filter to parse frame metadata (PTS, timestamps)
 * from FFmpeg's stderr output.
 * 
 * @param options - Extraction options including file path, output directory, and threshold
 * @returns Promise resolving to array of frame data with metadata
 */
export const extractSceneChanges = async ({ filePath, outputDir, threshold = 0.3 }: ExtractionOptions): Promise<{ path: string; time: number; pts: number; frame: number }[]> => {
    return new Promise((resolve, reject) => {
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Output pattern: scene_0001.png, scene_0002.png, etc.
        const outputPattern = path.join(outputDir, 'scene_%04d.png');

        // Array to collect frame metadata from FFmpeg output
        const frames: { path: string; time: number; pts: number; frame: number }[] = [];

        // Build FFmpeg command arguments
        // -vf select='gt(scene,T)': Select frames where scene change > threshold
        // showinfo: Outputs frame metadata to stderr for parsing
        // -vsync vfr: Variable frame rate (only output selected frames)
        const args = [
            '-i', filePath,
            '-vf', `select='gt(scene,${threshold})',scale='if(gt(iw,ih),640,360)':'if(gt(iw,ih),360,640)':force_original_aspect_ratio=decrease,showinfo`,
            '-vsync', 'vfr',
            '-an',
            outputPattern
        ];

        console.log('Running FFmpeg scene detection with args:', args.join(' '));

        const proc = spawn(getFfmpegPath(), args);

        // Parse FFmpeg stderr to extract frame metadata
        proc.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                // Look for showinfo filter output lines
                // Format: [Parsed_showinfo_1 @ ...] n: 123 pts: 456789 pts_time:1.234 ...
                if (line.includes('[Parsed_showinfo')) {
                    // Extract frame number (n:)
                    const nMatch = line.match(/n:\s*(\d+)/);
                    // Extract PTS value (pts:)
                    const ptsMatch = line.match(/pts:\s*(\d+)/);
                    // Extract timestamp in seconds (pts_time:)
                    const timeMatch = line.match(/pts_time:([\d.]+)/);

                    if (nMatch && ptsMatch && timeMatch) {
                        frames.push({
                            path: '', // Will be filled after extraction completes
                            frame: parseInt(nMatch[1], 10),
                            pts: parseInt(ptsMatch[1], 10),
                            time: parseFloat(timeMatch[1])
                        });
                    }
                }
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('Scene extraction finished');

                // Read output files
                const files = fs.readdirSync(outputDir)
                    .filter(f => f.startsWith('scene_') && f.endsWith('.png'))
                    .sort();
                console.log('Found scene files:', files);

                // Combine parsed metadata with file paths
                // Files are output in order, so we match by index
                const result = frames.map((f, i) => ({
                    ...f,
                    path: files[i] ? path.join(outputDir, files[i]) : ''
                })).filter(f => f.path !== '');

                resolve(result);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            reject(err);
        });
    });
};

// ============================================================================
// Video Metadata Analysis
// ============================================================================

/**
 * Gets video metadata using FFprobe.
 * 
 * Uses FFprobe's JSON output format to extract:
 * - Duration, FPS, resolution, codec, bitrate
 * 
 * @param filePath - Absolute path to the video file
 * @returns Promise resolving to VideoInfo object
 */
export const getVideoInfo = async (filePath: string): Promise<VideoInfo> => {
    return new Promise((resolve, reject) => {
        // FFprobe arguments for JSON output with stream and format info
        const args = [
            '-v', 'quiet',           // Suppress log output
            '-print_format', 'json', // Output as JSON
            '-show_format',          // Include format/container info
            '-show_streams',         // Include stream info
            filePath
        ];

        console.log('Running FFprobe for video info:', filePath);

        const proc = spawn(getFFprobePath(), args);
        let output = '';

        proc.stdout.on('data', (data) => {
            output += data.toString();
        });

        proc.stderr.on('data', (data) => {
            console.log('FFprobe stderr:', data.toString());
        });

        proc.on('close', (code) => {
            if (code === 0) {
                try {
                    const data = JSON.parse(output);

                    // Find video stream
                    const videoStream = data.streams?.find(
                        (s: any) => s.codec_type === 'video'
                    );

                    if (!videoStream) {
                        reject(new Error('No video stream found'));
                        return;
                    }

                    // Parse frame rate (can be "30/1" or "30000/1001" format)
                    let fps = 0;
                    if (videoStream.r_frame_rate) {
                        const [num, den] = videoStream.r_frame_rate.split('/');
                        fps = parseInt(num) / parseInt(den || '1');
                    }

                    const duration = parseFloat(data.format?.duration || '0');

                    const info: VideoInfo = {
                        duration: duration,
                        fps: Math.round(fps * 100) / 100,
                        width: videoStream.width || 0,
                        height: videoStream.height || 0,
                        codec: videoStream.codec_name || 'unknown',
                        totalFrames: Math.round(duration * fps),
                        bitrate: Math.round((parseInt(data.format?.bit_rate || '0') / 1000))
                    };

                    console.log('Video info:', info);
                    resolve(info);
                } catch (err) {
                    reject(new Error(`Failed to parse FFprobe output: ${err}`));
                }
            } else {
                reject(new Error(`FFprobe exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            console.error('FFprobe process error:', err);
            reject(err);
        });
    });
};

// ============================================================================
// Keyframe (I-Frame) Extraction
// ============================================================================

export const extractKeyframes = async ({ filePath, outputDir }: ExtractionOptions): Promise<FrameData[]> => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(outputDir)) { fs.mkdirSync(outputDir, { recursive: true }); }

        const outputPattern = path.join(outputDir, 'key_%04d.png');
        const frames: { frame: number, time: number, path: string }[] = [];

        // Updated command to include showinfo for timestamp extraction
        // Note: skip_frame nokey interacts with showinfo. showinfo might NOT show dropped frames.
        // We use select='eq(pict_type,I)' instead of skip_frame to ensure showinfo sees and reports the frames we keep.
        const args = [
            '-i', filePath,
            '-vf', `select='eq(pict_type,I)',scale='if(gt(iw,ih),640,360)':'if(gt(iw,ih),360,640)':force_original_aspect_ratio=decrease,showinfo`,
            '-vsync', 'vfr', // Variable frame rate to output only selected frames
            '-an',
            outputPattern
        ];

        console.log('Running FFmpeg keyframe extraction with args:', args.join(' '));
        const proc = spawn(getFfmpegPath(), args);

        proc.stderr.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                if (line.includes('[Parsed_showinfo')) {
                    const timeMatch = line.match(/pts_time:([\d.]+)/);
                    if (timeMatch) {
                        frames.push({
                            path: '', // Filled later
                            frame: 0, // Not strictly needed
                            time: parseFloat(timeMatch[1])
                        });
                    }
                }
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log('Keyframe extraction finished');
                const files = fs.readdirSync(outputDir)
                    .filter(f => f.startsWith('key_') && f.endsWith('.png'))
                    .sort();

                // Merge timestamps with files
                // Assuming showinfo output order matches file output order
                const result: FrameData[] = files.map((f, i) => ({
                    path: path.join(outputDir, f),
                    time: frames[i]?.time || 0 // Fallback if parsing missed something
                }));

                console.log('Found keyframe files:', result.length);
                resolve(result);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            console.error('FFmpeg process error:', err);
            reject(err);
        });
    });
};

/**
 * Extracts a single high-resolution frame at a specific timestamp.
 */
export const extractSingleHighResFrame = async (filePath: string, timestamp: number, outputDir: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(outputDir)) { fs.mkdirSync(outputDir, { recursive: true }); }

        const timestampStr = timestamp.toFixed(3).replace('.', '-');
        const outputPath = path.join(outputDir, `hq_${timestampStr}.png`);

        const args = [
            '-ss', timestamp.toString(),
            '-i', filePath,
            '-frames:v', '1',
            '-q:v', '2',
            '-y',
            outputPath
        ];

        console.log('Running HQ extraction:', args.join(' '));
        const proc = spawn(getFfmpegPath(), args);

        proc.on('close', (code) => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`HQ extraction failed with code ${code}`));
        });

        proc.on('error', reject);
    });
};