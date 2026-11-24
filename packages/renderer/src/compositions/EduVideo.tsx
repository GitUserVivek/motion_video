import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import type { StoryboardPlan, SceneInstruction, SceneChild, ComponentName } from '@edumotion/shared';

import { AnimatedText } from '../components/AnimatedText.js';
import { AnimatedNumber } from '../components/AnimatedNumber.js';
import { Character } from '../components/Character.js';
import { Teacher } from '../components/Teacher.js';
import { EducationalObject } from '../components/EducationalObject.js';
import { ObjectGroup } from '../components/ObjectGroup.js';
import { ConceptDiagram } from '../components/ConceptDiagram.js';
import { MultiplicationTable } from '../components/MultiplicationTable.js';
import { ImageScene } from '../components/ImageScene.js';
import { BackgroundScene } from '../components/BackgroundScene.js';
import { Subtitle } from '../components/Subtitle.js';
import { QuestionCard } from '../components/QuestionCard.js';
import { Confetti } from '../components/Confetti.js';
import { EndScreen } from '../components/EndScreen.js';
import { ProgressBar } from '../components/ProgressBar.js';
import { SplitScreenComparison } from '../components/SplitScreenComparison.js';
import { ProcessFlow } from '../components/ProcessFlow.js';
import { Timeline } from '../components/Timeline.js';
import { HighlightedRegion } from '../components/HighlightedRegion.js';
import { NumberCounter } from '../components/NumberCounter.js';
import { AnimatedDiagram } from '../components/AnimatedDiagram.js';
import { KineticTypography } from '../components/KineticTypography.js';
import { ObjectZoom } from '../components/ObjectZoom.js';
import { Callout } from '../components/Callout.js';
import { SpeechBubble } from '../components/SpeechBubble.js';
import { AnnotatedCallout } from '../components/AnnotatedCallout.js';
import { ComparisonChart } from '../components/ComparisonChart.js';
import { SummaryScene } from '../components/SummaryScene.js';
import { FrameMeter, SceneWipe } from '../components/motion/Primitives.js';
import { isPaletteId, PALETTES } from '../utils/palette.js';
import { accentAt, FONTS, INK, PAPER } from '../utils/design.js';
import { sanitizeProps } from '../utils/sanitize.js';

const COMPONENT_MAP: Record<ComponentName, React.ComponentType<Record<string, unknown>>> = {
  AnimatedText:        AnimatedText as unknown as React.ComponentType<Record<string, unknown>>,
  AnimatedNumber:      AnimatedNumber as unknown as React.ComponentType<Record<string, unknown>>,
  Character:           Character as unknown as React.ComponentType<Record<string, unknown>>,
  Teacher:             Teacher as unknown as React.ComponentType<Record<string, unknown>>,
  EducationalObject:   EducationalObject as unknown as React.ComponentType<Record<string, unknown>>,
  ObjectGroup:         ObjectGroup as unknown as React.ComponentType<Record<string, unknown>>,
  ConceptDiagram:      ConceptDiagram as unknown as React.ComponentType<Record<string, unknown>>,
  MultiplicationTable: MultiplicationTable as unknown as React.ComponentType<Record<string, unknown>>,
  ImageScene:          ImageScene as unknown as React.ComponentType<Record<string, unknown>>,
  BackgroundScene:     BackgroundScene as unknown as React.ComponentType<Record<string, unknown>>,
  Subtitle:            Subtitle as unknown as React.ComponentType<Record<string, unknown>>,
  QuestionCard:        QuestionCard as unknown as React.ComponentType<Record<string, unknown>>,
  Confetti:            Confetti as unknown as React.ComponentType<Record<string, unknown>>,
  EndScreen:           EndScreen as unknown as React.ComponentType<Record<string, unknown>>,
  ProgressBar:         ProgressBar as unknown as React.ComponentType<Record<string, unknown>>,
  // New educational components
  SplitScreenComparison: SplitScreenComparison as unknown as React.ComponentType<Record<string, unknown>>,
  ProcessFlow:         ProcessFlow as unknown as React.ComponentType<Record<string, unknown>>,
  Timeline:            Timeline as unknown as React.ComponentType<Record<string, unknown>>,
  HighlightedRegion:    HighlightedRegion as unknown as React.ComponentType<Record<string, unknown>>,
  NumberCounter:       NumberCounter as unknown as React.ComponentType<Record<string, unknown>>,
  AnimatedDiagram:     AnimatedDiagram as unknown as React.ComponentType<Record<string, unknown>>,
  KineticTypography:   KineticTypography as unknown as React.ComponentType<Record<string, unknown>>,
  ObjectZoom:          ObjectZoom as unknown as React.ComponentType<Record<string, unknown>>,
  Callout:             Callout as unknown as React.ComponentType<Record<string, unknown>>,
  SpeechBubble:        SpeechBubble as unknown as React.ComponentType<Record<string, unknown>>,
  AnnotatedCallout:    AnnotatedCallout as unknown as React.ComponentType<Record<string, unknown>>,
  ComparisonChart:     ComparisonChart as unknown as React.ComponentType<Record<string, unknown>>,
  SummaryScene:        SummaryScene as unknown as React.ComponentType<Record<string, unknown>>,
};



function renderComponent(
  name: ComponentName,
  props: Record<string, unknown>,
  key: string,
): React.ReactElement | null {
  const Comp = COMPONENT_MAP[name];
  if (!Comp) {
    console.warn(`[EduVideo] Unknown component: ${name}`);
    return null;
  }
  // Model-supplied props are untyped: one wrong type used to throw mid-render
  // and destroy the whole render pass.
  const safe = sanitizeProps(name, props);
  if (!safe) {
    console.warn(`[EduVideo] Dropped ${name}: props cannot be rendered`);
    return null;
  }
  return <Comp key={key} {...safe} />;
}

/**
 * Last line of defence: if a scene still throws while rendering, show an empty
 * backdrop for that scene instead of aborting the entire video.
 */
class SceneBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    console.warn('[EduVideo] Scene failed to render:', error.message);
  }

  override render(): React.ReactNode {
    if (this.state.failed) {
      return <AbsoluteFill style={{ backgroundColor: PAPER }} />;
    }
    return this.props.children;
  }
}

/** Clamp a percentage `top` so a model-placed element cannot cover the title. */
function clampTopPercent(value: unknown, maxPercent: number): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
  if (!match?.[1]) return null;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct)) return null;
  return `${Math.max(2, Math.min(pct, maxPercent))}%`;
}

/** Clamp a percentage `bottom` so nothing is drawn in the caption band. */
function clampBottomPercent(value: unknown, minPercent: number): string | null {
  if (typeof value !== 'string') return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*%\s*$/.exec(value);
  if (!match?.[1]) return null;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct)) return null;
  return `${Math.max(minPercent, Math.min(pct, 92))}%`;
}

/**
 * Child timings are scene-relative by contract. Convert them once here:
 *
 *   absoluteStartFrame = scene.startFrame + child.startFrame
 *
 * No guessing based on the value: a child at 10 in a scene starting at 300
 * always renders at 310. The backend normalises legacy storyboards before they
 * reach this component.
 */
function normalizeProps(
  scene: SceneInstruction,
  child: SceneChild,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...child.props,
    _sceneStartFrame: scene.startFrame,
  };

  const duration = Math.max(1, scene.endFrame - scene.startFrame);
  const maxStart = Math.max(2, duration - 5);
  const raw = child.props['startFrame'];
  const relative = typeof raw === 'number' && Number.isFinite(raw) ? raw : 4;
  const clamped = Math.min(Math.max(relative, 2), maxStart);
  props['startFrame'] = scene.startFrame + clamped;

  // Give titles a word-by-word reveal when the model did not ask for anything.
  if (child.component === 'AnimatedText' && !child.props['animation']) {
    props['animation'] = 'words';
  }

  // Titles own the top band and captions own the bottom band. A model-placed
  // element that drifts outside its band used to cover the other text.
  const clampTop = (max: number): void => {
    const clamped = clampTopPercent(props['top'], max);
    if (clamped !== null) props['top'] = clamped;
  };
  const clampBottom = (min: number): void => {
    const clamped = clampBottomPercent(props['bottom'], min);
    if (clamped !== null) props['bottom'] = clamped;
  };

  if (child.component === 'AnimatedText') {
    clampTop(26);
    clampBottom(20);
  } else if (child.component === 'QuestionCard') {
    clampTop(24);
  } else if (child.component === 'AnimatedNumber') {
    clampTop(42);
  } else {
    clampTop(62);
    clampBottom(20);
  }

  return props;
}

function SceneRenderer({
  scene,
  index,
}: {
  scene: SceneInstruction;
  index: number;
}): React.ReactElement {
  const frame = useCurrentFrame();

  const start = scene.startFrame;
  const end = scene.endFrame;
  // Scenes own a hard window. The designed wipe covers the cut; no two scenes
  // ever render over each other, so captions and cards cannot stack.
  if (frame < start || frame >= end) return <></> as React.ReactElement;

  const children = scene.children ?? [];
  const captions = children.filter((child) => child.component === 'Subtitle');
  const visuals = children.filter((child) => child.component !== 'Subtitle');
  const palette = isPaletteId(scene.props['palette']) ? scene.props['palette'] : 'sky';
  const wipeColor = PALETTES[palette].accent;

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill>
        {renderComponent(scene.component, { ...scene.props, _sceneStartFrame: start }, `${scene.id}-root`)
          ?? renderComponent('BackgroundScene', { palette, pattern: 'grid' }, `${scene.id}-fallback`)}
      </AbsoluteFill>

      <AbsoluteFill>
        {visuals.map((child, i) =>
          renderComponent(child.component, normalizeProps(scene, child), `${scene.id}-v-${i}`),
        )}
      </AbsoluteFill>

      {/* Captions are outside the visual layer so no camera or diagram transform
          can blur them. */}
      {captions.map((child, i) =>
        renderComponent(
          child.component,
          { ...child.props, _sceneStartFrame: start },
          `${scene.id}-c-${i}`,
        ),
      )}

      <SceneWipe startFrame={start} color={wipeColor} accent={accentAt(index)} />
    </AbsoluteFill>
  );
}

export interface EduVideoProps {
  /** Optional because Remotion treats every composition prop as optional. */
  storyboard?: StoryboardPlan;
}

export function EduVideo({ storyboard }: EduVideoProps): React.ReactElement {
  const scenes = storyboard?.scenes ?? [];
  const { durationInFrames } = useVideoConfig();
  const meterScenes = scenes.map((scene, index) => {
    const palette = isPaletteId(scene.props['palette']) ? scene.props['palette'] : 'sky';
    return {
      accent: index % 2 === 0 ? PALETTES[palette].accent : accentAt(index),
      frames: Math.max(1, scene.endFrame - scene.startFrame),
    };
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: PAPER,
        color: INK,
        fontFamily: FONTS.body,
        overflow: 'hidden',
      }}
    >
      {scenes.map((scene, index) => (
        <SceneBoundary key={scene.id}>
          <SceneRenderer scene={scene} index={index} />
        </SceneBoundary>
      ))}
      <FrameMeter scenes={meterScenes} totalFrames={durationInFrames} />
    </AbsoluteFill>
  );
}
