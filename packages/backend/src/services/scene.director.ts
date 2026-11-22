import {
  pickScenePalette,
  type ComponentName,
  type PaletteId,
  type SceneChild,
  type SceneInstruction,
  type StoryboardPlan,
} from '@edumotion/shared';
import { pickTopicObject, type TopicObjectType } from './storyboard.visuals.js';

/**
 * Deterministic visual direction applied *after* the model produced a
 * structurally valid storyboard.
 *
 * The LLM is good at deciding what a scene should teach and poor at keeping a
 * video visually alive: every scene came back as the same dark background with
 * an icon and a paragraph of narration as the title. Those are exactly the
 * things that can be decided without a model, so they are decided here:
 *
 *  - one background palette per scene, never the same as the previous scene;
 *  - a rotating background pattern and camera move;
 *  - a short heading instead of the whole narration;
 *  - an EducationalObject whose type actually appears in the narration;
 *  - an EndScreen on the final scene.
 *
 * Everything is a pure function of the storyboard + script, so renders stay
 * reproducible.
 */

const PATTERN_CYCLE = ['none', 'dots', 'grid', 'waves'] as const;
const CAMERA_CYCLE = ['zoomIn', 'panRight', 'zoomOut', 'panLeft'] as const;

/** Headings longer than this stop reading as titles. */
const MAX_HEADING_CHARS = 56;

/** Closing titles keyed by topic; the first match wins. */
const TOPIC_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/\b(photosynthes\w*|chlorophyll|leaves?|plants?)\b/i, 'Now You Know How Plants Make Food'],
  [/\b(heart|blood|circulat\w*)\b/i, 'Now You Know How Your Heart Works'],
  [/\b(artificial intelligence|machine learning|\bai\b|neural network)\b/i, 'Now You Know How AI Learns'],
  [/\b(cpu|processor|computer|memory|hardware)\b/i, 'Now You Know What Happens Inside a Computer'],
  [/\b(space|planet|solar system|orbit|rocket)\b/i, 'Now You Know How Space Works'],
  [/\b(atom|molecule|chemical|reaction)\b/i, 'Now You Know the Chemistry Behind It'],
  [/\b(numbers?|maths?|fractions?|equations?)\b/i, 'Now You Know the Maths Behind It'],
];

export interface DirectedStoryboard {
  storyboard: StoryboardPlan;
  /** Human-readable list of what the director changed, for the job log. */
  changes: string[];
}

function shorten(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').trim();
  if (clean.length <= maxChars) return clean;

  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > 12 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[,;:.\-–—]+$/, '').trim()}…`;
}

/** Narration the scene is actually speaking, read from its own caption cue. */
function sceneNarration(scene: SceneInstruction): string {
  const subtitle = scene.children?.find((child) => child.component === 'Subtitle');
  const entries = subtitle?.props['entries'];
  if (Array.isArray(entries)) {
    const text = entries
      .map((entry) =>
        typeof entry === 'object' && entry !== null
          ? (entry as { text?: unknown }).text
          : undefined,
      )
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .trim();
    if (text) return text;
  }

  const textChild = scene.children?.find((child) => child.component === 'AnimatedText');
  const text = textChild?.props['text'];
  return typeof text === 'string' ? text : '';
}

function topicTitle(script: string): string {
  const match = TOPIC_TITLES.find(([pattern]) => pattern.test(script));
  if (match) return match[1];

  const firstSentence = script
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return shorten(firstSentence ?? '', MAX_HEADING_CHARS) || 'Thanks for watching!';
}

/**
 * Re-point an EducationalObject at the concept the narration is about. The model
 * happily renders a book next to "the heart pumps blood"; this fixes that
 * without inventing props, and leaves the type alone when the narration gives no
 * better match.
 */
function alignObjectType(child: SceneChild, narration: string): SceneChild {
  if (child.component !== 'EducationalObject') return child;

  const current = child.props['type'];
  if (typeof current !== 'string') return child;

  const better: TopicObjectType = pickTopicObject(narration, current as TopicObjectType);
  return better === current ? child : { ...child, props: { ...child.props, type: better } };
}

export function directStoryboard(plan: StoryboardPlan, script: string): DirectedStoryboard {
  const changes: string[] = [];
  const totalScenes = plan.scenes.length;
  let previousPalette: PaletteId | undefined;

  const scenes: SceneInstruction[] = plan.scenes.map((scene, index) => {
    const children: SceneChild[] = [...(scene.children ?? [])];
    const narration = sceneNarration(scene);
    const isLast = index === totalScenes - 1;

    let component: ComponentName = scene.component;
    let props: Record<string, unknown> = { ...scene.props };

    // 1. Environment: a different palette for every scene, cycling patterns and
    //    camera moves so consecutive scenes never look identical.
    const palette = pickScenePalette(script, index, previousPalette);
    previousPalette = palette;
    const pattern = PATTERN_CYCLE[index % PATTERN_CYCLE.length] ?? 'dots';
    const camera = CAMERA_CYCLE[index % CAMERA_CYCLE.length] ?? 'zoomIn';

    if (component !== 'BackgroundScene') {
      // EduVideo paints the root component behind everything else, so a visual
      // at the root would hide the environment. Keep it, one layer down.
      children.unshift({ component, props: { ...scene.props } });
      changes.push(`scene ${index + 1}: moved ${component} above the background`);
      component = 'BackgroundScene';
      props = {};
    }

    props = { ...props, palette, pattern, camera };

    // Colour is planned centrally now. A leftover gradient/color prop would win
    // over the palette inside BackgroundScene and bring the dark slide look back.
    delete props['color'];
    delete props['gradient'];

    // Any extra BackgroundScene the model nested would paint over the planned
    // environment, so it gets the same palette and loses its own colour props.
    const backgroundIndex = children.findIndex((child) => child.component === 'BackgroundScene');
    if (backgroundIndex >= 0) {
      const existing = children[backgroundIndex];
      if (existing) {
        const existingProps: Record<string, unknown> = { ...existing.props, palette, pattern };
        delete existingProps['color'];
        delete existingProps['gradient'];
        children[backgroundIndex] = { ...existing, props: existingProps };
      }
    }

    // 2. Typography: a scene needs a short title, not the spoken paragraph.
    const titleIndex = children.findIndex((child) => child.component === 'AnimatedText');
    if (titleIndex >= 0) {
      const title = children[titleIndex];
      const text = title?.props['text'];
      if (title && typeof text === 'string' && text.trim().length > MAX_HEADING_CHARS) {
        children[titleIndex] = {
          ...title,
          props: { ...title.props, text: shorten(text, MAX_HEADING_CHARS) },
        };
        changes.push(`scene ${index + 1}: shortened heading`);
      }
    } else if (!isLast && narration) {
      children.unshift({
        component: 'AnimatedText',
        props: {
          text: shorten(narration, MAX_HEADING_CHARS),
          animation: 'words',
          fontSize: 62,
          fontWeight: 800,
          top: '12%',
          startFrame: scene.startFrame + 6,
        },
      });
      changes.push(`scene ${index + 1}: added heading`);
    }

    // 3. Visual relevance: the object on screen should be the thing being said.
    const directedChildren = children.map((child) => alignObjectType(child, narration));

    // 4. Ending: every video closes on a designed end screen.
    if (isLast) {
      // A root EndScreen was already moved into the children above, so this one
      // check covers both shapes.
      const hasEnd = directedChildren.some((child) => child.component === 'EndScreen');

      if (!hasEnd) {
        directedChildren.push({
          component: 'EndScreen',
          props: {
            title: topicTitle(script),
            subtitle: narration ? `In short: ${shorten(narration, 60)}` : 'Keep exploring with EduMotion',
            showConfetti: true,
            startFrame: scene.startFrame + 10,
          },
        });
        changes.push('added EndScreen to the final scene');
      }
    }

    return {
      ...scene,
      component,
      props,
      children: directedChildren,
    };
  });

  return {
    storyboard: { ...plan, scenes },
    changes,
  };
}
