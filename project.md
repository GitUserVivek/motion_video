PROJECT: EduMotion AI — Local AI-Powered Educational Video Generator

ROLE:
Act as a senior full-stack engineer, AI engineer, React developer, Remotion video engineer, and software architect.

OBJECTIVE:
Build a complete working local-first educational video generation application. Do not just provide examples, snippets, or documentation. Create the actual project files, implement the frontend and backend, integrate local AI, generate scripts, create animated scenes, render MP4 videos, save them locally, and provide download links.

CORE USER WORKFLOW:
1. User opens the React frontend.
2. User chooses Topic mode or Own Script mode.
3. Topic mode: user enters one educational topic and clicks Generate Script.
4. Own Script mode: user pastes narration and chooses whether to preserve it or improve grammar and punctuation.
5. Backend uses a local free best ai models to generate or validate the script.
6. Frontend displays the script in an editable text editor.
7. User can edit, regenerate, approve, or reject the script.
8. ONLY after approval, user clicks Create Video.
9. Backend generates a storyboard and structured timestamp-based scene JSON.
10. Local TTS generates narration audio.
11. Determine actual audio duration and align scene timing and subtitles with audio.
12. Select/generate suitable visual assets.
13. Remotion renders reusable React animation components.
14. FFmpeg produces the final MP4.
15. Backend saves the MP4 locally and returns a download URL.
16. Frontend displays video preview, download button, file location, and generation history.

TECHNOLOGY STACK:
- Frontend: React + Vite + TypeScript.
- Backend: Node.js + Express + TypeScript.
- AI: Ollama with configurable local models.
- Script/scene planning: Qwen3 8B or compatible model.
- Coding assistant: Qwen2.5-Coder 7B, optional.
- Video generation: Remotion.
- Animation: React, CSS, SVG, Lottie.
- Video/audio processing: FFmpeg.
- Local database: SQLite.
- Voice generation: Configurable offline TTS engine.
- Job queue: Persistent SQLite-backed jobs or another reliable local job queue.
- Storage: Local filesystem.

ARCHITECTURE:
Implement separate modules for:
1. AI script generation.
2. Script editing and validation.
3. Storyboard generation.
4. Scene timeline planning.
5. Voice generation.
6. Speech alignment and subtitles.
7. Asset selection.
8. Scene component rendering.
9. Video rendering.
10. FFmpeg processing.
11. Job management.
12. Local storage and downloads.

IMPORTANT AI RULE:
Do not let the LLM execute arbitrary JavaScript or React code in production.
Use structured JSON scene instructions validated with Zod or equivalent.
Create a reusable, extensible library of trusted Remotion components.
Allow optional AI-generated new components only through a separate validation, testing, and approval workflow.

REUSABLE COMPONENT LIBRARY:
- AnimatedText
- AnimatedNumber
- Character
- Teacher
- EducationalObject
- ObjectGroup
- MultiplicationTable
- ImageScene
- BackgroundScene
- Subtitle
- QuestionCard
- Confetti
- EndScreen
- ProgressBar

ANIMATION SUPPORT:
- Fade in/out.
- Slide.
- Bounce.
- Zoom.
- Rotate.
- Pop.
- Character wave.
- Character pointing.
- Object movement.
- Number counting.
- Scene transitions.

FRONTEND:
Build these pages:
1. Dashboard.
2. Topic/script input.
3. Script editor and approval.
4. Video configuration.
5. Rendering progress.
6. Video preview and download.
7. Generation history.
8. Settings and service health.

CONFIGURATION:
- Duration: 40, 60, 90 seconds and custom duration.
- Aspect ratio: 9:16, 16:9, 1:1.
- Language selection.
- Voice selection.
- Animation theme.
- Subtitle toggle.
- Background music toggle.
- Preserve original script toggle.
- Improve grammar toggle.

BACKEND API:
- GET /api/health
- POST /api/scripts/generate
- POST /api/scripts/validate
- POST /api/scripts/rewrite
- POST /api/videos/generate
- GET /api/jobs
- GET /api/jobs/:jobId
- POST /api/jobs/:jobId/cancel
- GET /api/videos
- GET /api/videos/:videoId/download
- DELETE /api/videos/:videoId
- GET /api/settings

VIDEO PIPELINE:
Script approval -> storyboard -> local TTS -> audio alignment -> asset selection -> timeline -> Remotion render -> FFmpeg processing -> MP4 validation -> local storage -> download URL.

RESOURCE ARTWORK (optional):
Drop any .svg/.png/.jpg/.jpeg/.webp/.gif into resources/ (or assets/backgrounds,
assets/characters). The file and folder names are the lookup key: a file named
water-cycle.svg (or water/cycle.png) is used on a tile about water, weather/storm.png
on one about storms. Matched files are inlined into the storyboard props as data:
URLs, so the Remotion render never fetches anything; a tile without a match keeps
its built-in SVG glyph, and files over 400 KB are skipped.

STORAGE:
Use the following directories:
- assets/characters
- assets/backgrounds
- assets/animations
- assets/sounds
- resources/icons
- resources/images
- data/projects
- output/videos
- output/audio
- output/subtitles
- output/thumbnails
- temp

DATABASE:
Use SQLite with projects, scripts, jobs, scenes, videos and settings tables.
Persist job status and project history across restarts.

SINGLE-TIME SETUP:
Create:
- setup.bat
- start.bat
- stop.bat

setup.bat must check prerequisites, install dependencies, pull local models, initialize TTS, create directories, initialize SQLite, verify FFmpeg and Remotion, and perform a test render.

start.bat must check/start Ollama, start backend, start rendering worker, start frontend, check service health, and open the browser. User should only need to execute this one file after initial setup.

stop.bat must gracefully stop managed application processes without deleting user files or videos.

ENGINEERING REQUIREMENTS:
- Full TypeScript typing.
- Shared types and validation schemas.
- Proper API error handling.
- Persistent job processing.
- Render concurrency control.
- Real progress reporting.
- Cancellation support.
- Automatic temporary file cleanup.
- Retry failed jobs.
- No fake download URLs.
- No hardcoded example topics.
- No cloud AI API required for core functionality.
- Offline operation after initial setup.
- Never overwrite previous generated videos.
- Validate final video file before marking job complete.
- Handle insufficient RAM and missing dependencies gracefully.

INITIAL TARGET:
- 40-second educational videos.
- 1080x1920.
- 30 FPS.
- English narration.
- 2D animation.
- One concurrent rendering job.
- Local MP4 storage.

IMPLEMENTATION PROCESS:
Phase 1: Inspect environment and create project structure.
Phase 2: Implement backend, SQLite and Ollama integration.
Phase 3: Implement topic-to-script and own-script workflows.
Phase 4: Build reusable Remotion component library.
Phase 5: Integrate local TTS and audio alignment.
Phase 6: Implement storyboard and scene JSON generation.
Phase 7: Integrate rendering worker and FFmpeg.
Phase 8: Implement frontend pages and progress tracking.
Phase 9: Implement local storage and downloadable MP4.
Phase 10: Create single-time setup and start scripts.
Phase 11: Perform complete end-to-end testing.

DEVELOPMENT RULES:
- Build incrementally.
- Do not leave placeholder functions or TODOs in core workflows.
- Do not mark an integration complete without testing it.
- Create actual source files, not just code examples in chat.
- Run type checking, linting and tests.
- Test API integrations.
- Perform at least one complete 40-second topic-based video generation.
- Perform at least one complete user-script-based video generation.
- Test application restart and download functionality.
- Document every command and configuration.
- If a model is too large for the machine, select a smaller compatible model.
- Keep the project modular and maintainable.

DELIVERABLES:
1. Complete source code.
2. Working frontend.
3. Working backend.
4. Local AI integration.
5. Remotion animation engine.
6. Reusable component library.
7. Local TTS integration.
8. SQLite database.
9. Persistent rendering jobs.
10. Local MP4 output.
11. Download functionality.
12. setup.bat, start.bat, stop.bat.
13. README with installation and usage.
14. Automated tests.
15. End-to-end verification report.

SUCCESS CRITERION:
After initial setup, the user executes start.bat, enters a topic, receives an editable script, approves it, and receives a real playable MP4 saved on their local machine with a working download link.

The same workflow must work when the user supplies their own script.

Start by inspecting the development environment and creating the project structure. Then implement each phase, test it, and proceed to the next. Do not stop after generating the architecture or scaffolding.