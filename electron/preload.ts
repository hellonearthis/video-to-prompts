/**
 * Electron Preload Script
 * 
 * This script acts as a secure bridge between the main process (Node.js) and
 * the renderer process (React/browser). It runs in an isolated context with
 * access to some Node.js APIs but is sandboxed from the main process.
 * 
 * The preload script uses `contextBridge` to safely expose specific APIs
 * to the renderer without giving it full access to Node.js or Electron.
 * This is a critical security layer in Electron applications.
 * 
 * The exposed APIs become available in the renderer as `window.ipcRenderer`.
 */

import { ipcRenderer, contextBridge } from 'electron'

// ============================================================================
// IPC Bridge Setup
// ============================================================================

/**
 * Expose IPC methods to the renderer process via contextBridge.
 * 
 * This creates a `window.ipcRenderer` object in the renderer that provides
 * safe access to IPC communication without exposing sensitive Node.js APIs.
 * 
 * Available methods:
 * - on(channel, listener): Subscribe to IPC events
 * - off(channel, listener): Unsubscribe from IPC events  
 * - send(channel, ...args): Send one-way messages to main
 * - invoke(channel, ...args): Send request and await response
 * 
 * Custom APIs:
 * - selectFile(): Open file picker dialog
 * - extractTimeFrames(filePath, outputDir, fps): Extract frames at time intervals
 * - extractKeyframes(filePath, outputDir): Extract actual video keyframes (I-frames)
 * - extractSceneChanges(filePath, outputDir, threshold): Detect scene changes
 */
contextBridge.exposeInMainWorld('ipcRenderer', {

  // --------------------------------------------------------------------------
  // Generic IPC Methods
  // --------------------------------------------------------------------------

  /**
   * Subscribe to IPC events from the main process.
   * Used for receiving push notifications/events.
   * 
   * @param channel - The event channel name
   * @param listener - Callback function for events
   */
  on(channel: string, listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void) {
    const subscription = (event: Electron.IpcRendererEvent, ...args: any[]) => listener(event, ...args)
    ipcRenderer.on(channel, subscription)
    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },

  /**
   * Unsubscribe from IPC events.
   * 
   * @param channel - The event channel name
   * @param listener - The listener to remove
   */
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },

  /**
   * Send a one-way message to the main process.
   * No response is expected.
   * 
   * @param channel - The channel name
   * @param args - Data to send
   */
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },

  /**
   * Send a request to the main process and await the response.
   * This is the primary method for request/response communication.
   * 
   * @param channel - The channel name
   * @param args - Data to send
   * @returns Promise that resolves with the response
   */
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // --------------------------------------------------------------------------
  // Custom Application APIs
  // --------------------------------------------------------------------------

  /**
   * Opens a native file picker dialog for selecting video files.
   * Triggers the 'select-file' IPC handler in main.ts.
   * 
   * @returns Promise resolving to the selected file path, or null if cancelled
   */
  selectFile: () => ipcRenderer.invoke('select-file'),

  /**
   * Extracts frames from a video at regular time intervals.
   * Triggers the 'extract-time-frames' IPC handler in main.ts.
   * 
   * @param filePath - Absolute path to the video file
   * @param outputDir - Directory where frames will be saved
   * @param fps - Frames per second to extract (default: 1)
   * @returns Promise resolving to array of extracted frame paths
   */
  extractTimeFrames: (filePath: string, outputDir: string, fps?: number) =>
    ipcRenderer.invoke('extract-time-frames', filePath, outputDir, fps),

  /**
   * Extracts actual keyframes (I-frames) from a video.
   * Triggers the 'extract-keyframes' IPC handler in main.ts.
   * 
   * @param filePath - Absolute path to the video file
   * @param outputDir - Directory where frames will be saved
   * @returns Promise resolving to array of extracted frame paths
   */
  extractKeyframes: (filePath: string, outputDir: string) =>
    ipcRenderer.invoke('extract-keyframes', filePath, outputDir),

  /**
   * Detects and extracts frames where significant scene changes occur.
   * Triggers the 'extract-scene-changes' IPC handler in main.ts.
   * 
   * @param filePath - Absolute path to the video file
   * @param outputDir - Directory where frames will be saved
   * @param threshold - Scene detection sensitivity (0.0-1.0)
   * @returns Promise resolving to array of frame data with metadata
   */
  extractSceneChanges: (filePath: string, outputDir: string, threshold: number) =>
    ipcRenderer.invoke('extract-scene-changes', filePath, outputDir, threshold),

  /**
   * Gets video metadata using FFprobe.
   * Triggers the 'get-video-info' IPC handler in main.ts.
   * 
   * @param filePath - Absolute path to the video file
   * @returns Promise resolving to VideoInfo object
   */
  getVideoInfo: (filePath: string) =>
    ipcRenderer.invoke('get-video-info', filePath),

  // --------------------------------------------------------------------------
  // AI Analysis APIs
  // --------------------------------------------------------------------------

  /**
   * Initialize Local AI model.
   */
  initAI: (modelId: string) => ipcRenderer.invoke('ai-init', modelId),

  /**
   * Check if LM Studio is running. 
   */
  checkLMStudio: () => ipcRenderer.invoke('ai-init'),

  /**
   * Analyzes a single frame using LM Studio vision model.
   * 
   * @param imagePath - Absolute path to the image file
   * @returns Promise resolving to analysis result
   */
  analyzeFrame: (imagePath: string) =>
    ipcRenderer.invoke('analyze-frame', imagePath),

  /**
   * Analyzes multiple frames in batch.
   * Progress updates are received via the 'analysis-progress' event.
   * 
   * @param imagePaths - Array of image file paths
   * @returns Promise resolving to array of analysis results
   */
  analyzeFramesBatch: (imagePaths: string[]) =>
    ipcRenderer.invoke('analyze-frames-batch', imagePaths),

  // --------------------------------------------------------------------------
  // Export APIs
  // --------------------------------------------------------------------------

  /**
   * Exports analysis data to a JSON file.
   * 
   * @param outputDir - Directory to save the JSON file
   * @param data - Analysis data to export
   * @returns Promise resolving to export result
   */
  exportAnalysisJson: (outputDir: string, data: object) =>
    ipcRenderer.invoke('export-analysis-json', outputDir, data),

  /**
   * Compare two frames to analyze action and flow.
   * 
   * @param frame1Path - Path to the first frame
   * @param frame2Path - Path to the second frame
   * @returns Promise resolving to comparison result
   */
  compareFrames: (frame1Path: string, frame2Path: string) =>
    ipcRenderer.invoke('compare-frames', frame1Path, frame2Path),

  /**
   * Export comparison data to a JSON file.
   * 
   * @param outputDir - Directory to save the JSON file
   * @param data - Comparison data to export
   * @returns Promise resolving to export result
   */
  exportComparisonJson: (outputDir: string, data: object) =>
    ipcRenderer.invoke('export-comparison-json', outputDir, data),

  /**
   * Compare multiple frames sequentially.
   */
  compareSequential: (imagePaths: string[]) =>
    ipcRenderer.invoke('compare-sequential', imagePaths),

  /**
   * Export sequential flow report to a JSON file.
   */
  exportFlowReport: (outputDir: string, data: object) =>
    ipcRenderer.invoke('export-flow-report', outputDir, data),
})
