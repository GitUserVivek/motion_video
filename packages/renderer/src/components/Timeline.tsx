import React from 'react';
import { Img, useCurrentFrame } from 'remotion';
import { fadeIn, slideIn } from '../utils/animation.js';

export interface TimelineEvent {
  date: string;
  title: string;
  description?: string;
  /** Caption-specific artwork inlined as a data URL. */
  image?: string;
  icon?: React.ReactNode;
  color?: string;
}

export interface TimelineProps {
  events: TimelineEvent[];
  top?: string;
  left?: string;
  startFrame?: number;
  width?: number;
}

export function Timeline({
  events,
  top = '50%',
  left = '50%',
  startFrame = 0,
  width = 800,
}: TimelineProps): React.ReactElement {
  const frame = useCurrentFrame();

  const timelineHeight = Math.max(400, events.length * 100);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        width,
        height: timelineHeight,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Central timeline line */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 6,
          background: 'linear-gradient(to bottom, #4A90D9, #8f7be0)',
          borderRadius: 3,
          transform: 'translateX(-50%)',
        }}
      />

      {/* Events */}
      {events.map((event, index) => {
        const appearFrame = startFrame + index * 20;
        const opacity = fadeIn(frame, appearFrame, 30);
        const offsetX = Math.sin(frame * 0.05 + index * 1.5) * 20;

        const side = index % 2 === 0 ? 'left' : 'right';

        return (
          <div
            key={`event-${index}`}
            style={{
              position: 'absolute',
              top: `${(index / events.length) * 100}%`,
              left: side === 'left' ? '15%' : '85%',
              transform: `translateY(-50%) ${side === 'left' ? 'translateX(0%)' : 'translateX(-100%)'}`,
              opacity,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              maxWidth: width * 0.4,
            }}
          >
            {/* Event card */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
                border: `2px solid ${event.color || '#4A90D9'}`,
                borderRadius: 16,
                padding: 20,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              }}
            >
              {event.image ? (
                <Img
                  src={event.image}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: 110,
                    objectFit: 'contain',
                    marginBottom: 10,
                  }}
                />
              ) : null}

              {/* Date */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: event.color || '#4A90D9',
                  marginBottom: 8,
                }}
              >
                {event.date}
              </div>

              {/* Title */}
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: '#ffffff',
                  marginBottom: event.description ? 8 : 0,
                }}
              >
                {event.title}
              </div>

              {/* Description */}
              {event.description && (
                <div
                  style={{
                    fontSize: 16,
                    color: 'rgba(255, 255, 255, 0.7)',
                    lineHeight: 1.5,
                  }}
                >
                  {event.description}
                </div>
              )}
            </div>

            {/* Connector to timeline */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: side === 'left' ? -30 : 'auto',
                left: side === 'right' ? -30 : 'auto',
                width: 30,
                height: 2,
                background: event.color || '#4A90D9',
                borderRadius: 1,
              }}
            />

            {/* Dot on timeline */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                right: side === 'left' ? -60 : 'auto',
                left: side === 'right' ? -60 : 'auto',
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: event.color || '#4A90D9',
                border: '4px solid #1a1a2e',
                boxShadow: '0 0 15px rgba(255, 255, 255, 0.5)',
                transform: 'translateY(-50%)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
