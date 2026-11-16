import React from 'react';
import { Character } from './Character.js';
import type { CharacterState } from './Character.js';

export interface TeacherProps {
  state?: CharacterState;
  size?: number;
  top?: string;
  left?: string;
  startFrame?: number;
  flipX?: boolean;
}

// Teacher is a preset of Character with an educational color scheme
export function Teacher(props: TeacherProps): React.ReactElement {
  return (
    <Character
      color="#2D6A4F"
      accentColor="#FFD700"
      {...props}
    />
  );
}
