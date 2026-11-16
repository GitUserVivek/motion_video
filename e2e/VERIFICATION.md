# EduMotion AI — End-to-End Verification Checklist

## Pre-flight
- [ ] `setup.bat` completed with no errors
- [ ] Ollama running: `curl http://localhost:11434/api/tags`
- [ ] Model available: `ollama list` shows qwen2.5:7b or llama3.2:3b
- [ ] FFmpeg available: `ffmpeg -version`
- [ ] edge-tts available: `edge-tts --version`
- [ ] `start.bat` launched frontend + backend
- [ ] `GET /api/health` returns `{"status": "ok"}`

## Scenario 1 — Topic-Based Video
- [ ] Open http://localhost:5173
- [ ] Click Create → Generate from Topic
- [ ] Enter topic: "How does photosynthesis work?"
- [ ] Click Generate Script
- [ ] Script appears in editor (non-empty)
- [ ] Edit a word in the script
- [ ] Click Approve & Continue
- [ ] Select 40s duration, 9:16 ratio
- [ ] Click Create Video
- [ ] Progress bar advances through all steps
- [ ] Video preview page loads
- [ ] Video plays in browser
- [ ] Download link downloads a real MP4 file
- [ ] MP4 file exists in output/videos/
- [ ] File size > 500 KB

## Scenario 2 — Own Script Video
- [ ] Click Create → Use My Script
- [ ] Paste a 100-word narration
- [ ] Select "Improve" mode
- [ ] Script is processed and displayed
- [ ] Approve and configure
- [ ] Video renders successfully
- [ ] Downloaded MP4 plays correctly

## Scenario 3 — Restart Persistence
- [ ] Stop the app with stop.bat
- [ ] Start again with start.bat
- [ ] History page shows previous videos
- [ ] Download link still works

## Scenario 4 — Job Cancellation
- [ ] Start a render job
- [ ] Click Cancel Job during rendering
- [ ] Job status changes to cancelled
- [ ] Temp files are cleaned from temp/ directory

## Scenario 5 — Error Handling
- [ ] Stop Ollama and attempt script generation
- [ ] Error message shown in UI (not crash)
- [ ] Start Ollama again, app recovers

## Type-Check & Lint
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` all tests pass

## Sign-off
Date: ___________  
Tested by: ___________  
Result: PASS / FAIL
