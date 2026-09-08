# Modular Prompt System

The goal is to move from monolithic prompt paragraphs to a **modular** structure. This allows mixing and matching different aspects of visual analysis (Theme, Scene, Characters, Objects, Lighting, Mood) to create highly specific or experimental outputs without rewriting entire prompts.

## Proposed Structure

The `qwen_vl3_prompts.json` can be restructured to have two main sections:
1.  **`modules`**: Individual building blocks.
2.  **`presets`**: Combinations of modules (this matches the current "dropdown" selection in the UI).
3.  **`styles`**: Instructions for the Text Model to rewrite the output.

### Module Categories

#### 1. Lighting (Requested Focus)
*   **Standard**: "Describe the lighting sources, direction, and quality (hard/soft)."
*   **Cinematic**: "Analyze the lighting using cinematic terminology: key light, fill light, back light, practicals, and atmospheric effects."
*   **Volumetric/Atmospheric**: "Focus on light interaction with air/particles (上帝 light rays, fog, dust), bloom, and glow."
*   **Studio**: "Describe the lighting setup as if in a photography studio (Rembrandt, Butterfly, Split lighting)."
*   **Color & Temp**: "Analyze specific color temperatures (warm vs cool contrast) and colored lighting (neon, gels)."

#### 2. Theme / Style
*   **Photorealistic**: "Focus on realism, textbook photography terms."
*   **Artistic**: "Describe the image as an artwork, noting brushwork, medium (oil, watercolor), or digital style (3D render, cel shaded)."
*   **Genre-Specific**: "Analyze using tropes from [Genre] (e.g., Cyberpunk, Noir, Western)."

#### 3. Scene / Environment
*   **Spatial**: "Describe the layout, depth perception, and spatial relationships of elements."
*   **World-Building**: "Infer the history and context of the location based on visual clues (decay, architecture, technology)."

#### 4. Characters
*   **Demographic**: "Age, gender, ethnicity."
*   **Fashion/Costume**: "Detailed analysis of clothing, fabrics, historical accuracy, or sci-fi functionalism."
*   **Emotion/Action**: "Micro-expressions, body language, and current activity."

#### 5. Objects
*   **Inventory**: "List distinct objects visible."
*   **Materiality**: "Describe the textures and materials (rust, polished metal, velvet, slime)."

#### 6. Mood / Atmosphere
*   **Emotional**: "What feeling does the image evoke? (Melancholy, Joy, Dread)."
*   **Sensory**: "Describe implied sensory details (temperature, smell, sound) based on visuals."

## New Module Ideas

### Camera & Composition Module
*   **Lens**: "Estimate focal length (wide angle, telephoto, macro) and aperture (bokeh, depth of field)."
*   **Framing**: "Rule of thirds, center framing, golden ratio, leading lines."
*   **Shot Type**: "Cowboy shot, close-up, extreme long shot."

### Narrative Module
*   **Story beats**: "What happened just before this moment? What will happen next?"
*   **Conflict**: "Identify visual conflict or tension in the frame."

### Technical Analysis Module
*   **Quality**: "Analyze image quality, noise, sharpness, and artifacts."

## AI Refinement & Styles (New)

We can introduce a "Second Pass" where a Text Model (like Llama 3, Mistral, or Qwen-VL itself) processes the initial observation.

### 1. Conflict Checking
*   **Logic**: "Check the description for conflicting elements (e.g., 'sunny day' vs 'starry sky'). If found, offer a revision or flag it."
*   **Modules**: "Verify if the described lighting matches the described time of day."

### 2. Style Transformation
Transform the dry/factual observation into a specific writing style:
*   **Poetic**: "Rewrite the description as free verse poetry, focusing on emotion and metaphor."
*   **Documentary**: "Rewrite as a neutral, objective, historical record."
*   **Glitch/Chaos**: "Rewrite using fragmented sentences, corrupt data artifacts strings, and digital noise metaphors."
*   **Screenplay**: "Format as a standard screenplay scene heading and action block."
*   **Midjourney V6 Optimized**: "Rewrite as a comma-separated list of tokens, prioritizing subject, medium, and style."

## Pros & Cons Analysis

### Pros
1.  **Precision & Control**: separating "Observation" from "Style" allows for much higher accuracy. The Vision model focuses on seeing, the Text model focuses on writing.
2.  **Infinite Variations**: You can observe an image once, then generate 50 different prompt styles (Poetic, Glitch, etc.) without re-running the expensive Vision task.
3.  **Quality Assurance**: The "Conflict Check" acts as a sanity filter, reducing AI hallucinations.
4.  **Experimentation**: Modular parts allow for rapid A/B testing of prompt structures.

### Cons
1.  **Latency (Speed)**: This requires **two** AI calls per image (Vision -> Text). This will double the processing time.
2.  **Model Loading**: If you want to use a *different* model for text (e.g., Llama 3) than vision (Qwen-VL), LM Studio may need to unload/reload models, which takes significant time (seconds to minutes).
    *   *Mitigation*: Use Qwen-VL for *both* tasks to avoid reloading.
3.  **Complexity**: The code becomes more complex. We need to handle the state between the two calls and handle potential errors in the second step.
4.  **Token Cost/Context**: Longer chains of prompts mean more context window usage.

## Recommendation
Start by using **Qwen-VL for both steps**. It is capable of text rewriting and logic checking. This avoids the "Model Loading" penalty. We can structure the "Refinement" as a second API call to the same loaded model.
