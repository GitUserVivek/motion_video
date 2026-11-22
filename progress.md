# EduMotion AI — Progress Tracker

> Last updated: 2026-11-22
> Plan: [`update_phases.md`](./update_phases.md) · Request: [`Update_Instructions.md`](./Update_Instructions.md)
> Status: 🟡 visual upgrade in progress — phases 0–4 implemented, verification pending on the GPU box

---

## What changed in this upgrade

### Phase 0 — Audit ✅
Read the whole generation pipeline (script → TTS → subtitles → storyboard → director → Remotion → FFmpeg).
Root causes of the "dark slideshow" look, in the order they matter:

1. **Every scene used one of four dark gradients** (`#1a1a2e → #0f3460`, etc.). No per-scene colour.
2. **Nothing planned visual variety.** The storyboard prompt *asked* for diversity; nothing enforced it.
3. **Title = narration.** `AnimatedText` often received the spoken paragraph.
4. **No guaranteed ending.** Validation demanded an EndScreen, the prompt asked for one, the model often omitted it, and after 3 attempts the job silently used a generic fallback storyboard.
5. **Relevance scoring was `script.includes(type)`** — a sensible diagram scored 0.25, which *failed* the scene and triggered the fallback.
6. **Nothing inspected the MP4** after rendering: black, frozen, silent or wrong-sized output was saved as "completed".

### Phase 1 — Colour system & environments ✅ (code complete, visual check pending)
- `packages/shared/src/constants.ts`: `PALETTE_IDS` + `pickScenePalette(topic, index, avoid)` — topic affinity (sound→pink, space→indigo, plants→mint/teal, heart→coral, tech→sky/violet, maths→sunshine), deterministic hash, adjacent scenes never share a palette.
- `packages/renderer/src/utils/palette.ts`: eight vivid palettes (sky, violet, coral, teal, sunshine, rose, mint, indigo) with gradient, accent, glow and pattern inks.
- `packages/renderer/src/components/BackgroundScene.tsx`: palette gradients, four drifting light blobs on independent periods, scrolling dots/grid/waves, top highlight, vignette. Legacy `theme` values still work (educational→sky, modern→violet, playful→rose, minimal→indigo).
- `sanitize.ts`: only known palette ids reach the renderer.

### Phase 2 — Deterministic scene direction ✅ (code complete, visual check pending)
New `packages/backend/src/services/scene.director.ts` runs after the model and before validation:
- assigns palette + pattern + camera move per scene (no two adjacent scenes alike);
- moves a non-background root component one layer down so the environment is visible;
- shortens over-long titles to ≤ 56 characters and adds a heading when a scene has none;
- re-points `EducationalObject.type` at the concept the scene's own narration names;
- guarantees an `EndScreen` on the final scene;
- every change is logged (`directed N change(s) — …`).
Applied to the selected attempt **and** to the fallback storyboard.

### Phase 3 — Prompt & validation ✅ (code complete, verification pending)
- Prompt: full implemented component list (adds `ObjectZoom`, `Callout`), explicit "title ≠ narration", backgrounds/camera owned by the system, mandatory final EndScreen.
- Validator rewritten:
  - relevance = share of the visual's own words (type, labels, diagram/step text) named by the scene's *own caption cue*, with concept aliases (leaf↔photosynthesis, heart↔blood, …) — no substring luck, no bonus for having any icon;
  - titles no longer count as the visual explanation;
  - the **final scene** must contain an EndScreen;
  - diagnostics are per scene: `scene-3: Low visual relevance (0.32)... (relevance 0.32)`;
  - a low-scoring storyboard is now kept and reported instead of being replaced by a slideshow.

### Phase 4 — Post-render quality control ✅ (code complete, needs a real render to confirm)
New `packages/backend/src/services/quality.service.ts`:
- ffprobe: video/audio streams, duration, dimensions, fps;
- ffmpeg single decode pass: `blackdetect` + `freezedetect`;
- failures (no video, no audio, wrong size, duration off by >8 % or 1.5 s, >15 % black, unreadable file) → job is marked `quality_failed` instead of `completed`;
- warnings (fps drift, >50 % frozen) are logged;
- report written to `output/reports/<jobId>.json`.

### Phase 5 — Automatic asset discovery ✅ (code complete, network untested here)
`packages/backend/src/services/asset.discovery.ts`, run by the worker before storyboard planning:
- **Providers** (keyless, open licences): Iconify search + SVG, OpenMoji annotations index + colour SVG, Wikimedia Commons `generator=search` + 900 px thumbnails. unDraw and LottieFiles are *not* integrated — neither has a public search API and scraping is not acceptable.
- **Queries** come from the script: concepts from a ~110-term curriculum lexicon first, then the most repeated meaningful words and two-word phrases (max 5 per job).
- **Storage**: files land in `resources/auto/<slug>-<hash8>.<ext>`, exactly where the existing artwork matcher already looks, so every future video reuses them with no extra wiring.
- **Caching**: search results cached on disk for 7 days; downloads deduplicated by SHA-256 through `data/assets/manifest.json`; OpenMoji's index cached the same way.
- **Safety**: SVGs are sanitised (no `<script>`, no `on*` handlers, no `<foreignObject>`, no external `href`) before being written; oversized payloads are skipped.
- **Licences**: every manifest entry records provider, licence name/URL and attribution, and `resources/auto/CREDITS.txt` is regenerated for CC BY / CC BY-SA compliance.
- **Failure behaviour**: 8 s timeout + one retry per request; any error is logged and the job continues with the built-in SVG glyphs. Rendering never depends on a provider being reachable.
- **Visible progress**: new `discovering_assets` step between subtitle alignment and storyboard planning.
- **Tests**: `packages/backend/src/__tests__/assets.test.ts` covers query building, stopwords/dedup, SVG sanitisation, scoring and slugs (cannot be executed in this sandbox — see limitations).
- **Visibility**: `ensureSceneVisuals` now returns a per-tile report (`SceneAssetUse`), stored in `jobs.assets_json` and exposed as `JobResponse.assets`. The render page lists every scene's tiles with the file that was used (`auto/heart-…svg`, a local library file) or `built-in glyph (heart)` when nothing matched; the worker logs the same counts.

### Phase 7 — Word-level captions ✅ (code complete, needs a real render to confirm)
- `subtitle.service.ts`: `groupWordCues()` merges edge-tts' one-cue-per-word SRT into phrases of ≤7 words / ≤48 chars, glues punctuation back on, and keeps every word's own `startMs`/`endMs` on the phrase.
- Phrase-level cues (espeak / engines without word boundaries) are returned untouched — the grouping only kicks in when the average cue is a single word.
- `sanitize.ts` used to throw `words` away; it now validates and keeps them.
- `Subtitle.tsx`: the phrase stays on screen and the word currently being spoken is highlighted and lifted, instead of one word flashing at a time.
- Cues are already clamped to the measured audio duration in `tts.service.ts`, so no caption outlives the narration.

### Phase 5 — `/output` serving ✅ (earlier work)
`mountOutputStatic()` serves `/output` and `/api/output`, answers directory requests with a file listing, blocks traversal, and logs the resolved root + file counts at boot.

---

## Remaining work

| Phase | Status | Notes |
|---|---|---|
| 6 — Composition & typography set | ⏳ not started | speech bubbles, annotated callouts, comparison chart, summary scene; director picking composition by narration intent |
| 8 — End-to-end verification | ⛔ blocked here | needs the GPU box: build, render 3 topics, sample frames, compare to `expected_video_style.mp4` |

> The five component names that had no renderer (`QuestionReveal`, `FactHighlight`,
> `ScientificVisualization`, `ChartAnimation`, `BeforeAfterComparison`) are removed from
> `ComponentNameSchema`, so `COMPONENT_MAP` is complete again and the model cannot ask for
> a component that throws. They can come back in phase 6 with real implementations.

## Verification status

- Backend/shared `tsc --noEmit`: exit 0. Renderer `tsc --noEmit`: exit 0 (both run against shared *source*, not the stale `dist/`).
- `vitest run src/__tests__/assets.test.ts`: **could not run here** — rollup's native binary (`@rollup/rollup-linux-x64-gnu`) is missing because `node_modules` was installed on Windows. The new tests are type-checked; they must be executed on the box with `npm test --workspace=packages/backend`.
- No render was produced here: this sandbox has no GPU, no model, and `@rollup/rollup-linux-x64-gnu` is missing so Vite/tsup/vitest cannot run. Visual quality must be checked on the Kaggle box.

## How to check on the GPU box

```bash
./start.sh
# watch for:
#   [Server] Static: /output (+ /api/output) -> ...
#   [Storyboard] ... directed N change(s) — scene 1: sky/dots; ...
#   [Worker] ... quality: passed (38.4s, 1080x1920, 0.0s black, 0 frozen)
ls output/reports/         # one JSON per rendered job
```

If a job now ends `quality_failed`, the report names the exact reason — that is the intended behaviour, not a regression.
