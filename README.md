# EduMotion AI

Local AI-powered educational video generator. Enter a topic, get a playable MP4 — no cloud required.

## What it does

1. You enter an educational topic (or paste your own script).
2. A local Ollama AI model writes the narration script.
3. You review and edit the script, then approve it.
4. Local TTS synthesizes the narration audio.
5. Remotion renders animated scenes frame-by-frame.
6. FFmpeg muxes frames and audio into a final MP4.
7. The video is saved locally and immediately downloadable.

## Prerequisites

| Tool | Version | Link |
|------|---------|------|
| Node.js | 18+ | https://nodejs.org |
| FFmpeg | any | https://ffmpeg.org/download.html |
| Ollama | any | https://ollama.com |
| edge-tts | pip install | `pip install edge-tts` |

## Setup (first time only)

```bat
setup.bat
```

This will check prerequisites, install dependencies, pull the AI model, create directories, and create your `.env` file.

## Start

```bat
start.bat
```

Opens the app at **http://localhost:5173** automatically.

## Stop

```bat
stop.bat
```

## Configuration

Edit `.env` to change:

- `OLLAMA_MODEL` — AI model (default: `qwen2.5:7b`)
- `TTS_ENGINE` — `edge-tts` or `espeak`
- `TTS_VOICE` — voice name (default: `en-US-AriaNeural`)
- `PORT` — backend port (default: `3001`)

You can also change settings at runtime from the **Settings** page in the app.

## Usage

### Topic mode
1. Click **Create** → **Generate from Topic**
2. Enter your topic (e.g. "How does photosynthesis work?")
3. Click **Generate Script** — wait for the AI
4. Edit the script if needed, then click **Approve & Continue**
5. Choose duration, aspect ratio, voice, and theme
6. Click **Create Video**
7. Watch the progress bar; download the MP4 when done

### Own Script mode
1. Click **Create** → **Use My Script**
2. Paste your narration text
3. Choose **Preserve** (fix grammar only) or **Improve** (full rewrite)
4. Continue as above from step 4

## Project Structure

```
edumotion/
├── packages/
│   ├── shared/     # Shared TypeScript types and Zod schemas
│   ├── backend/    # Express API, SQLite, Ollama, TTS, render queue
│   ├── renderer/   # Remotion composition + 14 animation components
│   └── frontend/   # React + Vite — 8 pages
├── output/videos/     # Generated MP4 files
├── output/audio/      # TTS WAV files
├── output/subtitles/  # SRT and JSON subtitles
├── output/thumbnails/ # Video thumbnails
├── temp/              # Render frames (auto-cleaned)
├── data/              # SQLite database
├── assets/            # Characters, backgrounds, sounds
├── setup.bat
├── start.bat
├── stop.bat
└── .env
```

## Component Library

All animation is driven by trusted Remotion components. The LLM never executes code — it outputs JSON scene instructions that reference components by name.

| Component | Purpose |
|-----------|--------|
| AnimatedText | Fade/slide/bounce/zoom text |
| AnimatedNumber | Count-up number |
| Character | SVG avatar (idle/wave/point) |
| Teacher | Educational character preset |
| EducationalObject | Book, apple, globe, atom... |
| ObjectGroup | Arrange multiple objects |
| MultiplicationTable | Animated table reveal |
| ImageScene | Full-bleed image with ken-burns |
| BackgroundScene | Gradient / pattern background |
| Subtitle | Auto-synced captions |
| QuestionCard | Interactive Q&A card |
| Confetti | Celebration particle effect |
| EndScreen | End card with CTA |
| ProgressBar | Timeline progress indicator |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Service health check |
| POST | /api/scripts/generate | Generate script from topic |
| POST | /api/scripts/validate | Process own script |
| POST | /api/scripts/rewrite | Rewrite existing script |
| POST | /api/scripts/approve | Approve script for rendering |
| POST | /api/videos/generate | Queue video render job |
| GET | /api/jobs | List all jobs |
| GET | /api/jobs/:id | Get job status and progress |
| POST | /api/jobs/:id/cancel | Cancel a pending/running job |
| GET | /api/videos | List all videos |
| GET | /api/videos/:id/download | Download MP4 |
| DELETE | /api/videos/:id | Delete video |
| GET | /api/settings | Get current settings |
| PATCH | /api/settings | Update settings |

## Troubleshooting

**Ollama not responding** — Run `ollama serve` in a terminal, then retry.

**TTS not working** — Install edge-tts: `pip install edge-tts`. Or install espeak-ng from your package manager.

**FFmpeg not found** — Add FFmpeg to your PATH. Download from https://ffmpeg.org/download.html.

**Video file too small / corrupt** — Check `logs/backend.log` for the render error. Usually a Remotion or FFmpeg issue.

**Out of memory during render** — Reduce `MAX_CONCURRENT_JOBS` to 1 in `.env` (already the default).
