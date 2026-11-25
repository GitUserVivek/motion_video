# Output review and fix status — Marathi video jobs

Reviewed and fixed on 2026-11-25. Both jobs were produced **before** the Marathi script-prompt rewrite, so their narration is the "before" picture, not a regression.

| | Job A | Job B |
|---|---|---|
| URL | `https://cover-ended-growing.ngrok-free.dev/output/1155d951-0488-408a-a2da-92de6cb72468/` | `https://cover-ended-growing.ngrok-free.dev/output/6f6cd6ff-df53-47a1-a79a-e4dfb12c4360/` |
| Topic | प्रकाशसंश्लेषण कसे होते? (photosynthesis) | प्रकाशसंश्लेषण (photosynthesis) |
| Status at review | **failed** — `validation_failed`, no `video.mp4` | completed, `video.mp4` present |
| Duration | 57.24 s audio / 1,718 frames | 14.93 s audio / 448 frames |
| Scenes / captions | 8 scenes / 7 cues | 4 scenes / 2 cues |
| Quality at review | — | `passed: true`, 3 frozen segments / 4.73 s (32%) |

**Method:** `validation-report.json`, `quality-report.json`, `content-analysis.json`, `storyboard.json`, `subtitles.json`, `subtitle-report.json`, `timing-report.json` and `assets.json` were read for both jobs; WAV durations were measured; four sampled frames of Job B were inspected. The audio was **not** listened to, so pronunciation is still unverified.

---

## Follow-up review — jobs `90a6cfd5` (English) and `a3c62997` (Marathi)

Both reports were re-read on 2026-11-25 after the fixes above. Neither failure was caused by the content fixes; one was a false positive introduced by the new math check, the other was the new freeze gate correctly rejecting a slideshow.

| | `90a6cfd5-66b2-4a67-bfac-5581e4786340` | `a3c62997-9015-444d-a9fd-918964d9fda6` |
|---|---|---|
| Topic / language | How a car runs internally / English | photosynthesis / Marathi |
| Status | rendered, then **rejected by quality** | **failed** at `validation_failed`, no `video.mp4` |
| Failure | `15.8 s of frozen picture is more than 30% of the video` (30.7% of 51.5 s, 9 segments) | blocking `math`: `Displayed chemical equation is not balanced: … CO2 + H2O → glucose + O2` |
| Editorial | `passed: true`, 8 warnings | not reached |

### 12. Math check read planning prose — fixed

The blocking message came from **`scene-4.visualBrief`**, not from a displayed prop: `"Animated equation showing CO2 + H2O → glucose + O2"`. `validateMath()` walked every string in the scene, so a drawing instruction was judged as an on-screen formula. Only `scene.props` and child `props` are now scanned; planning fields (`visualBrief`, `keyTerms`, `assetQueries`, `animationIntent`, …) and narration are not. A genuine displayed equation is still checked and still blocks.

The storyboard prompt example was itself an unbalanced word equation (`CO2 + H2O -> glucose + O2`), so the model was copying an invalid template. It is now `2H2 + O2 -> 2H2O`, with a note that displayed equations must balance and use symbols.

Test: `content.test.ts` — a `visualBrief` containing an unbalanced equation produces no math issue.

### 13. Frozen picture in diagram scenes — fixed in code, not re-rendered

`ffmpeg` freeze detection segments matched the static scenes: scenes 9–11 are `ConceptDiagram` only and hold still for ~15 s once the entrance animation ends; the background shape drift is too small to register. `EduVideo.tsx` now applies a scene-local camera move (`cameraMovement` is honoured: `zoomIn`, `zoomOut`, `panLeft`, `panRight`; absent or `static` gets a minimal push-in) around the backdrop and visual layers. Captions, the progress meter and the scene wipe stay outside the transform, so text is never scaled or blurred.

**Not verified:** the renderer needs headless Chrome, which this environment does not have, so the new motion was not measured against `freezedetect`. If a re-render still reports frozen time, the next lever is the drift amount, not the quality gate.

## Status summary

| # | Issue | Status |
|---|---|---|
| 1 | Duplicate Marathi title/bubble blocks Job A | **Fixed** for Marathi; overlaps still block if a duplicate survives |
| 2 | Captions cut mid-sentence at scene boundaries | **Improved** — split, snap and one-word-tail merge; a short end card can still force one crossing |
| 3 | Wrong artwork (`पान` → CO₂, DNA for water) | **Improved** — Marathi mapping and stricter downloads |
| 4 | Empty diagrams and English fillers | **Fixed** |
| 5 | Marathi grammar and meaning | **Not verifiable here** — prompt was already rewritten; no Marathi model installed |
| 6 | English label and unbalanced equation on screen | **Fixed** for the hard-coded label and invalid equations |
| 7 | Titles repeat narration / split across scenes | **Fixed for duplicates**; a split hook question can still occur |
| 8 | Cross-language warnings at score 0.35 | **Fixed** |
| 9 | Requested duration and 38-frame end card | **Improved** — warning and minimum end card; no hard duration enforcement |
| 10 | 32% frozen video passed quality | **Fixed** — frozen picture over 30% now fails |
| 11 | Asset audit counts unrendered images | **Open** — see below |

---

## P0

### 1. Duplicate Marathi title/bubble — fixed

The failing scene had an `AnimatedText` and a `SpeechBubble` with the same Marathi sentence, 84% overlapped. Both duplicate detectors used `[^a-z0-9%]`, which erases Devanagari, so neither could see the duplicate.

- New `packages/backend/src/services/text.language.ts` provides one Unicode normaliser and tokeniser (`\p{L}\p{M}\p{N}`), used by `scene.director.ts` and `layout.validation.ts`.
- Devanagari vowel signs are combining marks (`\p{M}`), not letters; stripping them had turned `आहे` into `आह`. This was found by the new regression test and fixed in every tokeniser.
- `dedupeNarration` now removes the repeated bubble before layout, so this class of failure no longer reaches the blocking overlap check.
- Tests: `editorial.test.ts` — Marathi duplicate title/caption layout test and Marathi bubble dedupe director test.

**Remaining:** layout duplicates/overlaps that survive the director are still blocking. Validation still happens after TTS, so a failure there still wastes the audio step.

### 2. Captions cut mid-sentence — improved

`subtitle.service.ts` now:

- splits long cues at sentence punctuation, commas, Devanagari danda and safe connector boundaries into chunks of at most 7 words / 64 characters, with proportional sub-timing;
- merges a one-word tail into the previous chunk instead of flashing it;
- suppresses one-word slivers when clipping with word timings;
- snaps scene boundaries to nearby caption edges (±1.5 s, minimum 30 frames, never below one second) before `alignToScenes()`.

`render.worker.ts` calls `splitLongCues()` before building the storyboard.

A simulation with Job B's two cues and four scenes now turns the 12.6 s cue into four readable cues, removes the one-word tail, and moves two boundaries onto caption edges. Tests: `subtitles.test.ts` — Marathi long-sentence split, boundary snap, sliver removal.

**Remaining:** with Job B's 2.9 s closing card, the final boundary (`12.0 s`) is more than 2.5 s away from the nearest caption edge, beyond the 1.5 s snap window. One cue can therefore still cross that boundary and be clipped, and a 19-word sentence can still break into grammatical phrases without a finite verb. There is no continuation marker.

---

## P1

### 3. Wrong artwork — improved

- `text.language.ts` maps Marathi label words to artwork vocabulary (`पान → leaf`, `सूर्य → sun`, `पाणी → water`, `कार्बन डाइऑक्साइड → carbon/dioxide`, …).
- `asset.library.ts` uses those mapped tokens for Marathi labels.
- Downloaded assets now need a score of at least 2 against the label/icon context; a narration-only match is no longer enough to attach an image.

This removes the "no English tokens, so pick any unused file" path that put a CO₂ molecule in the `पान` tile. Tests: `text.language.test.ts` mapping tests; asset matching tests.

**Remaining:** a candidate whose source title contradicts the query (DNA for "water", sucrose for "glucose", a Finnish equation image) is not detected by a dedicated title-contradiction check. The stricter score makes it less likely, not impossible.

### 4. Empty diagrams and English fillers — fixed

- `storyboard.repair.ts` drops empty `AnimatedDiagram`, `ConceptDiagram` and `SplitScreenComparison` children.
- `layout.validation.ts` makes empty `AnimatedDiagram`, `ConceptDiagram`, `ProcessFlow` and `SplitScreenComparison` blocking.
- `CONCEPT_FILLERS` in `storyboard.visuals.ts` are now Marathi.
- Unknown icon ids are mapped to `book` during repair, and layout warns if one still arrives. `ConceptDiagram` icons are checked too.

Tests: repair tests for empty panels and invalid icons; layout tests.

### 5. Marathi grammar — not verifiable here

The writing guide already added to `script-generate.prompt.ts` targets the reported errors: verb agreement, gender, case endings, no invented words, a Marathi exemplar and a self-check; Marathi temperature is 0.45. Both reviewed jobs predate that change.

On-screen wording mistakes that the model repeated are now normalised in `fixMarathiWording()`:

- `सूर्याचे प्रकाश शोषण` → `सूर्यप्रकाशाचे शोषण`
- `सूर्याचे प्रकाश` → `सूर्यप्रकाश`
- `पाणी वाहतुकी` → `पाण्याची वाहतूक`
- `कार्बन डाइऑक्साइड` → `कार्बन डायऑक्साइड`
- `ग्लुकोज` → `ग्लूकोज`

Tests: `text.language.test.ts` and `storyboard.repair.test.ts`.

**Not verified:** the local environment has no Qwen3-8B GGUF (only Qwen2.5-7B outside the project), so a real Marathi generation was not rerun. Grammar quality still depends on the model; only the prompt and label-level rules are covered by code.

### 6. English label and wrong equation — fixed

- The hard-coded `THE SHAPE EQUATION` was removed from `AnimatedDiagram.tsx`.
- `math.check.ts` has `isBalancedChemicalEquation()`, which parses elements and rejects word formulas and unbalanced equations **that are actually displayed** (planning prose is no longer scanned — see issue 12).
- `storyboard.repair.ts` drops an invalid chemical equation instead of showing it; `validateMath()` reports it.
- Process-flow step icons with unknown ids are removed so the renderer uses a valid glyph.
- The label wording fixes from issue 5 apply to titles, labels and process steps; captions are injected after this pass.

Tests: balanced/unbalanced equation unit test, an on-screen unbalanced equation test, and repair tests for invalid equations and icons.

**Remaining:** a *valid* equation is still rendered as plain text, not with subscripts (`CO₂`). The panel is omitted only when the equation is invalid.

### 7. Titles repeat narration — fixed for duplicates

Unicode normalisation now lets `isUsableTitle()` and the duplicate guards compare Devanagari. Marathi dangling-title checks reject titles ending in `नाही`, `आहे`, `आणि`, `म्हणजे`, `की` and similar fragments. The director removes a repeated bubble and the image/visual duplicate path is covered by tests.

**Remaining:** the hook question split across two scene titles is not automatically rejoined; each scene title is only checked for being a dangling fragment.

### 8. Cross-language scoring — fixed

`content.validation.ts` and `storyboard.validation.ts` tokenise Unicode text. When the narration is Devanagari and the analysis has no Devanagari terms, the "topic is only weakly represented" warning is suppressed instead of scoring the script at zero. Tests: `validation.test.ts` cross-language test; `storyboardValidator` relevance test still passes.

---

## P2

### 9. Duration and end card — improved

- `content.validation.ts` warns when requested and actual duration differ materially.
- `timing.service.ts` adds `ensureEndScreenDuration()`; a closing card shorter than 75 frames (2.5 s) borrows frames from the previous scene, keeping scene boundaries contiguous.
- The storyboard pipeline calls it, and snaps scene boundaries to caption edges.

Tests: `timing.test.ts` end-card extension.

**Remaining:** the requested 40/60/90 s target is still not enforced; a short narration produces a short video with a warning. Scene distribution is not driven directly by sentence count.

### 10. Frozen quality gate — fixed

`quality.service.ts` now:

- warns above 12% frozen picture;
- **fails above 30%** (Job B's 4.73 s of 14.93 s is 32%, so it would now fail);
- requires editorial `passed` as well as technical checks for the overall `passed`.

No automated test covers the ffmpeg freeze path in this environment. The gate stays at 30%; the fix for the jobs it rejected is motion in the renderer (see issue 13), not a looser threshold.

### 11. Asset audit counts unrendered images — open

`assets.json` records every artwork decision, including rejected candidates with `reason`. The downloaded count still follows attached `assetUses`, not a second scan of rendered `image` props, so an asset attached to a component that is later overlaid or not painted can still be counted. Fixing this properly needs the audit to verify each recorded data URL against the final component tree; that is not implemented.

The canal-lock/DNA/sucrose selections from Job B are now unlikely because of the Marathi mapping and score ≥2 rule, but the audit bookkeeping itself is unchanged.

---

## Verification

Run on 2026-11-25:

- `npm run build` — exit 0 (shared, backend, renderer, frontend).
- `npm test` — backend 110/110 in 14 files; frontend 2/2; renderer `--passWithNoTests`.
- New regression tests cover: Marathi duplicate title/bubble, Marathi long-caption split, scene-boundary snap, one-word sliver, empty diagrams, invalid icons, unbalanced equations, a planning brief containing an equation, end-card extension, Marathi label wording, and cross-language validation.

**Not verified:** real Marathi model output, TTS pronunciation, and the ffmpeg freeze threshold after the camera change. No headless Chrome or `edge-tts` is available here, and the reviewed jobs run on a remote server; only their HTTP outputs were accessible.

## What looks good

- Devanagari renders correctly in all four sampled frames — no tofu boxes, correct weights, titles and captions fit.
- The paper/board visual language, brand line `ANUPAM CLASSES / FIELD NOTES`, progress bar and instructor are coherent.
- Audio is present and correctly sized (24 kHz mono 16-bit, 0.9 s trailing silence), and both jobs selected `mr-IN-female-1`.
- Job B's end card is localised (`सारांश`, `प्रकाशसंश्लेषण`, Marathi summary), and Job A's uses `पाहिल्याबद्दल धन्यवाद!`.
