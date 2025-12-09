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
 * - extractKeyframes(filePath, outputDir): Extract video frames
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
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
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
   * Extracts frames from a video at regular intervals.
   * Triggers the 'extract-keyframes' IPC handler in main.ts.
   * 
   * @param filePath - Absolute path to the video file
   * @param outputDir - Directory where frames will be saved
   * @param fps - Frames per second to extract (default: 1)
   * @returns Promise resolving to array of extracted frame paths
   */
  extractKeyframes: (filePath: string, outputDir: string, fps?: number) =>
    ipcRenderer.invoke('extract-keyframes', filePath, outputDir, fps),

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
})
