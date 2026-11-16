import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { EduVideo } from './compositions/EduVideo.js';
import type { StoryboardPlan } from '@edumotion/shared';

// Default storyboard for Remotion Studio preview
const PREVIEW_STORYBOARD: StoryboardPlan = {
  jobId: 'preview',
  totalFrames: 1200,
  fps: 30,
  audioDurationMs: 40000,
  scenes: [
    {
      id: 'scene-1',
      startFrame: 0,
      endFrame: 300,
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        {
          component: 'AnimatedText',
          props: {
            text: 'What is Photosynthesis?',
            animation: 'fadeIn',
            startFrame: 15,
            fontSize: 72,
          },
        },
        {
          component: 'Subtitle',
          props: {
            entries: [
              { index: 0, startMs: 0, endMs: 10000, text: 'What is photosynthesis?' },
            ],
          },
        },
      ],
    },
    {
      id: 'scene-2',
      startFrame: 300,
      endFrame: 700,
      component: 'BackgroundScene',
      props: { theme: 'educational', pattern: 'dots' },
      children: [
        {
          component: 'Teacher',
          props: { state: 'wave', size: 220, top: '55%', left: '25%', startFrame: 310 },
        },
        {
          component: 'AnimatedText',
          props: {
            text: 'Plants use sunlight, water, and CO\u2082 to make food',
            animation: 'slideUp',
            startFrame: 320,
            fontSize: 56,
            top: '25%',
          },
        },
        {
          component: 'Subtitle',
          props: {
            entries: [
              { index: 0, startMs: 10000, endMs: 23000, text: 'Plants use sunlight, water, and CO\u2082 to make food' },
            ],
          },
        },
      ],
    },
    {
      id: 'scene-3',
      startFrame: 700,
      endFrame: 1000,
      component: 'BackgroundScene',
      props: { theme: 'playful' },
      children: [
        {
          component: 'EducationalObject',
          props: { type: 'atom', size: 180, top: '50%', left: '50%', startFrame: 710 },
        },
        {
          component: 'AnimatedText',
          props: {
            text: '6CO\u2082 + 6H\u2082O \u2192 Glucose + O\u2082',
            animation: 'zoom',
            startFrame: 730,
            fontSize: 52,
            top: '15%',
          },
        },
        {
          component: 'Subtitle',
          props: {
            entries: [
              { index: 0, startMs: 23000, endMs: 33000, text: 'The chemical equation of photosynthesis' },
            ],
          },
        },
      ],
    },
    {
      id: 'scene-4',
      startFrame: 1000,
      endFrame: 1200,
      component: 'BackgroundScene',
      props: { theme: 'educational' },
      children: [
        {
          component: 'EndScreen',
          props: {
            title: 'Now you know Photosynthesis!',
            subtitle: 'Keep learning with EduMotion',
            startFrame: 1010,
          },
        },
        {
          component: 'Confetti',
          props: { startFrame: 1010, count: 40 },
        },
      ],
    },
  ],
};

function RemotionRoot(): React.ReactElement {
  return (
    <Composition
      id="EduVideo"
      component={EduVideo}
      durationInFrames={1200}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ storyboard: PREVIEW_STORYBOARD }}
    />
  );
}

registerRoot(RemotionRoot);
