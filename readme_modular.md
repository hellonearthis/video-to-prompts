# Modular Prompt System

The application features a production-ready **Modular Prompt Architecture** configured in [`qwen_vl3_prompts.json`](./qwen_vl3_prompts.json) and executed dynamically by [`electron/llamaServer.ts`](./electron/llamaServer.ts).

Rather than relying on brittle, monolithic paragraphs, prompts are composed of focused, domain-specific modules that can be mixed and matched into presets, with optional second-pass style transformations and logic checks.

---

## 1. Architecture Overview

```
                      qwen_vl3_prompts.json
                     ┌──────────────────────┐
                     │  _preset_prompts []  │
                     └──────────┬───────────┘
                                │
               ┌────────────────┴────────────────┐
               ▼                                 ▼
      ┌─────────────────┐               ┌─────────────────┐
      │  presets { }    │               │  modules { }    │
      │  Combines keys  │               │  Atomic prompt  │
      │  from modules   │               │  instructions   │
      └────────┬────────┘               └─────────────────┘
               │
               ▼
      [Pass 1: Vision Model]  ───► JSON Output (summary, objects, tags)
               │
               ▼ (Optional Second Pass)
      ┌──────────────────────────────────────────┐
      │  styles { }       /  refinements { }     │
      │  (Poetic, etc.)   /  (Conflict Check)    │
      └──────────────────────────────────────────┘
               │
               ▼
      [Pass 2: Text Refinement] ───► Final Styled Description
```

---

## 2. Active Modules in `qwen_vl3_prompts.json`

### Camera & Composition (`modules.camera`)
* **`composition`**: Framings, rule-of-thirds, symmetry, leading lines, lens types, depth of field, and bokeh.
* **`movement`**: Camera trajectories (static, push-in, pull-out, tracking, pan, tilt, handheld, whip-pan, drone).
* **`angles`**: Shot scale and perspective (low-angle, high-angle, Dutch tilt, eye-level, bird's-eye).

### Narrative & Story Beats (`modules.narrative_beats`)
* **`story_arc`**: Implied narrative beat, motivation, and dramatic turning points.
* **`emotional_arc`**: Character agency, micro-expressions, vulnerability, and internal tension.
* **`pacing`**: Cinematic pacing rhythm roles (Hook, Setup, Progression, Emphasis, Turning Point, Payoff, Breath, Close).

### Technical & Digital Interfaces
* **`screen_recording.ui_walkthrough`**: UI/UX layout, buttons, modals, form fields, and software state.
* **`screen_recording.cursor_interaction`**: Mouse position, hover states, clicks, and active inputs.
* **`procedural.step_progression`**: Step-by-step physical or software instructional actions and tools.

### Lighting (`modules.lighting`)
* **`standard`**: Light source direction, quality (hard/soft), and exposure.
* **`cinematic`**: Key, fill, backlight, practicals, contrast ratios, and atmospheric roll-off.
* **`volumetric`**: Light interaction with air/particles (dust, fog, volumetric shafts, bloom).
* **`color_temp`**: Warm vs. cool contrast, neon hues, and color temperature.

### Theme & Environment
* **`theme.photorealistic`**: Real-world optical fidelity and sensor characteristics.
* **`theme.noir`**: High-contrast chiaroscuro, long shadows, and gritty realism.
* **`scene.spatial`**: 3D spatial layout, foreground/midground/background layering.
* **`scene.world_building`**: Environmental storytelling, wear, history, and architecture.

### Accessibility & Audio Description (`modules.accessibility`)
* **`audio_description`**: Present-tense audio description script describing purely visual actions, settings, and changes designed for visually impaired narration between dialogue pauses.
* **`visual_alt_text`**: Concise, descriptive alt-text summarizing visual subject and primary action.

### Conversational Dynamics (`modules.conversational`)
* **`turn_taking`**: Speaker turn-taking, active listening cues, gaze direction, and visual attention.
* **`interpersonal_dynamics`**: Visual markers of agreement, disagreement, tension, dominance, and rapport.

### Music & Live Performance (`modules.performance`)
* **`stage_and_lighting`**: Stage lighting cues, practical fixtures, spot vs wash, haze, and performers' blocking.
* **`rhythm_sync`**: Visual rhythm: cuts-on-the-beat, choreographic tempo, instrument playing, and physical energy.

### Advertising & Commercial Persuasion (`modules.advertising`)
* **`value_prop`**: Featured products, branding, claimed value, packaging legibility, and demonstrations.
* **`call_to_action`**: Calls to action (CTA), promo URLs, pricing overlays, disclaimers, and social proof cues.

### On-Screen Text & OCR (`modules.text_ocr`)
* **`on_screen_text`**: Quoting legible on-screen text verbatim with screen placement and diegetic (in-scene) vs overlay classification.

### Characters & Objects
* **`characters.costume`**: Fabric textures, historical accuracy, wear, and silhouette.
* **`characters.micro_expressions`**: Subtle emotional cues and eye focus.
* **`objects.materiality`**: Surface textures (patina, brushed metal, worn leather, glass).

---

## 3. Modular Presets

Presets combine module keys into production-grade prompts selectable in the UI dropdown:

| Preset Name | Composed Module Keys | Best Used For |
| :--- | :--- | :--- |
| **Ultra Cinematic Detailed** | `lighting.cinematic`, `camera.composition`, `theme.photorealistic` | High-fidelity photorealistic and film scene analysis |
| **Cinematic Rhythm & Shot Breakdown** | `camera.composition`, `camera.movement`, `narrative_beats.pacing` | Director's cut pacing, edit breakdown, and shot scales |
| **Screen Recording & UI Walkthrough** | `screen_recording.ui_state`, `screen_recording.user_actions` | Software demos, tutorials, and desktop UI workflows |
| **Procedural / Instructional Step** | `procedural.steps_order`, `procedural.tools_materials`, `procedural.critical_actions` | Cooking, assembly, crafting, or technical how-to videos |
| **Narrative Beats & Emotional Arcs** | `narrative_beats.dramatic_conflict`, `narrative_beats.turning_point` | Storyboards, drama clips, and character-driven scenes |
| **Modular: Video Accessibility & AD** | `accessibility.audio_description`, `accessibility.visual_alt_text`, `camera.framing` | Screen-reader alt-text & broadcast audio description narration |
| **Modular: Interview & Dialogue** | `conversational.turn_taking`, `conversational.interpersonal_dynamics`, `camera.angles` | Podcasts, interviews, meetings, debates, and talk shows |
| **Modular: Music & Live Performance** | `performance.stage_and_lighting`, `performance.rhythm_sync`, `camera.movement` | Music videos, concerts, choreography, and stage performances |
| **Modular: Commercial & Persuasion** | `advertising.value_prop`, `advertising.call_to_action`, `text_ocr.on_screen_text` | Ads, brand films, social commercials, and product reviews |
| **Tags** | Dedicated keyword extraction prompt | Quick tagging, asset search, and cataloging |
| **Simple Description** | Concise single-sentence prompt | Lightweight overviews and fast thumbnail scanning |

---

## 4. Two-Pass AI Refinements & Styles

The system supports an optional non-destructive second pass using the loaded multimodal model without reloading:

### Style Transformations (`styles`)
Takes the objective visual summary and transforms it into creative formats:
* **`Poetic`**: Lyrical free-verse focusing on metaphor and mood.
* **`Documentary`**: Objective, academic archival voice.
* **`Screenplay`**: Formats directly into industry-standard scene headings (`INT./EXT.`) and action paragraphs.
* **`Midjourney V6`**: Dense, comma-separated generative AI token list emphasizing composition and lighting.
* **`Glitch`**: Fragmented sentences, digital artifacts, and stylized cyberpunk motifs.

### Conflict & Evidence Refinements (`refinements`)
* **`Conflict Check`**: Logic check comparing environmental cues against lighting and time of day, highlighting inconsistencies.
* **`Evidence vs Inference`**: Enforces strict epistemic boundaries, stripping mind-reading assumptions and hedging inferences.
* **`Transcript-Visual Alignment`**: Flags ironies, contradictions, or discrepancies between spoken dialogue and visual action.
* **`Accessibility & Photosensitivity`**: Evaluates on-screen text contrast ratios and flags rapid stroboscopic flashing hazards.

---

## 5. Execution Pipeline

When the user selects a preset:
1. [`electron/llamaServer.ts`](./electron/llamaServer.ts) resolves the preset key in `qwen_vl3_prompts.json`.
2. Assembles the individual module instructions into a cohesive prompt.
3. Wraps the prompt in a structured JSON schema instruction.
4. Sends the image + prompt to `llama-server` on `http://localhost:8081`.
5. Uses `safeParseJson` to clean thinking tokens (`<think>`), parse code blocks, and guarantee structured schema return.
6. If a Style or Refinement is selected, dispatches a second text completion pass to the same loaded model.

---

## 6. Frontend Visual Badges & Schema Extensions

The UI directly surfaces enriched analysis data from modular presets in [`src/components/ThumbnailGrid.tsx`](./src/components/ThumbnailGrid.tsx):

* 🔤 **Text Badge** (`on_screen_text`): Displays detected text verbatim, showing screen placement (Top, Center, Bottom) and indicating whether it is diegetic (in-scene) or an overlay.
* 👁️ **Observed Badge** (`evidence_breakdown.observable_facts`): Highlights grounded visual evidence verified in the frame.
* 💡 **Inferred Badge** (`evidence_breakdown.inferred_intent`): Highlights narrative intent and cinematic subtext, kept distinct from observable facts.
* ✨ **Style Badge** (`styled_content`): Displays second-pass stylistic rewrites (Poetic, Screenplay, Midjourney V6).
* ⚖️ **Check Badge** (`consistency_check`): Displays logic checks, lighting contradictions, or photosensitivity warnings.

### Automated Integrity Testing
All presets, modules, styles, and refinements are strictly verified by [`electron/agent/__tests__/promptPresetIntegrity.test.ts`](./electron/agent/__tests__/promptPresetIntegrity.test.ts):
```bash
npm test
```
This guarantees that every preset declared in `_preset_prompts` maps to valid module definitions with zero broken references.
