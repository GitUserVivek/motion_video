# Issues — job `3e6d2e7c-937d-485f-8955-e2ed5c71c5f6`

Source: https://cover-ended-growing.ngrok-free.dev/output/3e6d2e7c-937d-485f-8955-e2ed5c71c5f6/

Reports reviewed: `quality-report.json`, `validation-report.json`, `assets.json`, `subtitle-report.json`, `storyboard.json`, `content-analysis.json`, `render-metrics.json`.

**Overall:** the technical output is valid — 40.13s, 1080×1920, 30fps, video + audio, no black or frozen segments, 0 failures. `validation-report.json` passes with 3 warnings, but the semantic and editorial issues below are still present in the generated video.

## High severity

### 1. The correct Calvin-cycle diagram was rejected by the asset verifier

- Candidate: `auto/carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png`
- It was rejected for the Chlorophyll, Water Splitting, ATP Creation, Calvin cycle, Light-dependent, Reactions, and Calvin slots.
- Rejection reason:
  > Names the shared term(s) carbon/calvin/cycle, but its identity belongs to geography — a field this scene does not discuss.
- The candidate is a scientific “carbon transition map”, but the word **map** is being classified as geography. This is a false field conflict.
- Impact: 8 built-in glyphs were used, and a correctly downloaded Calvin-cycle asset was never attached.

### 2. Unrelated artwork was attached to several scenes

| Scene | Slot | Attached asset | Problem |
|---|---|---|---|
| scene-3 | Chlorophyll | none (candidate rejected) | Correct Calvin-cycle diagram was blocked |
| scene-3 | Solar Panel | `solar-panels-in-brussels…jpg` | Solar panels are relevant to the analogy, not to chlorophyll |
| scene-4 | Sunlight Absorption | `bubble-diagram-showing-the-share-of-global-cumulative-energy…png` | A global energy-share chart, not sunlight absorption |
| scene-5 | “use sunlight to create” | same global energy-share chart | Unrelated to the narration and reused from scene-4 |
| scene-6 | Oxygen | same global energy-share chart | The chart contains no oxygen or plant concept |
| scene-7 | Light-dependent reactions | `nadp-dependent-malic-enzyme-chemical-reaction-scheme…jpg` | Unrelated enzyme reaction, not light-dependent photosynthesis |
| scene-8 | “oxygen is released as a byproduct” | `glucose-2…jpg` | A glucose image used for the oxygen byproduct |

### 3. The same image is reused for unrelated concepts

`bubble-diagram-showing-the-share-of-global-cumulative-energy-f15e34a9.png` is attached three times:

- scene-4 “Sunlight Absorption”
- scene-5 “use sunlight to create”
- scene-6 “Oxygen”

`glucose-chain-structure-numbered-5f466068.png` is also reused for both “Glucose” and “Glucose powers the plant”.

Repeated artwork makes different scenes look identical and does not explain the narration.

### 4. Low visual relevance in scene-2 and scene-4

`validation-report.json`:

- **scene-2 — relevance 0.35**
  - “The scene visual does not name any concept from its narration or key terms.”
  - Narration: “how plants turn sunlight into energy using chlorophyll,”
  - Key term: `chlorophyll`
  - The scene uses a chemical equation and a teacher, but no visual naming chlorophyll, sunlight, or energy.
- **scene-4 — relevance 0.40**
  - “The visuals do not name what the narration is about.”
  - Narration: “captures sunlight to fuel a process like a factory.”
  - Visual brief: “Animated diagram showing carbon dioxide and water entering plant.”
  - The actual `ProcessFlow` steps are “Sunlight Absorption / Water Splitting / ATP Creation”, which describe the light reactions rather than CO₂ and water entering the plant.

Both are warnings only, so the job still passes.

### 5. Subtitles are split mid-sentence into fragments

The subtitle report contains 14 scene cues, but reports `totalCues: 8`.

Fragments at scene boundaries:

- scene-1 ends with **“Photosynthesis is”**
- scene-3 ends with **“Imagine chlorophyll as a solar panel—it”**
- scene-4 ends with **“Plants”**
- scene-5 ends with **“take in carbon dioxide and water, then use sunlight to create”**
- scene-6 starts with lowercase **“glucose, their energy source.”**
- scene-7 starts with lowercase **“light-dependent reactions and the Calvin cycle.”**

The captions are sentence fragments rather than complete read units, even though the reported source is measured timing.

### 6. Scene-7’s concept diagram is fragmented and duplicated

The `ConceptDiagram` in scene-7 contains five items for two concepts:

- “Light-dependent reactions”
- “Calvin cycle”
- “Light-dependent”
- “Reactions”
- “Calvin”

This duplicates the same words across separate tiles and is likely to render as a crowded, confusing diagram. The editorial layout validation did not block it.

### 7. The quality gate passes despite semantic defects

`quality-report.json` reports `passed: true`, `failures: []`, `warnings: []`, and editorial `passed: true`.

The pipeline therefore accepts a video with:

- mismatched artwork in at least five scenes
- two low-relevance warnings
- fragmented subtitles
- a fragmented concept diagram

The current gate checks technical media validity and layout, but not whether attached artwork actually explains the narration.

## Medium severity

### 8. `storyboard.json` is not the final rendered plan

The storyboard artifact contains **0** `auto/` asset references and **0** `data:image` references, while `assets.json` records 18 selections using 10 downloaded images.

The storyboard file appears to be written before final artwork attachment. This makes the main inspection artifact unable to show which image was actually placed in each scene.

### 9. Render throughput is low

From `render-metrics.json`:

- 1,204 frames rendered in **431.9s**
- **2.79 fps**
- total render time **445.6s** (about 7m26s) for a 40s video
- mux time **13.1s**
- profile `gpu`, `angle-egl`, NVENC enabled, concurrency 4
- output 38.8 MB

The GPU profile still produces a long render relative to the video duration.

### 10. Downloaded assets are wasted while wrong assets are used

`assets.json` reports 16 downloaded entries, but only 7 distinct files were used. Nine downloaded files were unused, including:

- `photosynthesis-0924372a.svg`
- `oxygen-ba5474f3.svg`
- `oxygen-528399d7.svg`
- `chloroplast-structure-2931c1f3.png`
- `carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png`
- `c4-photosynthesis-is-less-complicated-cb4ada67.png`

Several of these directly match the narration, while unrelated energy and enzyme images were selected instead. This points to the ranking/attachment stage rather than download availability.

### 11. Subtitle report totals do not match its contents

`subtitle-report.json` declares `totalCues: 8`, but the scene arrays contain 14 cues. The report cannot be trusted for caption-count validation until the two numbers agree.
