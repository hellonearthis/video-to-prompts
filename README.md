# Video to Prompts

A desktop application that breaks down video clips into important visual components for analysis, asset creation, editing, or production planning. Uses **local AI** (`llama-server` via `llama.cpp`) to generate descriptions, analyze action between frames, and autonomously synthesize cinematic storyboards.

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
An intelligent, autonomous video understanding pipeline powered by local Vision-Language Models (e.g., `Qwen3-VL-8B`, `Qwen3.8-27B`, `Qwen2.5-VL-7B`) running via `llama-server`. Instead of processing an entire video at a fixed frame rate, the agent autonomously discovers turning points, zooms into sub-second moments, and writes high-fidelity image prompts.

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
  - **Prefix KV-Cache Locking**: Shared static system prompt prefix reuses prompt KV tensors across calls, eliminating prompt reprocessing latency.
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
- **On-Screen Text (OCR)**: Detects legible text verbatim, screen placement (Top, Bottom, Center, Banner), and diegetic vs overlay classification.
- **Evidence Breakdown**: Enforces epistemic integrity with a clean separation of:
  - `observable_facts`: Objective, unambiguous visual evidence.
  - `inferred_intent`: Hypothesized subtext, narrative motivation, or technical cinematography intent.
- **UI Visual Badges**: Visual indicators rendered directly inside thumbnail cards:
  - 🔤 **Text**: Detected on-screen typography or graphical overlays.
  - 👁️ **Observed**: Physical, visible facts grounded directly in the frame.
  - 💡 **Inferred**: Extrapolated narrative or emotional subtext.
  - ✨ **Style**: Second-pass stylistic transformation (Poetic, Screenplay, Midjourney V6, etc.).
  - ⚖️ **Check**: Logic consistency or photosensitivity advisory.

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
- **Resilient JSON Parser (`safeParseJson`)**: Multi-tier extraction that automatically strips reasoning blocks (`<think>`), cleans code fences, fixes unquoted keys, strips trailing commas, repairs unclosed JSON, and provides structured fallbacks.
- **Deduplication Logic**: Automatically ensures that "objects" and "tags" are mutually exclusive for cleaner analysis results.
- **Custom Tooltips**: Enhanced UI with custom, styled tooltips for timeline events and status indicators.

## Requirements

- **Node.js 18+**
- **llama-server (llama.cpp)** running locally on port `8081` (configurable via `LLAMA_SERVER_PORT` or `LOCAL_AI_URL`)
  - **Vision Model**: Requires a multimodal GGUF model and its companion vision projector (`mmproj*.gguf`) in `C:\llamaCPP\models`.
  - **Tested Models**: `Qwen3-VL-8B-Instruct-Q4_K_M`, `Qwen3.8-27B-ABLITERATED-Q3_K_S`, `Qwen3.5-9B`, `gemma-4-12B-it`.
  - **Recommended GPU**: NVIDIA RTX GPU (e.g. RTX 4070 / 5070 Ti / 4080 / 4090 with 12GB–16GB+ VRAM).

### Custom Prompts Configuration

You can customize the AI analysis behavior by editing the `qwen_vl3_prompts.json` file located in the root directory (or alongside the executable).

#### **File Structure**
```json
{
  "_preset_prompts": [
    "Tags",
    "Simple Description",
    "Ultra Cinematic Detailed",
    "Cinematic Rhythm & Shot Breakdown",
    "Screen Recording & UI Walkthrough",
    "Procedural / Instructional Step",
    "Narrative Beats & Emotional Arcs",
    "Modular: Video Accessibility & AD",
    "Modular: Interview & Dialogue",
    "Modular: Music & Live Performance",
    "Modular: Commercial & Persuasion"
  ],
  "modules": {
    "camera": { ... },
    "lighting": { ... },
    "theme": { ... },
    "narrative_beats": { ... },
    "accessibility": { ... },
    "conversational": { ... },
    "performance": { ... },
    "advertising": { ... },
    "text_ocr": { ... }
  },
  "presets": {
    "Ultra Cinematic Detailed": [
      "lighting.cinematic",
      "camera.composition",
      "theme.photorealistic"
    ],
    "Modular: Video Accessibility & AD": [
      "accessibility.audio_description",
      "accessibility.visual_alt_text",
      "camera.framing"
    ],
    "Modular: Interview & Dialogue": [
      "conversational.turn_taking",
      "conversational.interpersonal_dynamics",
      "camera.angles"
    ],
    "Modular: Music & Live Performance": [
      "performance.stage_and_lighting",
      "performance.rhythm_sync",
      "camera.movement"
    ],
    "Modular: Commercial & Persuasion": [
      "advertising.value_prop",
      "advertising.call_to_action",
      "text_ocr.on_screen_text"
    ]
  },
  "styles": { ... },
  "refinements": { ... }
}
```

#### **How It Works**
1. **Loading**: On startup, the app loads `qwen_vl3_prompts.json`.
2. **Dropdown**: The `_preset_prompts` list populates the "Analysis Prompt" dropdown in the sidebar.
3. **Modular Composition**: When a preset key is selected, the engine dynamically combines individual modules into a coherent, comprehensive prompt.
4. **Single/Batch Analysis**: When you click **"Analyze Item(s)"**, the app sends the assembled prompt text to `llama-server`.
5. **Story Analysis**: Analyzes sequence flow and comic-book panel recommendations using the resilient `safeParseJson` parser.

## Getting Started

### 1. One-Click Launcher (`launch.bat`)

The easiest way to start both `llama-server` and the application is with the bundled interactive launcher:

```cmd
launch.bat
```

**What the launcher does automatically:**
1. Scans `C:\llamaCPP\models` for all GGUF vision models and automatically matches them with their corresponding `mmproj*.gguf` files.
2. Remembers your last selected model for fast one-press launch.
3. Checks if port `8081` is already occupied, offering to stop existing instances cleanly.
4. Spawns `llama-server.exe` with optimal GPU acceleration flags:
   - `-c 16384` (16k context window for multi-frame comparison and storyboards)
   - `--flash-attn on` (Flash Attention for fast, memory-efficient self-attention)
   - `-ctk q8_0 -ctv q8_0` (8-bit quantized KV caching, cutting memory consumption in half to ~1.2 GB)
   - `-ngl 99` (offloads all layers to NVIDIA GPU)
5. Waits for `http://localhost:8081/v1/models` to report ready.
6. Launches the Electron desktop app via Vite dev server.

### 2. Manual Startup (Alternative)

If running `llama-server` manually:
```cmd
llama-server.exe -m "C:\llamaCPP\models\Qwen3-VL-8B-Instruct-Q4_K_M.gguf" --mmproj "C:\llamaCPP\models\mmproj-Qwen3-VL-8B-Instruct-F16.gguf" --port 8081 -c 16384 -ngl 99 --flash-attn on -ctk q8_0 -ctv q8_0
```

Then in this directory:
```bash
npm install
npm run dev
```

### 3. Running Unit Tests

The project includes an official unit test suite (41 tests across 6 test suites) covering Reelbench 15%/85% sampling math, cinematic rhythm role schemas, subtitle parsing, localized dialogue windowing, resilient prompt tool parsing, float timestamp fallbacks, VRAM budget boundaries, and the multi-tier `safeParseJson` resilient parser. It runs directly via Node.js native test runner without external dependencies:

```bash
npm test
```

### 4. Build

```bash
npm run build
```

## Agent Skills & Export Packages

The repository is built with evidence-based video analysis skills and agentic pairing:
- **Workspace Skills**: Located in [`.agents/skills/video-analysis/`](.agents/skills/video-analysis/SKILL.md) providing epistemic grounding, observation-vs-inference rules, and shot log workflows.
- **Export Package**: All workspace and global agent skills are packaged and backed up:
  - Archive: `Exported_Skills.zip` (standalone archive on Desktop)
  - Extracted: `Exported_Skills/` (includes `workspace_skills`, `global_skills`, and `builtin_skills`)

## Model Context Protocol (MCP) & Chrome DevTools

The workspace is configured to integrate with AI agent assistants (such as Antigravity, Claude Code, and Cursor) via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/):

### 1. Workspace Configuration (`.agents/mcp_config.json`)
The project includes workspace MCP configurations for both `chrome-devtools-mcp` and `video-to-prompts`:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx.cmd",
      "args": [
        "-y",
        "chrome-devtools-mcp@latest"
      ]
    },
    "video-to-prompts": {
      "command": "node",
      "args": [
        "--experimental-strip-types",
        "./electron/mcpServer.ts"
      ]
    }
  }
}
```

### 2. Available Video to Prompts MCP Tools (`electron/mcpServer.ts`)
- **`probe_video`**: Extracts video metadata (duration, FPS, resolution, codec, bitrate) via `ffprobe`.
- **`extract_frames`**: Extracts frames via regular time intervals (`fps`), keyframes (`I-frames`), or scene change detection (`sceneThreshold`).
- **`check_llama_server`**: Verifies connectivity to the local `llama-server` instance (`http://localhost:8081`) and dynamically reports the active vision model.
- **`list_prompt_templates`**: Returns all modular prompt presets, style transformations, and refinement filters from `qwen_vl3_prompts.json`.
- **`generate_frame_prompt`**: Submits a frame to local `llama-server` to generate structured prompts and scene analysis JSON.
- **`compare_consecutive_frames`**: Compares two frames to determine visual motion, action flow, and camera transitions.
- **`extract_storyboard`**: Autonomous multi-stage storyboard extractor (coarse scanning, turning point discovery, zoom refinement, and prompt generation).

## Project Structure

```
Video to Prompts/
├── launch.bat                  # One-click Windows batch launcher
├── launcher.ps1                # Interactive PowerShell vision model selector & server daemon
├── qwen_vl3_prompts.json       # Modular prompt system config (modules, presets, styles, refinements)
├── readme_modular.md           # Modular prompt architecture guide & schema reference
├── electron/                   # Electron Main Process
│   ├── main.ts                 # App entry, window management, IPC handlers
│   ├── preload.ts              # Bridge between main and renderer processes
│   ├── ffmpeg.ts               # FFmpeg video processing & probe functions
│   ├── llamaServer.ts          # Core llama-server local AI client & safeParseJson
│   ├── localAiClient.ts        # Endpoint auto-prober & model inspector
│   ├── mcpServer.ts            # MCP server implementation for AI agent pair-programming
│   └── agent/                  # Autonomous storyboard extraction pipeline
│       ├── coarsePass.ts       # Whole-video turning point discovery
│       ├── candidateRefiner.ts # Sub-second temporal zoom pass
│       ├── storyboardExtractor.ts # Pipeline orchestrator
│       ├── promptToolParser.ts # Multi-tier pseudo-tool extractor
│       └── __tests__/          # 41 native Node.js unit tests across 6 suites
├── src/                        # React Frontend (Renderer Process)
│   ├── App.tsx                 # Main application component & badge renderers
│   ├── App.css                 # Application layout styles (100% class-based)
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # TypeScript type definitions (FrameData, FrameAnalysis)
│   └── components/
│       ├── FilePicker.tsx      # Video selection component
│       ├── ControlPanel.tsx    # Extraction settings & prompt selector
│       ├── ThumbnailGrid.tsx   # Frame display grid with dynamic badges (Text, Observed, Inferred)
│       ├── ComparisonView.tsx  # Frame comparison modal
│       ├── StoryboardView.tsx  # Narrative analysis view
│       ├── SmartStoryboardModal.tsx # Autonomous agent storyboard viewer
│       ├── TimelineStrip.tsx   # Saved scenes timeline
│       └── FlowReport.tsx      # Action flow report
├── package.json                # Dependencies and scripts
├── vite.config.ts              # Vite bundler configuration
└── tsconfig.json               # TypeScript configuration
```

## JSON Export Format

### Frame Analysis Export
```json
{
  "source_video": "C:/path/to/video.mp4",
  "exported_at": "2026-10-02T...",
  "total_frames": 10,
  "analyzed_frames": 10,
  "frames": [
    {
      "path": "...",
      "type": "scene",
      "time": 1.5,
      "description": "A person walking across the frame...",
      "objects": ["person", "tree", "car"],
      "tags": ["outdoor", "daytime", "urban"],
      "scene_type": "outdoor",
      "cinematic_rhythm_role": "Progression",
      "camera_movement": "Tracking",
      "visual_elements": {
        "dominant_colors": ["blue", "green"],
        "lighting": "natural daylight"
      },
      "on_screen_text": {
        "text": "EXIT 4B",
        "placement": "Top-Right",
        "is_diegetic": true
      },
      "evidence_breakdown": {
        "observable_facts": "A green highway sign overhead reading 'EXIT 4B'; clear asphalt roadway.",
        "inferred_intent": "The protagonist is approaching an off-ramp decision point."
      }
    }
  ]
}
```

### Frame Comparison Export
```json
{
  "source_video": "C:/path/to/video.mp4",
  "exported_at": "2026-10-02T...",
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
