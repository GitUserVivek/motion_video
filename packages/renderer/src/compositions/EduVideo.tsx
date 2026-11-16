import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { StoryboardPlan, SceneInstruction, SceneChild, ComponentName } from '@edumotion/shared';

import { AnimatedText } from '../components/AnimatedText.js';
import { AnimatedNumber } from '../components/AnimatedNumber.js';
import { Character } from '../components/Character.js';
import { Teacher } from '../components/Teacher.js';
import { EducationalObject } from '../components/EducationalObject.js';
import { ObjectGroup } from '../components/ObjectGroup.js';
import { MultiplicationTable } from '../components/MultiplicationTable.js';
import { ImageScene } from '../components/ImageScene.js';
import { BackgroundScene } from '../components/BackgroundScene.js';
import { Subtitle } from '../components/Subtitle.js';
import { QuestionCard } from '../components/QuestionCard.js';
import { Confetti } from '../components/Confetti.js';
import { EndScreen } from '../components/EndScreen.js';
import { ProgressBar } from '../components/ProgressBar.js';

const COMPONENT_MAP: Record<ComponentName, React.ComponentType<Record<string, unknown>>> = {
  AnimatedText:        AnimatedText as React.ComponentType<Record<string, unknown>>,
  AnimatedNumber:      AnimatedNumber as React.ComponentType<Record<string, unknown>>,
  Character:           Character as React.ComponentType<Record<string, unknown>>,
  Teacher:             Teacher as React.ComponentType<Record<string, unknown>>,
  EducationalObject:   EducationalObject as React.ComponentType<Record<string, unknown>>,
  ObjectGroup:         ObjectGroup as React.ComponentType<Record<string, unknown>>,
  MultiplicationTable: MultiplicationTable as React.ComponentType<Record<string, unknown>>,
  ImageScene:          ImageScene as React.ComponentType<Record<string, unknown>>,
  BackgroundScene:     BackgroundScene as React.ComponentType<Record<string, unknown>>,
  Subtitle:            Subtitle as React.ComponentType<Record<string, unknown>>,
  QuestionCard:        QuestionCard as React.ComponentType<Record<string, unknown>>,
  Confetti:            Confetti as React.ComponentType<Record<string, unknown>>,
  EndScreen:           EndScreen as React.ComponentType<Record<string, unknown>>,
  ProgressBar:         ProgressBar as React.ComponentType<Record<string, unknown>>,
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
  return <Comp key={key} {...props} />;
}

function SceneRenderer({
  scene,
  frameOffset,
}: {
  scene: SceneInstruction;
  frameOffset: number;
}): React.ReactElement {
  const frame = useCurrentFrame();

  // Only render this scene during its frame window
  if (frame < scene.startFrame || frame >= scene.endFrame) {
    return <></> as React.ReactElement;
  }

  // Adjust props with frame offset so animations start at 0 relative to scene start
  const adjustedProps = {
    ...scene.props,
    _sceneStartFrame: scene.startFrame,
  };

  return (
    <AbsoluteFill>
      {renderComponent(scene.component, adjustedProps, `${scene.id}-root`)}
      {scene.children?.map((child: SceneChild, i: number) =>
        renderComponent(
          child.component,
          { ...child.props, _sceneStartFrame: scene.startFrame },
          `${scene.id}-child-${i}`,
        ),
      )}
    </AbsoluteFill>
  );
}

export interface EduVideoProps {
  storyboard: StoryboardPlan;
}

export function EduVideo({ storyboard }: EduVideoProps): React.ReactElement {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        fontFamily: '\'Segoe UI\', system-ui, sans-serif',
      }}
    >
      {storyboard.scenes.map((scene) => (
        <SceneRenderer
          key={scene.id}
          scene={scene}
          frameOffset={scene.startFrame}
        />
      ))}
    </AbsoluteFill>
  );
}
