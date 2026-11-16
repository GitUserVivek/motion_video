# EduMotion AI — Development Plan

> Local AI-Powered Educational Video Generator  
> Target: 40-second 1080×1920 educational MP4 from topic or user script  
> Stack: React + Vite + TS · Node/Express · Ollama · Remotion · FFmpeg · SQLite

---

## Monorepo Layout

```
edumotion/
├── packages/
│   ├── shared/          # Types, Zod schemas, constants (shared between FE and BE)
│   ├── backend/         # Express API, SQLite, Ollama, TTS, job queue, FFmpeg
│   ├── renderer/        # Remotion composition + all 14 reusable components
│   └── frontend/        # React + Vite + TS — 8 pages
├── assets/
│   ├── characters/
│   ├── backgrounds/
│   ├── animations/
│   └── sounds/
├── data/
│   └── projects/
├── output/
│   ├── videos/
│   ├── audio/
│   ├── subtitles/
│   └── thumbnails/
├── temp/
├── setup.bat
├── start.bat
├── stop.bat
├── README.md
├── dev.md
└── progress.md
```

---

## Phase 1 — Project Scaffold & Shared Types

**Goal:** Working monorepo with shared TypeScript types, Zod schemas, and all config files.

### Tasks
- [ ] Root `package.json` (npm workspaces monorepo)
- [ ] `packages/shared/` — all shared types and Zod schemas
  - `types/index.ts` — Project, Script, Job, Scene, Video, Settings
  - `schemas/scene.schema.ts` — Zod scene instruction schema
  - `schemas/job.schema.ts`
  - `schemas/script.schema.ts`
  - `constants.ts` — aspect ratios, durations, voices, themes
- [ ] `packages/backend/tsconfig.json`, `package.json`
- [ ] `packages/frontend/tsconfig.json`, `package.json`, `vite.config.ts`
- [ ] `packages/renderer/tsconfig.json`, `package.json`
- [ ] Root `tsconfig.base.json`
- [ ] `.gitignore`, `.eslintrc`, `.prettierrc`
- [ ] Directory scaffold (assets/, data/, output/, temp/)

### Shared Types
```ts
Project, Script, Job, Scene, Video, Settings
VideoConfig, AspectRatio, AnimationTheme
SceneInstruction, StoryboardPlan, SubtitleEntry
JobStatus, ScriptMode, TtsEngine
```

---

## Phase 2 — Backend Core

**Goal:** Express server with SQLite, Ollama client, and all API route handlers wired up.

### Tasks
- [ ] `packages/backend/src/index.ts` — Express app bootstrap
- [ ] `packages/backend/src/db/` — SQLite setup via `better-sqlite3`
  - `schema.sql` — projects, scripts, jobs, scenes, videos, settings tables
  - `db.ts` — singleton connection
  - `migrations.ts` — run on startup
- [ ] `packages/backend/src/services/ollama.service.ts` — chat completion with retry
- [ ] `packages/backend/src/routes/health.ts`
- [ ] `packages/backend/src/routes/scripts.ts` (stubs, full logic in Phase 3)
- [ ] `packages/backend/src/routes/videos.ts`
- [ ] `packages/backend/src/routes/jobs.ts`
- [ ] `packages/backend/src/routes/settings.ts`
- [ ] `packages/backend/src/middleware/` — error handler, request logger
- [ ] `packages/backend/src/config.ts` — env-driven config

### Database Schema
```sql
projects (id, title, created_at, updated_at)
scripts  (id, project_id, mode, content, status, created_at)
jobs     (id, project_id, status, progress, error, created_at, updated_at)
scenes   (id, job_id, index, instruction_json)
videos   (id, job_id, file_path, duration, size_bytes, created_at)
settings (key, value)
```

### API Surface
```
GET  /api/health
POST /api/scripts/generate
POST /api/scripts/validate
POST /api/scripts/rewrite
POST /api/videos/generate
GET  /api/jobs
GET  /api/jobs/:jobId
POST /api/jobs/:jobId/cancel
GET  /api/videos
GET  /api/videos/:videoId/download
DELETE /api/videos/:videoId
GET  /api/settings
```

---

## Phase 3 — Script Workflows

**Goal:** Topic-to-script and own-script modes fully working end-to-end with Ollama.

### Tasks
- [ ] `packages/backend/src/services/script.service.ts`
  - `generateFromTopic(topic, config)` — calls Ollama, returns structured script
  - `validateScript(content)` — checks grammar, structure
  - `rewriteScript(content, mode)` — improve or preserve
- [ ] Prompt templates in `packages/backend/src/prompts/`
  - `script-generate.prompt.ts`
  - `script-validate.prompt.ts`
  - `script-rewrite.prompt.ts`
- [ ] Script response parser — strips markdown, validates JSON envelope
- [ ] Integration test for all three endpoints

---

## Phase 4 — Remotion Component Library

**Goal:** All 14 reusable Remotion components + animation utilities, type-safe, driven by scene JSON.

### Components
| Component | Description |
|---|---|
| `AnimatedText` | Fade/slide/bounce text with configurable timing |
| `AnimatedNumber` | Count-up number with easing |
| `Character` | SVG avatar with wave/point/idle states |
| `Teacher` | Specialist character preset (extends Character) |
| `EducationalObject` | Generic illustrative object (book, apple, etc.) |
| `ObjectGroup` | Layout container for multiple objects |
| `MultiplicationTable` | Animated grid reveal |
| `ImageScene` | Full-bleed image with ken-burns |
| `BackgroundScene` | Gradient / pattern / solid background |
| `Subtitle` | Lower-third captioning synced to audio |
| `QuestionCard` | Animated question reveal card |
| `Confetti` | Particle celebration effect |
| `EndScreen` | CTA / end card |
| `ProgressBar` | Timeline / lesson progress indicator |

### Animation Utilities (`packages/renderer/src/utils/animation.ts`)
- `fadeIn(frame, start, duration)`
- `slideIn(frame, direction, start, duration)`
- `bounce(frame, start, duration)`
- `zoomIn(frame, start, duration)`
- `rotate(frame, start, duration, degrees)`
- `pop(frame, start)`
- `countUp(frame, start, duration, target)`
- `easeInOut(t)`

### Composition (`packages/renderer/src/compositions/EduVideo.tsx`)
- Reads scene JSON from props
- Renders each scene at correct frame offset
- Mixes audio track

---

## Phase 5 — TTS & Audio Alignment

**Goal:** Generate narration audio locally, detect exact duration, generate subtitle timecodes.

### TTS Engines (in preference order)
1. **Kokoro** (onnxruntime-node) — best quality offline
2. **edge-tts** (node subprocess) — good quality, requires network first run only
3. **espeak-ng** (system binary fallback)

### Tasks
- [ ] `packages/backend/src/services/tts.service.ts`
  - `synthesize(text, voice, outputPath)` — returns WAV path
  - `detectDuration(audioPath)` — ffprobe JSON parser
  - `selectEngine()` — auto-detect available engine
- [ ] `packages/backend/src/services/subtitle.service.ts`
  - `generateSubtitles(script, audioDuration)` — word-timed SRT + JSON
  - `alignToScenes(subtitles, scenes)` — distribute entries across scene slots
- [ ] Audio output saved to `output/audio/<jobId>.wav`
- [ ] Subtitles saved to `output/subtitles/<jobId>.srt` and `.json`

---

## Phase 6 — Storyboard & Scene JSON

**Goal:** Convert approved script into a validated JSON storyboard driving Remotion.

### Tasks
- [ ] `packages/backend/src/services/storyboard.service.ts`
  - `planStoryboard(script, config)` — calls Ollama with structured output prompt
  - `validateScenes(scenes)` — Zod validation
  - `distributeTimeline(scenes, audioDuration)` — assign frame ranges
- [ ] Zod schemas in `packages/shared/src/schemas/scene.schema.ts`
  - `SceneInstructionSchema` — component name, props, timing
  - `StoryboardSchema` — array of scenes with metadata
- [ ] Prompt template `packages/backend/src/prompts/storyboard.prompt.ts`
- [ ] Scenes saved to `scenes` table per job

### Scene JSON Shape
```json
{
  "scenes": [
    {
      "id": "scene-1",
      "startFrame": 0,
      "endFrame": 90,
      "component": "BackgroundScene",
      "props": { "color": "#1a1a2e" },
      "children": [
        {
          "component": "AnimatedText",
          "props": { "text": "What is photosynthesis?", "animation": "fadeIn", "startFrame": 10 }
        },
        {
          "component": "Subtitle",
          "props": { "entries": [...] }
        }
      ]
    }
  ]
}
```

---

## Phase 7 — Rendering Worker & FFmpeg

**Goal:** Persistent job queue renders Remotion to PNG sequence, FFmpeg muxes to MP4.

### Tasks
- [ ] `packages/backend/src/workers/render.worker.ts`
  - SQLite-backed job queue (poll interval 2s)
  - Max 1 concurrent render job
  - Progress reporting (0–100 persisted to DB)
  - Cancellation via `jobs.status = 'cancelled'`
  - Auto-retry on transient failure (max 2 retries)
- [ ] `packages/backend/src/services/render.service.ts`
  - `renderComposition(jobId, sceneJson, audioPath)` — calls `@remotion/renderer`
  - `muxVideo(framesDir, audioPath, outputPath, fps, duration)` — FFmpeg subprocess
  - `validateOutput(outputPath)` — ffprobe file check
  - `cleanupTemp(jobId)` — delete temp frames after success
- [ ] Temp frames written to `temp/<jobId>/frames/`
- [ ] Final MP4 written to `output/videos/<jobId>.mp4`
- [ ] Thumbnail extracted at frame 1s → `output/thumbnails/<jobId>.jpg`

### FFmpeg Command
```bash
ffmpeg -framerate 30 -i temp/{jobId}/frames/frame%06d.png \
       -i output/audio/{jobId}.wav \
       -c:v libx264 -crf 23 -preset fast \
       -c:a aac -b:a 128k \
       -pix_fmt yuv420p \
       -movflags +faststart \
       output/videos/{jobId}.mp4
```

---

## Phase 8 — Frontend

**Goal:** All 8 pages implemented, fully typed, with real-time progress and state management.

### Pages
| Route | Page | Description |
|---|---|---|
| `/` | Dashboard | Recent videos, quick-start cards, service health |
| `/create` | Input | Topic mode vs Own Script mode toggle |
| `/script` | Script Editor | Editable textarea, regenerate, approve |
| `/configure` | Video Config | Duration, ratio, voice, theme, toggles |
| `/render` | Progress | Live progress bar, log stream, cancel button |
| `/preview` | Video Preview | Player, download button, file path |
| `/history` | History | List of all generated videos with actions |
| `/settings` | Settings | Ollama model, TTS engine, paths |

### State Management
- Zustand store: `useProjectStore` — current project, script, config, jobId
- React Query: server state — jobs, videos, health polling
- WebSocket or SSE for live job progress from backend

### Key Components
- `ScriptEditor` — `<textarea>` with word count, character limit feedback
- `VideoConfigForm` — controlled form with Zod validation
- `ProgressTracker` — animated progress bar + step labels
- `VideoPlayer` — native `<video>` with download link
- `HistoryTable` — sortable, filterable video list

---

## Phase 9 — Storage & Downloads

**Goal:** Reliable local file serving, video metadata in DB, never overwrite existing files.

### Tasks
- [ ] `packages/backend/src/services/storage.service.ts`
  - `saveVideo(jobId, sourcePath)` — copy to `output/videos/`, register in DB
  - `getVideoPath(videoId)` — resolve absolute path
  - `generateDownloadUrl(videoId)` — signed local URL with expiry
  - `deleteVideo(videoId)` — delete file + DB row
  - `listVideos()` — paginated list from DB
- [ ] Static file serving via Express: `GET /api/videos/:videoId/download`
  - Streams file with correct `Content-Disposition` header
  - Returns 404 if file missing from disk
- [ ] File naming: `<jobId>-<timestamp>.mp4` (never collision)
- [ ] DB `videos` table updated with `file_path`, `size_bytes`, `duration`

---

## Phase 10 — Setup & Start Scripts

**Goal:** One-time `setup.bat` and daily-use `start.bat` / `stop.bat`.

### setup.bat checks
1. Node.js ≥ 18
2. FFmpeg on PATH
3. Ollama installed and running
4. Pull model: `ollama pull qwen2.5:7b`
5. npm install (all workspaces)
6. Build shared and renderer packages
7. Initialize SQLite DB
8. Create all directories
9. Test render (1-second Remotion smoke test)
10. Write `.env` with defaults

### start.bat flow
1. Check Ollama running → start if not
2. `node packages/backend/dist/index.js` (background)
3. `vite packages/frontend` (background)
4. Poll `GET /api/health` until 200
5. Open browser to `http://localhost:5173`

### stop.bat flow
1. Find and kill backend PID
2. Find and kill frontend PID
3. Print "Services stopped"

---

## Phase 11 — Tests & Verification

**Goal:** Type-check clean, lint clean, unit tests pass, end-to-end video generated.

### Test Coverage
- `packages/shared/` — Zod schema parse/reject tests
- `packages/backend/` — route handler unit tests (mocked DB + Ollama)
  - Script generate, validate, rewrite
  - Job create, poll, cancel
  - Video download, delete
- `packages/renderer/` — component render smoke tests (Remotion `renderMedia` with 1 frame)
- `packages/frontend/` — Vitest + Testing Library for each page

### End-to-End Checklist
- [ ] Topic-based 40s video generated successfully
- [ ] Own-script-based 40s video generated successfully
- [ ] Download URL returns real MP4 (not placeholder)
- [ ] App restart: history preserved, download still works
- [ ] Cancel job mid-render: temp files cleaned up
- [ ] Invalid topic: graceful error, no crash

---

## Engineering Constraints

| Constraint | Decision |
|---|---|
| AI execution | LLM never executes JS/React; outputs structured JSON only |
| Component safety | Only library components used; AI-suggested components require approval workflow |
| Concurrency | Max 1 render job at a time; queued jobs run FIFO |
| File safety | UUID-based filenames; never overwrite; delete only on user request |
| Offline | All AI, TTS, rendering, storage runs locally after initial pull |
| Error handling | Every async path has try/catch; errors persisted to job record |
| RAM guard | Check available RAM before rendering; warn user if < 4 GB free |

---

## Model Selection

| Use | Model | Fallback |
|---|---|---|
| Script generation | `qwen2.5:7b` | `llama3.2:3b` |
| Storyboard planning | `qwen2.5:7b` | `llama3.2:3b` |
| Grammar rewrite | `qwen2.5:7b` | `llama3.2:3b` |

TTS: Kokoro → edge-tts → espeak-ng (auto-detected at runtime)
