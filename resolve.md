# Resolution Plan — current pipeline

Reference: [`issues.md`](./issues.md)

## Goal

Make the pipeline:

- understand uploaded images from their content, not just their filenames;
- place each uploaded image in a scene where it can be explained or used as a readable reference;
- show content-rich artwork at a readable size instead of shrinking it into an icon;
- reject wrong artwork and stop reusing one file for unrelated concepts;
- produce sentence-safe captions and inspectable final artifacts;
- fail the job on unresolved semantic defects instead of reporting `passed: true`.

Keep the existing schema, approval gate, asset-discovery architecture, and topic independence. Do not hardcode this job’s topic, filenames, scene ids, or uploaded-image captions.

## Guiding rules

- Fix deterministic logic first. The LLM judge may reject an accepted candidate, but it must not be the only thing preventing a wrong image from reaching the render.
- An uploaded image is not “used” because it was attached somewhere. It is used only when its content matches the scene and its placement is recorded.
- Filename metadata may label an image, but it must not be treated as image understanding. Semantic placement requires vision metadata or explicit user-provided description.
- Every image gets a role: `icon`, `diagram`, `photo`, `reference`, or `worksheet`.
- A content-rich image must not be rendered in a 56–132 px icon slot. Use a large exhibit, or do not use the image in that slot.
- An image needs either readable display or an on-screen explanation of its purpose/content. `imageAlt` alone is not enough.
- A second use of the same artwork is allowed only when the concept is explicitly equivalent and the reuse is recorded; otherwise choose another asset or a built-in glyph.
- Preserve backward compatibility: no required schema changes, no new external service. Extend the existing optional vision service and existing components.
- Every fix gets a regression test built from the failure shapes in `issues.md`.
- Do not claim success from a valid MP4. Acceptance is based on the semantic report, final storyboard/asset audit, and sampled frames.

## Priority order

### P0 — Uploaded-image understanding and placement (issues 4, 6)

#### 1. Require real content metadata for uploaded images

Files: `packages/backend/src/services/vision.service.ts`, `user.asset.service.ts`, `user.asset.match.ts`

Extend `ImageMetadata` to carry enough information to route and explain an upload:

```ts
interface ImageMetadata {
  caption: string;          // e.g. "A worksheet comparing faces, edges, and vertices"
  description: string;      // one or two sentences about what the image teaches
  keywords: string[];       // concrete visual nouns
  subjects: string[];       // e.g. ["cube", "pyramid", "cylinder"]
  detectedText?: string;    // visible labels/headings, when the vision model can read them
  imageType: 'worksheet' | 'diagram' | 'photo' | 'chart' | 'illustration' | 'unknown';
  source: 'filename' | 'vision' | 'user-label';
}
```

- Ask the existing vision endpoint to return `caption`, `description`, `keywords`, `subjects`, `detectedText`, and `imageType`. Do not add a new provider.
- Store the metadata and `metadata_source` in the `script_assets` row and in `user-assets.json`.
- If vision is not configured or fails:
  - keep the filename/user-label caption for display;
  - mark `imageType: 'unknown'`;
  - do **not** allow semantic placement into a concept tile based only on filename tokens;
  - show the image as a neutral reference exhibit with its filename/description, or leave it unused with a clear reason.
- Log `metadata_source` and `imageType` for every upload.
- Add a warning when two uploads have near-identical fallback metadata, because that is a sign the model is not distinguishing them.

Tests: `user-assets.test.ts`

- Two uploads with the same filename-derived caption and keywords must not be treated as distinct semantic assets unless vision metadata differs.
- A filename-only upload with `imageType: 'unknown'` must not be routed into `AnimatedDiagram`/`ConceptDiagram` tiles.
- A vision-tagged worksheet must produce a caption/description that names the actual content.
- `user-assets.json` must contain `metadata_source`, `imageType`, and `usedIn` for each upload.

Acceptance: the two job-2 posters receive different descriptions and types, or both are marked unknown and excluded from semantic tile placement.

#### 2. Route uploads by content and record where they were used

Files: `packages/backend/src/services/storyboard.visuals.ts`, `user.asset.match.ts`, `render.worker.ts`

- Build the match context from `caption`, `description`, `subjects`, `detectedText`, `imageType`, and scene key terms — not just filename tokens.
- Classify the intended role before attaching:
  - broad worksheet/reference table → one large reference exhibit in the scene that introduces the overall concept;
  - specific diagram → one scene whose narration/key terms directly match its subjects;
  - photo → a scene that explains that object;
  - icon/illustration → a tile only when it is simple enough to read at tile size.
- A broad poster must not be split into per-tile matches. Attach it once, at the scene level, not to every label.
- Do not force an upload into the hook just because it is available. The hook should stay a hook unless its brief explicitly asks for a reference image.
- Keep one use per upload by default. A second use requires explicit concept equivalence and a recorded `reusedFrom`.
- Record:

```json
{
  "id": "...",
  "used": true,
  "usedIn": {
    "sceneId": "scene-2",
    "component": "ImageScene",
    "label": "Faces, edges, and vertices reference",
    "role": "reference",
    "reason": "Image lists faces, edges, and vertices for 3D shapes",
    "matchScore": 0.86
  }
}
```

- If an upload is not used, record the reason in `unused` rather than forcing it into a scene.

Tests: `user-assets.test.ts`, `editorial.test.ts`

- A general faces/edges/vertices poster and a curved-solids poster must not both land in the hook.
- The general poster must be eligible for the definition/counting scene; the curved-solids poster must not be forced into a scene that does not discuss curved solids.
- No upload may have `used: true` without `usedIn`.
- No upload may be attached twice without `reusedFrom`.

Acceptance for job 2: the first poster is shown as a readable reference in the faces/edges/vertices portion of the lesson, or is unused with a reason; the second is used only where cone/cylinder/sphere content is actually taught, or is unused with a reason. `scene-01` no longer shows two dense posters labeled “Cube” and “?”.

### P0 — Image presentation and readability (issues 5, 9)

#### 3. Add an image-role and readable-sizing contract

Files: `packages/backend/src/services/storyboard.visuals.ts`, `packages/renderer/src/components/AnimatedDiagram.tsx`, `ConceptDiagram.tsx`, `ProcessFlow.tsx`, `ImageScene.tsx`, `AnnotatedCallout.tsx`, `packages/backend/src/services/layout.validation.ts`

- Add optional image presentation fields to the storyboard props:
  - `imageRole: 'icon' | 'diagram' | 'photo' | 'reference' | 'worksheet'`
  - `imageCaption?: string` — visible caption explaining what the image shows
  - `imageDescription?: string` — purpose/content explanation
  - `imageLayout?: 'tile' | 'panel' | 'full'`
- Keep `imageAlt` for accessibility, but do not use it as the visible explanation.
- For `imageRole` other than `icon`:
  - use a large panel at least ~60–70% of the 1080 px frame width, with `objectFit: 'contain'`;
  - reserve space for the caption/description and keep subtitles from covering the image;
  - use `ImageScene`/`AnnotatedCallout` where they already fit, or add one small `ImageExhibit` component if neither can reserve readable space.
- For `AnimatedDiagram`, `ConceptDiagram`, `ProcessFlow`, `Timeline`, `ComparisonChart`, and `SplitScreenComparison`:
  - only attach an image to a tile when `imageRole === 'icon'` or the image is simple enough to read at the tile size;
  - never attach a worksheet, chart, or labeled diagram to `ProcessFlow`’s 56×56 image slot;
  - if a content-rich image is the best match, move it to a scene-level exhibit and use a built-in glyph for the tile.
- Do not shrink a content-rich image to fit; increase the exhibit size or leave it out.

Tests: `editorial.test.ts`, component tests if available

- A 1023×1279 worksheet assigned to a 56 px `ProcessFlow` step is rejected and moved to an exhibit (or the step uses a glyph).
- A content-rich `diagram`/`worksheet` gets an exhibit width of at least 600 px at 1080 px output.
- A poster has a visible `imageCaption`/`imageDescription`, not only `imageAlt`.
- A simple icon can still use a tile.

Acceptance: `scene-01` no longer contains readable-text posters at ~90 px. If a poster is used, its labels are legible in the sampled frame or its content is explained by visible text.

#### 4. Validate image readability and metadata

Files: `layout.validation.ts`, `storyboard.validation.ts`, `quality.service.ts`

Add semantic image checks:

- Blocking:
  - content-rich image (`diagram`, `worksheet`, `chart`, `reference`) in a tile smaller than the readable threshold;
  - image prop with no `imageAlt`;
  - content-rich image with no visible caption/description;
  - `used: true` upload with no `usedIn`;
  - image `role` incompatible with its component (e.g. worksheet in `ProcessFlow`).
- Warning:
  - extreme aspect ratio;
  - image with very dense detected text and no zoom/region focus;
  - image whose caption duplicates a heading without adding explanation.
- Include these in `quality-report.json` under an editorial/semantic section with the scene id and component.

Tests:

- A failing job-2 fixture (two 90 px posters, `Cube`/`?` labels) must fail validation.
- A fixture with a large image + caption must pass.
- A fixture with an image but no `imageAlt` or caption must fail.

### P0 — Asset correctness (issues 1, 2, 3, 14)

#### 5. Stop treating “map” as proof of geography

Files: `packages/backend/src/services/asset.verify.ts`

- Split field markers into strong and weak evidence.
  - Strong: `country`, `continent`, `ocean`, `cartography`, `atlas`, `region`, etc.
  - Weak/generic visualization words: `map`, `chart`, `graph`, `diagram`.
- A candidate may claim a semantic field when it has at least one strong marker, or at least two independent weak markers. A lone `map` must not create a `geography` conflict.
- Apply the same rule when detecting the scene’s own fields, so a scene saying “carbon transition map” is not classified as geography either.
- Keep the existing generic-token removal and shared-term requirement.
- Preserve the existing protections:
  - `Mars Cube One` must still be rejected for a geometry cube scene.
  - `Hierarchy of Control Pyramid` must still be rejected for a geometry pyramid scene.
  - A plain cube or satellite in its correct field must still be accepted.

Tests: `content.test.ts`

- Add the exact candidate `auto/carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png` and assert it is accepted for a photosynthesis/Calvin-cycle scene.
- Add a geography scene with `map of Europe`; verify it still resolves to geography when country/continent evidence exists.
- Keep the Mars/safety regression tests passing.

Acceptance: the Calvin-cycle candidate is accepted; it is no longer listed as a rejected candidate in `assets.json`.

#### 6. Require a head-concept match, not a filename coincidence

Files: `packages/backend/src/services/asset.library.ts`, `storyboard.visuals.ts`

The 3D-shapes job shows why a token hit is not enough:

- `freytag-s-pyramid-diagram` contains “pyramid” but is a story-structure diagram.
- `matchbox-label-geometric-design` contains “geometric” but is a commercial label.
- `concertina-cube-hasse-diagram` contains “cube” but is a lattice graph.

For downloaded (`auto/`) assets:

- Require either:
  - a label/icon hit on the asset’s head concept, or
  - at least two distinct key-term hits that are not merely modifiers.
- Treat proper-name or artifact patterns as a different field unless the scene names that artifact. A generic rule can use the final meaningful noun in the filename as the head concept (`Pyramid` in “Freytag’s Pyramid”, `Label` in “Matchbox label”, `Diagram` in “Hasse diagram”) and require the scene/key term to name that head concept, not just a modifier.
- Penalize generic filename words such as `bubble`, `share`, `cumulative`, `global`, `transition`, `scheme`, `matchbox`, `label`, `freytag`, `hasse` unless they are part of the exact label/key term.
- Do not attach a downloaded file on a single weak narration token (`energy`, `sun`, `process`, `plant`, `cube`, `pyramid`).
- Record `matchedTerms`, `matchScore`, `matchKind` (`label` | `icon` | `key-term` | `narration`), and the head concept in the audit.

Tests: `assets.test.ts`, `user-assets.test.ts`

- An `energy`-only chart must not match `oxygen`, `sunlight absorption`, or `use sunlight`.
- A `freytag-s-pyramid-diagram.jpg` must not match “12 Edges” or “pyramid” in a geometric-shape scene.
- A `matchbox-label-geometric-design.jpg` must not match “Edge” or “locate vertices”.
- A `concertina-cube-hasse-diagram.png` must not match “Face”, “6 Faces”, or “edges along the base”.
- An exact `oxygen`, `chloroplast structure`, or `soccer ball` asset must beat a generic chart/label.
- User-uploaded assets follow the new content-routing rules, not the downloaded-file head-concept rule.

#### 7. Deduplicate artwork across scenes, not only inside one scene

Files: `storyboard.visuals.ts`

- Add a global `usedArtwork: Map<assetId, sceneId>` for `attachSceneArtwork`.
- Pass it through every `verifiedArtwork` / `attach*Images` call in addition to the existing scene-local `used` set.
- A second use is allowed only when the new label normalizes to the same concept as the previous use (for example singular/plural or a direct synonym), and the reuse is explicitly recorded as `reusedFrom`.
- If no alternative matches, use the built-in glyph. Do not reuse an unrelated file just to avoid a glyph.
- Keep uploaded assets single-use by default; a second use requires explicit concept equivalence and `reusedFrom`.

Tests:

- Reproduce the energy chart being selected for `Sunlight Absorption`, `use sunlight`, and `Oxygen`; assert only one scene gets it and the other two choose a better asset or a built-in glyph.
- Reproduce the Hasse diagram, Freytag’s Pyramid, and matchbox label each being used three times in job 2; assert no file is reused across unrelated labels.
- Reproduce `glucose-chain` being reused for unrelated labels; assert reuse is either concept-equivalent or rejected.

#### 8. Make the asset audit explain accepted choices

Files: `storyboard.visuals.ts`, `render.worker.ts`

For every selection, record:

- `matchedTerms`
- `matchScore`
- `matchKind`
- `candidate` for rejected choices
- `reason` for rejection
- `reusedFrom` when reuse was allowed
- `role` and `imageLayout`
- for uploads, `usedIn` with scene, component, label, and reason

Keep the existing `candidate`/`reason` for rejections.

Acceptance: a reviewer can see why each accepted image was chosen, what role it played, and why an upload was marked used or unused.

### P0 — Visual relevance and diagram integrity (issues 7, 8, 9)

#### 9. Repair scenes whose visuals do not name the narration

Files: `storyboard.validation.ts`, `storyboard.visuals.ts`, `render.worker.ts`

- Extend `calculateVisualRelevance` to count actual attached visual evidence:
  - `AnimatedText` headings
  - diagram/process/split-screen labels
  - `imageAlt`
  - `imageCaption` / `imageDescription`
  - attached asset tokens, including verified head concepts
  - image roles (a worksheet that covers the scene’s key terms counts as evidence; a random chart does not)
- After `attachSceneArtwork`, run a semantic repair for any content scene scoring below `0.5`:
  - If the scene has a `ProcessFlow` but its labels do not cover the narration, rebuild the steps from the scene’s key terms/narration.
  - If the scene has no visual naming a key term, add a `ConceptDiagram` built from the scene’s own phrases or a readable image exhibit.
  - If an `AnimatedText` heading promises a component that is absent (e.g. “Animated number counter” with no `NumberCounter`), replace the heading or add the promised visual.
- Re-run validation after repair.
- Make a scene with non-empty key terms and no visual evidence for any key term blocking after the repair attempt. Keep a numeric warning band for `0.5–0.7`.
- Do not make a low score blocking when the scene is a closing/end screen with no teaching content.

Tests: `editorial.test.ts` plus fixtures from both jobs

- Scene-2 photosynthesis fixture: key term `chlorophyll`, equation-only visual; assert repair adds a visual naming chlorophyll/sunlight/energy and score clears the threshold.
- Scene-4 photosynthesis fixture: brief says CO₂/water entering a plant; ProcessFlow says sunlight/water/ATP; assert steps are repaired or the scene is blocked.
- Scene-7 3D-shapes fixture: “Pencil / Cylinder” and “Soccer Ball / Polyhedron” vs “simple form… geometry shapes the world”; assert repair adds a relevant recap label or the scene is blocked.
- Scene-6 3D-shapes fixture: heading says “Animated number counter” but no counter exists; assert heading and component agree.
- Closing scene with no key terms remains allowed.

#### 10. Stop fragmenting multi-word diagram labels

Files: `storyboard.visuals.ts` (`buildConceptItems`, `bestTerms`, `reserved`), `layout.validation.ts`

- Normalize candidate labels before deduplication (`lowercase`, collapse whitespace).
- Reject a candidate when it is a substring of an already chosen label, or when an already chosen label is a substring of it.
- Keep multi-word key phrases intact: `Light-dependent reactions` must remain one tile, not `Light-dependent` + `Reactions`.
- Cap self-generated `ConceptDiagram` items at three meaningful tiles.
- Add a `ConceptDiagram` validation path equivalent to `AnimatedDiagram`:
  - duplicate labels
  - contained/substring labels
  - more than three tiles for a two-concept phrase
  - labels longer than the safe width
- Make duplicate/contained labels blocking after repair; tile count and length can remain warnings.

Tests:

- Scene-7 photosynthesis fixture with “light-dependent reactions and the Calvin cycle” must produce two tiles, not five.
- Existing concept-diagram tests must keep distinct legitimate tiles.
- A three-tile 3D-shapes concept diagram must not contain duplicate/contained labels.

#### 11. Make the quality gate fail on unresolved semantic defects

Files: `storyboard.validation.ts`, `quality.service.ts`, `render.worker.ts`

- Add a semantic section to the editorial report:
  - unresolved low-relevance scene count
  - scenes with key terms but no matching visual
  - content-rich images in unreadable tiles
  - images without `imageAlt`/caption
  - uploads marked used without `usedIn`
  - captions split mid-sentence
  - duplicate/contained diagram labels
  - assets reused across unrelated scenes
  - headings that promise a missing visual component
- Any blocking semantic issue must fail the job before render (or after re-repair) and appear in `quality-report.json` with the scene id.
- Keep the technical media checks unchanged.
- Do not let `passed: true` coexist with these blocking issues.

Tests:

- A storyboard containing the exact job-1 mismatches must fail validation until the asset/caption/diagram fixes are applied.
- A storyboard containing the exact job-2 upload/readability mismatches must fail validation.
- A clean fixture must still pass.

### P0 — Captions and report integrity (issues 11, 12)

#### 12. Group captions by sentence, not only by word count

Files: `subtitle.service.ts` (`groupWordCues`)

- Flush the current group at sentence-ending punctuation (`.`, `?`, `!`) before considering the word/character cap.
- Prefer the most recent comma/colon/semicolon boundary when a group exceeds the cap.
- Never produce a cue that starts with a lowercase continuation when the previous cue does not end a sentence, unless the speaker is intentionally continuing after a colon.
- Preserve per-word timings after regrouping.

Tests: `subtitles.test.ts`

- Word-cue input for “Photosynthesis is how plants turn sunlight into energy using chlorophyll.” must not produce a standalone “Photosynthesis is” cue.
- Input with a sentence of more than seven words must split at punctuation or a natural phrase boundary, not at an arbitrary word.
- Existing measured-cue behavior remains unchanged.

#### 13. Snap scene boundaries to sentence boundaries

Files: `scene.balance.ts`, `storyboard.service.ts`, `subtitle.service.ts`

- Before subtitle injection, add a boundary pass over adjacent scenes:
  - Find the nearest cue boundary where the preceding cue ends a sentence.
  - If it is within a small tolerance (suggest ±400ms / 12 frames), move the shared scene boundary to that cue boundary.
  - Preserve total frames, minimum 30-frame scene duration, and non-overlap.
- Run this pass before `splitOversizedScenes` so scene balance and captions use the same boundaries.
- Keep `clipCueToWindow` as the fallback for cues that still cross a boundary.
- If no sentence boundary is available, leave the boundary but log a `caption-crosses-scene` warning.

Tests:

- Reproduce the photosynthesis scene-1 → scene-2 boundary at 4s; assert the boundary moves to the end of “Photosynthesis is …” and the next scene no longer starts with a fragment.
- Reproduce the 3D-shapes scene-1 → scene-2 boundary at 8s; assert the boundary moves to the end of “faces, edges, and vertices.” rather than splitting after “faces”.
- Reproduce scene-4 ending in “Plants” (job 1) and scene-7 ending in “simple form.” (job 2); assert the boundary snaps to a sentence end or the scene is flagged.
- Assert scene durations remain positive and the sum of frames equals `totalFrames`.

#### 14. Make the subtitle report count what it contains

Files: `packages/backend/src/workers/render.worker.ts`

- Compute `sceneCues` from the final storyboard’s `Subtitle` children.
- Report both:
  - `sourceCues: subtitles.length`
  - `totalCues: sceneCues.length`
- Keep `scenes[].cues` unchanged.
- Record `fragments` and `crossSceneSplits` counts.

Tests:

- A report built from job 2 must report `sourceCues: 9`, `totalCues: 16` (or the post-fix equivalent), and both counts must match the arrays.
- A report built from job 1 must report `sourceCues: 8`, `totalCues: 14` (or the post-fix equivalent).
- Assert `totalCues === sum(scenes[].cues.length)`.

### P1 — Final artifacts and performance (issues 10, 13, 14)

#### 15. Write the final storyboard after artwork attachment

Files: `render.worker.ts`, `storyboard.service.ts`, `job.files.ts`

- Write `storyboard.json` once more after `attachSceneArtwork` and after any final repair, or add `storyboard.final.json` and keep the planned one as `storyboard.planned.json`.
- The final artifact must include image references (data URLs or `auto/` paths), `imageAlt`, `imageRole`, `imageCaption`, and `usedIn` for uploads.
- Write the final asset audit at the same point so `storyboard.json` and `assets.json` describe the same plan.
- The job-2 final storyboard must contain both uploaded images if they were used; if an upload was not used, it must appear in the unused list with a reason.

Tests:

- Integration fixture: after attachment, `storyboard.json` contains at least one image reference matching a selected asset in `assets.json`.
- A final storyboard may not contain zero image references while `assets.json` reports downloaded selections.
- A final storyboard may not omit a `used: true` upload.

#### 16. Measure and improve render throughput

Files: `render.service.ts`, `render-metrics.json`, `hardware.service.ts`

- Add stage timings to `render-metrics.json`:
  - bundling/startup
  - frame rendering
  - mux
  - thumbnail
  - ffprobe validation
- Run the same storyboard with controlled A/B tests on the Kaggle GPU:
  - concurrency 4 vs 8 (only when CPU/RAM allow)
  - `--log error` vs `--log verbose`
  - JPEG quality 80 vs 92
  - `--gl angle-egl` vs the stable fallback
- Inspect the renderer for per-frame costs: CSS blur/filter, large box shadows, expensive SVG filters, repeated image decoding, and components re-rendering static layers.
- Keep the frame output quality gate; do not improve speed by lowering resolution or dropping required frames.
- Record the winning setting only after measuring it.

Acceptance target: at least a 25% reduction in frame-render time for the same storyboard and quality, or a documented hardware limit with the measured bottleneck. No speed claim without before/after metrics.

#### 17. Improve download-to-use efficiency

Files: `asset.discovery.ts`, `storyboard.visuals.ts`

- After attachment, log and report downloaded assets that were not used, with the reason (no confident match, rejected by verifier, duplicate, content-rich but no readable slot).
- Prefer assets whose filename contains the exact two-word key term over generic single-token matches.
- Avoid downloading more candidates than the scene query budget needs when a high-confidence match already exists.
- Keep the stale-search-cache fallback and 429 cooldown behavior.

Acceptance: the unused-download list is explainable, and the correct oxygen/chloroplast/photosynthesis and geometry assets are used when their scene key terms require them.

## Implementation order

1. **Upload metadata contract** (issue 4): vision fields, `metadata_source`, `imageType`.
2. **Upload routing and `usedIn`** (issue 6): content-based scene selection, no forced hook placement.
3. **Image role and presentation** (issue 5): large exhibits, no content-rich icon tiles.
4. **Image readability validation** (issues 5, 9): block unreadable images and missing captions.
5. **Asset verifier field fix** (issue 1).
6. **Matcher head-concept strictness** (issue 2).
7. **Global dedupe and audit fields** (issues 3, 14).
8. **Visual repair, heading fidelity, relevance blocking** (issues 7, 8).
9. **Diagram label dedupe and validation** (issue 8).
10. **Sentence-aware cue grouping and scene boundary snapping** (issue 11).
11. **Subtitle report counts** (issue 12).
12. **Final storyboard write** (issue 10).
13. **Semantic quality report integration** (issue 9).
14. **Render metrics and A/B performance pass** (issue 13).
15. **Download-to-use efficiency** (issue 14).

## Verification plan

### Automated

Run after each phase and again at the end:

```bash
npm run typecheck
npm test
npm run build
```

Add focused tests before changing behavior:

- `content.test.ts`: Calvin-cycle map accepted; Mars/safety rejections preserved.
- `assets.test.ts`: exact head concept beats generic chart/label; Freytag/matchbox/Hasse do not match geometric slots; reused asset rejected across unrelated scenes.
- `user-assets.test.ts`: filename-only metadata cannot route an upload; distinct vision metadata routes two posters differently; `used: true` requires `usedIn`; no duplicate upload use.
- `editorial.test.ts`: uploaded worksheet and content-rich diagram must use a readable exhibit; `ProcessFlow` cannot receive a 56 px worksheet; scene-2/scene-4 relevance repair; scene-7 two-tile diagram; duplicate/contained labels blocked; heading/component mismatch blocked.
- `subtitles.test.ts`: sentence-aware grouping, scene-boundary snapping, no fragment cues.
- `pipeline.integration.test.ts` or a new report test: `totalCues` equals the sum of scene cues; final `storyboard.json` contains attached images, `imageAlt`, and `usedIn`.

### End-to-end: job 2 (3D shapes)

1. Re-run the same “3D Shapes: Faces, Edges, and Vertices” topic with the same two uploaded posters.
2. Re-fetch the job folder and inspect `frames/scene-01.jpg` … `frames/scene-08.jpg`.
3. Confirm:
   - `scene-01` no longer shows two dense posters at ~90 px labeled “Cube” and “?”.
   - The general faces/edges/vertices poster is readable in the definition/counting portion, or is unused with a reason.
   - The curved-solids poster is used only where cone/cylinder/sphere content is taught, or is unused with a reason.
   - No 56–132 px tile contains a content-rich worksheet/diagram.
   - No downloaded file is reused across unrelated scenes.
   - Every used image has a visible caption/description and a recorded `usedIn`.
4. Compare `assets.json`: 7 downloads, 4 distinct used files, 3 unused files with reasons, and no repeated Hasse/Freytag/matchbox file.
5. Compare `subtitle-report.json`: `sourceCues: 9`, `totalCues` equals the sum of scene cues, and no lowercase sentence fragments.
6. Compare `storyboard.json`: both used uploads and all used downloaded images are present with `imageAlt` and roles.
7. `quality-report.json` must fail if any of these are still wrong, and pass only when they are fixed.

### End-to-end: job 1 (photosynthesis regression)

1. Re-run the same photosynthesis topic.
2. Confirm the Calvin-cycle candidate is accepted and no energy chart appears on oxygen/sunlight.
3. Confirm scene-2 and scene-4 relevance clears the threshold.
4. Confirm captions are complete read units and `totalCues` matches the scene arrays.
5. Sample the scene frames and confirm the Calvin cycle, oxygen, and sunlight scenes use the intended visuals.

### Performance

Compare `render-metrics.json` before/after; report measured throughput, not an estimate. Do not use the semantic fixes as evidence of speed improvement.

## Out of scope

- Changing the approval flow or job schema.
- Hardcoding this job’s topic, filenames, uploaded-image captions, or scene ids.
- Replacing asset discovery with a new provider.
- Adding a new external vision/OCR provider; extend the existing optional vision service.
- Accepting a technically valid MP4 when the semantic checks still fail.
