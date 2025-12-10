# Video to Prompts

A desktop application that breaks down video clips into important visual components for analysis, asset creation, editing, or production planning.

## Features

- **Video Import**: Drag-and-drop or file picker for video files (MP4, MOV, AVI, MKV)
- **Video Metadata**: Display duration, FPS, resolution, codec, and bitrate
- **Frame Extraction**: Three extraction modes:
  - **Time Frames**: Extract frames at regular time intervals (configurable FPS)
  - **Keyframes**: Extract actual video keyframes (I-frames from video encoding)
  - **Scene Detection**: Detect and extract frames where significant visual changes occur
- **Thumbnail Grid**: Visual display of extracted frames with color-coded badges and metadata
- **AI Descriptions** *(Coming Soon)*: Generate text descriptions using local LM Studio

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

```
Video to Prompts/
├── electron/                    # Electron Main Process
│   ├── main.ts                 # App entry point, window management, IPC handlers
│   ├── preload.ts              # Bridge between main and renderer processes
│   └── ffmpeg.ts               # FFmpeg video processing functions
├── src/                         # React Frontend (Renderer Process)
│   ├── App.tsx                 # Main application component
│   ├── App.css                 # Application styles
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # TypeScript type definitions
│   └── components/
│       ├── FilePicker.tsx      # Video file selection component
│       ├── ControlPanel.tsx    # Extraction settings controls
│       └── ThumbnailGrid.tsx   # Frame display grid
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite bundler configuration
└── tsconfig.json               # TypeScript configuration
```

## File Descriptions

### Electron (Main Process)

#### `electron/main.ts`
The main entry point for the Electron application. Responsibilities:
- Creates and manages the application window (BrowserWindow)
- Registers IPC handlers for communication with the renderer
- Sets up the custom file protocol for loading local images
- Handles app lifecycle events (ready, quit, activate)

#### `electron/preload.ts`
The secure bridge between the main process and renderer. Responsibilities:
- Exposes safe IPC methods to the renderer via `contextBridge`
- Provides `selectFile()`, `extractTimeFrames()`, `extractKeyframes()`, and `extractSceneChanges()` APIs
- Maintains security by controlling what the renderer can access

#### `electron/ffmpeg.ts`
Video processing module using FFmpeg. Responsibilities:
- Locates the bundled FFmpeg/FFprobe binaries (`ffmpeg-static`, `ffprobe-static`)
- `extractTimeFrames()`: Extracts frames at regular time intervals using fps filter
- `extractKeyframes()`: Extracts actual video keyframes (I-frames) from the encoding
- `extractSceneChanges()`: Detects scene changes and extracts those frames
- `getVideoInfo()`: Gets video metadata (duration, fps, resolution, codec, bitrate)
- Parses FFmpeg output to extract frame metadata (timestamps, PTS values)

### React (Renderer Process)

#### `src/App.tsx`
The main React component that orchestrates the UI. Responsibilities:
- Manages application state (selected file, frames, settings)
- Coordinates extraction workflow by calling IPC methods
- Renders either FilePicker (no file) or ControlPanel + ThumbnailGrid (file selected)

#### `src/components/FilePicker.tsx`
Video file selection component. Responsibilities:
- Provides drag-and-drop zone for video files
- Click-to-browse functionality via native file dialog
- Visual feedback during drag operations

#### `src/components/ControlPanel.tsx`
Extraction settings interface. Responsibilities:
- FPS input for time-based extraction rate
- Scene detection threshold slider (0.1 - 1.0)
- Checkboxes for extraction modes (Time Frames, Keyframes, Scene Changes)
- "Run Extraction" button with processing state

#### `src/components/ThumbnailGrid.tsx`
Displays extracted frames in a responsive grid. Responsibilities:
- Shows frame thumbnails with metadata (type, timestamp, frame number)
- Color-coded badges:
  - Blue: Time-based frames (extracted at intervals)
  - Green: Keyframes (actual I-frames from video encoding)
  - Orange: Scene change frames
- "Generate AI Descriptions" button (Phase 3 feature)
- Displays AI-generated descriptions when available

## Technology Stack

- **Electron**: Desktop application framework
- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **FFmpeg**: Video processing (via `ffmpeg-static`)

## How It Works

1. **User loads a video** via drag-and-drop or file picker
2. **Video metadata is displayed** (duration, FPS, resolution, codec, bitrate)
3. **App runs FFmpeg** to extract frames based on selected options:
   - **Time Frames**: Samples frames at regular time intervals (e.g., 1 fps)
   - **Keyframes**: Extracts actual I-frames from the video encoding
   - **Scene Changes**: Detects visual changes using configurable threshold
4. **Frames are displayed** in a thumbnail grid with color-coded type badges
5. **User can adjust settings** and re-run extraction
6. **AI descriptions** *(Phase 3)*: Send frames to local LLM for captioning

## License

MIT
