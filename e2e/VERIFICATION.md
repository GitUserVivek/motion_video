# EduMotion AI — End-to-End Verification

> **Last Updated**: 2026-11-23
> **Plan**: [`update_phases.md`](../update_phases.md)
> **Status**: 🟡 Phases 1–6 and 8 code-complete; Phase 7 automated checks pass; real GPU render/frame review pending

---

## What is verified here

These commands were run in this workspace and exited 0:

```bash
npm run typecheck   # shared, backend, renderer, frontend
npm test            # 61 tests: shared 12, backend 47, frontend 2; renderer has no tests
npm run build       # shared tsup + DTS, renderer/backend tsc, frontend tsc + Vite
```

The test suite includes:

- schema compatibility and additive storyboard fields;
- content-analysis fallback/claim handling and offline research behavior;
- boundary subtitle splitting with word timings and no duplicates;
- scene-relative timing normalization, legacy rebasing and out-of-scene clamping;
- math, layout and subtitle validators;
- asset-query/sanitisation/verification checks;
- `pipeline.integration.test.ts`, which runs a fake LLM storyboard and fake measured TTS
  captions through the real planner and asserts:
  - final `timingMode: 'scene-relative'` and absolute frame conversion;
  - every child start inside its scene;
  - split captions with no duplicate cue text;
  - a passing semantic validation report;
  - asset-report shape and persisted storyboard/timing/LLM artifacts.

Backend Vitest resolves `@edumotion/shared` from `../shared/src/index.ts`. This prevents a
stale `dist/index.mjs` from hiding a missing export during tests; production still uses the
`tsup` build.

---

## What is not verified here

This sandbox has **no ffmpeg/ffprobe, no edge-tts/espeak, no complete LLM model, and no GPU**.
It therefore cannot produce the acceptance renders:

- no real TTS word-boundary audio;
- no local LLM storyboard/analysis;
- no Remotion render or FFmpeg mux;
- no `quality.service.ts` black/frozen/duration inspection;
- no sampled-frame visual review.

Do not mark Phase 7 complete until the GPU-box runs below pass.

---

## GPU-box acceptance run

```bash
./start.sh
```

Render at least these unrelated topics, including one own-script job through approval:

1. **Business profit/loss** — the regression case; must not show technology icons.
2. **A science/biology topic** — e.g. photosynthesis.
3. **A history/technology topic with dates or numbers**.

For each job, check the console/logs for:

```text
[Content] … domain … key term(s) … claim(s)
[Research] … source(s) / unverified claim(s)
[Assets] … scene query, score, verdict, rejection reason
[Timing] … repaired child start frame(s)
[Subtitles] … measured source / boundary splits
[Validation] … blocking issue(s) / final storyboard valid
[QC] … black/frozen/duration/dimension results
```

If a job ends `quality_failed` or `validation_failed`, the report names the exact reason.
That is intended behavior, not a reason to bypass the gate.

---

## Artifact checklist per job

Under `output/<jobId>/`:

- [ ] `video.mp4` — playable, correct dimensions/FPS/duration
- [ ] `audio.wav` — narration used in the mux
- [ ] `subtitles.srt` / `subtitles.json` — canonical captions
- [ ] `content-analysis.json` — topic/domain/key terms/claims
- [ ] `research.json` — sources or explicit offline/unverified state
- [ ] `assets.json` — scene queries, verdicts, selected files and rejections
- [ ] `storyboard.json` — final directed render props
- [ ] `llm/storyboard.json` — prompts, attempts, validation, chosen attempt
- [ ] `timing-report.json` — relative/absolute child frames and repairs
- [ ] `subtitle-report.json` — source, splits and per-scene cue counts
- [ ] `validation-report.json` — blocking/warning issues
- [ ] `quality-report.json` — ffprobe + black/frozen-frame results
- [ ] `frames/scene-XX.jpg` — one representative frame per scene

---

## Sampled-frame checklist

For 2–3 frames per scene, compare the frame to that scene's narration and storyboard:

- [ ] The visual explains the spoken idea, not just a generic icon.
- [ ] Titles are short, readable, and do not repeat the narration.
- [ ] Diagram labels/assets match the scene's key terms.
- [ ] No black, blank or fallback-only scene.
- [ ] No text overflow, overlap or off-screen cards.
- [ ] Animations begin inside their scene and do not freeze the rest of it.
- [ ] Captions appear once, at the spoken time, and split cleanly at boundaries.
- [ ] The final scene is an EndScreen covering only the closing line.
- [ ] The business video contains no technology-derived visuals.
- [ ] Consecutive scenes do not reuse the same palette/composition unnecessarily.

---

## Pass criteria

- Three unrelated jobs complete without `validation_failed` or `quality_failed`.
- All artifacts above exist and agree with each other.
- The sampled frames pass the checklist.
- The business regression job shows finance/decision visuals, not technology icons.
- No animation, caption or scene-boundary defect remains in the sampled output.

Record the job IDs and any fixes in `progress.md` and `update_phases.md` after the review.
