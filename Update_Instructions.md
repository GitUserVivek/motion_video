Review the existing video-generation project and fix the issues identified in the latest generated video and its raw LLM instructions passed to Remotion. Do not rebuild the project or change its overall architecture. Inspect the existing implementation, identify the responsible code, and make the fixes directly.

### 1. Fix topic understanding and visual relevance
- The inferred topic was `technology`, even though the actual narration was about business profit and loss.
- Fix topic classification so it is derived from the actual generated script/narration, not generic keywords or unrelated metadata.
- Make every scene's visual plan directly represent the narration for that scene.
- Do not use generic calculators, random icons, plants, clouds, servers, or unrelated diagrams when a specific visual explanation is possible.
- Select or download appropriate PNG, SVG, illustrations, icons, and animations automatically.
- Prefer meaningful scene-specific illustrations over generic icon collections.
- Verify that downloaded assets actually represent their assigned concepts.

### 2. Fix scene and animation frame calculations
- The current output mixes global and scene-relative frame numbers.
- Standardize all child animation timings as scene-relative frames.
- Convert them to absolute frames in the Remotion rendering layer using:
  `absoluteStartFrame = scene.startFrame + child.startFrame`
- Apply this consistently to AnimatedText, diagrams, images, transitions, process flows, and nested components.
- Ensure no animation starts before its scene or continues unintentionally beyond its scene.
- Validate all frame ranges against the actual scene duration.

### 3. Fix subtitle synchronization
- Use the generated audio/transcript timestamps as the single source of truth.
- Ensure subtitles are assigned to the correct scenes.
- Split subtitle segments when they cross scene boundaries.
- Never duplicate subtitles between scenes.
- Ensure subtitles appear at the correct audio timestamps and disappear at the correct time.
- Keep subtitle timing independent of scene-relative visual animation timing.

### 4. Improve LLM storyboard instructions
- Remove contradictory instructions in system prompts, user prompts, and scene-generation prompts.
- Do not force every scene to contain unnecessary AnimatedText or repetitive subtitles.
- Titles should communicate the scene's key idea, not repeat the narration.
- Each scene must have a clear educational purpose and a visual explanation.
- Generate specific visual descriptions, asset requirements, animation actions, and transitions.
- Use the actual narration to determine visual style and assets.
- Preserve existing schema compatibility and ensure the LLM returns valid structured output.

### 5. Improve educational storytelling and composition
- Make videos more engaging, visual, and educational rather than presenting static icons and text.
- Use visual storytelling, progressive reveals, comparisons, object movement, diagrams, and meaningful transitions.
- Explain concepts through examples instead of merely displaying their names.
- Highlight important numbers, equations, keywords, and cause-and-effect relationships.
- Avoid overcrowding scenes with text and unrelated elements.
- Maintain consistent visual styling, typography, spacing, and animation quality across scenes.

### 6. Strengthen validation and quality checks
Add validation before rendering for:
- Topic-to-narration relevance.
- Scene-to-narration relevance.
- Asset-to-visual-description relevance.
- Mathematical correctness of displayed values and equations.
- Scene and child frame boundaries.
- Subtitle timestamps and duplicate segments.
- Missing assets and failed downloads.
- Text overflow, overlap, and screen boundaries.

Do not consider a video successful merely because its JSON schema is valid or its MP4 has the correct duration, FPS, and resolution.

### 7. Verify the actual rendered output
After implementing the fixes:
- Generate a test video using the existing project workflow.
- Extract representative frames from every scene.
- Inspect the rendered video against its narration and original storyboard instructions.
- Check that assets, animations, subtitles, and scene transitions are correct.
- Fix any issues discovered during this verification.
- Preserve useful logs explaining asset selection, scene timing, validation failures, and rendering errors.

### Important execution instructions
- Work with the existing running project and current codebase.
- Do not just provide recommendations or a theoretical implementation plan. Make the actual code changes.
- Reuse existing components and services wherever possible.
- Do not unnecessarily replace working functionality.
- Handle asset discovery and downloading automatically rather than requiring manual asset selection.
- Maintain backward compatibility with the existing video-generation pipeline.
- Run the relevant tests and generate a final test video to verify the fixes.

Start by tracing the current pipeline from script generation → topic detection → storyboard generation → asset selection → Remotion instructions → rendering → quality validation. Fix the root causes at their respective stages rather than applying superficial workarounds.


**CRITICAL — DYNAMIC CONTENT INTELLIGENCE**

Do not hardcode solutions or optimize exclusively for the currently uploaded sample video. Fix the generation pipeline so it works correctly for ANY topic provided by the user.

Before generating a script or storyboard:
- Understand the actual topic and identify its domain, subtopics, concepts, and learning objectives.
- For factual, educational, business, scientific, historical, or technical topics, retrieve relevant and reliable information when research is needed.
- Verify factual claims, numbers, formulas, calculations, dates, and examples before using them.
- Never invent statistics, facts, sources, or explanations.
- Generate scenes, visual assets, diagrams, animations, and narration based on the actual information gathered.
- Select assets based on semantic relevance to each scene, not merely keyword similarity.
- Ensure the narration, subtitles, visuals, and diagrams communicate the same information.

Implement these improvements at the shared pipeline level, not as topic-specific patches. Test using multiple unrelated topics to confirm that the system dynamically adapts without relying on the uploaded sample.