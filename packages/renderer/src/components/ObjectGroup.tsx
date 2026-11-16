import React from 'react';
import { EducationalObject } from './EducationalObject.js';
import type { EducationalObjectProps, ObjectType } from './EducationalObject.js';

export interface ObjectGroupItem extends Omit<EducationalObjectProps, 'top' | 'left'> {
  type: ObjectType;
  startFrame?: number;
}

export interface ObjectGroupProps {
  items: ObjectGroupItem[];
  layout?: 'row' | 'grid' | 'circle';
  top?: string;
  left?: string;
  spacing?: number;
}

export function ObjectGroup({
  items,
  layout = 'row',
  top = '50%',
  left = '50%',
  spacing = 120,
}: ObjectGroupProps): React.ReactElement {
  if (items.length === 0) return <></> as React.ReactElement;

  return (
    <>
      {items.map((item, i) => {
        let itemTop = top;
        let itemLeft = left;

        if (layout === 'row') {
          const totalWidth = (items.length - 1) * spacing;
          itemLeft = `calc(${left} + ${i * spacing - totalWidth / 2}px)`;
        } else if (layout === 'grid') {
          const cols = Math.ceil(Math.sqrt(items.length));
          const row = Math.floor(i / cols);
          const col = i % cols;
          itemLeft = `calc(${left} + ${(col - (cols - 1) / 2) * spacing}px)`;
          itemTop = `calc(${top} + ${(row - 0) * spacing}px)`;
        } else if (layout === 'circle') {
          const angle = (i / items.length) * 2 * Math.PI - Math.PI / 2;
          const radius = spacing;
          itemLeft = `calc(${left} + ${Math.cos(angle) * radius}px)`;
          itemTop  = `calc(${top} + ${Math.sin(angle) * radius}px)`;
        }

        return (
          <EducationalObject
            key={i}
            {...item}
            top={itemTop}
            left={itemLeft}
          />
        );
      })}
    </>
  );
}
