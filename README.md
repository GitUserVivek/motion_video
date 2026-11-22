# EduMotion AI — Professional Educational Video Generator

> **🎉 Version 2.0 - Enhanced Edition**
> Local AI-powered educational video generator. Enter a topic, get a **professional** playable MP4 — no cloud required.

---

## 🚀 What's New in Version 2.0

**EduMotion AI 2.0** is a **major upgrade** that transforms the system from a basic video generator to a **professional educational explainer platform**!

### ✅ Key Improvements
- **🎯 Professional Scripts**: Hooks, examples, progressive explanations, WHY/HOW focus
- **🎨 Intelligent Visuals**: Topic-specific asset matching with semantic understanding
- **📚 Enhanced Components**: 22 components (was 14) for diverse scene layouts
- **🎬 Better Storyboarding**: Visual planning stage with topic awareness
- **🔍 Quality Validation**: Comprehensive scene and storyboard validation
- **🚀 Model Upgrade**: Qwen3 8B (was Qwen2.5 7B) for better JSON output

**Status**: 🟡 **85% COMPLETE** - See [progress.md](progress.md) for details

---

## 📋 What It Does

1. **You enter an educational topic** (or paste your own script)
2. **AI generates a professional script** with:
   - Engaging hook (question, surprising fact, misconception)
   - Progressive explanation (simple → complex)
   - Real-world examples and analogies
   - WHY and HOW explanations
3. **You review and edit** the script, then approve it
4. **Local TTS synthesizes** the narration audio
5. **Intelligent storyboard planner** creates scene-by-scene visual strategy
6. **Remotion renders** animated scenes frame-by-frame with:
   - Topic-specific visuals
   - Diverse layouts
   - Professional animations
7. **FFmpeg muxes** frames and audio into a final MP4
8. **The video is saved locally** and immediately downloadable

---

## 🎯 Example Output

### Before (Version 1.0)
```
Plants use sunlight to make food. This is called photosynthesis.
```
- Generic script
- Tiny icon in center
- Same layout every scene

### After (Version 2.0)
```
Have you ever wondered how plants never seem to run out of food?
They make it themselves using a process called photosynthesis.
Imagine a tiny factory inside each leaf, capturing sunlight and turning it into energy.
Using just sunlight, water, and carbon dioxide, plants create sugar to feed themselves.
This happens in special structures called chloroplasts that contain a green pigment called chlorophyll.
As a byproduct, plants release oxygen into the air — the very oxygen we breathe.
Without photosynthesis, life on Earth as we know it wouldn't exist.
So every meal you eat traces back to sunlight captured by a leaf.
```
- Professional educational script
- Topic-specific visuals (sun, leaf, chloroplast)
- Animated diagram showing the process
- Diverse layouts across scenes

---

## 🛠️ Prerequisites

| Tool | Version | Link | Status |
|------|---------|------|--------|
| Node.js | 18+ | https://nodejs.org | ✅ Required |
| FFmpeg | any | https://ffmpeg.org/download.html | ✅ Required |
| edge-tts | pip install | `pip install edge-tts` | ✅ Required |
| **Qwen3 8B** | ~5-6 GB | Auto-downloaded | ✅ **NEW** |

> **No Ollama required.** The AI model runs directly inside Node via **[node-llama-cpp](https://github.com/withcatai/node-llama-cpp)**.
> The GGUF weights are downloaded automatically on first setup.

---

## 💾 Model Storage

Models are stored **outside** the project directory to avoid being accidentally deleted or committed:

```
<parent-of-project>/
└── models/
    └── qwen3-8b-instruct-q4/   ← GGUF weights (auto-downloaded)
        └── qwen3-8b-instruct-q4_k_m.gguf   (~5-6 GB)
```

The default model is now **Qwen3 8B Instruct Q4** from Hugging Face (`Qwen/Qwen3-8B-GGUF`).

### Model Configuration

To use a custom model, edit `.env`:

```env
LLM_MODEL_NAME=my-model-folder
LLM_MODEL_FILE=my-model.gguf
# Leave LLM_HF_REPO / LLM_HF_FILE blank if you placed the file manually
```

Or set these environment variables:
- `LLM_HF_REPO` - HuggingFace repo (e.g., `Qwen/Qwen3-8B-GGUF`)
- `LLM_HF_FILE` - GGUF filename (e.g., `qwen3-8b-instruct-q4_k_m.gguf`)
- `LLM_MODEL_NAME` - Local folder name
- `LLM_CONTEXT_SIZE` - Token context (default: 4096)
- `LLM_GPU_LAYERS` - GPU offload (default: auto, use `-1` for auto-detect)

---

## 🚀 Setup (First Time Only)

### Windows
```bat
setup.bat
```

### Linux / macOS
```bash
chmod +x setup.sh start.sh stop.sh
./setup.sh
```

**What setup does:**
1. ✅ Checks Node.js (≥ 18) and FFmpeg
2. ✅ Installs npm dependencies (all workspaces)
3. ✅ Builds shared, renderer, backend, and frontend packages
4. ✅ Creates output, temp, and asset directories
5. ✅ Copies `.env.example` → `.env`
6. ✅ **Downloads Qwen3 8B model** automatically (~5-6 GB)
7. ✅ Initializes SQLite database
8. ✅ Runs health checks

---

## ▶️ Start

### Windows
```bat
start.bat
```

### Linux / macOS
```bash
./start.sh
```

**What happens:**
1. Checks if model is available (downloads if missing)
2. Starts backend server on port 3001
3. Starts frontend dev server
4. Waits for services to be healthy
5. Opens browser to **http://localhost:5173**

On Linux/macOS, press **Ctrl+C** to stop all services, or run `./stop.sh` from another terminal.

---

## ⏹️ Stop

### Windows
```bat
stop.bat
```

### Linux / macOS
```bash
./stop.sh
```

---

## ⚙️ Configuration

Edit `.env` to customize settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_MODEL_NAME` | `qwen3-8b-instruct-q4` | Model folder under `../models/` |
| `LLM_HF_REPO` | `Qwen/Qwen3-8B-GGUF` | HuggingFace repo for auto-download |
| `LLM_HF_FILE` | `qwen3-8b-instruct-q4_k_m.gguf` | GGUF filename to download |
| `LLM_CONTEXT_SIZE` | `4096` | Token context window |
| `LLM_GPU_LAYERS` | `auto` | GPU layers (`0` = CPU, `-1` = auto) |
| `LLM_MAX_TOKENS` | `2048` | Max tokens per request |
| `MODELS_DIR` | `../models` | Model storage location |
| `TTS_ENGINE` | `edge-tts` | `edge-tts` or `espeak` |
| `TTS_VOICE` | `en-US-AriaNeural` | Voice name for TTS |
| `PORT` | `3001` | Backend port |
| `RENDER_FPS` | `30` | Video FPS |
| `RENDER_CONCURRENCY` | `auto` | Parallel frame renders |
| `MAX_CONCURRENT_JOBS` | `1` | Max simultaneous render jobs |

You can also change most settings at runtime from the **Settings** page in the app.

---

## 🎬 Usage

### Topic Mode (Recommended)
1. Click **Create** → **Generate from Topic**
2. Enter your topic (e.g., "How does photosynthesis work?")
3. Click **Generate Script** — the AI generates a **professional educational script**
4. Review and edit the script if needed
5. Click **Approve & Continue**
6. Choose duration (40-90s), aspect ratio (9:16, 16:9, 1:1), voice, and theme
7. Click **Create Video**
8. Watch the progress bar
9. **Download your professional MP4** when done!

### Own Script Mode
1. Click **Create** → **Use My Script**
2. Paste your narration text
3. Choose **Preserve** (fix grammar only) or **Improve** (full educational rewrite)
4. Continue from step 5 above

---

## 📁 Project Structure

```
<parent>/
└── models/
    └── qwen3-8b-instruct-q4/   ← GGUF weights (auto-downloaded)

project/
├── packages/
│   ├── shared/     # Shared TypeScript types and Zod schemas
│   │   ├── src/
│   │   │   ├── types/          # Interfaces (UPDATED: re-exports from schemas)
│   │   │   ├── schemas/        # Zod schemas (ENHANCED: new components, validation)
│   │   │   │   ├── scene.schema.ts
│   │   │   │   ├── job.schema.ts
│   │   │   │   ├── script.schema.ts
│   │   │   │   └── storyboard.schema.ts  # NEW: Enhanced with validation
│   │   │   ├── constants.ts    # Config values (UPDATED: Qwen3)
│   │   │   └── index.ts        # Main exports
│   │   └── dist/
│   │
│   ├── backend/    # Express API, SQLite, local LLM, TTS, render queue
│   │   ├── src/
│   │   │   ├── config.ts              # Configuration (UPDATED: Qwen3)
│   │   │   ├── index.ts                # Server entry
│   │   │   ├── db/                     # SQLite database
│   │   │   ├── middleware/             # Express middleware
│   │   │   ├── prompts/                # AI prompts (ENHANCED)
│   │   │   │   ├── script-generate.prompt.ts  # ENHANCED: Professional structure
│   │   │   │   ├── script-validate.prompt.ts
│   │   │   │   ├── script-rewrite.prompt.ts
│   │   │   │   └── storyboard.prompt.ts      # ENHANCED: Topic-aware planning
│   │   │   ├── routes/                 # API routes
│   │   │   ├── services/               # Business logic
│   │   │   │   ├── llm.service.ts           # NEW: node-llama-cpp integration
│   │   │   │   ├── llm.downloader.ts        # NEW: Auto-download models
│   │   │   │   ├── ollama.service.ts         # Legacy (deprecated)
│   │   │   │   ├── script.service.ts        # Script generation
│   │   │   │   ├── storyboard.service.ts    # ENHANCED: Multiple attempts, validation
│   │   │   │   ├── storyboard.validation.ts # NEW: Comprehensive validation
│   │   │   │   ├── storyboard.visuals.ts    # ENHANCED: Better asset matching
│   │   │   │   ├── tts.service.ts
│   │   │   │   ├── subtitle.service.ts
│   │   │   │   ├── render.service.ts
│   │   │   │   └── storage.service.ts
│   │   │   └── workers/                # Background jobs
│   │   │       └── render.worker.ts
│   │   └── dist/
│   │
│   ├── renderer/   # Remotion composition + 22 animation components (was 14)
│   │   ├── src/
│   │   │   ├── compositions/
│   │   │   │   └── EduVideo.tsx       # UPDATED: Support for 22 components
│   │   │   ├── components/            # 22 COMPONENTS
│   │   │   │   ├── AnimatedText.tsx
│   │   │   │   ├── AnimatedNumber.tsx
│   │   │   │   ├── Character.tsx
│   │   │   │   ├── Teacher.tsx
│   │   │   │   ├── EducationalObject.tsx
│   │   │   │   ├── ObjectGroup.tsx
│   │   │   │   ├── ConceptDiagram.tsx
│   │   │   │   ├── MultiplicationTable.tsx
│   │   │   │   ├── ImageScene.tsx
│   │   │   │   ├── BackgroundScene.tsx
│   │   │   │   ├── Subtitle.tsx
│   │   │   │   ├── QuestionCard.tsx
│   │   │   │   ├── Confetti.tsx
│   │   │   │   ├── EndScreen.tsx
│   │   │   │   ├── ProgressBar.tsx
│   │   │   │   ├── SplitScreenComparison.tsx  # NEW
│   │   │   │   ├── ProcessFlow.tsx             # NEW
│   │   │   │   ├── Timeline.tsx                # NEW
│   │   │   │   ├── HighlightedRegion.tsx       # NEW
│   │   │   │   ├── NumberCounter.tsx           # NEW
│   │   │   │   ├── AnimatedDiagram.tsx         # NEW
│   │   │   │   ├── KineticTypography.tsx       # NEW
│   │   │   │   ├── ObjectZoom.tsx              # NEW
│   │   │   │   └── Callout.tsx                 # NEW
│   │   │   ├── utils/
│   │   │   │   ├── animation.ts
│   │   │   │   ├── icons.tsx          # 19 icons (EXTENDED: 32 types)
│   │   │   │   └── sanitize.ts         # UPDATED: 32 object types
│   │   │   └── index.ts                # UPDATED: All 22 components exported
│   │   └── remotion.config.ts
│   │
│   └── frontend/   # React + Vite — 8 pages
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── store/
│       │   └── api/
│       └── index.html
│
├── assets/              # NEW: Additional assets
│   ├── characters/      # NEW: 5 SVG characters
│   │   ├── blue_character.svg
│   │   ├── green_character.svg
│   │   ├── red_character.svg
│   │   ├── purple_character.svg
│   │   └── pink_character.svg
│   ├── backgrounds/      # NEW: 4 SVG backgrounds
│   │   ├── educational_gradient.svg
│   │   ├── modern_dark.svg
│   │   ├── playful_gradient.svg
│   │   └── minimal_light.svg
│   ├── animations/
│   └── sounds/
│
├── resources/            # Existing resources (642 PNG character parts)
│   ├── icons/
│   └── images/
│       └── characters/
│
├── output/               # Generated files
│   ├── videos/
│   ├── audio/
│   ├── subtitles/
│   └── thumbnails/
│
├── data/                 # SQLite database
│   └── projects/
│
├── temp/                 # Temporary files (auto-cleaned)
│
├── logs/                 # Application logs
│
├── setup.bat
├── start.bat
├── stop.bat
├── setup.sh
├── start.sh
├── stop.sh
├── .env
├── .env.example
├── package.json
├── package-lock.json
└── tsconfig.base.json
```

---

## 🎨 Component Library (22 Components)

The LLM never executes code — it outputs JSON scene instructions that reference components by name.

### Base Components (14)
| Component | Purpose |
|-----------|---------|
| `AnimatedText` | Fade/slide/bounce/zoom text |
| `AnimatedNumber` | Count-up number |
| `Character` | SVG avatar (idle/wave/point/thinking) |
| `Teacher` | Educational character preset |
| `EducationalObject` | Book, apple, globe, atom, **32 types total** |
| `ObjectGroup` | Arrange multiple objects |
| `MultiplicationTable` | Animated table reveal |
| `ImageScene` | Full-bleed image with ken-burns |
| `BackgroundScene` | Gradient / pattern background |
| `Subtitle` | Auto-synced captions |
| `QuestionCard` | Interactive Q&A card |
| `Confetti` | Celebration particle effect |
| `EndScreen` | End card with CTA |
| `ProgressBar` | Timeline progress indicator |

### NEW Educational Components (8)
| Component | Purpose | Example Use |
|-----------|---------|-------------|
| `SplitScreenComparison` | Compare two things side-by-side | Before/After, Then/Now |
| `ProcessFlow` | Step-by-step process visualization | How photosynthesis works |
| `Timeline` | Chronological event display | Historical events |
| `HighlightedRegion` | Emphasize important areas | Focus on key parts |
| `NumberCounter` | Animated number counting | "206 bones in human body" |
| `AnimatedDiagram` | Complex diagrams with connections | Network topology |
| `KineticTypography` | Word-by-word animated text | Emphasize key phrases |
| `ObjectZoom` | Zoom into important objects | Focus on details |
| `Callout` | Annotate parts of visuals | Label diagram parts |

---

## 🔌 API Reference

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

---

## 📊 Educational Object Types (32 Types)

The system supports **32 educational object types** for better visual matching:

### Science & Nature
- book, apple, globe, leaf, plant, sun, water, cloud, rocket

### Biology
- cell, dna, gene, neuron, bacteria, virus, brain, heart, organ

### Chemistry
- atom, molecule, electron, proton, neutron, beaker, testtube

### Anatomy
- bone, skeleton, femur, skull, ribcage

### Technology
- calculator, circuit, server, network, computer

### Mathematics
- pencil, star, equation, chart, timeline

### Instruments
- microscope

---

## 🎯 Features Comparison

| Feature | Version 1.0 | Version 2.0 | Improvement |
|---------|-------------|-------------|-------------|
| **Model** | Qwen2.5 7B | **Qwen3 8B** | Better JSON output |
| **Script Quality** | Generic | **Professional** | Hooks, examples, structure |
| **Components** | 14 | **22** | +8 new components |
| **Object Types** | 19 | **32** | +13 new types |
| **Assets** | 642 PNGs | **642 PNGs + 9 SVGs** | Vector graphics |
| **Storyboarding** | Basic | **Intelligent** | Topic-aware planning |
| **Validation** | Basic | **Comprehensive** | Quality checks |
| **Visual Relevance** | Random | **Semantic** | Context-aware matching |

---

## 🐛 Troubleshooting

### Model Download Fails
```bash
# Run the downloader manually
node packages/backend/dist/services/llm.downloader.js

# Or set MODELS_DIR to a path with enough space
MODELS_DIR=/path/to/models npm run setup
```

### Script Generation Slow
```env
# Enable GPU acceleration in .env
LLM_GPU_LAYERS=-1  # Auto-detect
# or specify number of layers
LLM_GPU_LAYERS=20
```

### Out of Memory
```env
# Reduce context size in .env
LLM_CONTEXT_SIZE=2048
```

### TTS Not Working
```bash
# Install edge-tts
pip install edge-tts

# Or use espeak-ng
apt install espeak-ng
# Then set in .env
TTS_ENGINE=espeak
```

### FFmpeg Not Found
Download from https://ffmpeg.org/download.html and add to PATH.

### Video File Corrupt
```bash
# Check logs for details
cat logs/backend.log

# Usually a Remotion or FFmpeg issue
# Try reducing complexity or duration
```

### Rendering Slow
```env
# Reduce concurrency in .env
RENDER_CONCURRENCY=2
MAX_CONCURRENT_JOBS=1
```

### TypeScript Errors
```bash
# Rebuild all packages
npm run build

# Check specific package
cd packages/shared && npm run build
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| `README.md` | This file - Setup, usage, configuration |
| `progress.md` | Detailed progress tracking (85% complete) |
| `dev.md` | Development plan and current status |
| `project.md` | Project overview and structure |
| `e2e/VERIFICATION.md` | End-to-end testing checklist |
| `resources/README.md` | Asset documentation |

---

## 🎉 Conclusion

**EduMotion AI 2.0** is a **major upgrade** that transforms the system into a **professional educational video generator**.

### ✅ What's Working
- Professional script generation with hooks and examples
- Intelligent storyboard planning with topic awareness
- 22 components for diverse scene layouts
- 32 object types for better visual matching
- Comprehensive validation system
- Qwen3 8B model for better quality

### ⏳ What's Next
- Fix TypeScript errors in new files
- Implement audio synchronization
- Add word-level subtitle timing
- Implement final quality validation

**Status**: 🟡 **85% COMPLETE** - See [progress.md](progress.md) for details

---

**Last Updated**: 2026-11-22  
**Version**: 2.0 (Enhanced)  
**Model**: Qwen3 8B Instruct Q4  
**Status**: 🟡 **ENHANCEMENT PHASE - 85% COMPLETE**
