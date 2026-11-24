# Task: Apply Reference Motion Design Style to My Existing Remotion Video Project

I have provided a reference video demonstrating a specific Remotion-based motion design style.

I want you to analyze that reference and use its visual design language as the standard for creating videos in my existing project.

## 1. Mandatory Skill Instructions

First, locate and read:

`./skills/remotion-motion-design/SKILL.md`

If the file is located elsewhere, locate the supplied `remotion-motion-design-skill.md`.

Treat this skill as the mandatory visual design and implementation guideline whenever creating or modifying videos.

Do not simply read the file and ignore its instructions. Apply them throughout the entire video creation process.

## 2. Inspect My Existing Project

Before modifying anything:

- Understand the existing project architecture.
- Identify the Remotion setup and installed dependencies.
- Inspect existing compositions, components, assets, fonts, and rendering scripts.
- Understand how the current video-generation workflow operates.
- Identify reusable components and existing functionality.

Do not unnecessarily restructure, replace, or break existing code.

Preserve the existing project's functionality and architecture wherever possible.

## 3. Target Visual Style

Use the following visual direction:

- Bold editorial motion graphics.
- Oversized animated typography.
- Kinetic text transitions.
- Pastel and paper-textured backgrounds.
- Subtle grid patterns.
- Colorful geometric shapes.
- Blue, orange, yellow, mint, cream, and black color palette.
- Thick outlined cards with offset shadows.
- Animated UI elements and code panels.
- Frame timelines and progress indicators where relevant.
- Smooth spring-based animations.
- Staggered entrances and exits.
- Occasional 3D geometric illustrations.
- Designed transitions instead of generic fades.

The overall result should feel like a professionally art-directed technical explainer, not a PowerPoint presentation.

## 4. Remotion Implementation

Use Remotion's frame-driven animation system.

Prefer:
- useCurrentFrame()
- useVideoConfig()
- interpolate()
- spring()
- Sequence
- Series
- AbsoluteFill
- ThreeCanvas when actual 3D is beneficial.

All animations must be deterministic and synchronized with Remotion's rendering timeline.

Avoid CSS-only animations for important motion.

Build reusable components instead of implementing every animation independently.

## 5. Video Creation Workflow

Follow this workflow for every new video:

**Step 1: Understand the content**

Understand the topic, script, narration, and intended audience.

Do not invent facts, metrics, or claims.

**Step 2: Create a storyboard**

Break the content into meaningful scenes.

For every scene, define:
- Scene purpose.
- Text and narration.
- Visual composition.
- Background and colors.
- Animation style.
- Entry and exit transitions.
- Duration.

**Step 3: Establish visual consistency**

Define typography, color palette, spacing, shapes, shadows, and reusable components.

**Step 4: Implement the video**

Create the actual Remotion composition using the established visual system.

Use visual variety while maintaining a consistent identity.

**Step 5: Preview and inspect**

Render preview frames and inspect the actual output.

Check:
- Text clipping.
- Animation timing.
- Caption readability.
- Composition alignment.
- Transition quality.
- Missing assets.
- Visual consistency.

**Step 6: Final render**

Fix identified problems and render the final video.

## 6. Important Restrictions

- Do not blindly copy the reference video's content.
- Do not copy its branding or exact scenes.
- Do not change my original video's message or subject.
- Do not turn every scene into the same template.
- Do not overuse 3D, gradients, shadows, or animations.
- Do not introduce unnecessary dependencies.
- Do not break existing functionality.
- Do not stop after generating code. Inspect the rendered video.

## 7. Expected Result

I want my existing project to consistently produce videos with this professional motion-design aesthetic.

The reference should guide the visual language, while the content, scene composition, and animations should be designed specifically for each video.

Start by inspecting my existing project and reading the skill file.

Then provide:
1. A brief analysis of the existing architecture.
2. A proposed visual design system.
3. A scene-by-scene storyboard for the current video.
4. The implementation changes.
5. A rendered preview.
6. The final video after visual inspection.

Do not make destructive changes without justification.

**Most importantly: prioritize the actual rendered visual quality over simply producing technically correct Remotion code.**