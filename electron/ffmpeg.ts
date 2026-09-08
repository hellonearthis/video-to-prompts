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

/**
 * ============================================================================
 * TUTORIAL: FAST HIGH-EFFICIENCY SCALED FRAME EXTRACTION
 * ============================================================================
 * 
 * WHAT THIS DOES:
 * Slices a single video frame at an exact timestamp and scales it to fit within
 * the model's target resolution (default: 640x360).
 * 
 * WHY -ss GOES BEFORE -i (INPUT SEEKING VS OUTPUT SEEKING):
 * When `-ss <timestamp>` is placed BEFORE `-i <filePath>`, FFmpeg uses input seeking.
 * Instead of decoding all audio/video frames from 0.0s up to the target timestamp
 * (which takes seconds for long videos), FFmpeg seeks directly to the nearest keyframe
 * at the container demuxer level and only decodes the delta to the requested frame.
 * This reduces extraction time from ~3,000ms down to ~60ms per frame!
 * 
 * HOW THE ASPECT RATIO FILTER WORKS:
 * `scale='if(gt(iw,ih),640,360)':'if(gt(iw,ih),360,640)':force_original_aspect_ratio=decrease`
 * - If the video is landscape (iw > ih), it bounds the image within 640x360.
 * - If the video is portrait/vertical (ih > iw, like TikTok/Reels), it bounds within 360x640.
 * - `force_original_aspect_ratio=decrease` prevents stretching or letterbox bars.
 */
export const extractScaledFrameAtTime = async (
    videoFilePath: string,
    targetTimestampInSeconds: number,
    destinationPngPath: string,
    maximumBoundingWidth = 640,
    maximumBoundingHeight = 360
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const parentDirectory = path.dirname(destinationPngPath);
        if (!fs.existsSync(parentDirectory)) {
            fs.mkdirSync(parentDirectory, { recursive: true });
        }

        const adaptiveScaleFilter =
            `scale='if(gt(iw,ih),${maximumBoundingWidth},${maximumBoundingHeight})':` +
            `'if(gt(iw,ih),${maximumBoundingHeight},${maximumBoundingWidth})':force_original_aspect_ratio=decrease`;

        const ffmpegArgumentList = [
            '-ss', targetTimestampInSeconds.toString(), // Fast container-level seeking
            '-i', videoFilePath,
            '-frames:v', '1',                           // Extract exactly 1 visual frame
            '-vf', adaptiveScaleFilter,                 // Apply aspect-ratio-preserving downscale
            '-q:v', '2',                                // High JPEG/PNG visual quality
            '-y',                                       // Overwrite destination file without prompting
            destinationPngPath
        ];

        const ffmpegChildProcess = spawn(getFfmpegPath(), ffmpegArgumentList);
        ffmpegChildProcess.on('close', (exitCode) => {
            if (exitCode === 0) {
                resolve(destinationPngPath);
            } else {
                reject(new Error(`Scaled frame extraction failed with exit code ${exitCode}`));
            }
        });
        ffmpegChildProcess.on('error', (spawnError) => {
            reject(spawnError);
        });
    });
};

/**
 * ============================================================================
 * TUTORIAL: WHOLE-VIDEO COARSE PASS — MIDPOINT INTERVAL SAMPLING
 * ============================================================================
 * 
 * WHAT THIS DOES:
 * Extracts exactly N evenly-spaced frames spanning the entire video duration.
 * 
 * WHY WE USE MIDPOINT INTERVAL SAMPLING:
 * If a video is 100 seconds long and we extract 4 frames:
 * - Naive border sampling: [0s, 33s, 66s, 100s]
 *   Problem: 0s is almost always a black screen, production logo, or silent intro,
 *   and 100s is almost always closing credits or fade-to-black.
 * - Midpoint sampling:
 *   Interval width = 100 / 4 = 25s.
 *   Chunk 1: [0s - 25s]   -> Midpoint = 12.5s
 *   Chunk 2: [25s - 50s]  -> Midpoint = 37.5s
 *   Chunk 3: [50s - 75s]  -> Midpoint = 62.5s
 *   Chunk 4: [75s - 100s] -> Midpoint = 87.5s
 *   Result: Every segment is represented by its central action beat, completely
 *   avoiding intro black frames and credit scrolls!
 */
export const extractEvenlySpacedFrames = async (
    videoFilePath: string,
    outputDestinationDirectory: string,
    targetFrameCount = 16,
    maximumBoundingWidth = 640,
    maximumBoundingHeight = 360
): Promise<FrameData[]> => {
    const videoMetadata = await getVideoInfo(videoFilePath);
    const totalVideoDurationSeconds = videoMetadata.duration || 1;
    const actualExtractedFrameCount = Math.min(
        targetFrameCount,
        Math.max(1, Math.floor(totalVideoDurationSeconds * 2))
    );
    const intervalStepSeconds = totalVideoDurationSeconds / actualExtractedFrameCount;

    // Calculate midpoint timestamps for each equal temporal interval
    const midpointTimestampArray: number[] = Array.from(
        { length: actualExtractedFrameCount },
        (_, intervalIndex) => {
            const midpointTimestamp = (intervalIndex + 0.5) * intervalStepSeconds;
            return Math.max(0, Math.min(midpointTimestamp, Math.max(0, totalVideoDurationSeconds - 0.05)));
        }
    );

    if (!fs.existsSync(outputDestinationDirectory)) {
        fs.mkdirSync(outputDestinationDirectory, { recursive: true });
    }

    const extractedFrameDataList: FrameData[] = [];

    // Extract frames sequentially to prevent spawning 16 heavy child processes at once
    for (let frameIndex = 0; frameIndex < midpointTimestampArray.length; frameIndex++) {
        const timestampSeconds = midpointTimestampArray[frameIndex];
        const sanitizedTimestampString = timestampSeconds.toFixed(2).replace('.', '_');
        const outputPngFilename = `coarse_${frameIndex.toString().padStart(2, '0')}_${sanitizedTimestampString}s.png`;
        const outputPngFullPath = path.join(outputDestinationDirectory, outputPngFilename);

        try {
            await extractScaledFrameAtTime(
                videoFilePath,
                timestampSeconds,
                outputPngFullPath,
                maximumBoundingWidth,
                maximumBoundingHeight
            );
            extractedFrameDataList.push({
                path: outputPngFullPath,
                time: timestampSeconds
            });
        } catch (extractionError) {
            console.warn(`[FFMPEG] Failed to extract coarse frame at ${timestampSeconds}s:`, extractionError);
        }
    }

    return extractedFrameDataList;
};

/**
 * ============================================================================
 * TUTORIAL: PHASE B ZOOM WINDOW EXTRACTION
 * ============================================================================
 * 
 * WHAT THIS DOES:
 * Extracts a sequence of high-density frames within a narrow temporal window
 * (e.g. [12.0s to 18.0s] at 4 FPS).
 * 
 * WHY FPS AND FRAME COUNT ARE HARD-CAPPED:
 * When an autonomous agent requests a zoom, it may hallucinate an extreme value
 * like `fps: 1000`. If passed directly to FFmpeg, the system would attempt to extract
 * 6,000 images, freeze the application, and consume gigabytes of disk space.
 * We compute `targetCount = Math.min(maxFrames, Math.round(duration * fps))` to enforce
 * an unbreachable ceiling (default: 10 frames max per window).
 */
export const extractWindowFrames = async (
    videoFilePath: string,
    outputDestinationDirectory: string,
    windowStartSeconds: number,
    windowEndSeconds: number,
    samplingFramesPerSecond = 4,
    maximumAllowedFramesCount = 10,
    maximumBoundingWidth = 640,
    maximumBoundingHeight = 360
): Promise<FrameData[]> => {
    const videoMetadata = await getVideoInfo(videoFilePath);
    const totalVideoDurationSeconds = videoMetadata.duration || 1;

    // Clamp boundaries within valid video duration
    const clampedWindowStartSeconds = Math.max(0, Math.min(windowStartSeconds, totalVideoDurationSeconds - 0.1));
    const clampedWindowEndSeconds = Math.min(totalVideoDurationSeconds, Math.max(clampedWindowStartSeconds + 0.2, windowEndSeconds));
    const windowDurationSeconds = clampedWindowEndSeconds - clampedWindowStartSeconds;

    // Calculate frame count bounded by maximumAllowedFramesCount
    const calculatedFrameCount = Math.min(
        maximumAllowedFramesCount,
        Math.max(2, Math.round(windowDurationSeconds * samplingFramesPerSecond))
    );
    const temporalStepSeconds = windowDurationSeconds / (calculatedFrameCount - 1);

    const timestampSamplingArray: number[] = Array.from(
        { length: calculatedFrameCount },
        (_, frameStepIndex) => {
            const computedTimestamp = clampedWindowStartSeconds + frameStepIndex * temporalStepSeconds;
            return Math.min(clampedWindowEndSeconds, Math.max(clampedWindowStartSeconds, computedTimestamp));
        }
    );

    if (!fs.existsSync(outputDestinationDirectory)) {
        fs.mkdirSync(outputDestinationDirectory, { recursive: true });
    }

    const windowExtractedFrameList: FrameData[] = [];

    for (let frameIndex = 0; frameIndex < timestampSamplingArray.length; frameIndex++) {
        const timestampSeconds = timestampSamplingArray[frameIndex];
        const sanitizedTimestampString = timestampSeconds.toFixed(2).replace('.', '_');
        const outputPngFilename = `zoom_${frameIndex.toString().padStart(2, '0')}_${sanitizedTimestampString}s.png`;
        const outputPngFullPath = path.join(outputDestinationDirectory, outputPngFilename);

        try {
            await extractScaledFrameAtTime(
                videoFilePath,
                timestampSeconds,
                outputPngFullPath,
                maximumBoundingWidth,
                maximumBoundingHeight
            );
            windowExtractedFrameList.push({
                path: outputPngFullPath,
                time: timestampSeconds
            });
        } catch (extractionError) {
            console.warn(`[FFMPEG] Failed to extract zoom frame at ${timestampSeconds}s:`, extractionError);
        }
    }

    return windowExtractedFrameList;
};