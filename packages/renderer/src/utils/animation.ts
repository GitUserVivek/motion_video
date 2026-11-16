/**
 * Animation utility functions for Remotion components.
 * All functions take frame and timing params and return a 0-1 normalized value
 * or a CSS-ready string.
 */

import { interpolate, Easing } from 'remotion';

// Clamp helper
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Normalize a frame within a window to [0, 1]
export function progress(frame: number, start: number, duration: number): number {
  return clamp((frame - start) / duration, 0, 1);
}

// Ease in-out cubic
export function easeInOut(t: number): number {
  return Easing.inOut(Easing.cubic)(t);
}

// Ease out quart
export function easeOut(t: number): number {
  return Easing.out(Easing.quad)(t);
}

// Ease in
export function easeIn(t: number): number {
  return Easing.in(Easing.cubic)(t);
}

/**
 * Fade in from 0 to 1 opacity over `duration` frames starting at `start`.
 */
export function fadeIn(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });
}

/**
 * Fade out from 1 to 0 opacity over `duration` frames starting at `start`.
 */
export function fadeOut(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });
}

export type SlideDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Returns translateX or translateY pixel offset for a slide-in animation.
 * Distance defaults to 60px.
 */
export function slideIn(
  frame: number,
  direction: SlideDirection,
  start: number,
  duration: number,
  distance = 60,
): string {
  const p = interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const offset = p * distance;
  switch (direction) {
    case 'left':  return `translateX(-${offset}px)`;
    case 'right': return `translateX(${offset}px)`;
    case 'up':    return `translateY(-${offset}px)`;
    case 'down':  return `translateY(${offset}px)`;
  }
}

/**
 * Bounce effect — returns a scale multiplier that overshoots then settles.
 */
export function bounce(frame: number, start: number, duration: number): number {
  return interpolate(
    frame,
    [start, start + duration * 0.4, start + duration * 0.7, start + duration],
    [0, 1.15, 0.95, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/**
 * Zoom in from `fromScale` to 1 over `duration` frames.
 */
export function zoomIn(
  frame: number,
  start: number,
  duration: number,
  fromScale = 0.5,
): number {
  return interpolate(frame, [start, start + duration], [fromScale, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
}

/**
 * Rotate from `fromDeg` to `toDeg` over `duration` frames.
 * Returns a CSS rotate() string.
 */
export function rotate(
  frame: number,
  start: number,
  duration: number,
  fromDeg: number,
  toDeg: number,
): string {
  const deg = interpolate(frame, [start, start + duration], [fromDeg, toDeg], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });
  return `rotate(${deg}deg)`;
}

/**
 * Pop effect — quick scale-up then settle.
 */
export function pop(frame: number, start: number): number {
  return interpolate(
    frame,
    [start, start + 6, start + 10, start + 14],
    [1, 1.3, 0.9, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

/**
 * Count up a number from 0 to `target` over `duration` frames.
 */
export function countUp(
  frame: number,
  start: number,
  duration: number,
  target: number,
): number {
  const t = interpolate(frame, [start, start + duration], [0, target], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  return Math.round(t);
}

/**
 * Wave animation for character arm — oscillates between -20 and 20 degrees.
 */
export function wave(frame: number, start: number): number {
  if (frame < start) return 0;
  const elapsed = frame - start;
  return Math.sin(elapsed * 0.3) * 20;
}

/**
 * Point gesture — rotates an element toward a target direction.
 */
export function point(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration * 0.5, start + duration], [0, -30, -25], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
