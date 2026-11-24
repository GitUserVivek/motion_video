# Issues — current pipeline

Reference jobs:

- Job `3e6d2e7c-937d-485f-8955-e2ed5c71c5f6` — photosynthesis video
  <https://cover-ended-growing.ngrok-free.dev/output/3e6d2e7c-937d-485f-8955-e2ed5c71c5f6/>
- Job `403afc92-8c6f-4294-acf1-f6703c5e85d2` — “3D Shapes: Faces, Edges, and Vertices”
  <https://cover-ended-growing.ngrok-free.dev/output/403afc92-8c6f-4294-acf1-f6703c5e85d2/>

Reports reviewed for job 2: `quality-report.json`, `validation-report.json`, `assets.json`, `subtitle-report.json`, `subtitles.json`, `storyboard.json`, `content-analysis.json`, `render-metrics.json`, `timing-report.json`, `user-assets.json`, and the rendered `frames/scene-01.jpg` … `frames/scene-08.jpg`. The two uploaded images were also fetched from the asset preview endpoint and inspected directly.

**Overall:** both videos are technically valid. Job 2 is 52.8s, 1080×1920, 30fps, has audio, and reports no black or frozen segments. `quality-report.json` still says `passed: true`, but the semantic and editorial defects are visible in the rendered frames. Job 2 adds a new failure class: image assets are treated as small icons, and uploaded images are not understood well enough to be placed or explained correctly.

## High severity

### 1. The correct Calvin-cycle diagram was rejected by the asset verifier

- Candidate: `auto/carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png`
- It was rejected for the Chlorophyll, Water Splitting, ATP Creation, Calvin cycle, Light-dependent, Reactions, and Calvin slots.
- Rejection reason:
  > Names the shared term(s) carbon/calvin/cycle, but its identity belongs to geography — a field this scene does not discuss.
- The candidate is a scientific “carbon transition map”, but the word **map** is being classified as geography. This is a false field conflict.
- Impact: 8 built-in glyphs were used, and a correctly downloaded Calvin-cycle asset was never attached.

### 2. Unrelated artwork was attached to several scenes

**Photosynthesis job**

| Scene | Slot | Attached asset | Problem |
|---|---|---|---|
| scene-3 | Chlorophyll | none (candidate rejected) | Correct Calvin-cycle diagram was blocked |
| scene-3 | Solar Panel | `solar-panels-in-brussels…jpg` | Solar panels are relevant to the analogy, not to chlorophyll |
| scene-4 | Sunlight Absorption | `bubble-diagram-showing-the-share-of-global-cumulative-energy…png` | A global energy-share chart, not sunlight absorption |
| scene-5 | “use sunlight to create” | same global energy-share chart | Unrelated to the narration and reused from scene-4 |
| scene-6 | Oxygen | same global energy-share chart | The chart contains no oxygen or plant concept |
| scene-7 | Light-dependent reactions | `nadp-dependent-malic-enzyme-chemical-reaction-scheme…jpg` | Unrelated enzyme reaction, not light-dependent photosynthesis |
| scene-8 | “oxygen is released as a byproduct” | `glucose-2…jpg` | A glucose image used for the oxygen byproduct |

**3D-shapes job**

| Scene | Slot | Attached asset | Problem |
|---|---|---|---|
| scene-2 | Face | `auto/concertina-cube-hasse-diagram-b0309471.png` | A Hasse/lattice graph of a cube, not a face |
| scene-2 | Edge | `auto/matchbox-label-geometric-design-czechoslovakia-circa-1940s-m-47f98d78.jpg` | A commercial matchbox label, not an edge |
| scene-2 | Vertex | built-in glyph | No matching artwork selected |
| scene-3 | 6 Faces | Hasse diagram | The graph does not show six faces |
| scene-3 | 12 Edges | `auto/freytag-s-pyramid-diagram-76f656af.jpg` | Freytag’s Pyramid is a story-structure diagram, not a geometric pyramid |
| scene-3 | 8 Vertices | built-in glyph | No matching artwork selected |
| scene-4 | “edges along the base and…” | Hasse diagram | Unrelated to a pyramid’s base and slant edges |
| scene-4 | “To count systematically…” | Freytag’s Pyramid | Unrelated to counting faces/edges/vertices |
| scene-5 | “then trace edges” | Freytag’s Pyramid | Unrelated to tracing geometric edges |
| scene-5 | “locate vertices.” | Matchbox label | Unrelated to vertices |
| scene-6 | “Complex pattern” | Matchbox label | A random label, not a soccer-ball pattern |
| scene-6 | “Understanding” | built-in glyph | No matching artwork selected |

The second job therefore repeats the first job’s failure with different assets: downloaded files match one weak filename token, not the concept the scene is teaching.

### 3. The same image is reused for unrelated concepts

**Photosynthesis job**

`bubble-diagram-showing-the-share-of-global-cumulative-energy-f15e34a9.png` is attached three times:

- scene-4 “Sunlight Absorption”
- scene-5 “use sunlight to create”
- scene-6 “Oxygen”

`glucose-chain-structure-numbered-5f466068.png` is also reused for both “Glucose” and “Glucose powers the plant”.

**3D-shapes job**

`assets.json` contains 17 selections but only 4 distinct downloaded files are used. Three files are reused three times each across unrelated scenes:

- `auto/concertina-cube-hasse-diagram-b0309471.png` — Face, 6 Faces, “edges along the base”
- `auto/freytag-s-pyramid-diagram-76f656af.jpg` — 12 Edges, “To count systematically”, “then trace edges”
- `auto/matchbox-label-geometric-design-czechoslovakia-circa-1940s-m-47f98d78.jpg` — Edge, “locate vertices”, “Complex pattern”

The only per-scene exclusion set prevents two tiles in the *same* scene from sharing a file. There is no global `usedArtwork` map, so a file can be reused across scenes without any concept-equivalence check.

### 4. Uploaded images are not understood by the model

Job 2 had two uploaded images:

1. A full-page poster titled **“How to Find Faces, Edges & Vertices of 3D Shapes”**, with formulas and a table covering cube, cuboid, tetrahedron, triangular/pentagonal prisms, pentagonal/hexagonal pyramids, cylinder, cone, sphere, and hemisphere.
2. A full-page poster titled **“How to Find Faces, Edges & Vertices of Cone, Cylinder, Sphere and Hemisphere”**, with labeled diagrams and counts for those curved solids.

`user-assets.json` records:

- `faces_edges_vertices.jpeg` → caption `faces edges vertices`; keywords `faces`, `edges`, `vertices`, `faces edges vertices`; `used: true`
- `faces_edges_vertices_1.jpeg` → caption `faces edges vertices 1`; keywords `faces`, `edges`, `vertices`, `faces edges vertices 1`; `used: true`

Those captions and keywords are filename-derived. They do not distinguish the general 3D-shapes poster from the curved-solids poster, and they do not record that either image is a worksheet/reference table. The matcher therefore sees two nearly identical generic assets rather than two different teaching aids.

The upload path supports an optional vision model, but the metadata stored here is indistinguishable from `fallbackMetadata()`: caption equals the cleaned filename, and keywords are the filename tokens. There is no `metadata_source` in `user-assets.json`, so a reviewer cannot tell whether vision ran or whether the upload was only filename-tagged.

Impact:

- The model does not know what is inside the image.
- It cannot tell which poster is relevant to a definition scene, a counting scene, or a curved-solids extension.
- It cannot explain the image’s purpose or content.
- “Used” only means “attached somewhere”, not “understood and appropriate”.

### 5. Image assets are displayed too small to be understood

The uploaded posters are 1023×1279 and 1253×1253 pixels, but they are rendered inside `AnimatedDiagram` in scene-1 at roughly 90×90 pixels inside a small panel, with labels `Cube` and `?`. The poster text is completely unreadable. The same problem affects downloaded diagrams:

- `AnimatedDiagram` caps an image tile at about **104 px** and uses a 15–22 px label.
- `ConceptDiagram` renders artwork at roughly **76% of `iconSize`**; job 2 uses `iconSize: 132`, so the image is about **100 px**.
- `ProcessFlow` renders artwork at **56×56 px** inside an 80 px circle.
- `ComparisonChart`, `Timeline`, and `AnnotatedCallout` also use icon-sized artwork slots rather than a readable exhibit.

This is visible in the job 2 frames:

- `scene-01.jpg`: two dense posters shown as tiny thumbnails under “Cube” and “?”.
- `scene-02.jpg`: Hasse graph and matchbox label shown as small tiles under “Face” / “Edge”; their content cannot be read.
- `scene-03.jpg`: Hasse graph and Freytag’s Pyramid shown inside 80 px circles.
- `scene-04.jpg`: two small images in a mostly empty center panel.
- `scene-05.jpg`: three small images in a vertical flow.
- `scene-06.jpg`: soccer ball and matchbox label in small tiles.

`objectFit: contain` prevents cropping, but it does not solve readability. A content-rich diagram, worksheet, chart, or photograph cannot be understood at icon size. The pipeline currently has no concept of an image’s **role**: every image is treated as an icon replacement, regardless of aspect ratio, text density, or teaching purpose.

`imageAlt` does not solve this either. Alt text helps accessibility, but it is not visible to the learner and cannot replace a readable image or an on-screen explanation.

### 6. Uploaded images are attached to the wrong scene and role

Both uploads are attached to the **hook scene** (scene-1), where the storyboard asks for “A transparent cube rotating in 3D space with a question mark overlay”. The uploads are labeled `Cube` and `?`.

That placement is semantically wrong:

- The first poster is a general reference table for faces, edges, and vertices. It belongs with the definition/counting scenes (scene-2 or scene-3), not the opening question.
- The second poster covers cone, cylinder, sphere, and hemisphere. The narration does not teach curved solids in this video, so the correct action may be to leave it unused with a reason, or to show it in a clearly labeled extension — not to force it into the hook as a question mark.
- Neither upload is a cube or a question mark.
- The same two dense posters are placed side by side in the smallest visual area of the video, so they add clutter rather than explanation.

`user-assets.json` only records `used: true`. It does not record:

- which scene received the image
- which label/tile it was attached to
- whether it was shown as an icon or a large reference image
- the match score or reason
- whether the image’s content actually matched the scene

So the audit currently claims success for a placement that is visibly wrong.

### 7. Low visual relevance is still only a warning

**Photosynthesis job**

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

**3D-shapes job**

`validation-report.json` has one warning:

- **scene-7 — relevance warning**: “The scene visual does not name any concept from its narration or key terms.”

Scene-7’s `ComparisonChart` says “Pencil / Cylinder” and “Soccer Ball / Polyhedron”, while the scene narration is “simple form… Now you can see how geometry shapes the world”. The visual is a recap, but its labels do not connect to the words being spoken. The job still passes.

### 8. Visual briefs and rendered visuals can disagree

The photosynthesis job’s scene-4 brief says CO₂ and water enter a plant, but the rendered `ProcessFlow` says sunlight absorption, water splitting, and ATP creation.

Job 2’s scene-6 has an even clearer mismatch:

- `visualBrief`: “Animated number counter for soccer ball geometry”
- `AnimatedText`: “Animated number counter for soccer ball geometry”
- Actual `ConceptDiagram`: “Models / Complex pattern / Understanding” with a soccer-ball image and no number counter

The heading promises a counter that does not exist. The renderer and validator treat the heading as text, not as a claim about the visual, so the mismatch passes.

### 9. The quality gate passes despite semantic defects

Job 1 reports `passed: true`, `failures: []`, `warnings: []`, and editorial `passed: true` despite mismatched artwork, fragmented subtitles, and a fragmented diagram.

Job 2 reports `passed: true`, no blocking issues, and only the scene-7 relevance warning, despite:

- 10 downloaded artwork selections from only 4 distinct files
- three unrelated files reused three times each
- two uploaded worksheets rendered as unreadable 90 px thumbnails
- both uploads placed in the hook as “Cube” / “?”
- `storyboard.json` containing only one image reference and no `imageAlt`
- 9 source caption cues split into 16 scene cues

The gate checks technical media validity, layout, and some text conditions. It does not check whether an attached image is readable, whether an uploaded image was understood, whether the image’s role matches its placement, or whether a heading describes the visual that actually rendered.

### 10. `storyboard.json` is not the final rendered plan

**Photosynthesis job:** `storyboard.json` contains **0** `auto/` asset references and **0** `data:image` references, while `assets.json` records 18 selections using 10 downloaded images.

**3D-shapes job:** `storyboard.json` contains 17 selections in `assets.json`, but only **1** `image` prop and **1** `data:image` reference (the soccer ball in scene-6). It contains **0** `imageAlt` values. Both uploaded images are absent, even though the rendered `scene-01.jpg` visibly contains them.

The one embedded image proves that attachment can happen before the file is written, but most attachments still happen afterward. The artifact therefore cannot be used to audit what was actually placed in each scene.

### 11. Subtitles are split mid-sentence into fragments

**Photosynthesis job:** 14 scene cues are reported as `totalCues: 8`. Fragments include:

- scene-1 ends with **“Photosynthesis is”**
- scene-3 ends with **“Imagine chlorophyll as a solar panel—it”**
- scene-4 ends with **“Plants”**
- scene-5 ends with **“take in carbon dioxide and water, then use sunlight to create”**
- scene-6 starts with lowercase **“glucose, their energy source.”**
- scene-7 starts with lowercase **“light-dependent reactions and the Calvin cycle.”**

**3D-shapes job:** `subtitles.json` has 9 complete cues, but the scene arrays contain 16 cues. Examples:

- scene-1 ends with **“…faces,”**
- scene-2 starts with **“edges, and vertices.”**
- scene-2 ends with **“…and”**
- scene-3 starts with **“the corners where edges intersect are vertices.”**
- scene-4 starts with lowercase **“edges along the base…”**
- scene-5 starts with lowercase **“then trace edges…”**
- scene-6 starts with **“3D models.”**
- scene-7 starts with **“simple form.”**
- scene-8 is only 24 frames and contains **“around you!”**

The pipeline groups word cues into readable sentences, then clips them at scene boundaries. The scene boundaries do not follow sentence boundaries, so the final captions are sentence fragments even when the source cues are complete.

### 12. Subtitle report totals do not match their contents

- Job 1: `totalCues: 8`; scene arrays contain 14 cues.
- Job 2: `totalCues: 9`; scene arrays contain 16 cues.

The report cannot be trusted for caption-count validation until `totalCues` is derived from the final scene cues, not from the pre-split source cue list.

## Medium severity

### 13. Render throughput is low

**Photosynthesis job** from `render-metrics.json`:

- 1,204 frames rendered in **431.9s**
- **2.79 fps**
- total render time **445.6s** (about 7m26s) for a 40s video
- mux time **13.1s**
- profile `gpu`, `angle-egl`, NVENC enabled, concurrency 4
- output 38.8 MB

**3D-shapes job** from `render-metrics.json`:

- 1,584 frames
- **515,998 ms** frame render time
- **3.07 fps**
- total **533,456 ms** (about 8m53s) for a 52.8s video
- mux time **16,848 ms**
- output 50.0 MB

The GPU profile still produces a long render relative to the video duration. This is secondary to the semantic failures, but it is still a measurable throughput problem.

### 14. Downloaded assets are wasted while wrong assets are used

**Photosynthesis job:** 16 downloaded entries, 7 distinct files used, 9 unused, including:

- `photosynthesis-0924372a.svg`
- `oxygen-ba5474f3.svg`
- `oxygen-528399d7.svg`
- `chloroplast-structure-2931c1f3.png`
- `carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png`
- `c4-photosynthesis-is-less-complicated-cb4ada67.png`

Several directly match the narration, while unrelated energy and enzyme images were selected instead.

**3D-shapes job:** 7 downloaded files, 10 downloaded selections, 4 distinct files used, 3 unused:

- `auto/the-modern-dances-how-to-dance-them-1914-diagram-1-43fd9d2c.png`
- `auto/rhombus-set-psf-235bd787.png`
- `auto/comparison-oloid-sphericon-3d-67396e45.png`

The wrong files are not merely unused; they are reused across multiple scenes. This points to the ranking/attachment stage, not download availability.

## Required outcome

A video must not pass merely because the MP4 is valid. For image assets, acceptance requires:

1. Uploaded images are understood from their pixels, not just their filenames.
2. Each uploaded image is either shown as a readable reference image or paired with an on-screen explanation of its purpose/content.
3. Content-rich diagrams are not squeezed into icon-sized tiles.
4. An image is used at most once unless reuse is explicitly concept-equivalent and recorded.
5. Every accepted image records its scene, label, role, match evidence, and reason.
6. `storyboard.json` and `assets.json` describe the same final rendered plan.
7. Captions are complete read units and `totalCues` equals the sum of scene cues.
