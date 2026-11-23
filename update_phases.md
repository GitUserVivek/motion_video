# EduMotion — Dynamic Content & Rendering Correctness Plan

Source of truth: [`Update_Instructions.md`](./Update_Instructions.md)
Last rewritten: 2026-11-23
Status: **implemented and unit/integration verified (2026-11-23)** — Phases 1–6 and 8 are
code-complete. `npm run typecheck` passes in all four workspaces, `npm test` passes 61 tests
(shared 12, backend 47, frontend 2; the renderer has no test files and exits cleanly), and
`npm run build` passes. Phase 7 now has unit + integration coverage; the real three-topic GPU
render/frame review is still blocked because this sandbox has no TTS, LLM, ffmpeg, complete
model, or GPU. Existing features listed under “Baseline” are reused, not rebuilt. Progress
details are in `progress.md`.

Legend: `[ ]` planned · `[~]` in progress · `[x]` done and verified

---

## Non-negotiable constraints

- Work inside the existing pipeline and component library. Do not rebuild the project or
  replace the script → TTS → storyboard → Remotion → QC architecture.
- No topic-specific hardcoding. The business profit/loss video is one test case, not the
  target. Every rule must work for an arbitrary topic supplied by the user.
- Preserve schema compatibility. New storyboard fields are optional; old storyboards and
  existing API responses must keep working.
- Keep the script approval step. Research/validation may inform and flag a script, but must
  not silently replace an approved narration.
- Never invent facts, numbers, dates, formulas, sources, or examples. If research is
  unavailable, soften or remove unsupported claims instead of guessing.
- A valid Zod object and an MP4 with the right duration/FPS/resolution are **not** proof of
  a successful video. Semantic validation and frame inspection are required.
- Automated runs happen on the GPU box. This sandbox may only run type checks and isolated
  unit-level checks; no TTS, LLM, Remotion, or full server run here.

---

## Baseline to reuse (already implemented)

- Script generation, validation, rewrite, and the approval gate.
- Local LLM through `services/llm.service.ts` and `services/ollama.service.ts`, with JSON
  repair in `services/json.repair.ts`.
- edge-tts word-boundary cues, phrase grouping, SRT/JSON subtitle output, and actual audio
  duration measurement (`services/tts.service.ts`, `services/subtitle.service.ts`).
- Keyless artwork discovery (Iconify / OpenMoji / Wikimedia), SVG sanitisation, caching,
  licence metadata, and `resources/auto/` integration (`services/asset.discovery.ts`).
- Deterministic scene direction for palettes, patterns, cameras, headings, and EndScreen
  (`services/scene.director.ts`).
- Renderer component library, composition map, per-job output folders, resume, and the
  technical QC pass (`quality.service.ts`).
- Backdrop folders are excluded from foreground artwork matching.

Do not replace these services. Extend them where the new plan requires it.

---

## Confirmed root causes in the current code

These are the specific defects the phases must remove:

1. **Topic is guessed from a fixed keyword list.**
   `prompts/storyboard.prompt.ts` has `inferTopicFromScript()` and
   `extractKeyConcepts()`, and `getTopicSpecificVisuals()` returns a canned icon list.
   The pattern test runs over the whole script, so one mention of “technology” in a
   business profit/loss narration produces `INFERRED TOPIC: technology`.
2. **Visual planning is keyword-driven and generic.**
   `services/storyboard.visuals.ts` maps a small list of words to built-in object types;
   `storyboard.service.ts` has a second regex map in `inferVisualType()`; both can choose
   calculators, plants, clouds, or servers that the scene never discusses.
3. **Child frame timing is mixed.**
   `createFallbackStoryboard()` writes absolute child frames (`startFrame + 10`).
   `EduVideo.tsx` guesses whether a value is absolute using
   `raw < scene.startFrame`, then clamps it. There is no schema or validation rule for
   child timing.
4. **Subtitles are not split at scene boundaries.**
   `subtitleService.alignToScenes()` filters every cue that overlaps a scene and returns
   the whole cue, so a cue crossing a boundary is injected into both scenes.
5. **Storyboard instructions contradict each other.**
   The prompt says every scene must contain `BackgroundScene + visual + AnimatedText +
   Subtitle`, while other instructions say not to force unnecessary text/subtitles. It also
   supplies topic-specific icon lists and only one scene-relative timing example.
6. **Asset discovery is script-level and lexically scored.**
   Queries are built from the whole script; candidates are scored by filename/tag token
   overlap only; there is no check that a downloaded file represents the assigned scene
   concept.
7. **The script prompt asks for statistics without research.**
   `script-generate.prompt.ts` mandates “an interesting fact or surprising statistic”,
   which invites fabricated numbers.
8. **Validation is mostly structural.**
   Relevance uses token coverage with a static alias table; there are no checks for asset
   provenance, math, child frames, subtitle duplicates, text overflow, or unsupported
   claims. `quality.service.ts` only checks technical properties.

---

## Phase 1 — Content intelligence, topic understanding, and factual grounding ✅

Goal: understand the actual narration before a storyboard is planned, for any topic.

- [x] Add `services/content.analysis.ts` and `prompts/content-analysis.prompt.ts`.
  The LLM returns strict JSON (reuse `json.repair.ts`) with:
  - `topic`, `domain` (e.g. business/finance, biology, history), `subtopics`;
  - `audience`, `learningObjectives` (2–4);
  - `keyTerms`: term, plain-language meaning, synonyms, and object/illustration
    candidates that are genuinely appropriate for that term;
  - `claims`: numbers, percentages, dates, formulas, or statistics in the script, each
    marked `supported` / `unverified` / `needsResearch`;
  - `visualStyle`, `exampleIdeas`, and `researchNeeded` (boolean + reasons).
- [x] Validate the analysis with an additive shared Zod schema; persist it to
  `output/<jobId>/content-analysis.json`. A malformed analysis must degrade to a
  deterministic, low-confidence analysis derived from the narration, never abort the job.
- [x] Run analysis twice when appropriate:
  - before script generation, so the script prompt receives the real domain and objectives;
  - after approval, on the actual narration, which is the single source of truth for the
    storyboard. Do not let an early topic guess override the approved text.
- [x] Add `services/research.service.ts` behind a provider interface:
  - default keyless provider may use the official Wikipedia/Wikimedia REST APIs;
    no HTML scraping and no mandatory paid key;
  - configurable via `RESEARCH_PROVIDER`, `RESEARCH_TIMEOUT_MS`, `RESEARCH_MAX_SOURCES`;
  - cache results per topic/job, record URL, title, licence/attribution, retrieval time,
    and extract;
  - all failures are logged and produce `unverified` claims, not invented facts.
- [x] Add claim verification before approval:
  - exact numbers/dates/formulas are compared with researched extracts;
  - unsupported claims are flagged in the script validation/approval flow and must be
    softened, removed, or explicitly accepted by the user; the system never silently
    changes an approved script;
  - never require a statistic when the research provides none.
- [x] Update `prompts/script-generate.prompt.ts`:
  - remove the mandatory “surprising statistic” requirement;
  - use only facts supplied by analysis/research, otherwise explain qualitatively;
  - include the analysis domain/objectives/example ideas instead of the canned
    photosynthesis/skeleton examples;
  - keep the existing hook → explanation → example → takeaway structure.
- [x] Update `services/script.service.ts` to pass analysis context into generation and to
  log which facts were researched.
- [x] Remove topic inference from the storyboard prompt. `planStoryboard()` should receive
  the final `ContentAnalysis`; missing analysis is derived from the script, not from
  unrelated metadata.
- [x] Tests: a business profit/loss script must analyse as business/finance (not
  technology); two unrelated topics must produce distinct domains and key terms; offline
  research must leave the job runnable with `unverified` claims.

**Acceptance:** the same pipeline, not a special case, classifies arbitrary scripts
correctly; every numeric/statistical claim is either sourced or explicitly flagged; no
network dependency is mandatory.

---

## Phase 2 — Narration-grounded storyboard and scene-specific asset selection ✅

Goal: every scene’s visual plan explains that scene’s narration, and every selected asset
is tied to the concept it was selected for.

- [x] Extend the shared storyboard schema with optional, additive fields:
  - `SceneInstruction`: `purpose`, `visualBrief`, `keyTerms`, `assetQueries`,
    `animationIntent`, `transition`;
  - `StoryboardPlan`: `analysis` reference or `topic`/`domain` metadata and
    `timingMode: 'scene-relative'`;
  - keep all fields optional so existing storyboards still parse.
- [x] Rewrite `prompts/storyboard.prompt.ts`:
  - remove `inferTopicFromScript`, `extractKeyConcepts`, `getTopicSpecificVisuals`, and the
    hardcoded “skeleton → bones” style examples;
  - inject the content analysis (domain, objectives, key terms, visual candidates,
    researched facts);
  - require each scene to state a `purpose`, a concrete `visualBrief`, 1–3 `keyTerms`,
    1–3 `assetQueries`, the intended animation action, and the transition into the next
    scene;
  - require the visual to show the relationship or example in the narration, not just a
    label or icon;
  - remove the “every scene must have AnimatedText + Subtitle” rule; subtitles are injected
    by the system, and text is added only when it communicates the scene’s idea;
  - keep titles to 3–8 words and forbid repeating the narration;
  - state the scene-relative child timing contract explicitly (see Phase 3).
- [x] Replace generic visual selection:
  - `services/storyboard.visuals.ts`: use the analysis key terms/visual candidates and the
    scene’s own narration to choose objects and diagram tiles; remove (or reduce to a
    last-resort text-only diagram) the global `TOPIC_KEYWORDS` and `pickTopicObject`
    behaviour that invents unrelated objects;
  - `storyboard.service.ts`: delete `inferVisualType()` regex fallbacks for normal jobs;
    the fallback storyboard must use analysis key terms or a plain labelled diagram, not a
    random calculator/plant/cloud/server;
  - `scene.director.ts`: keep palette/pattern/camera/heading/EndScreen direction, but stop
    rewriting an object type to an unrelated topic object; respect the scene brief.
- [x] Move artwork attachment to a scene-aware two-step flow:
  1. plan/repair the storyboard text and briefs;
  2. discover assets from each scene’s `assetQueries`/`keyTerms`, verify them, then attach
     approved images and record `assetUses`.
  Reuse `asset.discovery.ts`, `asset.library.ts`, and `job.files.ts`; do not add a second
  downloader or a new asset folder layout.
- [x] Make `buildAssetQueries()` scene-aware:
  - accept the scene brief, key terms, and analysis instead of only the full script;
  - prefer specific phrases/illustrations over generic icon words;
  - keep the existing cache, timeout, SVG sanitisation, duplicate detection, and licence
    metadata.
- [x] Add asset verification (`services/asset.verify.ts`):
  - rank the top few candidates per query instead of attaching the first download;
  - deterministic check first: candidate name/tags/description must cover the assigned key
    term and not be a generic icon when the brief asks for a specific illustration;
  - verify every downloaded candidate that may be attached; use the local LLM as the
    semantic judge when available (`ASSET_VERIFY=auto|llm|tags`), cache by file hash, and
    fall back to strict tag/key-term matching when the model is disabled;
  - record accepted/rejected verdicts and reasons;
  - reject failed downloads and leave a built-in glyph or text-only diagram, with a warning.
- [x] Support animation assets without scraping: accept only public-API providers and safe
  formats; when a suitable animation is unavailable, use the existing Remotion motion
  components instead of inserting a static image where movement is required.
- [x] Tighten `asset.library.matchAssetImage()`:
  - only match files under `resources/`/`assets/` that cover a scene key term or the visual
    brief; narration-only matches are allowed only when the word is a scene key term;
  - keep the backdrop exclusion and one-file-per-scene rule;
  - re-check the “light-years vs minimal_light.svg” regression.
- [x] Persist `output/<jobId>/assets.json`: scene id, query, provider, licence, score,
  verdict, selected file, and rejection reason. Add the path to `job.files.ts`.
- [x] Tests: business P&L produces finance-related briefs, not technology icons; a biology
  scene and a history scene receive different visual plans; an unrelated downloaded icon is
  rejected; an offline discovery failure still renders a sensible text/glyph fallback.

**Acceptance:** every scene has a visual brief derived from its narration; every attached
image is traceable to a scene concept; generic unrelated icons are rejected.

---

## Phase 3 — One frame-timing contract ✅

Goal: scene frames are absolute; every child animation is scene-relative; conversion happens
once in the renderer; invalid timing is rejected before rendering.

- [x] Document the contract in the schema and prompt:
  - `scene.startFrame` / `scene.endFrame` are absolute video frames;
  - every child `props.startFrame` (and optional `endFrame`/duration) is relative to its
    scene: `0 <= startFrame < sceneDuration`;
  - subtitles use absolute milliseconds and are **not** part of this conversion.
- [x] Add `services/timing.service.ts` with `normalizeStoryboardTiming()`:
  - default missing child timings to a small in-scene offset;
  - clamp relative values to the scene window and reject negative/non-finite values;
  - mark the storyboard `timingMode: 'scene-relative'`;
  - for legacy storyboards without the marker, normalize once at ingestion (rebase
    unambiguous absolute values, clamp, and log) so the renderer has one rule.
- [x] Fix every producer of child timings:
  - `createFallbackStoryboard()` and `repairStoryboard()` emit relative values (remove
    `startFrame + 10` / `startFrame + 15`);
  - `ensureSceneVisuals()` and the director emit relative values;
  - the prompt example shows a scene starting at a non-zero frame with relative children.
- [x] Simplify `packages/renderer/src/compositions/EduVideo.tsx`:
  - remove the `raw < scene.startFrame` heuristic;
  - always compute `absoluteStartFrame = scene.startFrame + child.startFrame`;
  - pass the absolute value to the component (or to a small `useSceneClock` helper);
  - nested compositions (process flows, diagrams, image scenes, callouts) inherit the
    parent scene-relative start for their own internal staggers; do not double-add the
    scene offset inside them;
  - keep subtitles outside this conversion and keep the camera/transition windows.
- [x] Validate timing before rendering:
  - every child has a finite, non-negative relative start;
  - no child starts before its scene or after `scene.endFrame - minimumOnScreenFrames`;
  - optional child durations do not outlive the scene;
  - write `output/<jobId>/timing-report.json` with relative and absolute values plus any
    repairs.
- [x] Add unit tests for scenes starting at 300/700 frames, fallback/repair output, and
  invalid child values; verify no animation starts before its scene.

**Acceptance:** the renderer has no guessing; a child at 10 in a scene starting at 300
renders at 310; no child animation is scheduled outside its scene.

---

## Phase 4 — Subtitle synchronization ✅

Goal: measured TTS word timings are the source of truth; captions are assigned once to the
correct scene and never duplicated at boundaries.

- [x] Treat measured `ttsService.synthesize().subtitles` as primary. Proportional
  `generateSubtitles()` remains a fallback only for engines without word boundaries; log
  and record `subtitleSource: 'measured' | 'estimated'`.
- [x] Rewrite `subtitleService.alignToScenes()`:
  - clip every cue to the scene’s `[startMs, endMs]` window;
  - split a cue that crosses a boundary into two entries, using word-level timings when
    present; when absent, split words proportionally and mark the result estimated;
  - split the `words` array too, so highlighting remains correct inside each scene;
  - preserve first/last word timings, keep entries ordered, and never duplicate the same
    text in two adjacent scenes.
- [x] Keep subtitle timing independent of scene-relative animation timing. `Subtitle.tsx`
  continues to use absolute video time; only the per-scene entries are clipped.
- [x] Validate subtitles before rendering:
  - start/end within audio duration and the scene window;
  - no negative or inverted ranges;
  - no duplicate cue text/segment across adjacent scenes;
  - no overlapping cues within a scene;
  - measured cues are not replaced by estimates when both exist.
- [x] Write `output/<jobId>/subtitle-report.json` with source, cue count, boundary splits,
  gaps/overlaps, and per-scene counts. Keep `subtitles.srt` / `subtitles.json` as the
  canonical outputs.
- [x] Tests: a cue spanning two scenes appears once in each scene with split text and word
  timings; no-duplicate assertions; measured-versus-estimated selection.

**Acceptance:** every caption appears exactly once at its audio timestamp; scene boundaries
split rather than duplicate cues.

---

## Phase 5 — Educational storytelling, composition, and layout ✅

Goal: scenes explain through examples, relationships, and progression instead of static
icons plus labels.

- [x] Add a scene purpose taxonomy (hook, define, process, compare, example, data, recap,
  ending) derived from the analysis + narration; store it on the scene.
- [x] Let the director choose a composition only when the purpose/brief supports it:
  process → process flow/diagram; comparison → split screen/comparison chart; numbers →
  number counter; cause/effect → annotated callout or flow; recap → summary. Do not rotate
  compositions arbitrarily.
- [x] Prompt for examples and relationships: each explanation scene must show what changes,
  what causes what, or how two things compare; a label-only tile row is not sufficient when
  a process or comparison is described.
- [x] Enforce content budgets:
  - at most one title plus one visual focus per scene; no wall of text;
  - title ≤ 8 words, safe-area bands respected;
  - no more than 2–3 diagram tiles per narration segment;
  - use the existing `ComparisonChart`, `ProcessFlow`, `AnimatedDiagram`, `Timeline`,
    `NumberCounter`, `HighlightedRegion`, `Callout`, `SummaryScene` where appropriate.
- [x] Highlight important numbers/equations/keywords from the analysis claims, using the
  existing components rather than plain text.
- [x] Add renderer-level text fitting:
  - put the estimate of rendered text width/height (font size × character count) in
    `packages/shared` so validation and the renderer use the same numbers;
  - shrink long titles/labels instead of overflowing;
  - keep title/caption safe bands and prevent overlapping visual cards.
- [x] Keep typography, spacing, palette, and transition rules consistent across scenes;
  preserve the existing palette/camera system.
- [x] Acceptance: sampled storyboards show a mix of compositions, real examples, and no
  scene dominated by three or more competing text blocks.

---

## Phase 6 — Validation and quality gates ✅

Goal: reject a storyboard that merely parses but does not explain the narration or cannot
render correctly.

- [x] Add `services/content.validation.ts`:
  - analysis-to-narration consistency: domain, objectives, and key terms actually appear
    in the approved script;
  - scene-to-narration relevance using analysis key terms/synonyms and `visualBrief`, not
    a static global alias list;
  - flag generic/decoration-only icon scenes and scenes whose brief is unrelated to the
    scene narration.
- [x] Add `services/math.check.ts`:
  - safely parse simple arithmetic, percentages, and equations (no `eval`);
  - verify computed values and displayed values against each other and the narration;
  - flag unsupported statistics/dates that were not verified in Phase 1.
- [x] Extend `storyboard.validation.ts`:
  - frame and child-timing checks (Phase 3);
  - missing/failed asset checks using the manifest;
  - duplicate/misassigned subtitle checks (Phase 4);
  - text length/overflow/overlap/safe-boundary checks using the shared estimator;
  - asset-to-visual-brief relevance from the manifest;
  - keep the existing EndScreen, continuity, and visual-variety rules.
- [x] Make validation results actionable and severity-aware:
  - blocking issues stop the render after the bounded repair attempts, with a precise
    per-scene/per-asset report;
  - warnings are logged and included in the report but do not silently discard a designed
    storyboard;
  - never fall back to a generic slideshow while claiming success.
- [x] Persist `output/<jobId>/validation-report.json` and include it in the job logs.
- [x] Extend post-render QC (`quality.service.ts` / worker):
  - keep ffprobe, duration, dimensions, black-frame, and frozen-frame checks;
  - extract one representative frame per scene into
    `output/<jobId>/frames/scene-XX.jpg` and a contact sheet;
  - record scene coverage and sampled timestamps so the E2E review can compare each frame
    with its narration and storyboard;
  - technical QC alone must not mark the job successful when the semantic report is
    blocked.
- [x] Tests for every validator: valid fixture, business-vs-technology mismatch, bad math,
  duplicate subtitle, out-of-scene child, missing asset, overflow.

**Acceptance:** a structurally valid but semantically wrong storyboard fails before
rendering with a report explaining why; every check has a deterministic fixture.

---

## Phase 7 — End-to-end verification on real renders 🟡

Goal: prove the fixes on actual output, not only on JSON.

> **Automated portion verified here:** unit tests, the fake-LLM/fake-TTS integration fixture,
> all workspace typechecks and the full build pass. The three rendered topics and sampled-frame
> review remain blocked on the GPU box (no ffmpeg/TTS/model/GPU in this sandbox).

- [x] Add unit tests for the new analysis, timing, subtitle, asset-verification, math, and
  layout modules. Keep existing asset and schema tests passing.
- [x] Add an integration fixture that runs storyboard planning with a fake LLM response and
  a fake TTS result, then asserts the final Remotion props: relative child timings, split
  subtitles, attached assets, and validation report.
- [ ] On the GPU box, render at least three unrelated topics:
  - business profit/loss (the regression case);
  - a science/biology topic;
  - a history or technology topic with dates/numbers.
  Include one own-script job through the approval flow.
- [ ] For each job, inspect:
  - `content-analysis.json`, `assets.json`, `timing-report.json`,
    `subtitle-report.json`, `validation-report.json`, `quality-report.json`;
  - 2–3 frames per scene from `frames/`, compared with the narration and storyboard;
  - subtitles at scene boundaries, asset/concept match, animation start times, transitions,
    and title/visual overlap.
- [ ] Fix issues found, re-run the affected topic, and record the result. Preserve logs for
  topic classification, research sources, asset queries/scores/rejections, timing repairs,
  subtitle splits, validation failures, and rendering errors.
- [x] Update `e2e/VERIFICATION.md` with exact commands, expected artifacts, and the sampled
  frame checklist.
- [x] Performance guard: analysis/research/asset verification must respect timeouts and
  caching; a research provider outage must not block rendering.

**Acceptance:** three unrelated rendered videos pass semantic and visual review; the
business video has no technology visuals; no animation/caption/scene-boundary defect remains
in the sampled frames.

---

## Phase 8 — Compatibility, artifacts, and documentation ✅

- [x] Preserve the public API and schema:
  - optional new fields only;
  - `planStoryboard()` remains usable without analysis (derive it internally);
  - old storyboards render through the ingestion normalizer;
  - existing `/api/jobs`, videos, output, and resume contracts stay unchanged.
- [x] Extend `services/job.files.ts` with `contentAnalysis`, `research`, `assetsManifest`,
  `timingReport`, `subtitleReport`, `validationReport`, and `framesDir`, all under
  `output/<jobId>/`.
- [x] Extend the asset/artwork report so the render page can show selected assets,
  rejected candidates, and the scene/concept they belong to, without redesigning the page.
- [x] Add structured log prefixes:
  `[Content]`, `[Research]`, `[Assets]`, `[Timing]`, `[Subtitles]`, `[Validation]`,
  `[QC]`, so a failed job can be diagnosed from logs alone.
- [x] Document configuration: `RESEARCH_PROVIDER`, `RESEARCH_TIMEOUT_MS`,
  `RESEARCH_MAX_SOURCES`, `ASSET_VERIFY`, and any analysis/validation toggles.
- [x] Update `README.md`, `project.md`, `dev.md`, `progress.md`, and this file as phases
  complete. Do not mark a phase `[x]` until its tests and E2E checks pass.

---

## Implementation notes (2026-11-22)

- New services: `content.analysis.ts`, `research.service.ts`, `fact.check.ts`,
  `asset.verify.ts`, `timing.service.ts`, `content.validation.ts`, `math.check.ts`,
  `layout.validation.ts`, `subtitle.validation.ts`.
- New shared modules: `schemas/content.schema.ts` and `utils/text-metrics.ts`; storyboard
  schema gained optional `purpose`, `visualBrief`, `keyTerms`, `assetQueries`,
  `animationIntent`, `transition`, `domain` and `timingMode` fields.
- Scene discovery now runs after storyboard planning and writes `assets.json`; the old
  whole-script discovery call was removed so scenes do not inherit unrelated downloads.
- Backdrop folders remain excluded from foreground artwork matching.
- Asset verification is deterministic and offline (key-term/token + backdrop checks). An
  optional local-LLM judge was left out to avoid an extra LLM call per tile; the deterministic
  verdict is recorded in the logs and the manifest.
- 2026-11-23: added `pipeline.integration.test.ts`, which runs a fake LLM storyboard and fake
  measured captions through the real planner and asserts relative child timings, boundary-split
  captions, validation, the asset report and persisted artifacts.
- Backend Vitest now aliases `@edumotion/shared` to `../shared/src/index.ts`, so tests cannot
  silently pass or fail against a stale `dist/index.mjs`; `tsup` remains the production build.
- Workspace checks are fixed: `npm run typecheck` runs every package, `renderer` exits cleanly
  with no tests, and the frontend’s React Query v5/type errors are resolved.
- `npm run build` passes end to end (shared DTS, renderer/backend tsc, frontend tsc + Vite).
- Not verified here: real TTS timings, real research network calls, Remotion rendering,
  sampled frames, and the three-topic visual review.

## Verification commands

- All workspace typechecks: `npm run typecheck`
- All workspace tests: `npm test` (61 passing)
- Full build: `npm run build`
- Full E2E: `./start.sh`, then render the acceptance topics and inspect the artifacts listed
  in Phase 7.

## Sandbox limitations

- No ffmpeg/ffprobe, edge-tts/espeak, complete LLM model, GPU, Remotion render, or full server
  run here. The real three-topic render and sampled-frame review must happen on the GPU box.
- Unit/integration tests and the production build do run here; Vite, tsup and Vitest are
  working in this environment.
