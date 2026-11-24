# Renderer polish backlog

Minor visual issues found while reviewing the 3D-shapes cut. None of these
block the render; they are the next pass on the shared editorial system.

## Layout / empty space

- **Scene 6 (real world)** — the three-step flow now sits at 50% so the gap under
  the headline is gone, but the block is still the shortest content on screen.
  Consider a fourth chip or a small sketch of each field (building / controller)
  to fill the right-hand whitespace next to the cards.
- **Scene 7 (recap)** — the poster block is centered in the 16%–79% band, which
  leaves ~15% empty paper between the chips and the caption card. Options: pull
  `EndScreen` down a little, or enlarge the title (`fitFontSize` cap of 132 is
  never reached with "Break it down").
- **Long captions** — the caption card is bottom-anchored above the frame meter.
  A three-line caption on a scene with a low diagram (scene 3) comes within
  ~40px of the diagram's shadow. A caption max-height with slightly smaller type
  after 2 lines would give a safer margin.
- **Equation panel** — reads cleanly now (no line number, one line), but the dark
  panel is the only dark object in a pastel scene. A white-paper variant with an
  orange underline would match the rest of the system better.

## Components not yet converted to the paper system

- `SpeechBubble` — still uses the old rounded/glass look.
- `AnnotatedCallout` — old arrow + glow styling; needs a sticker-tag treatment.
- `ImageScene` — full-bleed image with no paper frame or caption slip.
- `SummaryScene` — plain bullet list; should become a chip grid like `EndScreen`.
- `ComparisonChart` bars are restyled, but axis labels still use the old muted
  grey rather than ink + mono labels.

## Motion

- `SceneWipe` is a single diagonal block. A two-layer wipe (paper + accent bar
  with a 3–4 frame offset) would read more like the reference.
- No exit animation: scenes cut to the wipe without the content settling or
  leaving. A 6-frame scale-out on the last block of each scene would help.
- Sticker rotate values are random per index; on scenes with 3 cards the
  alternating ±1.2° looks mechanical.

## Data / planner

- Shared `OBJECT_TYPES` in `storyboard.visuals.ts` does not list the new geometry
  icons (`cube`, `pyramid`, `square`, `edge`, `vertex`), so a generated
  geometry storyboard can still fall back to `book`.
- `CurrentVideo` is a static preview composition; arbitrary topics still depend
  on the planner choosing sensible `top`/`width` values. Clamping `top` in
  `EduVideo` guards the worst cases but does not fix density.
