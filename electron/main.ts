/**
 * Electron Main Process
 * 
 * This is the entry point for the Electron application. It runs in the main
 * (Node.js) process and is responsible for:
 * - Creating and managing the application window
 * - Handling IPC (Inter-Process Communication) with the renderer
 * - Managing app lifecycle (startup, shutdown, etc.)
 * - Registering custom protocols for file access
 * 
 * The main process has full access to Node.js APIs and the file system,
 * while the renderer process (React app) is sandboxed for security.
 */

import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { extractKeyframes, extractSceneChanges, getVideoInfo } from './ffmpeg'

// ============================================================================
// ESM Compatibility
// ============================================================================

// Create a require function for ESM compatibility (needed for some packages)
const require = createRequire(import.meta.url)
// Get __dirname equivalent in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ============================================================================
// Path Configuration
// ============================================================================

/**
 * Directory structure after build:
 * ├─┬─┬ dist/           (renderer files)
 * │ │ └── index.html
 * │ ├─┬ dist-electron/  (main process files)
 * │ │ ├── main.js
 * │ │ └── preload.mjs
 */
process.env.APP_ROOT = path.join(__dirname, '..')

// Environment variables for different build modes
// Using bracket notation avoids Vite's define plugin transformation
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

// Public assets path (different in dev vs production)
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// ============================================================================
// Window Management
// ============================================================================

/** Reference to the main application window */
let win: BrowserWindow | null

/**
 * Creates the main application window with appropriate settings.
 * 
 * Key configuration:
 * - Preload script for secure IPC communication
 * - webSecurity disabled to allow loading local file:// images
 * - Loads from dev server in development, built files in production
 */
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      // Preload script runs before renderer, sets up IPC bridge
      preload: path.join(__dirname, 'preload.mjs'),
      // Allow loading local file:// images (needed for extracted frames)
      // Note: This reduces security; consider using a custom protocol in production
      webSecurity: false,
    },
  })

  // Send a message to renderer when page loads (for debugging)
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Load the app: dev server URL in development, local file in production
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// ============================================================================
// App Lifecycle Events
// ============================================================================

/**
 * Handle all windows being closed.
 * On macOS, apps typically stay active until explicitly quit (Cmd+Q).
 * On other platforms, closing all windows quits the app.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

/**
 * Handle app activation (macOS dock click).
 * Re-creates the window if none exist.
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ============================================================================
// App Initialization
// ============================================================================

/**
 * Main initialization - runs when Electron is ready.
 * Sets up custom protocols and IPC handlers before creating the window.
 */
app.whenReady().then(() => {

  // --------------------------------------------------------------------------
  // Custom Protocol Registration
  // --------------------------------------------------------------------------

  /**
   * Register a custom 'local-file://' protocol for serving local files.
   * This provides a way to load local images even with stricter security.
   * 
   * Usage in renderer: <img src="local-file://C:/path/to/image.png" />
   * 
   * Note: This is currently unused since webSecurity is disabled,
   * but kept for future security improvements.
   */
  protocol.handle('local-file', (request) => {
    // Remove protocol prefix and decode URI components
    let filePath = decodeURIComponent(request.url.replace('local-file://', ''));
    // Normalize Windows paths - replace backslashes with forward slashes
    filePath = filePath.replace(/\\/g, '/');
    console.log('Protocol serving:', filePath);
    // Use net.fetch to serve the file
    return net.fetch('file:///' + filePath);
  });

  // Create the main window
  createWindow()

  // --------------------------------------------------------------------------
  // IPC Handlers
  // --------------------------------------------------------------------------

  /**
   * Handle file selection dialog.
   * Opens a native file picker filtered for video files.
   * 
   * @returns The selected file path, or null if cancelled
   */
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }]
    })
    return result.filePaths[0] || null
  })

  /**
   * Handle keyframe extraction request.
   * Delegates to the FFmpeg module.
   * 
   * @param filePath - Path to the input video file
   * @param outputDir - Directory to save extracted frames
   * @returns Array of extracted frame file paths
   */
  ipcMain.handle('extract-keyframes', async (_, filePath, outputDir, fps) => {
    return await extractKeyframes({ filePath, outputDir, fps })
  })

  /**
   * Handle scene change extraction request.
   * Delegates to the FFmpeg module.
   * 
   * @param filePath - Path to the input video file
   * @param outputDir - Directory to save extracted frames
   * @param threshold - Scene detection sensitivity (0.0-1.0)
   * @returns Array of frame data with metadata
   */
  ipcMain.handle('extract-scene-changes', async (_, filePath, outputDir, threshold) => {
    return await extractSceneChanges({ filePath, outputDir, threshold })
  })

  /**
   * Handle video info request.
   * Uses FFprobe to analyze video metadata.
   * 
   * @param filePath - Path to the video file
   * @returns VideoInfo object with duration, fps, resolution, codec, etc.
   */
  ipcMain.handle('get-video-info', async (_, filePath) => {
    return await getVideoInfo(filePath)
  })
})
