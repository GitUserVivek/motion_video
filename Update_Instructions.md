# TASK: Transform EduMotion AI into a Professional Animated Educational Video Generator

You are acting as a Senior Creative Technologist, Motion Graphics Engineer, AI Video Architect, Remotion Expert, and Full-Stack TypeScript Engineer.

Your task is to **inspect, modify, upgrade, test, and implement the existing EduMotion AI project** so that it produces professional, colorful, highly engaging animated educational explainer videos matching the visual quality and storytelling style of the supplied `expected_video_style.mp4`.

Do not simply provide recommendations, an implementation plan, or sample components. Work directly inside the existing repository and implement the changes.

## 1. FIRST: Understand the existing project

Before modifying anything, inspect the complete repository.

Understand:
- Monorepo architecture and package dependencies.
- Backend API and job queue.
- Local LLM integration (Qwen3 8B / llama.cpp).
- Script generation and approval workflow.
- Storyboard generation and validation.
- Asset management and asset matching.
- Existing Remotion components.
- TTS engine and subtitle generation.
- Audio alignment and timing.
- Rendering worker and FFmpeg integration.
- Frontend and video preview/download workflow.
- Existing database and file storage.

Read the actual implementation rather than trusting documentation alone.

Important existing files include, but are not limited to:

- `packages/backend/src/prompts/script-generate.prompt.ts`
- `packages/backend/src/prompts/storyboard.prompt.ts`
- `packages/backend/src/services/storyboard.service.ts`
- `packages/backend/src/services/storyboard.validation.ts`
- `packages/backend/src/services/storyboard.visuals.ts`
- `packages/shared/src/schemas/storyboard.schema.ts`
- `packages/shared/src/schemas/scene.schema.ts`
- `packages/renderer/src/EduVideo.tsx`
- `packages/renderer/src/components/`
- `packages/renderer/src/utils/sanitize.ts`

Locate the actual equivalent files if the repository structure differs.

Preserve the working architecture and existing functionality. Do not unnecessarily rewrite the backend, database, queue, frontend, or rendering engine.

## 2. THE MAIN OBJECTIVE: Match the reference video style

The current generated video is visually repetitive and looks like a basic slideshow.

The expected video is a completely different visual experience.

Use `expected_video_style.mp4` as the primary visual reference and `stream.mp4` as the current-output reference.

The target visual language should include:

### A. Colorful animated environments

Use different visual environments throughout the video.

Examples:
- Light blue educational backgrounds.
- Vibrant purple backgrounds.
- Coral/orange backgrounds.
- Turquoise and teal backgrounds.
- Yellow infographic backgrounds.
- Pink backgrounds for sound/music-related concepts.

Use subtle gradients, circles, patterns, shadows, texture, and decorative shapes.

Do not use the same background for every scene.

Color choices should reflect the topic and scene purpose.

### B. Cartoon illustrations and characters

Introduce professional, friendly, modern educational illustrations.

Examples:
- Cartoon characters with expressive faces.
- Animated mascots.
- Objects with facial expressions where appropriate.
- Science equipment.
- Computers and electronic devices.
- Books, microphones, headphones and speakers.
- Mathematical illustrations.
- Technology-related objects.
- Topic-specific diagrams.

Use actual relevant illustrations, not generic emoji or a repeated document icon.

Characters should have consistent visual identities when recurring across scenes.

### C. Dynamic typography

Create a professional typography animation system.

Include:
- Large bold headings.
- Outlined text.
- Text with contrasting shadows.
- Highlighted keywords.
- Animated word emphasis.
- Typewriter effects.
- Word-by-word reveal.
- Pop-in and bounce animations.
- Speech bubbles.
- Labels and annotations.
- Numbered steps.
- Small explanatory captions.

Use different text treatments depending on the scene.

Do not display the entire narration as a large heading.

The narration captions and visual explanatory text must be separate layers with proper hierarchy.

### D. Educational visual storytelling

Every scene should visually explain the concept.

Examples:

If narration says "A computer processes millions of instructions":

Show:
- A computer or processor illustration.
- Animated data particles entering it.
- Processing animation.
- Output particles or results.
- An explanatory label.

If narration explains "The CPU is the brain of the computer":

Show:
- An animated computer.
- Highlight the CPU.
- Zoom into the CPU.
- Show a brain analogy.
- Add connecting arrows and labels.

If narration explains a process:

Show a step-by-step animated flow.

If narration compares two concepts:

Show a split-screen comparison.

If narration explains a timeline:

Show a timeline with animated milestones.

If narration introduces a problem:

Visually demonstrate the problem before showing its solution.

These are examples. All visual choices must be derived from the actual topic and narration.

## 3. BUILD A CREATIVE SCENE GENERATION PIPELINE

Do not let the LLM generate random scenes with arbitrary icons.

Introduce a structured creative planning pipeline.

### Stage 1: Script understanding

Analyze the approved script and extract:

- Main topic.
- Target audience.
- Educational level.
- Key concepts.
- Important terminology.
- Examples and analogies.
- Processes.
- Comparisons.
- Cause-and-effect relationships.
- Important numbers and facts.
- Scene boundaries.
- Appropriate visual metaphors.

Break the narration into meaningful visual segments.

Each segment should communicate one clear educational idea.

### Stage 2: Visual direction planning

For each segment, generate a structured visual plan containing:

- Scene ID.
- Narration text.
- Start and end timing.
- Main educational objective.
- Visual concept.
- Visual metaphor.
- Required assets.
- Asset descriptions.
- Background style and color.
- Composition/layout.
- Text overlays.
- Highlighted keywords.
- Animation sequence.
- Camera movement.
- Transition into the next scene.
- Audio synchronization information.

Use strict TypeScript/Zod schemas.

### Stage 3: Scene diversity

Avoid generating six scenes with the same composition.

Introduce a scene composition selection system.

Possible scene types:

1. Cartoon illustration scene.
2. Animated infographic.
3. Step-by-step process.
4. Split-screen comparison.
5. Timeline.
6. Animated flowchart.
7. Character explanation.
8. Speech-bubble conversation.
9. Product/device breakdown.
10. Zoomed-in technical explanation.
11. Data visualization.
12. Code/editor simulation.
13. Before-and-after comparison.
14. Question/hook scene.
15. Summary scene.
16. Dedicated end screen.

Choose layouts based on the narration.

Use a sensible variety of compositions across the video.

Do not force every scene to use a different layout when repetition is educationally justified.

## 4. AUTOMATIC ASSET DISCOVERY AND DOWNLOAD SYSTEM

THIS IS A CRITICAL REQUIREMENT.

The application must independently discover, download, organize, cache, and reuse the images, PNGs, SVGs, illustrations, and animations required for the generated video.

I do not want to manually search for assets or manually place images into the assets directory.

Implement an automatic asset acquisition pipeline.

### Asset sources

Integrate appropriate sources such as:

- OpenMoji for open-licensed illustrations.
- unDraw for suitable SVG illustrations.
- Wikimedia Commons for relevant openly licensed media.
- Iconify for icons from supported icon collections.
- Open-source SVG repositories.
- LottieFiles or other animation sources when their API, license, and access terms permit.
- Other reliable public asset sources where licensing allows.

Use official APIs or permitted download mechanisms.

Do not scrape websites against their terms or bypass authentication, access restrictions, or licensing.

### Asset acquisition workflow

For every scene:

1. Extract visual entities from narration.
2. Generate descriptive search queries.
3. Search for relevant assets.
4. Retrieve candidate asset metadata.
5. Check visual relevance.
6. Check format and licensing.
7. Download the best suitable asset.
8. Store it in the project's asset library.
9. Generate an asset manifest.
10. Pass the actual local asset path to Remotion.

Support:
- PNG.
- SVG.
- JPG/WebP.
- GIF where supported.
- Lottie JSON where supported.
- Locally generated SVG illustrations.

Do not assume every downloaded SVG or Lottie file is safe or renderable.

Sanitize SVGs, validate formats, handle broken downloads, and use safe rendering methods.

### Asset matching requirements

Never use a generic document icon for unrelated narration.

For example:

Narration: "The CPU processes instructions."

Search for CPU/processor-related illustrations.

Narration: "Sound travels through vibrations."

Search for sound waves, speakers, and vibration illustrations.

Narration: "The Earth revolves around the Sun."

Search for solar system illustrations.

Narration: "A database stores information."

Search for database and storage illustrations.

Use semantic relevance rather than matching only individual keywords.

If no appropriate external asset exists, generate a custom illustration using SVG, CSS, or existing Remotion drawing components.

Do not substitute an unrelated icon just because the asset search returned no results.

### Asset management

Implement:

- Asset download service.
- Asset search service.
- Asset relevance scoring.
- Asset metadata.
- License metadata.
- Local asset caching.
- Duplicate detection.
- Asset fallback generation.
- Asset cleanup for abandoned jobs.
- Download timeout and retry logic.

Use deterministic local asset paths.

Do not redownload identical assets for every video.

Maintain a searchable reusable asset library.

Do not make successful video rendering dependent on a third-party asset provider being available.

If external discovery fails, continue using cached assets and locally generated illustrations.

## 5. CREATE A PROFESSIONAL REMOTION ANIMATION SYSTEM

Upgrade the existing component library rather than replacing it without reason.

Implement or improve reusable components for:

### Backgrounds
- AnimatedGradientBackground.
- PatternBackground.
- FloatingShapes.
- ParticleBackground.
- SectionBackground.

### Characters and illustrations
- Character.
- CharacterExpression.
- CharacterConversation.
- IllustratedObject.
- AnimatedIcon.
- ImageReveal.
- ObjectZoom.
- AssetAnimation.

### Typography
- KineticTypography.
- HighlightedText.
- WordReveal.
- TypewriterText.
- SpeechBubble.
- CaptionCard.
- Label.
- Callout.

### Educational visuals
- ProcessFlow.
- Timeline.
- SplitScreenComparison.
- AnimatedDiagram.
- NumberCounter.
- DataVisualization.
- BeforeAfter.
- ComparisonChart.
- ConceptBreakdown.

### Transitions
- SlideTransition.
- WipeTransition.
- ZoomTransition.
- MorphTransition.
- ShapeTransition.
- MatchCutTransition.

### Ending
- SummaryScene.
- EndScreen.

Use existing components wherever possible and avoid duplicate implementations.

All animations must use Remotion's frame-based APIs such as `useCurrentFrame`, `useVideoConfig`, `interpolate`, and `spring`.

Avoid ordinary browser timers and nondeterministic CSS animations.

Every animation must render correctly during server-side/frame-based rendering.

## 6. MOTION AND CAMERA DIRECTION

The video should feel alive.

Introduce meaningful motion throughout the video:

- Objects entering from different directions.
- Smooth scale and position transitions.
- Camera zoom.
- Camera pan.
- Parallax.
- Floating objects.
- Animated arrows.
- Connecting lines.
- Expanding circles.
- Particle movement.
- Character reactions.
- Animated charts.
- Object transformations.
- Emphasis animations.

Use easing and spring-based animation.

Avoid excessive movement that makes educational content difficult to understand.

Every movement should support the explanation.

Do not leave an entire scene visually static for several seconds.

## 7. AUDIO AND WORD-LEVEL SYNCHRONIZATION

Improve the existing Edge TTS integration.

Use the actual synthesized audio file and actual audio duration as the source of truth.

Implement:

- Accurate audio duration detection.
- Word-level timestamp handling.
- Word-level caption animation.
- Sentence-level visual segmentation.
- Audio-to-scene synchronization.
- Correct scene durations.
- Caption alignment.
- Accurate transitions between scenes.

Use existing Edge TTS word-boundary events wherever available.

If the TTS engine cannot provide reliable word timings, introduce a suitable fallback alignment approach.

Do not estimate audio duration using character count or word count.

Do not generate scene timings independently of the actual narration audio.

Ensure captions never appear before the corresponding narration or remain visible long after it finishes.

Keep background music and sound effects on separate audio layers.

Automatically duck background music under narration.

## 8. SCRIPT AND STORYBOARD QUALITY

Improve the existing Qwen3 8B prompts and generation pipeline.

The generated educational script must be:

- Interesting.
- Accurate.
- Conversational.
- Easy to understand.
- Educationally structured.
- Appropriate for the target audience.

Use:
- Strong opening hook.
- Curiosity-driven explanations.
- Real-world examples.
- Analogies.
- Step-by-step teaching.
- Visual demonstrations.
- Short recaps.
- Memorable conclusion.

Do not unnecessarily increase narration length.

The storyboard must describe actual visual actions, not merely suggest an icon and a text label.

Each scene must have a meaningful beginning, middle, and end.

Ensure the storyboard ends with a proper EndScreen component.

## 9. FIX THE EXISTING VALIDATION FAILURES

Current backend logs show:

`Low visual relevance score: 0.25 - visuals may not match narration`

They also show:

`Storyboard should end with an EndScreen component`

After three failed attempts, the system silently creates a fallback storyboard.

Fix the root causes.

Implement stronger validation for:

- Narration-to-visual semantic relevance.
- Asset-to-scene relevance.
- Asset existence.
- Asset loading.
- Scene duration.
- Scene continuity.
- Scene diversity.
- Animation coverage.
- Text overflow.
- Missing required components.
- EndScreen presence.
- Audio alignment.
- Missing visual content.

Do not solve validation by simply lowering thresholds or bypassing checks.

Do not treat the existence of an icon as proof that a scene is visually relevant.

When validation fails:
1. Identify the exact failing scene.
2. Identify the reason.
3. Repair the scene.
4. Regenerate missing assets if necessary.
5. Revalidate.
6. Use a safe, visually meaningful fallback only when repair fails.

Log scene-level diagnostics with asset names, relevance scores, and validation errors.

Fallback storyboards must follow the same professional visual design requirements.

## 10. VIDEO DESIGN AND OUTPUT

Maintain vertical 9:16 output by default.

Target:
- Resolution: 1080 × 1920.
- Frame rate: 30 FPS.
- High-quality H.264 MP4.
- Consistent typography.
- Proper safe margins.
- No cropped illustrations.
- No overlapping elements.
- No unreadable text.

Design the opening to immediately attract attention.

Use visually varied sections throughout the video.

The final scene must contain a designed ending, such as a summary, memorable question, or relevant call to action.

Do not end on an abruptly disappearing object or incomplete narration.

## 11. AUTOMATED FINAL VIDEO QUALITY CONTROL

After rendering, automatically inspect the actual output.

Implement checks for:

- Black frames.
- Frozen frames.
- Missing assets.
- Broken images.
- Incorrect dimensions.
- Incorrect duration.
- Missing audio.
- Audio/video duration mismatch.
- Clipped text.
- Overlapping components.
- Empty scenes.
- Missing ending.
- Rendering errors.

Use FFmpeg and frame sampling where appropriate.

Generate a quality report containing:

- Number of scenes.
- Scene durations.
- Assets used.
- Missing assets.
- Asset relevance.
- Animation types.
- Audio duration.
- Video duration.
- Validation score.
- Quality-control failures.

Do not mark a job completed until the required quality checks pass.

Fix the existing `/output/` 404 issue if it represents a real broken frontend/backend route. Verify the actual video streaming, thumbnail, preview, and download endpoints rather than assuming they work because rendering completed.

## 12. PERFORMANCE AND RESOURCE MANAGEMENT

The current environment has approximately:

- 31 GB RAM.
- 4 CPUs.
- NVIDIA Tesla T4 GPU.
- Local Qwen3 8B model.

Optimize the implementation for this environment.

Requirements:

- Avoid unnecessary repeated LLM calls.
- Cache asset search results.
- Reuse downloaded assets.
- Limit concurrent downloads.
- Limit rendering concurrency based on available resources.
- Avoid loading large unnecessary images.
- Optimize SVG and image dimensions.
- Avoid memory leaks.
- Keep job processing reliable.
- Preserve the existing queue and recovery mechanisms.

Do not introduce unnecessary paid APIs or cloud dependencies.

The core generation and rendering pipeline must continue to work locally.

External asset sources are optional dependencies, not mandatory runtime dependencies.

## 13. FRONTEND IMPROVEMENTS

Keep the existing user workflow.

The user should only need to provide:
- Topic.
- Target audience.
- Desired duration.
- Language.
- Voice.
- Optional visual preferences.

The application should automatically handle:
- Script generation.
- Script approval.
- Visual planning.
- Asset discovery.
- Asset downloads.
- Animation.
- Audio generation.
- Rendering.
- Quality validation.
- Video preview.
- Download.

Expose useful progress stages in the frontend, including asset discovery and storyboard generation.

Do not require manual asset selection for normal generation.

## 14. TESTING AND ACCEPTANCE CRITERIA

Do not stop after implementing a few new components.

Run the existing tests and add new tests for the upgraded pipeline.

Create at least three representative test topics:

1. Science: How does the human heart work?
2. Technology: How does artificial intelligence work?
3. Education: How does photosynthesis work?

For each topic, verify:

- Correct visual asset discovery.
- Topic-specific scene generation.
- Different scene compositions.
- Animated illustrations.
- Appropriate background variations.
- Word-level captions where supported.
- Correct audio synchronization.
- Proper ending.
- Successful rendering.
- Successful video playback.

Render at least one complete end-to-end test video.

Extract representative frames from the generated video and compare them against `expected_video_style.mp4`.

Check whether the output actually achieves the intended visual quality.

If it still looks like the current dark-background/icon/slideshow output, the implementation is not complete.

## 15. IMPORTANT IMPLEMENTATION RULES

1. Modify the actual existing project.
2. Do not rebuild the entire project from scratch.
3. Preserve existing working features and APIs.
4. Do not remove the script approval workflow.
5. Do not replace the local LLM with a paid external LLM API.
6. Do not introduce mandatory paid asset APIs.
7. Do not hardcode illustrations for only the three test topics.
8. The system must work for arbitrary educational topics.
9. Do not generate random unrelated visuals.
10. Do not silently fall back to generic slides when storyboard generation fails.
11. Do not fake validation scores.
12. Do not claim a feature is implemented without verifying it.
13. Handle missing external assets gracefully.
14. Keep the code modular, typed, maintainable, and production-oriented.
15. Update schemas, types, prompts, services, components, and tests consistently.

## 16. FINAL DELIVERABLES

After completing the work:

1. Implement all required modifications.
2. Run the complete build.
3. Run unit and integration tests.
4. Generate at least one actual test MP4.
5. Verify that the MP4 plays correctly.
6. Inspect its representative frames.
7. Fix any discovered visual problems.
8. Update the project progress document with accurate completion percentages.
9. Document new dependencies and asset sources.
10. Document any API keys or optional configuration required.

Provide a final report with:

- Files created.
- Files modified.
- Existing issues fixed.
- New services and components.
- Asset acquisition implementation.
- Audio synchronization implementation.
- Validation improvements.
- Build and test results.
- Generated video location.
- Remaining limitations.

**MOST IMPORTANT FINAL INSTRUCTION:**

The objective is not to make the existing video slightly better.

The objective is to transform EduMotion into an automated educational motion-graphics production system that produces videos resembling the supplied reference in terms of visual richness, colorful environments, animated illustrations, typography, educational storytelling, and scene variety.

The system must automatically understand the topic, find or create suitable visual resources, animate them meaningfully, synchronize them with narration, and produce a polished final video without requiring manual creative intervention.

Prioritize actual visual output quality over adding more architecture, documentation, or components.

Start by inspecting the existing repository and reference videos, then implement the improvements end-to-end.