# EduMotion — Generated Video Quality Correction Plan

Last updated: 2026-11-23  
Target evidence: job `42513265-edd8-4eb4-a1f7-af193bb321ed`  
Status: **code phases implemented — runtime/render verification pending**

> **Implementation status (2026-11-23)**
> - P0/P1 code fixes are in: semantic asset rejection, auto diagram layout, semantic
>   titles + text deduplication, lane-aware speech bubbles, sentence-aligned scene
>   splits, editorial validation, instructor bounds, env-override precedence.
> - `npm run typecheck`, `npm test` (shared 15, backend 77, frontend 2) and
>   `npm run build` pass.
> - Not verifiable here: Kaggle rebuild/restart, live storyboard inspection,
>   MP4 frame review, and render-throughput benchmarks. No Chromium, GPU,
>   ffmpeg/ffprobe or Kaggle access exists in this environment.
> - The target job's raw LLM/storyboard/metrics/JPEG artifacts were not present
>   locally, so the fixtures reproduce its documented defects rather than copying
>   the files.
> - LLM semantic judging (`ASSET_VERIFY=llm`) was not added; the deterministic
>   semantic-field verifier is the fallback and the only path used.

This plan fixes the defects visible in the generated video and raw LLM storyboard. It is written as execution instructions for the next implementation pass, not as a redesign of the project.

The target job is one regression case, not a runtime special case. Every rule below must work for arbitrary topics. Do not hardcode “cube”, “pyramid”, “geometry”, or this job ID into production behaviour.

---

## 1. Evidence reviewed

### 1.1 Actual render

| Item | Value |
|---|---|
| Resolution | 1080×1920 |
| FPS | 30 |
| Duration | 44.8s |
| Total frames | 1,344 |
| Render FPS | **2.83 fps** |
| Frame render time | 475.3s |
| Mux time | 14.9s |
| Total render time | **490.8s / 8m 11s** |
| Output size | 45.7 MB |
| Profile | `gpu`, `angle-egl`, concurrency 4, NVENC on |
| Chunk count | 1 |

The technical quality report passed: audio exists, no black segments, no frozen segments. That is not evidence of editorial quality.

### 1.2 Raw LLM response

- Model: `qwen3-8b`
- Attempts: 3
- Chosen attempt: **3**
- Validation: **7/7 scenes valid**
- Relevance: **0.693**
- Attempts 1 and 2 were rejected for low visual relevance.

The chosen attempt returned one root component per scene and no children:

1. `ImageScene` — hook
2. `AnimatedDiagram` — define
3. `ProcessFlow` — process
4. `SplitScreenComparison` — compare
5. `AnnotatedCallout` — example
6. `NumberCounter` — data
7. `EndScreen` — recap

The pipeline then wrapped those roots in `BackgroundScene` and injected titles, subtitles, speech bubbles, extra diagrams, and downloaded images. Most visible defects were introduced or amplified by those injections.

### 1.3 Final storyboard

The final storyboard has 7 scenes, each exactly 192 frames:

| Scene | Components |
|---|---|
| 1 | `AnimatedText`, `ImageScene`, `Subtitle`, `SpeechBubble` |
| 2 | `AnimatedText`, `AnimatedDiagram`, `Subtitle` |
| 3 | `AnimatedText`, `ProcessFlow`, `Subtitle`, `SpeechBubble` |
| 4 | `AnimatedText`, `SplitScreenComparison`, `Subtitle` |
| 5 | `AnimatedText`, `AnnotatedCallout`, `Subtitle`, `ProcessFlow` |
| 6 | `AnimatedText`, `ConceptDiagram`, `Subtitle` |
| 7 | `EndScreen`, `Subtitle` |

The storyboard contains **zero `Teacher` components**. The job was created before the instructor feature was deployed to the Kaggle runtime.

### 1.4 Visual review of the seven scene frames

1. **Scene 1 — duplicate and truncated narration**
   - “Have you ever wondered how to figure out the…”
   - A speech bubble repeats the same sentence.
   - The subtitle repeats it again.
   - The requested image is effectively invisible and appears unrelated.

2. **Scene 2 — broken diagram**
   - A large empty panel.
   - Three items are clustered in the bottom-right corner.
   - Labels overlap and are too small.
   - No cube or meaningful shape diagram.

3. **Scene 3 — bubble covers the process**
   - “Why does this matter?” is painted over the third process step.
   - The third step cannot be read.

4. **Scene 4 — unrelated images**
   - Cube side uses a satellite/solar-panel image.
   - Pyramid side uses a workplace “Hierarchy of Control” pyramid.
   - The displayed facts are correct, but the images teach the wrong association.
   - The heading is truncated.

5. **Scene 5 — no pyramid**
   - “a square base” is shown with generic book icons.
   - The subtitle ends mid-sentence: “…and each”.

6. **Scene 6 — generic icon chain**
   - Five identical book icons read “Corner → Vertex → Architecture → Design → Video games”.
   - The model’s `NumberCounter` intent was lost.

7. **Scene 7 — end card**
   - This is the clearest scene. It is acceptable but generic.

---

## 2. Defect register

| ID | Priority | Defect | Observed evidence | Primary location |
|---|---|---|---|---|
| D1 | P0 | Instructor missing | Final storyboard has no `Teacher`; stale runtime | Deployment / `scene.director.ts` |
| D2 | P0 | Duplicated narration | Scene 1 title + bubble + subtitle say the same thing | `scene.director.ts`, `storyboard.visuals.ts` |
| D3 | P0 | Wrong assets attached | Satellite image for cube; safety pyramid for geometry pyramid | `asset.verify.ts`, `storyboard.visuals.ts` |
| D4 | P0 | Diagram items cluster | `x:100/150/200` treated as offsets from center | `AnimatedDiagram.tsx` |
| D5 | P0 | Bubble overlaps process | Bubble at 62%, ProcessFlow at 54% | `scene.director.ts`, layout validation |
| D6 | P1 | Titles are fragments/truncated | “where they meet are edges”, “these parts helps…” | `scene.director.ts`, `AnimatedText.tsx` |
| D7 | P1 | `NumberCounter` intent lost | Scene 6 became a generic book chain | `scene.director.ts`, `storyboard.visuals.ts` |
| D8 | P1 | Captions split mid-sentence | “the lines” / “where they meet”, “and each” / “corner is a vertex” | `scene.balance.ts`, `subtitle.service.ts` |
| D9 | P1 | Validation misses editorial failures | Report passed despite overlap, wrong assets, duplicates | `layout.validation.ts`, `quality.service.ts` |
| D10 | P2 | Slow CPU-bound render | 2.83 fps; only one T4 used; concurrency 4 on 4 vCPU | `hardware.service.ts`, `render.service.ts` |
| D11 | P1 | Instructor has no rendered verification | No test asserts saved `appearance` or overlap | Tests, `Teacher.tsx` |

### Root-cause notes

- **D2:** `directStoryboard()` adds an `AnimatedText` from `sceneNarration()` when the model supplied no title. The hook composition then adds a `SpeechBubble` from the same narration. Subtitles are injected independently. There is no normalized-text deduplication.
- **D3:** `attachSplitScreenImages()` and `attachSingleImage()` trust the lexical `matchAssetImage()` result. `verifyAssetMatch()` does not understand that a satellite named “Mars Cube One” is not a geometry cube, or that a safety hierarchy is not a geometric pyramid.
- **D4:** `AnimatedDiagram` computes `centerX + item.position.x`. The model supplied values like `x:100`, `y:150`, which are layout positions, not small offsets. All items collapse near the same corner.
- **D5:** `SpeechBubble` is always placed at `top: 62%` for a hook. `ProcessFlow` is placed around `top: 54%`. There is no collision lane or post-composition overlap check.
- **D6:** `shorten()` cuts narration at 56 characters and appends `…`. The director uses that as a scene title instead of deriving a semantic title from `visualBrief`, `purpose`, or `keyTerms`.
- **D7:** `ensureSceneVisuals()`/`directStoryboard()` can replace a scene’s intended visual with a `ConceptDiagram` when the scene lacks a component in `TOPIC_COMPONENTS`. The fallback is a row of book glyphs.
- **D8:** Scene boundaries are aligned to measured cue boundaries, not script sentence boundaries. A sentence can therefore be cut between scenes even when the audio continues naturally.
- **D9:** `validateLayout()` only estimates text boxes. It does not check component overlap, duplicate text, diagram clustering, title truncation, or asset-to-concept mismatch. `quality-report.json` only checks technical media properties.
- **D10:** Remotion renders DOM frames; Chromium uses one T4 but the work is CPU-bound. `chunkCount: 1` confirms the second T4 is idle. NVENC only affects the final mux.

---

## 3. Non-negotiable rules for the implementation

- Preserve the existing script → approval → TTS → storyboard → Remotion → QC architecture.
- Preserve schema and API compatibility. New props must be optional and old storyboards must still render.
- Do not hardcode this job, topic, filename, or asset IDs into runtime selection.
- Prefer built-in, safe illustrations over an unverified downloaded image.
- Never attach an image merely because one generic token matches.
- Never let a title, speech bubble, and caption repeat the same sentence.
- Do not consider a render successful because Zod, timing, and MP4 metadata pass.
- Keep the script approval gate.
- Do not add a new downloader or a second asset folder layout; extend the existing discovery/verification path.
- Do not increase render concurrency or resolution to hide a content bug.
- Use deterministic rules for layout and selection wherever possible. Use the local LLM only as a cached semantic judge, with a strict tag fallback.

---

## 4. Execution phases

### Phase 0 — Freeze evidence and deploy the current build

**Goal:** make sure the reviewed output actually comes from the latest code, and make the regression case reproducible.

Tasks:

- [ ] Save the job evidence in the test fixtures:
  - raw chosen LLM storyboard;
  - final directed storyboard;
  - `render-metrics.json`;
  - seven scene JPEGs.
- [ ] Record the Kaggle runtime identity:
  - `[Server] Code:` commit;
  - `[Server] Built:` timestamp;
  - warning if the build is older than the commit.
- [ ] Rebuild and restart the Kaggle notebook using the repository’s normal start path.
- [ ] Confirm the backend log says the latest commit and a fresh build time.
- [ ] Re-plan one short test video and confirm the saved storyboard contains the expected `Teacher` props.
- [x] Add a startup assertion or log line when `RENDER_PROFILE=auto` selects `gpu` but `chunkCount=1`; this is useful evidence, not an error.

**Exit gate:** the new job’s `storyboard.json` contains `Teacher` components, and `render-metrics.json` is produced by the new build.

**Do not** mark this phase complete from a local build alone. The Kaggle process must be restarted.

---

### Phase 1 — Make asset selection semantically safe

**Goal:** no scene may display an image that is unrelated to its assigned concept.

Tasks:

- [x] Audit `services/asset.verify.ts` and `services/asset.discovery.ts`.
- [x] Strengthen `verifyAssetMatch()` so acceptance requires:
  - a scene key term or a synonym in the candidate title, filename, tags, or description; and
  - no conflicting object noun in the candidate identity.
- [x] Treat ambiguous candidates as rejected when the scene has a concrete noun. Example patterns:
  - “cube” must not accept a satellite whose identity is “Mars Cube One”;
  - “pyramid” must not accept a safety/management hierarchy;
  - “face/edge/vertex” must not accept a generic book, building, or satellite.
- [ ] Use the existing local LLM verifier for ambiguous cases, with:
  - `ASSET_VERIFY=auto|llm|tags`;
  - hash-based cache;
  - strict lexical fallback when the model is unavailable.
- [x] For `SplitScreenComparison`, verify each pane independently:
  - the left label/content and left image must agree;
  - the right label/content and right image must agree;
  - if either side fails, leave that pane text-only with a built-in glyph. Do not keep a mismatched image.
- [x] For `SpeechBubble`, do not attach an image unless the image is verified against both the bubble text and the scene key terms.
- [ ] For `AnimatedDiagram` tiles, prefer the built-in cube/line/corner glyphs when no verified image exists. Add a `pyramid` glyph if the icon set does not already have one.
- [x] Record every decision in `assets.json`:
  - scene id;
  - query;
  - candidate;
  - score;
  - verdict;
  - rejection reason;
  - selected file.
- [x] Add regression tests using the two bad candidates from this job as fixture data, but not as runtime exceptions:
  - satellite-like “cube” candidate is rejected for a geometry cube;
  - safety-pyramid candidate is rejected for a geometric pyramid;
  - a verified cube image is accepted;
  - no verified image means text + built-in glyph, not an unrelated photo.

**Exit gate:** a cube/pyramid storyboard never receives a satellite or management image. `assets.json` explains every rejection.

---

### Phase 2 — Fix diagram geometry and collision layout

**Goal:** every diagram is readable in portrait, landscape, and square output.

Tasks:

- [x] Change `AnimatedDiagram` to support an explicit `layout` prop:
  - `auto`: arrange 2–5 items in a centered row or grid; ignore raw model offsets;
  - `manual`: preserve the old offset behaviour for old storyboards.
- [x] Make `auto` the default for new storyboards.
- [x] Clamp every item to the component’s safe box.
- [x] Ensure the panel size is derived from item count, not a fixed 600×400 panel with tiny clustered contents.
- [x] Add label wrapping and a minimum readable font size.
- [x] In `scene.director.ts`, reserve vertical lanes:
  - title: 6–18%;
  - primary visual: 24–70%;
  - speech bubble: only in a free lane, never over a process step;
  - captions: bottom 82–94%.
- [x] Do not add a `SpeechBubble` to a scene that already has a full-width `ProcessFlow`, `Timeline`, or `SplitScreenComparison` unless the bubble can be placed in a verified free lane.
- [x] For a process scene, either:
  - omit the hook bubble, or
  - place the question as a short title and keep the process flow fully visible.
- [x] Add a shared layout helper that returns estimated boxes for `AnimatedText`, `SpeechBubble`, `ProcessFlow`, `AnimatedDiagram`, `AnnotatedCallout`, `ConceptDiagram`, and `SplitScreenComparison`.
- [x] Use that helper in `layout.validation.ts` to detect overlap, out-of-bounds boxes, and clustered diagram items.
- [ ] Add visual tests at 1080×1920, 1920×1080, and 1080×1080.

**Exit gate:** the scene-2 items are evenly distributed, and the scene-3 bubble no longer covers the third step.

---

### Phase 3 — Establish one text hierarchy per scene

**Goal:** one idea, one heading, one supporting visual, one caption.

Tasks:

- [x] Stop deriving titles by truncating narration.
- [x] Derive a title in this order:
  1. explicit model title;
  2. `visualBrief` shortened semantically;
  3. `purpose` + key terms (for example, “Cube vs Pyramid”);
  4. omit the heading if no good title exists.
- [x] Keep headings to 3–8 words and at most two lines.
- [x] Remove the `…` produced by `shorten()` for headings. Use wrapping and `fitFontSize` instead.
- [x] Add normalized-text deduplication:
  - if a `SpeechBubble` text equals the `AnimatedText` text, drop the bubble;
  - if a bubble equals any subtitle cue, drop the bubble;
  - if a heading equals the first subtitle cue, keep only the subtitle.
- [x] Only create a `SpeechBubble` when:
  - the scene contains a real question, or the model explicitly requested one; and
  - no existing heading already states that question.
- [x] Limit a scene to one primary visual plus one optional annotation. Do not stack `AnimatedDiagram` + `ProcessFlow` + `ConceptDiagram` in the same scene.
- [x] Preserve `NumberCounter`/`AnimatedNumber` when the narration contains a real measured value. Do not replace it with a generic concept row.
- [x] For scene 6, use a counter or a counting diagram, not five identical book icons.
- [x] Add tests:
  - title + bubble + subtitle duplication is removed;
  - a question hook keeps one bubble and no duplicate title;
  - a measured-data scene keeps its counter;
  - a title never ends with `…` unless the source text itself was intentionally omitted.

**Exit gate:** no scene shows the same sentence more than once, and every heading reads as a title rather than a cut-off caption.

---

### Phase 4 — Align scene boundaries with sentences and captions

**Goal:** a viewer should never see a sentence split awkwardly across scenes.

Tasks:

- [x] Review `services/scene.balance.ts` and `services/subtitle.service.ts`.
- [x] Prefer script sentence boundaries over raw cue boundaries when splitting or balancing scenes.
- [x] If a sentence must span scenes because it exceeds the maximum scene duration:
  - split at a clause boundary;
  - preserve the full text in the subtitle stream;
  - mark the continuation so the next scene does not start with a dangling “and each”.
- [x] Add validation that rejects a scene caption beginning with a conjunction or a scene title ending in a dangling connector.
- [x] Keep subtitle timing independent from child animation timing.
- [x] Verify that no cue is duplicated across scenes.

**Exit gate:** the final captions read as complete clauses, and no scene starts with “faces…” after a previous scene ends with “Today, we’ll learn how to spot”.

---

### Phase 5 — Add editorial validation and a real quality gate

**Goal:** detect the failures that the current technical report misses.

Tasks:

- [x] Extend `layout.validation.ts` with:
  - duplicate normalized text across title, bubble, and subtitles;
  - component bounding-box overlap;
  - out-of-frame children;
  - `AnimatedDiagram` item clustering and label overlap;
  - title truncation/ellipsis;
  - empty full-width panels;
  - unverified image selection;
  - `Teacher` overlapping captions or the primary visual.
- [x] Extend `quality.service.ts` / `quality-report.json` with an `editorial` section:
  - checks run;
  - blocking issues;
  - warnings;
  - asset verdict counts;
  - frame-review paths.
- [x] Keep technical checks separate from editorial checks. A video may be technically valid but editorially blocked.
- [x] Add an integration fixture from this job’s final storyboard that asserts:
  - no duplicate text;
  - no ProcessFlow/SpeechBubble overlap;
  - no unverified images;
  - no title ending in `…`;
  - no `Teacher` in the final scene.
- [x] Add a second fixture for a different topic to prove the rules are generic.
- [x] Ensure warnings are visible in logs and output JSON. Do not silently pass them.

**Exit gate:** the exact defects in this job would be caught before rendering.

---

### Phase 6 — Re-render and inspect every scene

**Goal:** verify the actual output, not only the JSON.

Tasks:

- [ ] Build the project after all fixes.
- [ ] Run the shortest useful end-to-end render first (one or two scenes or a 10-second fixture).
- [ ] Extract one frame from the start, middle, and end of every scene.
- [ ] Inspect:
  - title readability;
  - asset correctness;
  - diagram spread;
  - text/bubble collisions;
  - caption completeness;
  - instructor position;
  - end-card composition.
- [ ] Only then run the full 45-second render.
- [ ] Record:
  - `renderFps`;
  - `renderFramesMs`;
  - `muxMs`;
  - output size;
  - editorial warnings.
- [ ] Compare against the current 2.83 fps baseline without trading away quality.

**Exit gate:** all seven scene frames pass the checklist, and the rendered MP4 has no editorial blocking issues.

---

### Phase 7 — Roll out and verify the instructor

**Goal:** the selected voice always produces the same saved instructor, without breaking layout.

Tasks:

- [ ] Rebuild and restart the Kaggle runtime so the instructor code is live.
- [x] Verify voice mapping:
  - `en-US-female-1` → Emma;
  - `en-US-male-1` → James;
  - `en-GB-female-1` → Sophie;
  - `espeak-en` → Alex.
- [x] Verify the saved storyboard writes the same `appearance` to every `Teacher` child.
- [x] Verify the instructor appears in at most three teaching scenes and never in the final EndScreen scene.
- [ ] Verify the instructor does not cover captions, diagrams, or callouts in 9:16, 16:9, and 1:1.
- [x] Add a test that resolves the voice and checks every `Teacher.appearance` in the persisted storyboard.
- [x] Add `Teacher` bounds to the layout validator.

**Exit gate:** instructor present, stable across rerenders, and visually clear.

---

### Phase 8 — Improve render throughput only after correctness

**Goal:** make the CPU-bound render faster without changing visual quality.

Tasks:

- [x] Make environment overrides actually win over `recommendSettings()`:
  - `RENDER_CONCURRENCY`;
  - `RENDER_GL`;
  - `RENDER_PROFILE`.
- [ ] Benchmark, on the Kaggle notebook:
  - 1080×1920 @ 30 fps with concurrency 2, 3, 4;
  - 720×1280 @ 30 fps;
  - 1080×1920 @ 24 fps.
- [ ] Compare quality before choosing a lower resolution or FPS. Do not silently downgrade the requested output.
- [ ] Test `swiftshader` vs `angle-egl` for 2D DOM scenes; use the measured winner.
- [ ] Move temporary frame output to `/dev/shm` or `/tmp` only after checking free space and cleanup.
- [ ] Test dual-GPU chunking only if the benchmark shows a gain; the second T4 is idle today because `chunkCount: 1`.
- [ ] Document the chosen profile and the measured fps in `progress.md`.

**Exit gate:** a measured improvement with no regression in frame review.

---

## 5. Files likely involved

- `packages/backend/src/services/scene.director.ts`
- `packages/backend/src/services/storyboard.visuals.ts`
- `packages/backend/src/services/asset.discovery.ts`
- `packages/backend/src/services/asset.verify.ts`
- `packages/backend/src/services/scene.balance.ts`
- `packages/backend/src/services/subtitle.service.ts`
- `packages/backend/src/services/storyboard.validation.ts`
- `packages/backend/src/services/layout.validation.ts`
- `packages/backend/src/services/quality.service.ts`
- `packages/backend/src/services/hardware.service.ts`
- `packages/backend/src/services/render.service.ts`
- `packages/backend/src/prompts/storyboard.prompt.ts`
- `packages/renderer/src/components/AnimatedDiagram.tsx`
- `packages/renderer/src/components/AnimatedText.tsx`
- `packages/renderer/src/components/SpeechBubble.tsx`
- `packages/renderer/src/components/ProcessFlow.tsx`
- `packages/renderer/src/components/SplitScreenComparison.tsx`
- `packages/renderer/src/components/ConceptDiagram.tsx`
- `packages/renderer/src/components/Teacher.tsx`
- `packages/shared/src/schemas/storyboard.schema.ts`
- `packages/shared/src/utils/text-metrics.ts`
- backend tests and fixtures

---

## 6. Verification commands

Run from the repository root:

```bash
npm run typecheck
npm test
npm run build
```

Then, using the normal Kaggle start path:

1. Confirm the server log shows the latest commit and a fresh build.
2. Plan a short test video.
3. Inspect `output/<jobId>/storyboard.json`, `assets.json`, `render-metrics.json`, and `quality-report.json`.
4. Extract scene frames and review every scene.
5. Only after the short test passes, run the full video.

---

## 7. Definition of done

- [ ] P0 defects D1–D5 are fixed. (D2–D5 fixed in code; D1 needs a Kaggle rollout.)
- [x] The final storyboard contains no duplicate title/bubble/caption text.
- [x] Every attached image is verified against its scene concept.
- [x] Diagrams are spread, readable, and inside safe bounds.
- [x] No speech bubble covers a process step or annotation.
- [x] Titles are semantic, not truncated caption fragments.
- [x] `NumberCounter` intent is preserved when the narration contains a measured value.
- [x] Scene boundaries do not split sentences awkwardly.
- [x] Editorial validation catches all of the above before rendering.
- [ ] The instructor is present, voice-matched, saved, and non-overlapping. (Saved/voice/bounds yes; live render needs Kaggle.)
- [ ] The seven-frame review passes for 9:16, 16:9, and 1:1.
- [x] Tests, typecheck, and build pass.
- [ ] Render speed is measured, not assumed.

**Not done if:** the MP4 is the right duration and the schema is valid, but the scene still shows a wrong image, a covered step, or repeated narration.
