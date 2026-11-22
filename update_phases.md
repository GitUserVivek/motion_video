# EduMotion — Visual Upgrade Phases

Source of truth for the work requested in `Update_Instructions.md`.
Progress is tracked per phase in `progress.md`; this file holds the plan.

Legend: `[ ]` not started · `[~]` implemented, verification pending · `[x]` done & checked

---

## Phase 0 — Audit the existing pipeline
- [x] Read backend services, prompts, schemas, renderer components, worker, TTS, render service
- [x] Record what already works (script approval, queue, recovery, TTS word boundaries, frame mux)
- [x] Record the real defects (dark identical backgrounds, no scene direction, no EndScreen guarantee, relevance scoring by substring, no post-render QC)

## Phase 1 — Colour system & scene environments
- [x] Shared palette ids + deterministic palette picker (topic affinity, adjacent-scene avoidance)
- [x] Renderer palette definitions (vivid blue / violet / coral / teal / sunshine / rose / mint / indigo)
- [x] `BackgroundScene` rewritten: palette gradients, drifting light blobs, scrolling patterns
- [x] Prop sanitiser accepts only known palette ids

## Phase 2 — Deterministic scene direction (no LLM randomness)
- [x] `scene.director.ts`: per-scene palette + pattern + camera assignment
- [x] Root component normalisation (background painted behind whatever the model put first)
- [x] Short heading generation (never the whole narration)
- [x] `EducationalObject` type re-aligned to the scene's own narration
- [x] Guarantee an `EndScreen` on the final scene
- [x] Director applied to both the selected attempt and the fallback storyboard

## Phase 3 — Storyboard prompt & validation
- [x] Prompt lists every implemented component, demands varied compositions and short headings
- [x] Validation: EndScreen must be on the final scene (root or child)
- [x] Validation: relevance measured by coverage of the scene's own narration words (with concept aliases)
- [x] Validation: titles are no longer counted as the scene's visual explanation
- [x] Scene-level diagnostics (id, score, failing reason) logged instead of a silent fallback

## Phase 4 — Post-render quality control
- [x] `quality.service.ts`: ffprobe streams/duration/dimensions + ffmpeg blackdetect/freezedetect
- [x] Report written to `output/reports/<jobId>.json`
- [x] Worker runs QC before saving and refuses to mark a failing render completed

## Phase 5 — Asset acquisition
- [x] Search/download service: Iconify, OpenMoji, Wikimedia Commons (all keyless, open licences)
- [x] unDraw / LottieFiles deliberately not integrated: neither offers a public search API, and scraping is off-limits
- [x] Disk search cache (7 days), content-hash manifest, duplicate detection, timeout + one retry
- [x] SVG sanitisation (scripts, event handlers, external references removed) before anything reaches the renderer
- [x] Licence metadata per file + `resources/auto/CREDITS.txt` for CC BY / CC BY-SA attribution
- [x] Relevance scoring of candidates; downloaded files land in `resources/auto/` so the existing matcher picks them up
- [x] Graceful fallback: any provider failure is logged and built-in SVG glyphs are used
- [x] `ASSET_DISCOVERY` / `ASSET_PROVIDERS` / `ASSET_MAX_QUERIES` / `ASSET_TIMEOUT_MS` configuration
- [x] Unit tests for query building, SVG sanitisation, scoring and slugs

## Phase 6 — Typography & composition components *(next)*
- [ ] Speech bubbles, annotated callouts, comparison charts, summary scene used by the director
- [ ] Director picks composition by narration intent (process / comparison / timeline / data / hook / summary)

## Phase 7 — Word-level captions
- [x] Group edge-tts per-word cues into readable phrases (≤7 words / ≤48 chars)
- [x] Keep per-word timings on each phrase and highlight the spoken word
- [x] Sanitiser no longer drops `words`, so the highlight survives to the renderer
- [x] Cues are clamped to the measured audio duration in the TTS service

## Phase 8 — End-to-end verification *(blocked: needs the GPU box)*
- [ ] Rebuild shared/renderer/backend
- [ ] Render the three acceptance topics, inspect sampled frames against `expected_video_style.mp4`
- [ ] Confirm `/output`, streaming, thumbnail and download endpoints on the real host

---

## Constraints in this sandbox
- No TTS, LLM, Remotion render or server run (4 vCPU / no GPU here; testing happens on the Kaggle box).
- `@rollup/rollup-linux-x64-gnu` is missing, so Vite/tsup/vitest cannot run → verification is `tsc --noEmit` (backend, shared, renderer) plus static reasoning.
