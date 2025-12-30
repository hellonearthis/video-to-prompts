# Video to Prompts

A desktop application that breaks down video clips into important visual components for analysis, asset creation, editing, or production planning. Uses **local AI** (LM Studio) to generate descriptions and analyze action between frames.

## Features

### Frame Extraction
- **Video Import**: Drag-and-drop or file picker for video files (MP4, MOV, AVI, MKV)
- **Video Metadata**: Display duration, FPS, resolution, codec, and bitrate
- **Smart Extraction**: Automatically detects existing extraction folders and offers to reuse frames or clear and re-run.
- **Three Extraction Modes**:
  - **Time Frames**: Regular time intervals (configurable FPS)
  - **Keyframes**: Actual video keyframes (I-frames)
  - **Scene Detection**: Detect and extract frames where significant visual changes occur
- **Automatic Image Scaling**: Extracted frames are automatically scaled to a 640x420 (landscape) or 420x640 (portrait) bounding box to optimize AI analysis performance and memory usage.

### AI-Powered Analysis
- **Frame Selection**: Click to select frames, Ctrl/Cmd+Click for multi-select, Shift+Click for range
- **Analyze Selected/All**: Generate AI descriptions for individual frames
- **Frame Comparison**: Select 2 frames to analyze the *action* and *object flow* between them
- **Sequential Flow Analysis**: Select multiple frames (3+) to analyze the continuous flow of action and changes across the sequence
- **Full Storyboard View**: View all saved scenes as a continuous, scrollable narrative.
- **Story Timeline Persistence**: Scenes are saved to `story_timeline.json` and restored automatically.
- **Analysis Progress Feedback**: A real-time timer provides a life signal during long AI analyses.
- **Export to JSON**: Save analysis data, comparison results, or full story timelines

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

Story Analysis includes:
- **Narrative Arc**: "What happened", "The Change", and "Implied Subtext"
- **Key Entities**: Main characters and their roles (Protagonist/Antagonist)
- **Story Signals**: Importance score, agency, and emotional shifts
- **Visual Narrative Grammar**: Color-coded sections for intuitive reading:
    - 🔵 **Setup / Atmosphere**: Context and environment
    - 🟢 **Action**: Major events and turning points
    - 🟠 **Reaction**: Emotional beats and subtext
    - 🟣 **Reveal**: Narrative climax and significant shifts
- **Panel Guidance**: AI-suggested comic panel layout, selecting the *best* frames for specific beats

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

### 2. LM Studio Troubleshooting & Limits

If you encounter **Analysis Failed (API Error 400)**, it is usually related to model context or token limits.

- **Context Window (Token Limits)**: 
  - Vision models process images as large batches of tokens. Analyzing a "Story" with 4-6 frames can easily exceed default context limits.
  - **The Fix**: In LM Studio's **Server Tab** (right sidebar), look for **"Context Length"** or **"Context Window"**. Set this to at least **10000** or **32000** (or higher if your GPU supports it).
- **GPU Offload**: Ensure **GPU Offload** is enabled and set to "Max" if possible. Vision models are significantly slower and more prone to timeouts on CPU.
- **Image Processing Capacity**:
  - The application sends full-resolution frames. If you have low VRAM, try analyzing fewer frames at once.
  - If the model crashes frequently, try a smaller quantized version of the vision model (e.g., 4-bit vs 8-bit).

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
4. **Smart Reuse**: If frames already exist, choose **"Reuse"** to skip extraction and restore your **Story Timeline**.
5. **Select frames** for analysis:
   - Click a frame to select it
   - Ctrl/Cmd+Click to add/remove from selection
   - Shift+Click to select a range
6. **Analyze frames**:
   - Click **"Analyze Selected"** to analyze only selected frames
   - Click **"Analyze All"** to analyze every frame
7. **Compare two frames (Action Analysis)**:
   - Select exactly 2 frames
   - Click **"Compare Action"** (purple button)
   - View the side-by-side comparison with AI analysis
8. **Analyze Story (Director's Cut)**:
   - Select multiple frames (2+) that form a scene
   - Click **"Analyze Story"** (in the action bar)
   - View the narrative breakdown and AI-suggested panel layout
   - **Add to Timeline**: Save the scene to your session timeline
- **View Full Storyboard**: Click "📖 View Full Storyboard" in the timeline header to see the entire narrative sequence
9. **Export results**:
   - **"Export JSON"**: Saves all analyzed frame data
   - **"Export to JSON"** (in comparison/story view): Saves specific analysis results

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
│   ├── App.css                 # Application layout styles
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # TypeScript type definitions
│   └── components/
│       ├── FilePicker.tsx      # Video selection component
│       ├── FilePicker.css      # Component styles
│       ├── ControlPanel.tsx    # Extraction settings
│       ├── ControlPanel.css    # Component styles
│       ├── ThumbnailGrid.tsx   # Frame display grid
│       ├── ThumbnailGrid.css   # Component styles
│       ├── ComparisonView.tsx  # Frame comparison modal
│       ├── ComparisonView.css  # Component styles
│       ├── StoryboardView.tsx  # Narrative analysis view
│       ├── StoryboardView.css  # Component styles
│       ├── TimelineStrip.tsx   # Saved scenes timeline
│       ├── TimelineStrip.css   # Component styles
│       ├── FlowReport.tsx      # Action flow report
│       └── FlowReport.css      # Component styles
├── package.json                 # Dependencies and scripts
├── vite.config.ts              # Vite bundler configuration
└── tsconfig.json               # TypeScript configuration
```

## Architecture: Clean CSS System

The application has been refactored to use a **100% Class-Based CSS architecture**. 
- **Zero Inline Styles**: All component styling is managed via external `.css` files.
- **Consistent Theming**: Uses CSS variables for color coordination and visual narrative grammar.
- **Maintainability**: Clear separation of concerns between structure (TSX) and presentation (CSS).

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
   - Fram Pairs: Analyzes action, object flow, and differences
   - Sequences: Generates narrative storyboards and panel layouts
7. **Results can be exported** or saved to the timeline

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
