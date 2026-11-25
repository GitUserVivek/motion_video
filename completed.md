# EduMotion AI — Completed State

> Snapshot: **2026-11-25** · Branch `master`
> Every statement below was read from the code in this checkout or measured on this machine.
> Where a claim was not verified here, it says so explicitly.
> This file supersedes the status sections of `project.md` and `progress.md`, which are older
> than the code (see [Stale documents](#12-stale-documents)).

---

## 1. What the system is

A local, offline-first educational video generator: a topic or pasted script becomes a narrated,
animated MP4. Generation runs on a local GGUF model through `node-llama-cpp`; narration runs
through `edge-tts` (or `espeak`); frames are drawn by Remotion; encoding is FFmpeg.

Monorepo (npm workspaces):

| Workspace | Path | Role |
|---|---|---|
| `@edumotion/shared` | `packages/shared` | Types, Zod schemas, constants (palettes, voices, instructors, aspect ratios), shared text metrics |
| `@edumotion/backend` | `packages/backend` | Express API, JSON DB, LLM, TTS, subtitles, storyboard, assets, render worker, QC |
| `@edumotion/renderer` | `packages/renderer` | Remotion composition `EduVideo` + 28 components |
| `@edumotion/frontend` | `packages/frontend` | React + Vite UI, 8 pages, Zustand + React Query |

Entry point of the backend is `packages/backend/src/index.ts`: it logs the running commit/build,
creates the storage directories, runs migrations, mounts the routes, starts the job worker and
preloads the model in the background when the GGUF exists.

---

## 2. End-to-end flow

A request to `POST /api/videos/generate` (only for an **approved** script) inserts a `jobs` row with
`status='pending'`. `render.worker.ts` polls every **2 s**, takes the oldest pending job, and runs
these eight stages (the numbers are the worker's own `[1/8]…[8/8]` log tags):

| # | Stage | What happens | `current_step` | Artifact in `output/<jobId>/` |
|---|---|---|---|---|
| 1 | Audio synthesis | Script → speech. Voice preset id (`en-US-male-1`) resolved to the engine voice (`en-US-GuyNeural`) via `resolveTtsVoice()`. `edge-tts` writes MP3 (+ word-boundary SRT when `--write-subtitles` is supported), FFmpeg converts to WAV `pcm_s16le`, `ffprobe` measures the real duration. Falls back to `espeak-ng`/`espeak`. | `generating_audio` | `audio.wav` |
| 2 | Subtitle alignment | Measured cues are grouped into phrases (≤ **7 words / 48 chars**, per-word timings kept), or estimated from audio length when the engine reports none; overlaps normalised. | `aligning_subtitles` | `subtitles.srt`, `subtitles.json` |
| 3 | Content analysis | The approved narration is analysed (domain, learning objectives, key terms, claims, visual style) and claims are checked against an optional keyless Wikipedia source. Best-effort: research never blocks a job. | `analyzing_content` | `content-analysis.json`, `research.json` |
| 4 | Storyboard planning | Up to **3** LLM attempts (temperature 0.3 → 0.1 → 0.05); each response is JSON-repaired, schema-checked, planned, **directed** and validated. The best parsed attempt is kept even if it only produced warnings. | `planning_storyboard` | `storyboard.json`, `llm/storyboard.json` |
| 4b | User artwork | Images uploaded on the Review Script page are matched per scene and inlined as data URLs. | `analyzing_user_assets` | `user-assets.json` |
| 5 | Scene artwork discovery | Two searches per scene from `assetQueries` → key terms → caption, downloaded from the open-licence providers, then verified and attached per tile. | `discovering_scene_assets` | `assets.json` |
| 6 | Validation | Semantic + structural + layout + subtitle + claim/maths checks. A blocking issue fails the job with `validation_failed` before any expensive render work. | `validating_storyboard` | `validation-report.json`, `subtitle-report.json` |
| 7 | Rendering | Remotion CLI renders a JPEG frame sequence, FFmpeg muxes frames + WAV to H.264/AAC, thumbnail extracted at 1 s. | `rendering` | `video.mp4`, `thumbnail.jpg`, `render-metrics.json` |
| 8 | Quality inspection | `ffprobe` streams/duration/dimensions/fps + FFmpeg `blackdetect`/`freezedetect` + one sampled frame per scene + the editorial layout report. Failure fails the job with `quality_failed`. | `validating` → `saving` | `quality-report.json`, `frames/` |

On success the job becomes `completed` and a `videos` row (`vid-<jobId>`) is written. A thrown stage
re-queues the job up to `MAX_RETRY_COUNT` (default **2**); interrupting the process leaves jobs in
`processing`, which the worker re-queues to `pending` on the next start (`requeued`).
Jobs can be cancelled (`pending|processing`) and resumed (`failed|cancelled`) from the UI.

Job statuses: `pending`, `processing`, `completed`, `failed`, `cancelled`.
Terminal step labels written on failure: `validation_failed`, `quality_failed`, `failed`.

---

## 3. Models

**Text generation (the only model).** Local GGUF through `node-llama-cpp` **3.22.3**.

| Setting | Value (from `config.ts`) |
|---|---|
| Directory | `<repo>/../models` (override `MODELS_DIR`) |
| Model folder | `qwen3-8b-instruct-q4` (`LLM_MODEL_NAME`) |
| Expected file | `qwen3-8b-instruct-q4_k_m.gguf` (`LLM_MODEL_FILE`, else `LLM_HF_FILE`) |
| Download source | `Qwen/Qwen3-8B-GGUF` on Hugging Face (`LLM_HF_REPO`), fetched automatically when the file is missing; a truncated file is detected and reported |
| Context | 4096 tokens (`LLM_CONTEXT_SIZE`) |
| Max tokens per reply | 2048 (`LLM_MAX_TOKENS`) |
| Generation timeout | 180 000 ms (`LLM_TIMEOUT_MS`), ×4 on the CPU fallback |
| GPU layers | `auto` (`LLM_GPU_LAYERS`: `auto`/`-1`, `max`, or a number; `0` = CPU) |
| Source build | off (`LLM_BUILD_FROM_SOURCE`) — needed when the prebuilt CUDA binary wants a newer driver/toolkit |

Behaviour that is implemented and logs its state:

- **Reasoning is rendered off.** The GGUF's own `tokenizer.chat_template` is wrapped with
  `JinjaTemplateChatWrapper({ reasoning: false })`, so Qwen3 answers instead of spending a small
  `num_predict` budget on a ` thinking` block. Log: `[LLM] Reasoning disabled in the chat template`.
  If the template cannot be read, the default wrapper is used and a warning is logged.
- **CUDA graphs disabled on GPU** unless the operator set the variable:
  `GGML_CUDA_DISABLE_GRAPHS=1` is set before `getLlama()` (Turing/sm_75 workaround for garbled logits).
- **Empty vs garbage replies are different failures.** A reply with no visible text is retried once
  and then reported as "no visible text"; only a reply without letters/digits (the broken-kernel
  signature) reloads the model on CPU and doubles the timeout.
- **One chat at a time.** Chats are serialised through a queue, the pooled context sequence is
  `clearHistory()`-ed before each session, and the sequence is always disposed (otherwise the second
  request fails with "No sequences left").
- **Warm-up.** The model is preloaded at boot when the file exists, so the first request does not pay
  the load (or a one-time source build).
- `ollama.service.ts` still exists only as a deprecated alias (`llmService as ollamaService`); Ollama
  is not used.

**Speech.** No neural TTS model is bundled: `edge-tts` (Python CLI) is preferred, `espeak-ng`/`espeak`
is the fallback, and `kokoro` resolves to the edge-tts preference rather than a separate engine.
Voices exposed in the UI (`packages/shared/src/constants.ts`): Emma/US female (Aria), James/US male
(Guy), Sophie/UK female (Sonia), eSpeak English. FFmpeg is required for MP3→WAV and FFprobe for
duration.

**Instructors.** The presenter is a fixed library of four drawn profiles
(`emma`, `james`, `sophie`, `alex`), selected deterministically from the chosen voice — not a
generated model.

**Vision (optional, off by default).** `VISION_PROVIDER=auto` + `VISION_API_URL`/`VISION_API_KEY`/
`VISION_MODEL` would describe uploaded artwork through any OpenAI-compatible endpoint; with no
configuration the deterministic filename/label metadata is used.

> **State of this checkout:** `../models` contains only `qwen2.5-7b-instruct-q4`, i.e. **not** the
> Qwen3 folder the config expects, so a run from this directory would download the ~5 GB Qwen3 GGUF
> first. No LLM generation was executed while writing this file.

---

## 4. Artwork sources (all keyless)

Automatic discovery (`services/asset.discovery.ts`) downloads CC/PD artwork into
`resources/auto/`, where the existing library matcher indexes it for this and every later video.

| Provider | Licence recorded | Notes |
|---|---|---|
| **OpenMoji** | CC BY-SA 4.0 | Colour emoji SVG index, cached 7 days |
| **Wikimedia Commons** | per-file (`LicenseShortName`/`LicenseUrl`/`Artist`) | 640 px thumbnail; 320 px `Special:FilePath` fallback for small originals; original uploads rejected (they are the URLs that 429) |
| **Cleveland Museum of Art** | CC0 1.0 only | `share_license_status === 'CC0'` is enforced; ~900 px web image; artist credited |
| **NASA Image Library** | NASA public domain | public domain; `~small` rendition selected over the tens-of-MB `~orig` (`nasaPreviewUrl()`); mission credit recorded |
| **Iconify** | real set licence from `api.iconify.design/collection` (cached 30 days) | fallback source; colour sets preferred, monochrome sets tinted |

Default order (`ASSET_PROVIDERS`, also the preference order):
`openmoji, wikimedia, cleveland, nasa, iconify`. The search stops at the first confident match
(score ≥ 0.9), so the last entries act as fallbacks rather than multiplying images per scene.

Query construction: the scene's own `assetQueries` → `keyTerms` → words derived from
`visualBrief` + caption; concept lexicon entries are whole-word matched (so `pyramid` no longer
searches for `ram`), and fragments that open with a verb (`touch sides`, `becomes pyramid`) are
dropped. Per scene 2 queries; per job `min(18, max(6, scenes × 2))`.

Reliability features: 8 s request timeout, 3 attempts with bounded backoff + jitter, `Retry-After`
honouring, per-host cooldown after HTTP 429 (Wikimedia is additionally paced at 1 request /
1100 ms), on-disk search cache (`SEARCH_CACHE_VERSION = v6`, 7 days, stale results used when
providers are down), SHA-256 de-duplicated manifest (`data/assets/manifest.json`), sanitised SVGs
(no `<script>`, `on*`, `<foreignObject>`, external `href`), size caps (400 KB SVG / 900 KB raster),
and `resources/auto/CREDITS.txt` regenerated with licence + attribution.

Candidates can be rejected semantically before use (`asset.verify.ts`, optional local-model judge
`asset.judge.ts`, `ASSET_VERIFY=auto|llm|tags`, cache `data/assets/verify-cache.json`): a spacecraft
called "Mars Cube One" cannot illustrate a shape.

**Verified this session (live network):** OpenMoji/Wikimedia logic is unit-tested; Cleveland and NASA
were probed end to end and downloaded real files —
`zhao-mengfu-writing-the-heart-…jpg` (118 560 B, CC0, "Qiu Ying (Chinese, 1494–1552)") and
`weighing-in-on-the-dumbbell-nebula-…jpg` (54 457 B), `luxor-egypt-…jpg` (83 924 B), both NASA
public domain with mission credits.

**Deliberately not used:** Openverse (measured 15 399–23 587 ms on all four queries tried — always
past the 8 s asset timeout, so it could never answer), Art Institute of Chicago (Cloudflare challenge
to server-side requests), unDraw/LottieFiles (no public search API; scraping is not acceptable).

---

## 5. Storyboard, direction and layout

- **Planning** (`storyboard.service.ts` + `prompts/storyboard.prompt.ts`): the prompt receives the
  content analysis and requires per scene `purpose`, `visualBrief`, `keyTerms`, `assetQueries`,
  `animationIntent`, `transition`. Repair passes (`storyboard.repair.ts`, `json.repair.ts`) fill only
  missing/invalid props and now **preserve the plan** (`purpose`, `visualBrief`, `keyTerms`,
  `assetQueries`, `animationIntent`, `transition`); a missing `visualBrief` is derived and counted as
  "enriched" separately from real repairs.
- **Direction** (`scene.director.ts`, deterministic, after the model): one palette per scene from
  `pickScenePalette()` (8 palettes, topic affinity, neighbours never repeat), rotating pattern and
  camera move, semantic heading (model title → visual brief → purpose + key terms → omit), duplicate
  title/bubble/caption removal, intent-driven composition (`summary` → `SummaryScene`,
  `comparison`/`data` → `ComparisonChart`/`SplitScreenComparison`, `timeline` → `Timeline`,
  `process` → `ProcessFlow`, `definition` → `AnnotatedCallout`, `hook` → `SpeechBubble`), presenter
  selection, and a guaranteed `EndScreen` on the final scene. Every change is logged
  (`directed N change(s) — …`).
- **Typography rules:** a heading is a short idea, never narration cut mid-sentence, and **no visible
  text ends in an ellipsis** — the previous `shorten()` helpers and the
  `extractKeyPhrase` `substring(0, 37) + '...'` were removed; cards wrap and shrink instead.
- **Timing contract:** `scene.startFrame/endFrame` are absolute video frames; a child's
  `startFrame` is **relative to its scene**. `timing.service.ts` repairs legacy absolute child frames
  and records both values in `timing-report.json`; `EduVideo.tsx` adds the scene offset exactly once.
- **Layout validation** (`layout.validation.ts`) runs before rendering and again in the QC report:
  duplicate text between title/bubble/caption, box overlap, out-of-frame children, clustered manual
  diagrams, truncated/dangling titles, empty diagrams, artwork without `imageAlt`, presenter on the
  closing card. Font fitting uses the same shared `text-metrics.ts` as the renderer.

---

## 6. Rendering and hardware

- Frames: Remotion CLI (`remotion 4.0.545`) is spawned with the current Node binary
  (`resolveRemotionCli`), entry `packages/renderer/src/root.tsx`, composition `EduVideo`,
  `--sequence --image-format jpeg --jpeg-quality 92`, `--props temp/<jobId>/props.json`.
- Frames land in `temp/<jobId>/frames/`; a failed CLI run keeps its full log at
  `temp/<jobId>.remotion.log` and surfaces the first real error line.
- Mux: `h264_nvenc` when NVENC is available and the profile is not CPU, otherwise `libx264`, adding
  the WAV narration; metrics (`fps`, frame/mux time, profile, output size) go to
  `render-metrics.json`.
- `hardware.service.ts` detects NVIDIA GPUs (`nvidia-smi`), NVENC (`ffmpeg -encoders`) and picks
  profile `cpu|gpu|dual-gpu`, concurrency (CPU count minus one, halved for dual-GPU),
  GL backend (`angle-egl` on a usable GPU), `useNvenc` and `chunkCount`. `RENDER_CONCURRENCY`,
  `RENDER_GL`, `RENDER_PROFILE`, `RENDER_DUAL_GPU`, `RENDER_NVENC` override detection. The
  experimental dual-GPU chunked frame render falls back to the single pass on any error.
- Live progress: frame count is parsed from Remotion output with a frames-on-disk fallback every 2 s;
  each finished scene is logged and written to `scenes_completed/scenes_total` for the UI.
- Aspect ratios: 9:16 → 1080×1920, 16:9 → 1920×1080, 1:1 → 1080×1080. Duration options 40/60/90 s,
  FPS default 30.

---

## 7. Storage, artifacts and resources

One folder per job (`services/job.files.ts`, which rejects any job id that could escape `output/`):

```
output/<jobId>/
├── video.mp4              thumbnail.jpg          audio.wav
├── subtitles.srt          subtitles.json
├── storyboard.json        llm/storyboard.json
├── content-analysis.json  research.json
├── assets.json            user-assets.json
├── timing-report.json     subtitle-report.json
├── validation-report.json quality-report.json
├── render-metrics.json    frames/
```

`llm/storyboard.json` keeps the exact system + user prompt, every attempt's raw reply, whether it
parsed / was repaired / passed, its relevance score, and which attempt was chosen.

| Path | Contents | Git |
|---|---|---|
| `resources/` | artwork library; `auto/` = downloaded files + `CREDITS.txt`; `icons/`, `images/` created at boot | tracked (auto assets are normal files) |
| `assets/` | `characters/`, `backgrounds/`, `animations/`, `sounds/` — brand SVGs and media | tracked, except `assets/sounds/` |
| `data/db/` | the JSON database (`<table>.json`) | ignored |
| `data/assets/` | search cache, manifest, verify cache | ignored |
| `data/research/`, `data/user-assets/`, `data/projects/` | research cache, uploaded images, project data | ignored |
| `temp/<jobId>/` | frame sequence + props, Remotion logs | ignored |
| `logs/` | `backend.log`, `frontend.log` written by `start.sh` | ignored |
| `.pids/` | backend/frontend PIDs written by `start.sh` | not in `.gitignore` |

`/output` and `/api/output` are served as a browsable index (breadcrumbs, sizes, mtimes, inline
preview, streaming with range requests, forced-download links). Percent-encoded traversal and
symlinks escaping the output tree are rejected.

**Database:** it is a hand-written **JSON store**, not SQLite — `db.ts` implements
`prepare().run/get/all`, `transaction` and `exec` over `data/db/<table>.json`. Tables
(migrations.ts): `projects`, `scripts`, `jobs`, `scenes`, `videos`, `script_assets`, `settings`.
`jobs` gained `scenes_completed`, `scenes_total`, `assets_json` through explicit `ALTER` checks.
Known limitation, documented in code: `SELECT` does not honour column aliases.
`data/db/` is empty in this checkout (no jobs have run here).

**Legacy leftovers on disk:** `output/` still contains the old type-based folders (`videos/`,
`audio/`, `subtitles/`, `thumbnails/`, `test_video_id/`) from before the per-job layout. They are
gitignored and no longer written.

---

## 8. API surface (verified from `routes/`)

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Health + service availability |
| `POST /api/scripts/generate` | Generate a script from a topic |
| `POST /api/scripts/validate` | Validate (or `improve`) a pasted script |
| `POST /api/scripts/rewrite` | Rewrite a stored script (`preserve`/`improve`) |
| `POST /api/scripts/approve` | Approve a script (optionally with edited content) → unlocks generation |
| `GET/POST /api/scripts/:scriptId/assets` | List / upload Review-Script images (PNG, JPEG, WebP; 25 MB JSON body limit) |
| `DELETE /api/scripts/:scriptId/assets/:assetId` | Remove an uploaded image |
| `GET /api/scripts/assets/:assetId/preview` | Preview an uploaded image |
| `POST /api/videos/generate` | Queue a job (approved script only) → `202 { jobId }` |
| `GET /api/videos` | Video library with download/thumbnail URLs |
| `GET /api/videos/:videoId/stream` · `/download` · `/thumbnail` | Playback, download, poster |
| `DELETE /api/videos/:videoId` | Delete a video |
| `GET /api/jobs`, `GET /api/jobs/:jobId` | Job list / poll (2 s) |
| `GET /api/jobs/:jobId/assets` | Per-tile artwork report with preview URLs |
| `POST /api/jobs/:jobId/cancel` · `/resume` | Cancel / re-queue |
| `GET /api/settings`, `PATCH /api/settings` | Read / update runtime settings (DB-backed, flat key→value body) |
| `GET /api/assets/*` | Read-only artwork previews (images only) |
| `GET /output`, `GET /api/output/*` | Browsable artifact index |

The job poll response deliberately omits the artwork report (it can hold hundreds of URLs and changes
once per job): it carries `assetsAvailable`, and the report is fetched once from
`/api/jobs/:jobId/assets`.

---

## 9. Frontend

React 18.3 + Vite 5.4 + React Router 6 + Zustand + React Query, eight pages:
`/` Dashboard, `/create` CreateInput, `/script` ScriptEditor, `/configure` VideoConfig,
`/render` RenderProgress (live steps, scene counter, per-tile artwork previews, cancel/resume),
`/preview` VideoPreview, `/history` History (resume/delete), `/settings` Settings
(llm/TTS/voices/health), plus a NotFound page. `start.sh` serves it on **5173** and proxies
`VITE_BACKEND_URL` (default `http://localhost:3001`).

---

## 10. Renderer components (28)

`ComponentNameSchema` (`packages/shared/src/schemas/storyboard.schema.ts`) and `COMPONENT_MAP` in
`EduVideo.tsx` agree on the same 28 names:

`AnimatedText`, `AnimatedNumber`, `Character`, `Teacher`, `EducationalObject`, `ObjectGroup`,
`ConceptDiagram`, `MultiplicationTable`, `ImageScene`, `BackgroundScene`, `Subtitle`, `QuestionCard`,
`Confetti`, `EndScreen`, `ProgressBar`, `SplitScreenComparison`, `ProcessFlow`, `Timeline`,
`HighlightedRegion`, `NumberCounter`, `AnimatedDiagram`, `KineticTypography`, `ObjectZoom`,
`Callout`, `SpeechBubble`, `AnnotatedCallout`, `ComparisonChart`, `SummaryScene`.

Every JSON prop passes `utils/sanitize.ts` before rendering (data-URL images only, known palettes and
object types only, numeric ranges, per-component limits such as ≤3 callout points, ≤4 chart bars,
≤5 recap rows), so a malformed prop drops that child instead of breaking the render.
Note: `COMPONENT_NAMES` in `constants.ts` is not used by the pipeline and still lists only the 14
base components; the authoritative list is the schema + `COMPONENT_MAP`.

---

## 11. Configuration (env vars accepted by `config.ts`)

`PORT` (3001), `NODE_ENV`, `MODELS_DIR`, `LLM_MODEL_NAME`, `LLM_MODEL_FILE`, `LLM_HF_REPO`,
`LLM_HF_FILE`, `LLM_CONTEXT_SIZE`, `LLM_GPU_LAYERS`, `LLM_BUILD_FROM_SOURCE`, `LLM_MAX_TOKENS`,
`LLM_TIMEOUT_MS`, `GGML_CUDA_DISABLE_GRAPHS` (set automatically; unset it to opt back in),
`VISION_PROVIDER|API_URL|API_KEY|MODEL|TIMEOUT_MS`, `TTS_ENGINE`, `TTS_VOICE`
(`edge-tts` default, `en-US-AriaNeural` default), `ASSET_DISCOVERY`, `ASSET_PROVIDERS`,
`ASSET_MAX_QUERIES` (18), `ASSET_TIMEOUT_MS` (8000), `ASSET_VERIFY`, `RESEARCH_PROVIDER` (wikipedia),
`RESEARCH_TIMEOUT_MS`, `RESEARCH_MAX_SOURCES`, `RENDER_FPS` (30), `RENDER_PROFILE`, `RENDER_GL`,
`RENDER_CONCURRENCY`, `RENDER_DUAL_GPU`, `RENDER_NVENC`, `MAX_CONCURRENT_JOBS`, `MAX_RETRY_COUNT`.

Values come from `.env` through `node --env-file-if-exists=.env` in `start.sh`. There is no
`.env.example` in the repository, so the defaults above are the documented baseline.
`start.sh` also exports the CUDA build environment (`CUDACXX`, `CUDA_PATH`,
`NODE_LLAMA_CPP_CMAKE_OPTION_GGML_CUDA_NO_VMM=ON`) so a source build of llama.cpp can reuse its cache;
it always rebuilds the backend first, then starts backend (3001) and frontend (5173) and writes PIDs
to `.pids/`.

---

## 12. Stale documents

These exist and are readable, but their status numbers/sections predate the code:

- `project.md` — claims SQLite/better-sqlite3 (the DB is the JSON store), "22 components" (there are
  28), "85 % complete", and lists audio sync / word timing / quality checks as pending, although
  measured durations, word-level captions and post-render QC are implemented.
- `progress.md` — accurate for the 2026-11-23 upgrade, but its counts (61 tests) and asset-provider
  list (3 providers) are out of date.
- `dev.md`, `issues.md`, `resolve.md`, `e2e/VERIFICATION.md`, `improve.md`, `README.md`,
  `resources/README.md` — historical plans/notes; `improve.md` is the place for minor design polish.

Use **this file** for the current state.

---

## 13. Checks actually run (this session, this machine)

| Check | Result |
|---|---|
| `npm run build:backend` (tsup + `tsc`) | **exit 0** |
| `npm test` at the repo root | **exit 0** |
| `packages/shared` — `schemas.test.ts` | 1 file, **15 tests passed** |
| `packages/backend` — 13 files (`asset-judge`, `assets`, `content`, `editorial`, `hardware`, `health`, `jobs`, `pipeline.integration`, `storyboard.repair`, `subtitles`, `timing`, `user-assets`, `validation`) | **96 tests passed** |
| `packages/renderer` | no test files (`--passWithNoTests`, exit 0) |
| `packages/frontend` — `pages.test.tsx` | 1 file, **2 tests passed** |
| Live artwork probe: `ASSET_PROVIDERS=cleveland,nasa` | downloaded and persisted 3 real files with licences/credits, then the probe and its caches were removed |
| Live provider latency: Openverse search | 15 399–23 587 ms per cold query → dropped (see §4) |

**Not verified here** (no suitable environment in this sandbox): an actual LLM reply (the expected
Qwen3 GGUF is not under `../models`), TTS synthesis, a Remotion render, FFmpeg/FFprobe QC, and
therefore **no end-to-end MP4 from the current code**. The last real render evidence is the
`geometry-editorial.mp4` job from before these changes, and the Kaggle run whose log exposed the
empty-LLM-reply bug.

To verify on the GPU box, the log should show, in order:
`[LLM] Reasoning disabled in the chat template`, `[LLM] CUDA graphs disabled`, no
`(0 chars, start "")`, no `reloading the model on CPU`, `[Assets] … downloaded`, `[Validation] …
passed`, `[Render] … fps`, `[Quality] … -> quality-report.json`, and finally
`Job … completed 🎉` with `output/<jobId>/video.mp4`.

---

## 14. Fixes that landed in this working session (2026-11-25, commit `1bc0844`)

1. **Asset sources:** added Cleveland Museum of Art (CC0) and NASA (public domain) providers with
   `PROVIDER_WEIGHT`, per-provider parsing, licence/credit records, and `nasaPreviewUrl()` tests;
   documented why Openverse and Art Institute were rejected.
2. **No ellipsis in visible text:** removed `shorten()` from `scene.director.ts` and
   `storyboard.visuals.ts`, removed `extractKeyPhrase`'s `substring(0, 37) + '...'`, and replaced the
   end-screen `narration.slice(0, 60)`. Clauses, labels, headings, chart/timeline titles and the hook
   question now stay complete. A regression test walks every painted string of a directed storyboard
   across 5 purposes × 4 narrations and asserts none ends in `…`/`...`.
3. **LLM reliability:** reasoning disabled in the template, empty vs garbage classification, CPU
   reload only for garbage, serialized chats with `clearHistory()`, CPU timeout ×4, CUDA graphs off on
   GPU.
4. **Asset queries:** whole-word concept matching, `isUsableQuery()` fragment filter, explicit
   queries → key terms → caption ordering.
5. **Repair keeps the plan:** planning fields survive `repairStoryboard()`, and a missing
   `visualBrief` is derived and reported separately.
6. **Renderer data is tracked:** `.gitignore` now ignores `/data/` but not
   `packages/renderer/src/data/`; `currentVideo.ts` is committed, which fixes
   `Can't resolve './data/currentVideo.js'` during a Remotion render.

---

## 15. Honest gaps

- **No end-to-end render on the current code.** Every stage after the LLM is exercised by unit and
  integration tests with a fake model, but a real MP4 from this build is still the missing proof.
- **Local model mismatch:** `../models` holds `qwen2.5-7b-instruct-q4` while the config expects the
  Qwen3 folder; the downloader would fetch ~5 GB on first use.
- **Settings default drift:** the seeded `settings.llm_model_name` row still says
  `qwen2.5-7b-instruct-q4`, which no longer matches `config.localLlm.modelName`.
- **`COMPONENT_NAMES` (constants) lists 14 of 28 components** even though the schema and renderer
  support all 28.
- **Legacy `output/` folders** from the old per-type layout are still present (ignored by git).
- **Dual-GPU chunked rendering** is opt-in and unproven on a real two-GPU box; it falls back safely.
- **Provider coverage is fallback-shaped:** early stopping at the first confident match means the
  newer sources usually only run when OpenMoji/Wikimedia have no good hit.
