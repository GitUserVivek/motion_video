import React from 'react';

/**
 * Every piece of topic artwork in the pipeline is a hand-authored SVG glyph
 * drawn inside a 100x100 viewBox. Keeping them in one module means a diagram,
 * an object group and a single standing object all draw identical shapes, and
 * the backend keyword map only has to agree with one list.
 */
export type ObjectType =
  | 'book' | 'apple' | 'globe' | 'atom' | 'lightbulb' | 'calculator' | 'pencil' | 'star'
  | 'leaf' | 'plant' | 'sun' | 'water' | 'cloud' | 'rocket' | 'heart' | 'cell' | 'microscope';

export const ICON_PATHS: Record<ObjectType, React.ReactElement> = {
  book: (
    <g>
      <rect x="10" y="10" width="80" height="80" rx="5" fill="#4A90D9" />
      <rect x="20" y="20" width="60" height="60" rx="3" fill="#E8F4FD" />
      <line x1="50" y1="20" x2="50" y2="80" stroke="#4A90D9" strokeWidth="4" />
      <rect x="25" y="30" width="20" height="3" rx="1" fill="#4A90D9" />
      <rect x="25" y="38" width="18" height="3" rx="1" fill="#4A90D9" />
      <rect x="25" y="46" width="20" height="3" rx="1" fill="#4A90D9" />
    </g>
  ),
  apple: (
    <g>
      <circle cx="50" cy="55" r="35" fill="#E74C3C" />
      <ellipse cx="35" cy="45" rx="12" ry="8" fill="rgba(255,255,255,0.3)" />
      <rect x="47" y="15" width="6" height="18" rx="3" fill="#27AE60" />
      <path d="M53 20 Q70 10 72 25" stroke="#27AE60" strokeWidth="3" fill="none" />
    </g>
  ),
  globe: (
    <g>
      <circle cx="50" cy="50" r="40" fill="#3498DB" stroke="#2980B9" strokeWidth="2" />
      <ellipse cx="50" cy="50" rx="20" ry="40" fill="none" stroke="#ECF0F1" strokeWidth="2" />
      <line x1="10" y1="50" x2="90" y2="50" stroke="#ECF0F1" strokeWidth="2" />
      <line x1="50" y1="10" x2="50" y2="90" stroke="#ECF0F1" strokeWidth="1" />
    </g>
  ),
  atom: (
    <g>
      <circle cx="50" cy="50" r="10" fill="#FFD700" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#4A90D9" strokeWidth="3" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#E74C3C" strokeWidth="3" transform="rotate(60 50 50)" />
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#2ECC71" strokeWidth="3" transform="rotate(120 50 50)" />
    </g>
  ),
  lightbulb: (
    <g>
      <circle cx="50" cy="40" r="28" fill="#FFD700" opacity="0.9" />
      <rect x="38" y="65" width="24" height="8" rx="4" fill="#999" />
      <rect x="38" y="72" width="24" height="8" rx="4" fill="#aaa" />
      <line x1="50" y1="5" x2="50" y2="15" stroke="#FFD700" strokeWidth="3" />
      <line x1="20" y1="15" x2="28" y2="22" stroke="#FFD700" strokeWidth="3" />
      <line x1="80" y1="15" x2="72" y2="22" stroke="#FFD700" strokeWidth="3" />
    </g>
  ),
  calculator: (
    <g>
      <rect x="15" y="5" width="70" height="90" rx="8" fill="#2C3E50" />
      <rect x="22" y="12" width="56" height="28" rx="4" fill="#ECF0F1" />
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2].map((col) => (
          <rect key={`${row}-${col}`} x={25 + col * 20} y={50 + row * 18} width="14" height="12" rx="3" fill="#3498DB" />
        )),
      )}
    </g>
  ),
  pencil: (
    <g>
      <rect x="42" y="5" width="16" height="70" rx="3" fill="#FFD700" />
      <polygon points="42,75 58,75 50,92" fill="#FFA500" />
      <rect x="42" y="5" width="16" height="12" rx="3" fill="#E74C3C" />
      <line x1="42" y1="17" x2="58" y2="17" stroke="#C0392B" strokeWidth="2" />
    </g>
  ),
  star: (
    <g>
      <polygon
        points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35"
        fill="#FFD700"
        stroke="#FFA500"
        strokeWidth="2"
      />
    </g>
  ),
  leaf: (
    <g>
      <path d="M50 92 C18 70 14 28 50 8 C86 28 82 70 50 92 Z" fill="#2ECC71" />
      <line x1="50" y1="18" x2="50" y2="88" stroke="#1E8449" strokeWidth="3" />
      <line x1="50" y1="42" x2="32" y2="32" stroke="#1E8449" strokeWidth="2" />
      <line x1="50" y1="56" x2="68" y2="46" stroke="#1E8449" strokeWidth="2" />
    </g>
  ),
  plant: (
    <g>
      <rect x="28" y="72" width="44" height="22" rx="4" fill="#B5651D" />
      <line x1="50" y1="72" x2="50" y2="34" stroke="#27AE60" strokeWidth="4" />
      <ellipse cx="33" cy="46" rx="17" ry="9" fill="#2ECC71" transform="rotate(-25 33 46)" />
      <ellipse cx="67" cy="38" rx="17" ry="9" fill="#27AE60" transform="rotate(25 67 38)" />
      <circle cx="50" cy="27" r="8" fill="#F1C40F" />
    </g>
  ),
  sun: (
    <g>
      <circle cx="50" cy="50" r="22" fill="#FFD700" />
      <g stroke="#FFD700" strokeWidth="4" strokeLinecap="round">
        <line x1="50" y1="6" x2="50" y2="18" />
        <line x1="50" y1="82" x2="50" y2="94" />
        <line x1="6" y1="50" x2="18" y2="50" />
        <line x1="82" y1="50" x2="94" y2="50" />
        <line x1="20" y1="20" x2="29" y2="29" />
        <line x1="71" y1="71" x2="80" y2="80" />
        <line x1="80" y1="20" x2="71" y2="29" />
        <line x1="29" y1="71" x2="20" y2="80" />
      </g>
    </g>
  ),
  water: (
    <g>
      <path d="M50 6 C70 36 82 52 82 66 A32 32 0 1 1 18 66 C18 52 30 36 50 6 Z" fill="#3498DB" />
      <ellipse cx="38" cy="62" rx="9" ry="14" fill="rgba(255,255,255,0.35)" transform="rotate(-20 38 62)" />
    </g>
  ),
  cloud: (
    <g>
      <path
        d="M26 74 A16 16 0 0 1 28 42 A20 20 0 0 1 64 34 A16 16 0 0 1 78 74 Z"
        fill="#BDC3C7"
      />
      <circle cx="38" cy="58" r="4" fill="#8FA0A6" opacity="0.5" />
    </g>
  ),
  rocket: (
    <g>
      <path d="M50 6 C66 24 70 46 70 62 L50 74 L30 62 C30 46 34 24 50 6 Z" fill="#ECF0F1" stroke="#95A5A6" strokeWidth="2" />
      <circle cx="50" cy="38" r="9" fill="#3498DB" />
      <path d="M30 62 L18 80 L32 74 Z" fill="#E74C3C" />
      <path d="M70 62 L82 80 L68 74 Z" fill="#E74C3C" />
      <path d="M44 74 L50 94 L56 74 Z" fill="#F39C12" />
    </g>
  ),
  heart: (
    <g>
      <path d="M50 86 C20 64 12 44 22 30 C32 16 48 22 50 34 C52 22 68 16 78 30 C88 44 80 64 50 86 Z" fill="#E74C3C" />
      <path d="M30 40 C32 34 38 32 42 36" stroke="rgba(255,255,255,0.4)" strokeWidth="4" fill="none" strokeLinecap="round" />
    </g>
  ),
  cell: (
    <g>
      <circle cx="50" cy="50" r="40" fill="#9BD7F5" opacity="0.9" />
      <circle cx="50" cy="50" r="14" fill="#2C3E50" />
      <circle cx="32" cy="33" r="5" fill="#2E86C1" />
      <circle cx="69" cy="62" r="4" fill="#2E86C1" />
      <circle cx="62" cy="28" r="3" fill="#2E86C1" />
    </g>
  ),
  microscope: (
    <g>
      <circle cx="44" cy="16" r="10" fill="#95A5A6" />
      <rect x="40" y="24" width="9" height="34" rx="4" fill="#7F8C8D" />
      <path d="M26 62 Q26 44 44 44 Q62 44 62 62 Z" fill="#95A5A6" />
      <rect x="18" y="74" width="64" height="10" rx="4" fill="#5D6D7E" />
      <rect x="64" y="52" width="14" height="18" rx="3" fill="#BDC3C7" />
    </g>
  ),
};

export const OBJECT_TYPES: ObjectType[] = Object.keys(ICON_PATHS) as ObjectType[];

/** One icon drawn as its own standalone SVG in the given pixel box. */
export function IconGlyph({
  type,
  size,
}: {
  type: ObjectType;
  size: number;
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {ICON_PATHS[type] ?? ICON_PATHS.book}
    </svg>
  );
}
