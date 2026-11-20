# EduMotion AI

Local AI-powered educational video generator. Enter a topic, get a playable MP4 — no cloud required.

## What it does

1. You enter an educational topic (or paste your own script).
2. A local GGUF language model writes the narration script.
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
| edge-tts | pip install | `pip install edge-tts` |

> **No Ollama required.** The AI model runs directly inside Node via
> [node-llama-cpp](https://github.com/withcatai/node-llama-cpp).
> The GGUF weights are downloaded automatically on first setup.

## Model Storage

Models are stored **outside** the project directory to avoid being accidentally deleted or committed:

```
<parent-of-project>/
└── models/
    └── qwen2.5-7b-instruct-q4/
        └── qwen2.5-7b-instruct-q4_k_m.gguf   (~4.5 GB)
```

The default model is **Qwen 2.5 7B Instruct Q4** from Hugging Face
(`Qwen/Qwen2.5-7B-Instruct-GGUF`). You can change it in `.env`.

To use a custom model, download any GGUF file and set:

```env
LLM_MODEL_NAME=my-model-folder
LLM_MODEL_FILE=my-model.gguf
# Leave LLM_HF_REPO / LLM_HF_FILE blank if you placed the file manually
```

## Setup (first time only)

**Windows:**
```bat
setup.bat
```

**Linux / macOS:**
```bash
chmod +x setup.sh start.sh stop.sh
./setup.sh
```

Both scripts:
1. Check Node.js (≥ 18) and FFmpeg
2. Install npm dependencies
3. Build the shared and backend packages
4. Create output / temp / asset directories
5. Copy `.env.example` → `.env`
6. Download the GGUF model weights into `../models/`

## Start

**Windows:**
```bat
start.bat
```

**Linux / macOS:**
```bash
./start.sh
```

Opens the app at **http://localhost:5173** automatically.  
On Linux/macOS, press **Ctrl+C** to stop all services, or run `./stop.sh` from another terminal.

## Stop

**Windows:**
```bat
stop.bat
```

**Linux / macOS:**
```bash
./stop.sh
```

## Configuration

Edit `.env` to change:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL_NAME` | `qwen2.5-7b-instruct-q4` | Sub-folder name under `../models/` |
| `LLM_HF_REPO` | `Qwen/Qwen2.5-7B-Instruct-GGUF` | HuggingFace repo for auto-download |
| `LLM_HF_FILE` | `qwen2.5-7b-instruct-q4_k_m.gguf` | GGUF filename to download |
| `LLM_CONTEXT_SIZE` | `4096` | Token context window (reduce if low RAM) |
| `LLM_GPU_LAYERS` | `0` | GPU layers to offload (`0` = CPU, `-1` = auto) |
| `LLM_MAX_TOKENS` | `2048` | Max tokens generated per request |
| `MODELS_DIR` | `../models` | Override model storage location |
| `TTS_ENGINE` | `edge-tts` | `edge-tts` or `espeak` |
| `TTS_VOICE` | `en-US-AriaNeural` | Voice name for TTS |
| `PORT` | `3001` | Backend port |

You can also change most settings at runtime from the **Settings** page in the app.

## Usage

### Topic mode
1. Click **Create** → **Generate from Topic**
2. Enter your topic (e.g. "How does photosynthesis work?")
3. Click **Generate Script** — the local LLM generates the narration
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
<parent>/
└── models/
    └── qwen2.5-7b-instruct-q4/   ← GGUF weights (auto-downloaded)

project/
├── packages/
│   ├── shared/     # Shared TypeScript types and Zod schemas
│   ├── backend/    # Express API, SQLite, local LLM, TTS, render queue
│   ├── renderer/   # Remotion composition + 14 animation components
│   └── frontend/   # React + Vite — 8 pages
├── output/videos/     # Generated MP4 files
├── output/audio/      # TTS WAV files
├── output/subtitles/  # SRT and JSON subtitles
├── output/thumbnails/ # Video thumbnails
├── temp/              # Render frames (auto-cleaned)
├── data/              # SQLite database
├── assets/            # Characters, backgrounds, sounds
├── setup.bat / setup.sh
├── start.bat / start.sh
├── stop.bat / stop.sh
└── .env
```

## Component Library

The LLM never executes code — it outputs JSON scene instructions that reference components by name.

| Component | Purpose |
|-----------|---------|
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

**Model download fails during setup**
Run the downloader manually after setup:
```bash
node packages/backend/dist/services/llm.downloader.js
```
Or set `MODELS_DIR` to a path with enough free space (the default Q4 model is ~4.5 GB).

**Script generation is slow**
Set `LLM_GPU_LAYERS=-1` in `.env` to offload all layers to your GPU. Requires a CUDA or Metal-capable GPU.

**Out of memory during generation**
Reduce `LLM_CONTEXT_SIZE` to `2048` in `.env`.

**TTS not working**
Install edge-tts: `pip install edge-tts`. Or install espeak-ng and set `TTS_ENGINE=espeak`.

**FFmpeg not found**
Add FFmpeg to your PATH. Download from https://ffmpeg.org/download.html.

**Video file too small / corrupt**
Check `logs/backend.log` for the render error. Usually a Remotion or FFmpeg issue.

**Out of memory during render**
Reduce `MAX_CONCURRENT_JOBS` to 1 in `.env` (already the default).

**Rendering is slow**
Frames are painted by Chromium on the CPU, so the two levers are parallelism and the GL
backend. `RENDER_CONCURRENCY` defaults to your core count (capped at 8) — going above it
normally makes renders slower. To try the GPU, set `RENDER_GL` to one of `angle`,
`angle-egl`, `egl`, `swiftshader`, `swangle`, `vulkan` (leave it unset for Chrome's default):
```bash
# inside packages/renderer — reports whether Chrome is really hardware accelerated
npx remotion gpu --gl=angle
```
`angle-egl` is the best candidate on a Linux box with a real GPU. Without one, Chrome falls
back to software and the render speed is unchanged, so compare logs before keeping it.

On Kaggle the T4s are visible to CUDA (the LLM uses them) but not to Chrome: the image ships
Mesa's EGL only, with no NVIDIA EGL vendor entry, so `RENDER_GL=angle-egl` stays on the
software path. Check `ls /usr/share/glvnd/egl_vendor.d/` — without a `10_nvidia.json` there
is nothing for ANGLE to accelerate with. `npx remotion gpu` cannot answer this either:
Chrome Headless Shell blocks `chrome://gpu`, so the command fails with `net::ERR_FAILED`.
