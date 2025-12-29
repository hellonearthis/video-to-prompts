# Video to Prompts

A desktop application that breaks down video clips into important visual components for analysis, asset creation, editing, or production planning. Uses **local AI** (LM Studio) to generate descriptions and analyze action between frames.

## Features

### Frame Extraction
- **Video Import**: Drag-and-drop or file picker for video files (MP4, MOV, AVI, MKV)
- **Video Metadata**: Display duration, FPS, resolution, codec, and bitrate
- **Three Extraction Modes**:
  - **Time Frames**: Extract frames at regular time intervals (configurable FPS)
  - **Keyframes**: Extract actual video keyframes (I-frames from video encoding)
  - **Scene Detection**: Detect and extract frames where significant visual changes occur

### AI-Powered Analysis
- **Frame Selection**: Click to select frames, Ctrl/Cmd+Click for multi-select, Shift+Click for range
- **Analyze Selected/All**: Generate AI descriptions for individual frames
- **Frame Comparison**: Select 2 frames to analyze the *action* and *object flow* between them
- **Export to JSON**: Save all analysis data or comparison results

### AI Analysis Output
Each analyzed frame includes:
- **Summary**: Concise description of frame content
- **Objects**: List of detected objects
- **Tags**: Descriptive keywords
- **Scene Type**: indoor/outdoor/portrait/etc
- **Visual Elements**: Dominant colors, lighting description

Frame comparisons include:
- **Action Description**: What's happening between frames
- **Object Flow**: How objects moved or changed
- **Differences**: Key visual differences

## Requirements

- **Node.js 18+**
- **LM Studio** running locally at `http://localhost:1234`
  - **Model**: Requires a vision-capable model (e.g., `qwen/qwen3-vl-4b` or `llava`)
  - **Local Server**: Must have the "Local Server" started in LM Studio.

## Getting Started

### 1. LM Studio Setup
1. Download and install [LM Studio](https://lmstudio.ai/).
2. Search for and download a vision model (recommend: `qwen/qwen3-vl-4b`).
3. Go to the **Local Server** tab (↔️ icon).
4. Load the vision model and click **Start Server**.
5. Ensure the server is running on port `1234`.

### 2. Application Installation
```bash
npm install
```

### 3. Cleanup (If upgrading from v1.0)
If you previously used the Transformers.js version, you can reclaim several GBs of space:
1. Delete the `%AppData%\YourAppName\models` folder.
2. Delete `%USERPROFILE%\.cache\huggingface` if not needed for other tools.

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Usage

1. **Load a video** via drag-and-drop or file picker
2. **Configure extraction settings** (FPS, scene threshold, extraction modes)
3. **Click "Run Extraction"** to extract frames
4. **Select frames** for analysis:
   - Click a frame to select it
   - Ctrl/Cmd+Click to add/remove from selection
   - Shift+Click to select a range
5. **Analyze frames**:
   - Click **"Analyze Selected"** to analyze only selected frames
   - Click **"Analyze All"** to analyze every frame
6. **Compare two frames**:
   - Select exactly 2 frames
   - Click **"Compare Action"** (purple button)
   - View the side-by-side comparison with AI analysis
7. **Export results**:
   - **"Export JSON"**: Saves all analyzed frame data
   - **"Export to JSON"** (in comparison view): Saves comparison result

## Project Structure

```
Video to Prompts/
├── electron/                    # Electron Main Process
│   ├── main.ts                 # App entry, window management, IPC handlers
│   ├── preload.ts              # Bridge between main and renderer processes
│   ├── ffmpeg.ts               # FFmpeg video processing functions
│   └── lmstudio.ts             # LM Studio AI integration
├── src/                         # React Frontend (Renderer Process)
│   ├── App.tsx                 # Main application component
│   ├── App.css                 # Application styles
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # TypeScript type definitions
│   └── components/
│       ├── FilePicker.tsx      # Video file selection component
│       ├── ControlPanel.tsx    # Extraction settings controls
│       ├── ThumbnailGrid.tsx   # Frame display grid with selection
│       └── ComparisonView.tsx  # Frame comparison modal
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite bundler configuration
└── tsconfig.json               # TypeScript configuration
```

## Technology Stack

- **Electron**: Desktop application framework
- **React**: UI library
- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool and dev server
- **FFmpeg**: Video processing (via `ffmpeg-static`)
- **LM Studio**: Local AI inference (vision models)

## How It Works

1. **User loads a video** via drag-and-drop or file picker
2. **Video metadata is displayed** (duration, FPS, resolution, codec, bitrate)
3. **FFmpeg extracts frames** based on selected options
4. **Frames are displayed** in a thumbnail grid with color-coded type badges:
   - 🔵 Blue: Time-based frames
   - 🟢 Green: Keyframes (I-frames)
   - 🟠 Orange: Scene change frames
5. **User selects frames** for AI analysis
6. **LM Studio analyzes frames** via local API:
   - Single frames: Generates summary, objects, tags, scene type
   - Two frames: Analyzes action, object flow, and differences
7. **Results can be exported** to JSON for further use

## JSON Export Format

### Frame Analysis Export
```json
{
  "source_video": "C:/path/to/video.mp4",
  "exported_at": "2025-12-13T...",
  "total_frames": 10,
  "analyzed_frames": 10,
  "frames": [
    {
      "path": "...",
      "type": "scene",
      "time": 1.5,
      "description": "A person walking...",
      "objects": ["person", "tree", "car"],
      "tags": ["outdoor", "daytime", "urban"],
      "scene_type": "outdoor",
      "visual_elements": {
        "dominant_colors": ["blue", "green"],
        "lighting": "natural daylight"
      }
    }
  ]
}
```

### Frame Comparison Export
```json
{
  "source_video": "C:/path/to/video.mp4",
  "exported_at": "2025-12-13T...",
  "start_frame": "path/to/frame1.png",
  "end_frame": "path/to/frame2.png",
  "analysis": {
    "action_description": "The person moves from left to right...",
    "object_flow": "The car in the background has moved...",
    "differences": ["Person position changed", "Lighting shifted"],
    "confidence": 0.9
  }
}
```

## License

MIT
