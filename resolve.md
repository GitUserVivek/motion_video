# Resolution Plan — job `3e6d2e7c-937d-485f-8955-e2ed5c71c5f6`

Reference: [`issues.md`](./issues.md)

## Goal

Make the pipeline reject wrong artwork, choose the correct downloaded artwork, produce sentence-safe captions, avoid fragmented diagrams, write inspectable final artifacts, and make semantic failures block the render. Keep the existing schema, approval gate, asset-discovery architecture, and topic independence.

## Guiding rules

- Fix deterministic logic first. The LLM judge can only reject an accepted candidate; it must not be required to catch issues the rules can catch.
- Never hardcode photosynthesis or this job's filenames. Use generic semantic-field, label, key-term, and sentence rules.
- Preserve backward compatibility: no required schema changes, no new external service.
- Every fix gets a regression test built from the failure shape in `issues.md`.
- Do not claim success from a valid MP4. Acceptance is based on the semantic report, final storyboard/asset audit, and sampled frames.

## Priority order

### P0 — Asset correctness (issues 1, 2, 3, 10)

#### 1. Stop treating “map” as proof of geography

Files: `packages/backend/src/services/asset.verify.ts`

- Split field markers into strong and weak evidence.
  - Strong: `country`, `continent`, `ocean`, `cartography`, `atlas`, `region`, etc.
  - Weak/generic visualization words: `map`, `chart`, `graph`, `diagram`.
- A candidate may claim a semantic field when it has at least one strong marker, or at least two independent weak markers. A lone `map` must not create a `geography` conflict.
- Apply the same rule when detecting the scene's own fields, so a scene saying “carbon transition map” is not classified as geography either.
- Keep the existing generic-token removal (`diagram`, `chart`, `illustration`, etc.) and the current shared-term requirement.
- Preserve the existing protections:
  - `Mars Cube One` must still be rejected for a geometry cube scene.
  - `Hierarchy of Control Pyramid` must still be rejected for a geometry pyramid scene.
  - A plain cube or satellite in its correct field must still be accepted.

Tests: `packages/backend/src/__tests__/content.test.ts`

- Add the exact candidate `auto/carbon-transition-map-of-the-calvin-benson-bassham-cycle-d02b6985.png` and assert it is accepted for a photosynthesis/Calvin-cycle scene.
- Add a geography scene with `map of Europe`; verify it still resolves to geography when country/continent evidence exists.
- Keep the Mars/safety regression tests passing.

Acceptance: the Calvin-cycle candidate is accepted; it is no longer listed as a rejected candidate in `assets.json`.

#### 2. Require a real concept match, not a narration coincidence

Files: `packages/backend/src/services/asset.library.ts`, `storyboard.visuals.ts`

- For downloaded (`auto/`) assets, require either:
  - a label or icon hit, or
  - at least two distinct key-term hits.
- Do not attach a downloaded file on a single weak narration token (`energy`, `sun`, `process`, `plant`) when the label or key terms do not name it.
- Add a small penalty for generic filename words such as `bubble`, `share`, `cumulative`, `global`, `transition`, `scheme`, unless they are part of the exact label/key term.
- Record the match evidence in the asset audit: `matchedTerms`, `matchScore`, and whether the hit was label/icon/key-term/narration.

Tests: `assets.test.ts`, `user-assets.test.ts`

- An `energy`-only chart must not match `oxygen`, `sunlight absorption`, or `use sunlight`.
- An exact `oxygen` or `chloroplast structure` asset must beat a generic energy chart.
- User-uploaded assets keep their existing matching behavior.

#### 3. Deduplicate artwork across scenes, not only inside one scene

Files: `storyboard.visuals.ts`

- Add a global `usedArtwork: Map<assetId, sceneId>` for `attachSceneArtwork`.
- Pass it through every `verifiedArtwork` / `attach*Images` call in addition to the existing scene-local `used` set.
- A second use is allowed only when:
  - the new label normalizes to the same concept as the previous use, or
  - no alternative asset matches and the reuse is explicitly recorded as `reusedFrom`.
- Otherwise skip the candidate and continue to the next match or the built-in glyph.
- Keep user-uploaded assets allowed to repeat only when the user explicitly attached them to those scenes.

Tests:

- Reproduce the energy chart being selected for `Sunlight Absorption`, `use sunlight`, and `Oxygen`; assert only one scene gets it and the other two choose a better asset or a built-in glyph.
- Reproduce `glucose-chain` being reused for unrelated labels; assert reuse is either concept-equivalent or rejected.

#### 4. Make the asset audit explain accepted choices too

Files: `storyboard.visuals.ts`, `render.worker.ts`

- Include in `assets.json` for every selection:
  - `matchedTerms`
  - `matchScore`
  - `candidate` for rejected choices
  - `reusedFrom` when reuse was allowed
- Keep the existing `candidate`/`reason` for rejections.

Acceptance: a reviewer can see why each accepted image was chosen, not only why rejected ones were skipped.

### P0 — Visual relevance and diagram integrity (issues 4, 6, 7)

#### 5. Repair scenes whose visuals do not name the narration

Files: `storyboard.validation.ts`, `storyboard.visuals.ts`, `render.worker.ts`

- Extend `calculateVisualRelevance` to count actual attached visual evidence:
  - `AnimatedText` headings
  - diagram/process/split-screen labels
  - `imageAlt` values
  - attached asset tokens
- After `attachSceneArtwork`, run a semantic repair for any content scene scoring below `0.5`:
  - If the scene has a `ProcessFlow` but its labels do not cover the narration, rebuild the steps from the scene's key terms/narration.
  - If the scene has no visual naming a key term, add a `ConceptDiagram` built from the scene's own phrases.
- Re-run validation after repair.
- Make a scene with non-empty key terms and **no** visual evidence for any key term blocking after the repair attempt. Keep a numeric warning band for `0.5–0.7`.
- Do not make a low score blocking when the scene is a closing/end screen with no teaching content.

Tests: `editorial.test.ts` plus a new fixture from this job

- Scene-2 fixture: key term `chlorophyll`, equation-only visual; assert repair adds a visual naming chlorophyll/sunlight/energy and score clears the threshold.
- Scene-4 fixture: brief says CO₂/water entering a plant; ProcessFlow says sunlight/water/ATP; assert steps are repaired or the scene is blocked.
- Closing scene with no key terms remains allowed.

#### 6. Stop fragmenting multi-word diagram labels

Files: `storyboard.visuals.ts` (`buildConceptItems`, `bestTerms`, `reserved`), `layout.validation.ts`

- Normalize candidate labels before deduplication (`lowercase`, collapse whitespace).
- Reject a candidate when it is a substring of an already chosen label, or when an already chosen label is a substring of it.
- Keep multi-word key phrases intact: `Light-dependent reactions` must remain one tile, not `Light-dependent` + `Reactions`.
- Cap self-generated `ConceptDiagram` items at three meaningful tiles.
- Add a `ConceptDiagram` validation path equivalent to `AnimatedDiagram`:
  - duplicate labels
  - contained/substring labels
  - more than three tiles for a two-concept phrase
  - labels longer than the safe width
- Make duplicate/contained labels blocking after repair; tile count and length can remain warnings.

Tests:

- Scene-7 fixture with “light-dependent reactions and the Calvin cycle” must produce two tiles, not five.
- Existing concept-diagram tests must keep distinct legitimate tiles.

#### 7. Make the quality gate fail on unresolved semantic defects

Files: `storyboard.validation.ts`, `quality.service.ts`, `render.worker.ts`

- Add a semantic section to the editorial report:
  - unresolved low-relevance scene count
  - scenes with key terms but no matching visual
  - captions split mid-sentence
  - duplicate/contained diagram labels
  - assets reused across unrelated scenes
- Any blocking semantic issue must fail the job before render (or after re-repair) and appear in `quality-report.json` with the scene id.
- Keep the technical media checks unchanged.
- Do not let `passed: true` coexist with these blocking issues.

Tests:

- A storyboard containing the exact mismatches from this job must fail validation until the asset/caption/diagram fixes are applied.
- A clean fixture must still pass.

### P0 — Captions and report integrity (issues 5, 11)

#### 8. Group captions by sentence, not only by word count

Files: `subtitle.service.ts` (`groupWordCues`)

- Flush the current group at sentence-ending punctuation (`.`, `?`, `!`) before considering the word/character cap.
- Prefer the most recent comma/colon/semicolon boundary when a group exceeds the cap.
- Never produce a cue that starts with a lowercase continuation when the previous cue does not end a sentence, unless the speaker is intentionally continuing after a colon.
- Preserve per-word timings after regrouping.

Tests: `subtitles.test.ts`

- Word-cue input for “Photosynthesis is how plants turn sunlight into energy using chlorophyll.” must not produce a standalone “Photosynthesis is” cue.
- Input with a sentence of more than seven words must split at punctuation or a natural phrase boundary, not at an arbitrary word.
- Existing measured-cue behavior remains unchanged.

#### 9. Snap scene boundaries to sentence boundaries

Files: `scene.balance.ts`, `storyboard.service.ts`, `subtitle.service.ts`

- Before subtitle injection, add a boundary pass over adjacent scenes:
  - Find the nearest cue boundary where the preceding cue ends a sentence.
  - If it is within a small tolerance (suggest ±400ms / 12 frames), move the shared scene boundary to that cue boundary.
  - Preserve total frames, minimum 30-frame scene duration, and non-overlap.
- Run this pass before `splitOversizedScenes` so scene balance and captions use the same boundaries.
- Keep `clipCueToWindow` as the fallback for cues that still cross a boundary.
- If no sentence boundary is available, leave the boundary but log a `caption-crosses-scene` warning.

Tests:

- Reproduce the scene-1 → scene-2 boundary at 4s; assert the boundary moves to the end of “Photosynthesis is …” and the next scene no longer starts with a fragment.
- Reproduce scene-4 ending in “Plants”; assert the boundary snaps to a sentence end or the scene is flagged.
- Assert scene durations remain positive and the sum of frames equals `totalFrames`.

#### 10. Make the subtitle report count what it contains

Files: `packages/backend/src/workers/render.worker.ts`

- Compute `sceneCues` from the final storyboard's `Subtitle` children.
- Report both:
  - `sourceCues: subtitles.length`
  - `totalCues: sceneCues.length`
- Keep `scenes[].cues` unchanged.
- Optionally record `fragments` and `crossSceneSplits` counts.

Tests:

- A report built from the failing job must report `sourceCues: 8`, `totalCues: 14` (or the post-fix equivalent), and both counts must match the arrays.
- Assert `totalCues === sum(scenes[].cues.length)`.

### P1 — Final artifacts and performance (issues 8, 9)

#### 11. Write the final storyboard after artwork attachment

Files: `render.worker.ts`, `storyboard.service.ts`, `job.files.ts`

- Write `storyboard.json` once more after `attachSceneArtwork` and after any final repair, or add `storyboard.final.json` and keep the planned one as `storyboard.planned.json`.
- The final artifact must include image references (data URLs or `auto/` paths) and `imageAlt` where applicable.
- Write the final asset audit at the same point so `storyboard.json` and `assets.json` describe the same plan.

Tests:

- Integration fixture: after attachment, `storyboard.json` contains at least one image reference matching a selected asset in `assets.json`.
- No final storyboard may contain zero image references while `assets.json` reports downloaded selections.

#### 12. Measure and improve render throughput

Files: `render.service.ts`, `render-metrics.json`, `hardware.service.ts`

- Add stage timings to `render-metrics.json`:
  - bundling/startup
  - frame rendering
  - mux
  - thumbnail
  - ffprobe validation
- Run the same storyboard with controlled A/B tests on the Kaggle GPU:
  - concurrency 4 vs 8 (only when CPU/RAM allow)
  - `--log error` vs `--log verbose`
  - JPEG quality 80 vs 92
  - `--gl angle-egl` vs the stable fallback
- Inspect the renderer for per-frame costs: CSS blur/filter, large box shadows, expensive SVG filters, repeated image decoding, and components re-rendering static layers.
- Keep the frame output quality gate; do not improve speed by lowering resolution or dropping required frames.
- Record the winning setting only after measuring it.

Acceptance target: at least a 25% reduction in frame-render time for the same storyboard and quality, or a documented hardware limit with the measured bottleneck. No speed claim without the before/after metrics.

#### 13. Improve download-to-use efficiency

Files: `asset.discovery.ts`, `storyboard.visuals.ts`

- After attachment, log and report downloaded assets that were not used, with the reason (no confident match, rejected by verifier, duplicate).
- Prefer assets whose filename contains the exact two-word key term over generic single-token matches.
- Avoid downloading more candidates than the scene query budget needs when a high-confidence match already exists.
- Keep the stale-search-cache fallback and 429 cooldown behavior.

Acceptance: the unused-download list is explainable, and the correct oxygen/chloroplast/photosynthesis assets are used when their scene key terms require them.

## Implementation order

1. **Asset verifier field fix** (issue 1)
2. **Matcher strictness + global dedupe + audit fields** (issues 2, 3, 4, 10)
3. **Visual repair + relevance blocking** (issues 4, 7)
4. **Diagram label dedupe + validation** (issue 6)
5. **Sentence-aware cue grouping + scene boundary snapping** (issue 5)
6. **Subtitle report counts** (issue 11)
7. **Final storyboard write** (issue 8)
8. **Semantic quality report integration** (issue 7)
9. **Render metrics and A/B performance pass** (issue 9)

## Verification plan

### Automated

Run after each phase and again at the end:

```bash
npm run typecheck
npm test
npm run build
```

Add focused tests before changing behavior:

- `content.test.ts`: Calvin-cycle map accepted; Mars/safety rejections preserved.
- `assets.test.ts`: exact-concept match beats generic energy/chart; reused asset rejected across unrelated scenes.
- `editorial.test.ts`: scene-2 and scene-4 relevance repair; scene-7 two-tile diagram; duplicate/contained labels blocked.
- `subtitles.test.ts`: sentence-aware grouping, scene-boundary snapping, no fragment cues.
- `pipeline.integration.test.ts` or a new report test: `totalCues` equals the sum of scene cues; final `storyboard.json` contains attached images.

### End-to-end

1. Re-run the same photosynthesis topic on Kaggle.
2. Re-fetch the job folder and compare:
   - `assets.json`: Calvin-cycle candidate accepted; no energy chart on oxygen/sunlight; no unexplained reuse.
   - `validation-report.json`: no low-relevance warnings for scene-2/scene-4; no caption fragments.
   - `subtitle-report.json`: `totalCues` matches the scene arrays.
   - `storyboard.json`: contains the attached images.
   - `quality-report.json`: semantic checks pass only because the defects are gone, not because they are warnings.
3. Sample the scene frames and confirm the Calvin cycle, oxygen, and sunlight scenes use the intended visuals.
4. Compare `render-metrics.json` before/after; report measured throughput, not an estimate.

## Out of scope

- Changing the approval flow or job schema.
- Hardcoding this job's topic, filenames, or scene ids.
- Replacing asset discovery with a new provider.
- Accepting a technically valid MP4 when the semantic checks still fail.
