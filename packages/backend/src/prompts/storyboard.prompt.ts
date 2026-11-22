import type { ContentAnalysis, VideoConfig } from '@edumotion/shared';
import { formatContentAnalysisForStoryboard } from './content-analysis.prompt.js';

/**
 * Storyboard instructions.
 *
 * The old prompt inferred a topic from a handful of keywords and handed the
 * model a canned icon list. This version gives it the actual narration analysis
 * instead and asks for a concrete visual brief, asset queries and a scene
 * purpose for every scene. Subtitles are injected by the backend, not invented
 * here, and all child animation timings are scene-relative.
 */
export function buildStoryboardPrompt(
  script: string,
  config: VideoConfig,
  audioDurationMs: number,
  analysis?: ContentAnalysis,
): string {
  const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);
  const sceneCount = Math.min(8, Math.max(4, Math.ceil(audioDurationMs / 10000)));
  const analysisBlock = analysis
    ? formatContentAnalysisForStoryboard(analysis)
    : 'No structured analysis available. Derive the domain and key terms from the narration.';

  const availableComponents = [
    'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher',
    'EducationalObject', 'ObjectGroup', 'ConceptDiagram',
    'MultiplicationTable', 'ImageScene', 'BackgroundScene',
    'Subtitle', 'QuestionCard', 'Confetti', 'EndScreen', 'ProgressBar',
    'SplitScreenComparison', 'ProcessFlow', 'Timeline', 'HighlightedRegion',
    'AnimatedDiagram', 'NumberCounter', 'KineticTypography', 'ObjectZoom', 'Callout',
    'SpeechBubble', 'AnnotatedCallout', 'ComparisonChart', 'SummaryScene',
  ];

  return `You are a professional educational video storyboard planner. Plan a ${Math.round(audioDurationMs / 1000)}-second video from the narration below. Every visual must explain that scene's words; a pretty but unrelated icon is a failure.

SCRIPT (the only narration the viewer hears):
${script}

CONTENT ANALYSIS (derived from this narration):
${analysisBlock}

VIDEO SPECS:
- Total frames: ${totalFrames}
- FPS: ${config.fps}
- Aspect ratio: ${config.aspectRatio}
- Theme: ${config.animationTheme}
- Scenes to create: ${sceneCount}

SCENE RULES:
1. Each scene teaches ONE idea from the script and follows the script order.
2. Set a short "purpose": hook | define | process | compare | example | data | recap | ending.
3. Set "visualBrief" to a specific, drawable description of what should be on screen. Name the objects, people, arrows, values or relationship — not "a nice visual".
4. Set 1-3 "keyTerms" copied from the narration or analysis. These are the only concepts the scene's artwork may depict.
5. Set 1-3 "assetQueries": concrete illustration searches derived from the visual brief (e.g. "profit and loss statement", "water cycle diagram"), not generic words like "idea" or "business".
6. Set "animationIntent" (what moves or reveals) and "transition" (cut, slide, fade, wipe).
7. Use a composition that matches the purpose:
   - process → ProcessFlow or AnimatedDiagram
   - compare → SplitScreenComparison or ComparisonChart
   - numbers → AnimatedNumber or NumberCounter
   - timeline → Timeline
   - definition/parts → AnnotatedCallout or ConceptDiagram
   - recap → SummaryScene
   - opening hook → QuestionCard or SpeechBubble
8. Do NOT force AnimatedText into every scene. Add a title (3-8 words, never the narration) only when it names the scene's idea. Do not add a Subtitle child: the backend injects captions from measured audio.
9. Do not use a generic calculator, plant, cloud, server, lightbulb or random icon unless the narration or analysis explicitly names that object/idea. Text-labelled diagrams are better than a wrong object.
10. Avoid overcrowding: one visual focus plus one short title is enough. No wall of text.
11. The final scene MUST contain EndScreen with a short recap.

FRAME TIMING (MANDATORY):
- Scene "startFrame" and "endFrame" are absolute video frames.
- Every child "startFrame" is RELATIVE to its own scene, starting at 0.
- A child must start at least 2 frames into its scene and before the scene ends.
- Scene frames must be contiguous, first starts at 0, last ends at ${totalFrames}.

AVAILABLE COMPONENTS:
${availableComponents.join(', ')}

EducationalObject types (only when the narration names one):
book, apple, globe, atom, lightbulb, calculator, pencil, star, leaf, plant, sun, water, cloud, rocket, heart, cell, microscope, brain, bone, skeleton, dna, neuron, circuit, server, network, equation, chart, timeline

RETURN ONLY VALID JSON (no markdown fences):
{
  "scenes": [
    {
      "id": "scene-1",
      "startFrame": 0,
      "endFrame": 120,
      "purpose": "hook",
      "visualBrief": "A shop owner comparing two receipts; one has a loss in red, the other a profit in green.",
      "keyTerms": ["profit", "loss"],
      "assetQueries": ["profit and loss statement", "shop receipts"],
      "animationIntent": "reveal the loss receipt first, then slide the profit receipt beside it",
      "transition": "fade",
      "component": "BackgroundScene",
      "props": { "theme": "${config.animationTheme}" },
      "children": [
        {
          "component": "AnimatedText",
          "props": { "text": "Profit or Loss?", "animation": "words", "fontSize": 58, "top": "12%", "startFrame": 4 }
        },
        {
          "component": "SplitScreenComparison",
          "props": { "leftTitle": "Loss", "rightTitle": "Profit", "startFrame": 12, "top": "52%" }
        }
      ]
    }
  ]
}`;
}
