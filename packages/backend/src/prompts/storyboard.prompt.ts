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
3. Use AnimatedText for key phrases from the script
4. Include Subtitle component in EVERY scene with the matching narration text
5. Use Teacher or Character for 1-2 scenes to add visual interest
6. End with an EndScreen component in the final scene
7. Scene children should enhance comprehension, not clutter the screen
8. Keep props simple — text strings, color hex codes, boolean flags, number values only
9. The scenes array must be ordered by startFrame
10. Each scene endFrame must equal the next scene startFrame
11. Last scene endFrame must equal ${totalFrames}

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
        {"component": "AnimatedText", "props": {"text": "Opening title", "animation": "fadeIn", "startFrame": 10, "fontSize": 72, "color": "#ffffff"}},
        {"component": "Subtitle", "props": {"entries": [{"index": 0, "startMs": 0, "endMs": 3000, "text": "Opening narration"}]}}
      ]
    }
  ]
}`;
}
