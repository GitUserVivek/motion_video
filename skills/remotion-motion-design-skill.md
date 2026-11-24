# Remotion Motion Design Skill

## Purpose

Use this skill whenever creating or editing a video in this project with Remotion. The target is a polished, fast-paced, code-native motion-design explainer inspired by the supplied reference video.

This is a visual direction and implementation standard, not a request to copy the reference video's exact scenes, wording, assets, or branding. Preserve the current project's subject, script, and message while applying the visual language below.

## 1. Reference style: visual DNA

### Overall feel
- Vertical, social-first explainer format by default: **9:16, 1080 × 1920, 30 fps**.
- Editorial motion-graphics aesthetic: playful, precise, technical, bold, and highly legible.
- A deliberate mix of clean vector design, kinetic typography, UI/code demonstrations, and occasional dimensional 3D elements.
- Scenes should feel art-directed, not like generic presentation slides or a template slideshow.

### Backgrounds and palette
- Alternate between warm off-white / paper backgrounds and soft pastel color fields.
- Use subtle graph-paper or engineering-grid texture on light scenes. Keep it faint enough that it never competes with content.
- Use a restrained palette with strong contrast:
  - warm cream / off-white for the base;
  - pale blush, mint, and light yellow for scene backgrounds;
  - saturated cobalt/royal blue;
  - vivid orange;
  - yellow;
  - mint/teal;
  - near-black for text, outlines, and UI.
- Use large flat color blocks and simple geometric shapes as accents. Avoid gradients unless the story genuinely benefits from them.
- Maintain consistent color meanings across a video where practical.

### Typography
- Use a heavy, modern sans-serif / grotesk display face for headlines. Headlines are usually black, large, compact, and high contrast.
- Use a clean sans-serif for supporting copy and captions.
- Use monospace for code, terminal output, filenames, and technical labels.
- Use uppercase, compact labels inside colored rounded rectangles for section tags (for example, a short category label).
- Use selective word emphasis with color, scale, rotation, or a contrasting label. Do not animate every word.
- Keep text concise. Prefer one clear message per scene.
- Ensure all text remains readable on a phone. Avoid tiny body copy and dense paragraphs.

### Shapes, cards, and interface elements
- Use simple geometry: circles, rounded rectangles, pills, small squares, arrows, connectors, and thin timeline tracks.
- Use bold black outlines on selected cards and labels. A small hard shadow or offset shadow can create a tactile cut-paper / sticker feel.
- Use overlapping cards and layered elements to create depth, but preserve clear hierarchy.
- Code panels should look like intentional product/UI elements: dark or light panel, monospace text, restrained syntax colors, clean padding, and a visible frame.
- Use small UI details (progress bars, frame markers, chips, badges, arrows) to reinforce the idea that the video is made with code.

## 2. Motion language

### Timing and pacing
- Build a clear visual beat every few seconds. Avoid holding a static composition for too long unless the narration needs it.
- Use quick, purposeful entrances: pop, slide, scale, reveal, wipe, stagger, and masked text reveals.
- Use short overshoots or spring-like easing sparingly for playful elements.
- Use smooth easing for major layout transitions. Avoid linear motion unless it represents a technical/process movement.
- Stagger related elements by a few frames to create rhythm.
- Use pauses before important claims or visual reveals.
- Match scene changes and emphasis to narration/audio when available.

### Preferred animation techniques
- Animate with Remotion's frame-driven APIs: `useCurrentFrame()`, `useVideoConfig()`, and `interpolate()`.
- Use `spring()` for natural pop-ins, settling cards, and shape movement.
- Use `Sequence` and `Series` (where appropriate) to organize timing and scene structure.
- Use `AbsoluteFill` for scene composition and explicit layer positioning.
- Use masks / clipping / transforms for text and shape reveals.
- Use `ThreeCanvas` / Three.js only when actual 3D adds value. The reference uses a few restrained 3D object moments, not constant 3D.
- Keep motion deterministic and render-safe. Do not rely on CSS animations, browser timers, random values without a fixed seed, or state that changes independently of the frame.

### Transitions
- Prefer designed transitions over generic fades:
  - shape wipes;
  - color-panel wipes;
  - cards sliding between layouts;
  - a headline scaling or moving into the next composition;
  - elements connecting or transforming into the next scene.
- Use fades only when they serve a deliberate tonal pause.
- Maintain spatial continuity where possible so scenes feel connected.

## 3. Scene design patterns

Use these as a visual vocabulary, not a mandatory checklist. Select patterns that fit the script.

1. **Bold opening hook**: dark or high-contrast background, compact label, oversized headline, one strong visual.
2. **Concept title scene**: large product/topic name with simple geometry and a short subtitle.
3. **Flow / transformation scene**: show a simple before → process → after relationship using cards, arrows, and movement.
4. **Rules / categories scene**: multiple colored label cards arranged in a tidy grid; animate them in with a stagger.
5. **Code demonstration scene**: code panel with a focused highlighted line or a small number of relevant lines. Do not fill the screen with unreadable code.
6. **Frame-by-frame / timeline scene**: show a progress track, colored blocks, playhead, and frame/time labels when explaining animation or process.
7. **Comparison scene**: two clearly differentiated approaches, with matching visual structure and a clear verdict.
8. **3D accent scene**: one or two simple geometric 3D objects on a soft pastel background, with restrained rotation or movement.
9. **Proof / result scene**: show the output, result, or evidence clearly. Do not use fake metrics or fabricated UI.
10. **Closing scene**: concise takeaway, project/brand identity if supplied, and a clean final hold.

## 4. Captions and narration

- If narration exists, create accurate, synchronized captions.
- Captions should be short, broken into readable phrases, and positioned consistently with safe margins.
- Use a contrasting caption treatment when the background changes; never sacrifice readability.
- Highlight a keyword only when it improves comprehension.
- Do not invent narration, claims, metrics, or product capabilities.
- If there is no narration, use concise on-screen copy to carry the story.

## 5. Composition and accessibility

- Respect mobile safe areas. Keep important text away from the extreme top, bottom, and side edges.
- Maintain strong contrast and readable font sizes.
- Avoid clutter. Each scene should have one primary focal point and a small number of supporting elements.
- Use consistent spacing, alignment, corner radii, stroke widths, and shadow treatment.
- Avoid excessive visual noise, unnecessary decorative elements, and rapid flashing.
- Make sure the video communicates even when viewed on a small screen.

## 6. Remotion implementation standards

- First inspect the existing project structure, package scripts, Remotion version, compositions, assets, fonts, and render configuration. Do not replace or restructure working project code without a concrete reason.
- Reuse the project's existing components, assets, tokens, and conventions where sensible.
- Build reusable components for recurring visual elements:
  - `SectionLabel`
  - `Headline`
  - `Caption`
  - `OutlinedCard`
  - `CodePanel`
  - `TimelineTrack`
  - `ShapeAccent`
  - `SceneTransition`
- Keep each scene/component focused and configurable through props.
- Use frame-based calculations for every animation. Prefer `interpolate()` with explicit input/output ranges and clamp behavior.
- Use `spring()` with deliberate damping/stiffness/mass values. Avoid uncontrolled bounce.
- Define scene timing centrally or make it easy to inspect. Avoid scattered magic frame numbers.
- Use `Sequence` / `Series` for clear timing and composition structure.
- Use the correct `width`, `height`, `fps`, and `durationInFrames` for the intended output.
- Load fonts and assets locally where possible. Do not depend on remote assets at render time unless the project already has a reliable asset strategy.
- Ensure all media paths resolve in the render environment.
- Do not introduce nondeterministic behavior. A render of the same composition with the same props must produce the same output.
- Avoid expensive per-frame work. Precompute static data and keep 3D scenes lightweight.
- Do not use CSS keyframe animations or transitions for motion that must be synchronized with Remotion frames.
- Keep React keys stable and avoid unnecessary rerenders.

## 7. Workflow the agent must follow

### Phase A — inspect before editing
1. Inspect the project tree and identify the Remotion entry point, root, compositions, components, assets, fonts, scripts, and current video-generation workflow.
2. Read the existing project instructions and conventions.
3. Identify the current target composition and the exact content/script that must be preserved.
4. Report the planned changes briefly before making large structural changes.
5. Do not overwrite existing work or delete assets just to impose this style.

### Phase B — plan the video
1. Break the script/content into scenes based on meaning, not arbitrary equal durations.
2. For every scene, define:
   - purpose / message;
   - narration or on-screen text;
   - visual metaphor or UI element;
   - background and palette;
   - entrance, emphasis, and exit motion;
   - approximate frame range.
3. Create a concise storyboard or scene plan before implementation.
4. Ensure visual variety while preserving one coherent design system.
5. Do not add scenes, claims, or details unsupported by the source content.

### Phase C — implement
1. Implement the style using reusable components and the existing architecture.
2. Build the opening hook first, then establish the design system, then implement remaining scenes.
3. Use typography, shapes, cards, code panels, and timelines as the primary visual language.
4. Use 3D sparingly and only when it makes the explanation clearer.
5. Keep all animations frame-driven and deterministic.
6. Add captions and audio synchronization if the project contains narration/audio.

### Phase D — validate and render
1. Run the project's type checks / lint / build scripts where available.
2. Render a low-cost preview or representative frames first.
3. Inspect the actual rendered frames, not just the React code.
4. Check for:
   - clipped or overflowing text;
   - unreadable code or captions;
   - inconsistent spacing or alignment;
   - awkward timing or motion;
   - missing assets/fonts;
   - blank frames and incorrect scene boundaries;
   - audio/caption desynchronization;
   - visual inconsistency between scenes.
5. Fix issues and render again.
6. Render the final output using the project's existing render command/configuration.
7. Provide the final video path, render settings, and a short summary of what changed.

## 8. Quality bar / acceptance criteria

The video is complete only when:
- It clearly follows the reference's editorial motion-design language.
- It feels like one coherent video, not a collection of unrelated templates.
- Typography is bold, legible, and intentionally animated.
- Backgrounds, colors, shapes, cards, and code panels follow a consistent visual system.
- Motion is smooth, purposeful, frame-accurate, and deterministic.
- The content remains accurate to the original project/script.
- The final render has been inspected and obvious visual defects are fixed.
- The output is suitable for the target platform and aspect ratio.

## 9. Things to avoid

- Generic PowerPoint-style slides.
- Default template transitions on every scene.
- Constant zooming, spinning, bouncing, or random movement.
- Overuse of gradients, glows, glassmorphism, and drop shadows.
- Tiny text, dense paragraphs, or full-screen walls of code.
- Decorative 3D that does not explain anything.
- Unrelated stock footage that breaks the visual language.
- Fake dashboards, fake metrics, fabricated testimonials, or invented claims.
- CSS-only animation that drifts out of sync with Remotion frames.
- Rewriting the existing project architecture without need.
- Copying the reference video's exact script, branding, or scene sequence.

## 10. Default output settings

Unless the project or user specifies otherwise:
- Aspect ratio: 9:16
- Resolution: 1080 × 1920
- Frame rate: 30 fps
- Format: MP4 (H.264)
- Audio: preserve supplied narration/music and synchronize captions where applicable

If the current project targets landscape, square, or another platform, preserve that target and adapt the composition rather than forcing 9:16.
