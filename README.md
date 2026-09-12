# Video to Prompts

A desktop application that breaks down video clips into important visual components for analysis, asset creation, editing, or production planning. Uses **local AI** (LM Studio) to generate descriptions and analyze action between frames.

## Features

### Frame Extraction
- **Video Import**: Drag-and-drop or file picker for video files (MP4, MOV, AVI, MKV)
- **Video Metadata**: Display duration, FPS, resolution, codec, and bitrate
- **Smart Extraction**: Automatically detects existing extraction folders and offers to reuse frames or clear and re-run.
- **Four Extraction Modes**:
  - **Time Frames**: Regular time intervals (configurable FPS)
  - **Keyframes**: Actual video keyframes (I-frames)
  - **Scene Detection**: Detect and extract frames where significant visual changes occur
  - **Dual-Frame (15%/85% A/B) Shot Extraction**: Inspired by the Reelbench architecture. Rather than extracting cut boundary frames (which often suffer from flash cuts, dissolve artifacts, or codec noise), this mode discovers continuous shot intervals, filters micro-noise (< 0.3s), and samples paired keyframes at the 15% mark (establishing composition) and 85% mark (resolution composition).
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

### ⚡ Smart Storyboard Extractor (Autonomous Agentic Mode)
An intelligent, autonomous video understanding pipeline powered by local Vision-Language Models (e.g., `qwen/qwen3-vl-8b`, `qwen2.5-vl-7b`) running via LM Studio. Instead of processing an entire video at a fixed frame rate, the agent autonomously discovers turning points, zooms into sub-second moments, and writes high-fidelity image prompts.

- **Phase A — Macro Turning Point Scan (Coarse Pass)**:
  - Divides video into 16 evenly-spaced midpoint intervals and extracts lightweight frames downscaled to $640\times360$.
  - Evaluates the whole video in a single inference call along with optional spoken dialogue from an attached SubRip (`.srt`) subtitle file (e.g. from ComfyUI + Qwen ASR).
  - Proposes up to $N$ key dramatic beats (Setup, Conflict Escalation, Dramatic Climax, Resolution).
- **Phase B — Temporal Refinement & Sub-Second Zoom**:
  - Slices a high-density temporal window ($\pm 3$ seconds at 4 FPS) around each candidate turning point.
  - Injects localized spoken dialogue ($\pm 8$ seconds around the candidate moment) without bloating the context with unrelated scenes.
  - The model selects the exact peak frame using integer **frame-index grounding** (`{"frameIndex": 3}`), or requests a narrower sub-second zoom (`{"action": "zoom", "start_sec": ..., "end_sec": ...}`).
  - Bounded by strict global safety budgets to guarantee predictable, crash-free execution on local 16GB VRAM GPUs.
- **Phase C — High-Fidelity Prompt Synthesis**:
  - Extracts a single uncompressed, full-resolution frame at the winning timestamp.
  - Automatically passes the frame to `analyzeFrame()` using your selected prompt preset from `qwen_vl3_prompts.json` (e.g., *Ultra Cinematic Detailed*, *Tags*, *Simple Description*).
  - Enriches the storyboard timeline with visual analysis, scene types, tags, narrative rationale, and generative AI prompt tokens.
- **Token & VRAM Hygiene (MyClaw Playbook Architecture)**:
  - **Prefix KV-Cache Locking**: Shared static system prompt prefix (`AGENT_SYSTEM_PROMPT_PREFIX`) enables `llama.cpp` / LM Studio to reuse prompt KV tensors across calls, eliminating prompt reprocessing latency.
  - **Context Isolation**: Every candidate turning point runs in a fresh, isolated conversation session. Intermediate exploration frames are discarded immediately after pinpointing rather than accumulating across turns.
  - **Localized Dialogue Windowing**: Restricts transcript injection to $\pm 8\text{s}$ around each candidate beat, avoiding multi-thousand token dialogue leaks.
  - **Resolution Downscaling**: Exploration frames are bounded to $640\times360$ (~300 vision tokens/frame), reserving full-resolution tokens solely for the final winning frames.

### AI Analysis Output
Each analyzed frame includes:
- **Summary**: Concise description of frame content
- **Objects**: List of detected objects
- **Tags**: Descriptive keywords
- **Scene Type**: indoor/outdoor/portrait/etc
- **Visual Elements**: Dominant colors, lighting description
- **Cinematic Rhythm Role**: Grounded pacing beat classification (Hook, Setup, Progression, Emphasis, Turning Point, Payoff, Breath, Close)
- **Camera Movement**: Inferred camera trajectory (Static, Push in, Pull out, Pan left/right, Tilt, Tracking, Handheld, Drone)

Frame comparisons include:
- **Action Description**: What's happening between frames
- **Camera Movement & Rhythm Role**: Grounded cinematography and pacing classifications
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
- **Deduplication Logic**: Automatically ensures that "objects" and "tags" are mutually exclusive for cleaner analysis results.
- **Custom Tooltips**: Enhanced UI with custom, styled tooltips for timeline events and status indicators.

## Requirements

- **Node.js 18+**
- **LM Studio** running locally at `http://localhost:1234`
  - **Model**: Requires a vision-capable model (e.g., `qwen/qwen3-vl-4b` or `llava`)
  - **Local Server**: Must have the "Local Server" started in LM Studio.

### 3. Custom Prompts Configuration

You can customize the AI analysis behavior by editing the `qwen_vl3_prompts.json` file located in the root directory (or alongside the executable).

#### **File Structure**
```json
{
  "_preset_prompts": [
    "Tags",
    "Simple Description",
    "Ultra Cinematic Detailed",
    "Cinematic Rhythm & Shot Breakdown"
  ],
  "qwenvl": {
    "Tags": "...",
    "Simple Description": "...",
    "Ultra Cinematic Detailed": "...",
    "Cinematic Rhythm & Shot Breakdown": "..."
  }
}
```

#### **How It Works**
1.  **Loading**: On startup, the app loads `qwen_vl3_prompts.json`.
2.  **Dropdown**: The `_preset_prompts` list populates the "Analysis Prompt" dropdown in the sidebar.
3.  **Single/Batch Analysis**: When you click **"Analyze Item(s)"**, the app sends the prompt text corresponding to your selected key (e.g., `qwenvl["Tags"]`) to the AI.
4.  **Story Analysis (Dual Phase)**: 
    -   **Phase 1**: Uses a built-in "Story Witness" prompt to determine narrative structure.
    -   **Phase 2**: Automatically uses the `"Ultra Cinematic Detailed"` prompt from the JSON to generate high-fidelity visual descriptions for each storyboard panel. You can edit this specific key in the JSON to change the style of the final storyboard descriptions.

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

### Running Unit Tests

The project includes an official unit test suite (23 tests across 4 suites) covering Reelbench 15%/85% sampling math, cinematic rhythm role schemas, subtitle parsing, localized dialogue windowing, resilient prompt tool parsing, float timestamp fallbacks, and VRAM budget boundaries. It runs directly via Node.js native test runner without any external test runner dependencies:

```bash
npm test
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

## Model Context Protocol (MCP) & Chrome DevTools

The workspace is configured to integrate with AI agent assistants (such as Antigravity, Claude Code, and Cursor) via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/):

### 1. Workspace Configuration (`.agents/mcp_config.json`)
The project includes a workspace MCP configuration for [`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp):

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ]
    }
  }
}
```

### 2. Available Agent Tools
- **Page Navigation**: Navigate directly to local dev instances (e.g., `http://localhost:5173`).
- **DOM & Script Evaluation**: Run JavaScript expressions in the renderer context to inspect state and verify component interactions.
- **Viewport Screenshots**: Capture real-time UI screenshots into the AI agent context.
- **Network & Performance**: Inspect network requests and performance traces.

### 3. WebMCP Compatibility
Architecturally ready for Google Chrome Labs' client-side **WebMCP** specification (`document.modelContext`), allowing web applications to declare declarative AI tool endpoints directly inside browser components.

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

## LTX-2 Prompting Guide

### Narrative Flow
**Role**: AI Cinematographer and LTX2 Prompt Engineer.
**Output Rules**:
1.  **Single Flowing Paragraph**: No bullet points or line breaks.
2.  **Present-Tense Action Verbs**: Use "walks," "tilts," "glides" (not "was walking").
3.  **Explicit Camera Behavior**: Use specific moves like "The camera pans," "tracks," "pushes in," "tilts up," "glides overhead," or "cuts to".
4.  **Audio Integration**: Weave audio descriptions directly into the narrative (e.g., "the low rumble of explosions rolls across the dunes"). Dialogue stays in "double quotes".
5.  **Show, Don't Tell**: Translate emotions into physical cues (e.g., "shoulders slump" instead of "sadness").
6.  **Visual Details**: Incorporate lighting, texture, and atmosphere (fog, dust, neon glow).
7.  **Transitions**: Use connectors like "then," "suddenly," "meanwhile," or "as".

### Dialogue Sequencing
1.  **Quotation Marks and Attribution**: Place spoken text in double quotes and identify the speaker.
    - *Example*: The woman says softly, "That’s it... Dad’s lost it."
2.  **Control the "Director’s Eye"**: Describe the visual shift (camera move) when a new character speaks.
    - *Example*: The camera slowly pans right, revealing the grandfather... He shouts, "Wheeeew!"
3.  **Narrative Connectors**: Use transition words like "then," "responds," "a beat," or "followed by".
4.  **Emotional and Vocal Cues**: Describe how the line is delivered (whispering, shouting, deadpan) and accents.

> [!TIP]
> **Transformation Logic**:
> - JSON summary → Establishing Shot (Wide view)
> - JSON key_entities → Subject Definitions (Costume, appearance, lighting)
> - JSON uncertainty → Visual Ambiguity (Shadows, blur, distance)
> - JSON sound → Atmospheric Description

---

LTX2 Ultra-Detailed Cinematic System Prompt:

Role: You are an expert AI Cinematographer and LTX2 Prompt Engineer. Your goal is to convert concepts into a single, flowing narrative paragraph (10 to 16 sentences) that is rigorously optimized for the LTX2 video generation model.
Output Rules (Strict Adherence Required):
1. Format & Structure:
    ◦ Write ONE continuous paragraph only. Do not use bullet points, lists, or line breaks, as these confuse the model’s temporal understanding.
    ◦ Use Present-Tense Action Verbs exclusively (e.g., "glides," "reflects," "adjusts" instead of "is standing" or "was walking") to ensure immediate motion.
    ◦ Maintain a length of 180 to 320 words (10-16 sentences) to allow for the requested depth of detail while maintaining the cohesion required by LTX2.
2. Visual Micro-Detail:
    ◦ Subject Details: Describe materials and textures explicitly (e.g., "worn leather," "rough stone," "frayed denim"). Note specific signs of wear, patina, and surface reflectivity.
    ◦ Human Details: If people are present, specify skin texture/pores, hair movement, fabric weight, and fit. Avoid abstract emotions; use physical cues (e.g., instead of "he is sad," write "his shoulders slump and a tear trails down his cheek").
    ◦ Lighting Analysis: define the Key, Fill, and Back light. Describe the direction, softness, highlight roll-off, and the shape of the shadows cast.
3. Cinematic Mechanics:
    ◦ Explicit Camera Behavior: You must direct the camera. Use specific terms like "tracks," "pushes in," "pans," "tilts up," or "rack focus." Describe how the perspective shifts relative to the subject.
    ◦ Composition: Describe leading lines, negative space, and depth of field (e.g., "shallow depth of field blurs the neon signage in the background").
    ◦ Temporal Flow: Use connectors like "as," "while," "then," and "suddenly" to ensure actions flow logically into one another without static pauses.
4. Audio & Atmosphere:
    ◦ Audio Integration: Do not list sounds separately. Weave auditory descriptions directly into the narrative (e.g., "the low hum of machinery vibrates through the floor," "rain drums rhythmically against the glass").
    ◦ Dialogue: If a character speaks, place the text inside double quotation marks.
Input Data: [Insert your scene concept, image description, or raw ideas here]
