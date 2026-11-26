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

## Follow-up review — job `1c112276` (artwork)

Report read on 2026-11-25: `https://cover-ended-growing.ngrok-free.dev/output/1c112276-ddf2-4960-a62b-0f7f7ac45c36/`. The job itself **passed** — validation `passed: true`, quality `passed: true` (47.7 s, 1080×1920, 0 frozen, 0 black) — so the complaint is the artwork, not the render.

`assets.json` and the editorial tally show the real problem: **0 downloaded, 0 library, 0 user, 32 built-in glyphs**. Every tile in the video is a vector glyph. The seven files that were downloaded and offered were all rejected by the verifier:

| Query | File it picked | Why it was wrong |
|---|---|---|
| `3D shape differences` | `human-ne-cells-exhibit-species-specific-differences-in-cell-shape.jpg` | a cell-biology micrograph |
| `corner edges` | NASA `The Inner Rings` | a Saturn photo |
| `understanding parts` | NASA `Snowman` | a Pluto photo |
| `face corner` | Cleveland `First a pool of water, then a prostitute…` | an Odilon Redon painting |
| `matter` | OpenMoji brain | an emoji, not the scene's idea |
| `geometric shape transformation` | `Geometric enhancements.JPG` | a study figure about shape perception |

Two causes, both in the pipeline rather than in that one job:

1. the searches were descriptions of the *slide* (`3D cube transforming into box animation`, `step-by-step counting process`, `face corner`, `matter`), and because the model's own queries came first they consumed the two-per-scene budget, so the scene's concrete nouns (`cube`, `box`, `faces`) were never searched;
2. the verifier judged file names and tags only, and a rejection was final — the tile fell straight back to its glyph even when a better file was already on disk.

### 14. Artwork sources, searching and verification — fixed

**More sources.** Two keyless providers were added to `asset.discovery.ts`, both tested live from this machine before wiring them in:

- **Openverse** (`api.openverse.org`) — the broadest CC-licensed pool outside Wikimedia, filtered to `mature=false` and `cc0,by,by-sa`;
- **Metropolitan Museum Open Access** (`collectionapi.metmuseum.org/public/collection/v1.1`) — CC0 only, for humanities scenes. The old `v1` search was retired upstream on 2026-10-01, so the code uses `v1.1`.

Default provider order is now `openmoji,iconify,wikimedia,openverse,met,cleveland,nasa`. Iconify moved to second place because a diagram tile is better illustrated by an exact vector glyph than by a stock photo that shares one word with the scene.

**Searches name things, not slides.** `compactQuery()` reduces a descriptive phrase to its content nouns (`3D cube transforming into box animation` → `cube box`), the scene's key terms come before the model's phrases, and a part word is anchored to the video's subject (`faces` → `cube faces`, `edges` → `cube edges`). Without the anchor, `edges` found a photo of stones at a bus station; with it, Wikimedia returns `Parallelohedron edges cube.png` and Rubik's-cube edge diagrams.

**A separate model checks the picture.** `vision.service.ts` gained `audit()`: when `VISION_API_URL`/`VISION_MODEL` is configured, each accepted candidate's actual image is sent to that model with the element being illustrated (`label`, scene key terms, narration), and it answers `{match, reason}`. The verdict is cached and is *not* used on `ASSET_VERIFY=tags`. Since the follow-up change described in the next section, the vision endpoint is the only model that judges artwork; the script model is not asked about images at all. A captioning model that answers with a description instead of JSON is handled by `captionVerdict()`, which accepts the picture when the model itself named a needed concept and rejects it when none appear. A guard was added to the deterministic verifier as well: emoji sets are searched first, and `grinning face` was being attached to a geometry tile called `Face` on the shared word; facial-expression markers are now their own semantic field, so an emoji face is rejected in a geometry scene.

**Rejected is not final.** `matchAssetImages()` returns the ranked candidates instead of one best file. `pickVerifiedMatch()` in `storyboard.visuals.ts` verifies them in order (up to `ASSET_MAX_CANDIDATES`, default 4) and keeps the first that passes; every rejection is written to `assets.json` as `candidate`/`reason`, plus `tried` for the alternatives. A tile only falls back to its glyph when nothing in the pool passes.

**Verified offline** by replaying this job's real `storyboard.json` through the compiled services:

- searches are now `cube, box, cube faces, cube edges, rubik cube, cube vertices, shape, …` instead of `3D cube transforming into box animation`, `face corner`, `matter`;
- 13 files downloaded from the new source list, 9 tiles took real artwork (was 0), and every previously attached mistake is now rejected with a reason (emoji `grinning face`, stones at a bus station, a war memorial, a Comet-marked cube figure);
- 23 tiles still fall back to their glyph because their labels are abstract parts (`Vertex`, `Sides`, `Lines`) or caption fragments and no candidate passed.

**Not verified:** a re-render of the job (no `video.mp4` produced here — bundled Chrome is missing `libnspr4` and there is no `ffmpeg`), and the vision audits themselves, because no `VISION_API_URL` is configured in this environment; the replay ran the text verifier.

**Remaining, separate issue:** several diagram labels are caption fragments (`scene-7` tiles `and`, `For example, imagine holding a cube`). That is `buildConceptItems()` wording, not artwork selection, and it is not changed here.

## Job `c38e520b` (Marathi Pythagoras) — no artwork used, and nothing verified by a model

Report read on 2026-11-25: `https://cover-ended-growing.ngrok-free.dev/output/c38e520b-dac1-4014-9542-7b5318afeb50/`. The render itself is fine (38.1 s, 1080×1920, 0 black, 0 frozen), but **every one of the 13 tiles is a built-in glyph** (book/leaf icons): `assets.json` lists 10 downloaded files and 13 selections, all `source: "builtin"`, `asset: null`.

So no, no asset was correct, and no, nothing was verified by a model — the verifier never saw a single candidate. Replayed this job's own `storyboard.json` with its 10 downloaded files in `resources/auto/`, using the current build: **0 candidates** were offered for the tiles, so neither the deterministic tags nor the semantic judge ran on them.

Cause: the tile labels are Marathi words (`बाजू`, `त्रिकोण`, `कोन`, `हिपोटेन्यूस`), and `mappedTokens()` knew no geometry vocabulary, so `textTokens('त्रिकोण')` was empty. `matchAssetImages()` only offers a downloaded file when it matches the tile's icon or label (hard requirement for `auto/` files), so English-named diagrams such as `LabeledTriangle.svg` and `Right angled triangle.svg` could never be candidates, even though they were already downloaded and are exactly right for those tiles.

**Fixed:** the Marathi→artwork vocabulary in `text.language.ts` now covers geometry (`त्रिकोण`→triangle, `कोन`→angle, `कर्ण`→hypotenuse, `पिथागोरस`→pythagorean/theorem, `बाजू`→side, plus square/rectangle/circle/cube), and the semantic-judge prompt shows that English meaning next to a non-Latin label. Replaying the same storyboard now attaches **3 real diagrams** (`right-angled-triangle`, `triangle-right-circumscribed`) instead of 0, with the rest still glyphs because their labels are caption fragments (`लाडू दीवाळी`, `त्याची खालच्या`), not concepts.

**The model call that used to fail is out of the artwork path.** The old semantic judge asked the script model for a verdict with `num_predict: 120`; on the reasoning build in that environment it came back empty three times and logged `Semantic judge disabled for this run … using deterministic tags from here on` (visible in the GTA job earlier the same day). Artwork is now judged by the vision endpoint (see below), so the script model's empty replies can no longer switch artwork verification off.

**Still open:** the deployed server is running pre-`165287c` code — the job's logged searches are un-compacted (`triangle with labeled hypotenuse`) and there is no `scene searches anchored on …` line, so the restart happened before the artwork work. Rebuild and restart before judging these fixes. Diagram labels for Marathi scenes remain caption fragments (`buildConceptItems`), so most tiles still have no concept for any picture to match.

---

## Two models, two jobs: artwork now verified by a vision endpoint

The install runs two models side by side, and they no longer share work:

- `LLM_*` (default `qwen3-8b-instruct-q4` via node-llama-cpp) writes the script and slides, unchanged;
- `VISION_API_URL` / `VISION_MODEL` looks at artwork. It is the only model that judges whether a downloaded image shows what a scene needs.

`asset.judge.ts` no longer imports `llm.service.ts` at all: the chat judge, its prompt, its 512-token budget and its three-strike disable are removed. `ASSET_VERIFY` is now `auto` (default), `vision` or `tags`; the legacy value `llm` is accepted and mapped to `vision` with a warning. With no vision endpoint configured the pipeline accepts artwork on the file-name rules alone and warns once — it never falls back to the script model. Deterministic rejections (backdrop, no scene term, generic-only file, conflicting subject field) remain final in every mode.

Non-Latin tile labels are glossed before they reach the vision prompt (`कोन (angle)`), so a Marathi label is not an opaque string to the model.

**Verified here with a real vision model.** Local Ollama, `moondream` (1.8B, 1.7 GB), configured through `.env` (`VISION_API_URL=http://127.0.0.1:11434/v1`, `VISION_MODEL=moondream`, `VISION_TIMEOUT_MS=120000`). Two generated test pictures, judged by the compiled `AssetJudge` against a Marathi geometry context (`कोन`, `त्रिकोण`, hypotenuse narration):

- a right-triangle diagram with an angle marker and sides `a, b, c` → `source=vision`, **accepted**: “Vision accepted: it shows triangle …” (29.7 s);
- a graffiti mural on a brick wall, filed as `right-angle-marker-mural-wall-art.png` so the file name passes the rules → `source=vision`, **rejected**: “Vision rejected: it shows something else …” (26.3 s);
- the same two calls repeated from the cache: 5 ms each, same verdicts, no model call.

Moondream is a captioning model: it ignores the JSON request and describes the picture. `captionVerdict()` accepts when that description contains one of the scene's concepts and rejects when it contains none, and the verdict text quotes what the model saw, so the reason is auditable.

**Cost:** 26–30 s per image on this CPU-only box (1.8B model, 3.7 GB RAM). A GPU or a hosted vision endpoint is seconds. Verdicts are cached per model, and `ASSET_MAX_CANDIDATES=4` means a rejected tile can cost up to four audits.

**Not verified:** job `c38e520b` itself could not be re-run — the ngrok server returned HTTP 502 for every report file during this session, so its storyboard and downloaded images were unavailable. The verifier was proven on real photographs/diagrams, not on that job's files.

## The vision server is now the backend's job

The vision model still runs in its own process (`node-llama-cpp` 3.22.3 has no image input), but the backend no longer relies on someone remembering to start it. `packages/backend/src/services/vision.server.ts` runs at launch whenever artwork verification uses a model:

- health-checks `VISION_API_URL` (`GET /api/tags`);
- when nothing answers and `VISION_PROVIDER=ollama`, starts `ollama serve` with `OLLAMA_HOST` taken from that URL, waits up to `VISION_START_TIMEOUT_MS` (45 s) for it to accept requests, and pulls `VISION_MODEL` once if the server does not list it (`VISION_PULL_TIMEOUT_MS`, 10 min);
- stops the server it started on `SIGINT`/`SIGTERM`/exit — a server that was already running is left untouched;
- treats any other provider as external: recorded, never started, never probed at boot;
- on failure logs the exact fix (`install Ollama or set VISION_OLLAMA_BIN to its full path`) and artwork falls back to the file-name rules. `VISION_AUTOSTART=off` keeps manual control, `VISION_OLLAMA_BIN` points at a binary outside `PATH`.

With `VISION_PROVIDER=ollama`, `VISION_API_URL` now defaults to `http://127.0.0.1:11434/v1`, so the only required setting is `VISION_MODEL`.

This uncovered a real crash: on a box without Ollama (`spawn ollama ENOENT` in the Kaggle log) Node emits an async `error` event on the child, and with no listener the whole backend died at launch. The child now has an error listener, the readiness poll aborts immediately, and the failure is logged instead.

**Verified live:**

- existing server at `127.0.0.1:11434` → `ready: true`, `moondream`, nothing spawned;
- `VISION_OLLAMA_BIN=/nonexistent/ollama` → `ready: false` in 565 ms with the install hint, process still alive and exiting 0 — the crash above is gone;
- cold start on a free port with an empty model store (`OLLAMA_MODELS=/tmp/omodels`, port 11435): spawned `ollama serve`, downloaded 1.7 GB, `ready: true` after 501.7 s, and the spawned server was gone after `stop()`.
- 9 unit tests cover the helpers, external provider, already-running server, self-start, autostart off, missing binary and unconfigured endpoint.

**Not verified:** this box still has Ollama installed system-wide, so a machine where the pull happens on every first launch was simulated with a throwaway model store, not a fresh install.

## Verification

Run on 2026-11-26:

- `npm run build -w packages/backend` — exit 0.
- `npm test -w packages/backend` — 133/133 in 17 files.
- Artwork verification through the compiled judge against local Ollama `moondream`: one accept, one reject, both re-run from cache (see above).
- Vision server supervisor: existing server, missing binary, and cold start with a model pull (see above).

Run on 2026-11-25:

- `npm run build` — exit 0 (shared, backend, renderer, frontend).
- `npm test` — backend 125/125 in 15 files; frontend 2/2; renderer `--passWithNoTests`.
- Artwork replay against `output/1c112276…/storyboard.json` (see issue 14): 9 tiles with real artwork, 0 wrong files accepted, all rejections recorded with a reason.
- New regression tests cover: Marathi duplicate title/bubble, Marathi long-caption split, scene-boundary snap, one-word sliver, empty diagrams, invalid icons, unbalanced equations, a planning brief containing an equation, end-card extension, Marathi label wording, cross-language validation, query compaction and part-word anchoring, the vision verdict (accept/reject/cache/no-endpoint fallback/never overriding a deterministic rejection), the legacy `llm` mode mapping, caption-style model replies, and trying the next candidate after a rejection.

**Not verified:** real Marathi model output, TTS pronunciation, and the ffmpeg freeze threshold after the camera change. No headless Chrome or `edge-tts` is available here, and the reviewed jobs run on a remote server; only their HTTP outputs were accessible.

## What looks good

- Devanagari renders correctly in all four sampled frames — no tofu boxes, correct weights, titles and captions fit.
- The paper/board visual language, brand line `ANUPAM CLASSES / FIELD NOTES`, progress bar and instructor are coherent.
- Audio is present and correctly sized (24 kHz mono 16-bit, 0.9 s trailing silence), and both jobs selected `mr-IN-female-1`.
- Job B's end card is localised (`सारांश`, `प्रकाशसंश्लेषण`, Marathi summary), and Job A's uses `पाहिल्याबद्दल धन्यवाद!`.
