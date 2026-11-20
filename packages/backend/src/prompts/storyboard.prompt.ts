import type { VideoConfig } from '@edumotion/shared';

export function buildStoryboardPrompt(
  script: string,
  config: VideoConfig,
  audioDurationMs: number,
): string {
  const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);
  const availableComponents = [
    'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher',
    'EducationalObject', 'ObjectGroup', 'MultiplicationTable',
    'ImageScene', 'BackgroundScene', 'Subtitle', 'QuestionCard',
    'Confetti', 'EndScreen', 'ProgressBar',
  ];

  return `You are a video storyboard planner for educational animated videos. Convert the narration script into a JSON storyboard.

SCRIPT:
${script}

VIDEO SPECS:
- Total frames: ${totalFrames}
- FPS: ${config.fps}
- Duration: ${Math.round(audioDurationMs / 1000)}s
- Aspect ratio: ${config.aspectRatio}
- Animation theme: ${config.animationTheme}

AVAILABLE COMPONENTS: ${availableComponents.join(', ')}

RULES:
1. Divide the video into 4-8 scenes covering the full frame range (0 to ${totalFrames})
2. Each scene MUST have a BackgroundScene as the base component
3. EVERY scene MUST also contain at least one VISUAL child in addition to text: EducationalObject, ObjectGroup, Teacher, Character, MultiplicationTable, ImageScene or QuestionCard. A scene whose children are only AnimatedText + Subtitle is INVALID.
4. Use AnimatedText for short key phrases (max 12 words), positioned near the top of the frame, with "animation": "words" so each word reveals on its own beat
5. Include a Subtitle component in EVERY scene with the matching narration text
6. EducationalObject "type" must match the narration: book, apple, globe, atom, lightbulb, calculator, pencil, star, leaf, plant, sun, water, cloud, rocket, heart, cell, microscope. Examples: photosynthesis → leaf/plant/sun; water cycle → water/cloud/sun; space → rocket/globe; maths → calculator; biology → cell/heart.
7. Use Teacher or Character in at most 1-2 scenes, not every scene
8. End with an EndScreen component in the final scene
9. Visual elements must not overlap the title area (top 15%) or the caption area (bottom 15%) — place graphics around 45-65% height
10. Vary the layout between scenes: alternate graphics left/right of centre and change the composition so consecutive scenes do not look identical. Add an AnimatedNumber ONLY for a real measurement with a unit (30%, 5 km, 2 million) — never for a bare count like "3".
11. Keep props simple — text strings, color hex codes, boolean flags, number values only
12. The scenes array must be ordered by startFrame
13. Each scene endFrame must equal the next scene startFrame
14. Last scene endFrame must equal ${totalFrames}
15. Every scene's AnimatedText must name the idea that scene teaches (2-8 words), not a greeting or filler. Consecutive scenes must teach different ideas instead of repeating the topic name.
16. Return one object, one line, strict JSON: double-quoted keys, a comma between every element, no trailing commas, no comments, no markdown fences

Subtitle entries format: {"index": 0, "startMs": 0, "endMs": 3000, "text": "narration text"}

Output ONLY valid JSON matching this exact schema — no markdown, no explanation:
{
  "scenes": [
    {
      "id": "scene-1",
      "startFrame": 0,
      "endFrame": 90,
      "component": "BackgroundScene",
      "props": {"color": "#1a1a2e", "theme": "educational"},
      "children": [
        {"component": "EducationalObject", "props": {"type": "leaf", "size": 260, "top": "55%", "left": "50%", "startFrame": 8, "animation": "bounce"}},
        {"component": "AnimatedText", "props": {"text": "Opening title", "animation": "words", "startFrame": 10, "fontSize": 72, "color": "#ffffff"}},
        {"component": "Subtitle", "props": {"entries": [{"index": 0, "startMs": 0, "endMs": 3000, "text": "Opening narration"}]}}
      ]
    }
  ]
}`;
}
