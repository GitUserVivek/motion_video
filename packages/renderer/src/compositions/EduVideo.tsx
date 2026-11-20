import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
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
import { ParticleField } from '../components/ParticleField.js';
import { fadeIn, fadeOut } from '../utils/animation.js';
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
};

/** Frames of cross-fade overlap between consecutive scenes. */
const TRANSITION_FRAMES = 12;

type CameraMode = 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight';

const CAMERA_CYCLE: CameraMode[] = [
  'zoomIn', 'panRight', 'zoomOut', 'panLeft', 'zoomIn', 'panLeft', 'zoomOut', 'panRight',
];

function cameraFor(scene: SceneInstruction, index: number): CameraMode {
  const declared = scene.props['camera'];
  if (declared === 'zoomIn' || declared === 'zoomOut' || declared === 'panLeft' || declared === 'panRight') {
    return declared;
  }
  return CAMERA_CYCLE[index % CAMERA_CYCLE.length] ?? 'zoomIn';
}

/**
 * Deterministic camera move over the scene's own lifetime. Backgrounds get a
 * stronger move than foreground elements, which reads as mild parallax.
 */
function cameraStyle(mode: CameraMode, progress: number, strength: number): React.CSSProperties {
  const zoom = 1 + 0.13 * strength;
  const pan = 4 * strength;
  switch (mode) {
    case 'zoomOut':
      return { transform: `scale(${interpolate(progress, [0, 1], [zoom + 0.03, 1.02])})` };
    case 'panLeft':
      return {
        transform: `scale(${zoom}) translateX(${interpolate(progress, [0, 1], [pan, -pan])}%)`,
      };
    case 'panRight':
      return {
        transform: `scale(${zoom}) translateX(${interpolate(progress, [0, 1], [-pan, pan])}%)`,
      };
    case 'zoomIn':
    default:
      return { transform: `scale(${interpolate(progress, [0, 1], [1.02, zoom + 0.03])})` };
  }
}

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
      return <AbsoluteFill style={{ backgroundColor: '#0f0f1e' }} />;
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
 * The storyboard model picks startFrame values relative to the video or to the
 * scene, inconsistently. Anything before the scene start would already be fully
 * faded in when the scene appears, which is why animations looked absent, so
 * rebase it onto the scene and keep it inside the scene window.
 */
function normalizeProps(
  scene: SceneInstruction,
  child: SceneChild,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    ...child.props,
    _sceneStartFrame: scene.startFrame,
  };

  const raw = child.props['startFrame'];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const start = raw < scene.startFrame ? scene.startFrame + Math.max(2, raw) : raw;
    props['startFrame'] = Math.min(Math.max(start, scene.startFrame + 2), scene.endFrame - 5);
  } else {
    props['startFrame'] = scene.startFrame + 4;
  }

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
  totalScenes,
}: {
  scene: SceneInstruction;
  index: number;
  totalScenes: number;
}): React.ReactElement {
  const frame = useCurrentFrame();

  const start = scene.startFrame;
  const end = scene.endFrame;
  if (frame < start - TRANSITION_FRAMES || frame >= end + TRANSITION_FRAMES) {
    return <></> as React.ReactElement;
  }

  const isFirst = index === 0;
  const isLast = index === totalScenes - 1;
  const enter = fadeIn(frame, isFirst ? 0 : start - TRANSITION_FRAMES, TRANSITION_FRAMES);
  const exit = isLast ? 1 : fadeOut(frame, end - TRANSITION_FRAMES, TRANSITION_FRAMES);
  const opacity = Math.max(0, Math.min(enter, exit));

  const span = Math.max(1, end - start);
  const progress = Math.max(0, Math.min(1, (frame - start) / span));
  const camera = cameraFor(scene, index);

  const children = scene.children ?? [];
  const captions = children.filter((child) => child.component === 'Subtitle');
  const visuals = children.filter((child) => child.component !== 'Subtitle');

  return (
    <AbsoluteFill style={{ opacity, overflow: 'hidden' }}>
      {/* Background layer moves more than the foreground for parallax depth. */}
      <AbsoluteFill style={cameraStyle(camera, progress, 1)}>
        {renderComponent(scene.component, { ...scene.props, _sceneStartFrame: start }, `${scene.id}-root`)
          ?? renderComponent('BackgroundScene', { theme: 'educational' }, `${scene.id}-fallback`)}
      </AbsoluteFill>

      <ParticleField seed={index + 1} opacity={0.45} />

      <AbsoluteFill style={cameraStyle(camera, progress, 0.5)}>
        {visuals.map((child, i) =>
          renderComponent(child.component, normalizeProps(scene, child), `${scene.id}-v-${i}`),
        )}
      </AbsoluteFill>

      {/* Captions stay outside the camera so they remain crisp and readable.
          They only render inside their own scene window so the cross-fade cannot
          stack two cues on screen at a boundary. */}
      {frame >= start && frame < end && captions.map((child, i) =>
        renderComponent(
          child.component,
          { ...child.props, _sceneStartFrame: start },
          `${scene.id}-c-${i}`,
        ),
      )}
    </AbsoluteFill>
  );
}

export interface EduVideoProps {
  /** Optional because Remotion treats every composition prop as optional. */
  storyboard?: StoryboardPlan;
}

export function EduVideo({ storyboard }: EduVideoProps): React.ReactElement {
  const scenes = storyboard?.scenes ?? [];
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        fontFamily: '\'Segoe UI\', system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {scenes.map((scene, index) => (
        <SceneBoundary key={scene.id}>
          <SceneRenderer
            scene={scene}
            index={index}
            totalScenes={scenes.length}
          />
        </SceneBoundary>
      ))}
    </AbsoluteFill>
  );
}
