import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

/**
 * Devanagari text (Marathi) needs glyphs that neither the display stack nor
 * DejaVu provides, and the render container has no system Devanagari font, so
 * Marathi titles and captions used to paint as empty boxes. The two weights ship
 * with the renderer (public/fonts) and are registered before the first frame is
 * captured: `delayRender` holds capture until the faces are ready, which keeps a
 * slow font load from baking a frame of fallback glyphs into the video.
 */
export const DEVANAGARI_FONT_FAMILY = 'Noto Sans Devanagari';

const FONT_FILES = [
  { weight: '400', file: 'fonts/NotoSansDevanagari-Regular.ttf' },
  { weight: '700', file: 'fonts/NotoSansDevanagari-Bold.ttf' },
] as const;

let loading: Promise<void> | null = null;

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return;

  // @font-face + `document.fonts.load` instead of `FontFaceSet.add`, which is
  // missing from TypeScript's DOM typings even though browsers implement it.
  const declarations = FONT_FILES.map(
    ({ weight, file }) => `@font-face {
      font-family: '${DEVANAGARI_FONT_FAMILY}';
      src: url(${staticFile(file)}) format('truetype');
      font-weight: ${weight};
      font-style: normal;
      font-display: block;
    }`,
  ).join('\n');

  const style = document.createElement('style');
  style.setAttribute('data-render-font', DEVANAGARI_FONT_FAMILY);
  style.textContent = declarations;
  document.head.appendChild(style);

  await Promise.all(
    FONT_FILES.map(({ weight }) => document.fonts.load(`${weight} 1em "${DEVANAGARI_FONT_FAMILY}"`, 'श')),
  );
}

function ensureFonts(): Promise<void> {
  if (loading) return loading;
  loading = loadFonts().catch((error: unknown) => {
    // A missing font must not fail the render: English still renders, and the
    // warning names what could not be served.
    console.warn(
      '[fonts] Could not load the Devanagari font:',
      error instanceof Error ? error.message : String(error),
    );
  });
  return loading;
}

/** Register the bundled fonts for this composition and wait for them. */
export function useRenderFonts(): void {
  const [handle] = useState(() => delayRender('Loading Devanagari font'));

  useEffect(() => {
    void ensureFonts().then(() => continueRender(handle));
  }, [handle]);
}
