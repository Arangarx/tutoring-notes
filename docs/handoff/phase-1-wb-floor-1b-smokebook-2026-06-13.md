# Phase 1 workstream 1b — captured-audio clock (iOS hardware smoke)

**Branch:** `phase1/wb-reliability-floor`  
**Tip commit:** `[636dc92](https://github.com/Arangarx/tutoring-notes/commit/636dc9209432555e98709b3ad959f7b76b57f94c)`  
**Preview:** [phase1/wb-reliability-floor preview](https://tutoring-notes-git-phase1-wb-rel-a7e957-arangarx-5209s-projects.vercel.app)  
**Date:** 2026-06-13  
**Scope:** Workstream **1b** — replace `performance.now()` WB-event clock with frame-counting captured-audio clock (`getAudioMs` via AudioWorklet / ScriptProcessor fallback), iOS no-timeslice MP4 path, recording-stall watchdog banner. Agent-runnable jest coverage already green; **this runbook is real-browser / iOS-hardware only.**

**Overall result:**

- [ ] PASS
- [ ] FAIL

---

## What 1b changed (read before smoke)


| Area                    | Behavior                                                                                                                                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WB-event timestamps** | Every whiteboard event uses `getAudioMs()` from the mic mixdown graph — frame counter active only while recording, baseline captured at **recording-start** (not first `ondataavailable`), cumulative across 50-min segment rollovers. |
| **iOS MP4**             | No-timeslice `recorder.start()` when MIME is `audio/mp4` — single Whisper-decodable file per segment.                                                                                                                                  |
| **Watchdog**            | Draft checkpoint interval (30 s) runs stall detection; UI banner `data-testid="wb-recording-stall-banner"` with copy *"Recording may have stopped — check your microphone."*                                                           |
| **Console logs**        | `[mic-recorder-audio] avx=… frame-counter=audioworklet` or `script-processor` on graph init; `event=ios-no-timeslice`; `event=audiocontext-state-change state=suspended`; `[useAudioRecorder] … event=watchdog-stall` on stall.        |


**Common setup (all items):** Sign in as pilot tutor on the branch **Preview** URL. Open any student's whiteboard workspace (`/admin/students/<studentId>/whiteboard/<wbsid>/workspace`) — start a **new** session or resume in-progress. Grant microphone permission when prompted. Open browser devtools console (desktop) or Safari Web Inspector attached to the iPhone (iOS items) **before** pressing **Start recording**.

**Replay path:** After **End session**, open session review at `/admin/students/<studentId>/whiteboard/<wbsid>` — press **Play** on the replay timeline and verify stroke animation tracks spoken audio.

---

## Feature smoke items

### 1. Desktop baseline — Chrome + Safari sync gate

**Action:** On the branch **Preview**, desktop **Chrome**: sign in as tutor → open whiteboard workspace → open devtools console → **Start recording** → speak aloud while drawing **three distinct strokes** at ~5 s, ~15 s, and ~25 s (say aloud what you're drawing, e.g. "first line", "second circle", "third arrow") → **End session** → open review replay → press **Play** from t=0 and scrub the timeline. Repeat the same flow on desktop **Safari** (macOS) in a fresh session.

**Expect:** On **both** Chrome and Safari: replay strokes appear at the moments you spoke/drew (visually in sync with audio — no multi-second drift). Console on recording start shows `[mic-recorder-audio] avx=… frame-counter=audioworklet` **or** `frame-counter=script-processor` (either is pass). End-session completes without error toast; replay audio plays through.

**Ignore this run:** Student-side sync, theme parity, notes-generation quality, laser pointer, live A/V mesh. Minor sub-250 ms jitter is acceptable on desktop. CSP console noise from AudioWorklet `blob:` URL (see Residual NOTEs — N-CSP).

- [ ] PASS
- [x] FAIL
- [ ] SKIP

**Notes: Included screenshot of errors just from loading the WB space.  We need to remember to get hotloading working.  I shouldn't have to quit my whiteboard session and start over to use a camera and mic I just plugged in. Video is still not working.  It's still going to an external replay page...actually I'm kinda confused, end session took me to some sort of "Previous whiteboard session -- read only preview" message.  What is this page?  I can start whiteboard session, open full replay, or open last snapshot.  Opened last replay.  Scrubber is still using the old and busted version that doesn't start at the beginning or end at the end....the scrubber should be using the fixed one that opacity uses.  My audio as tutor sounds super scratchy and weird, student from phone is fine right now.  Still has the flash of the final board state at the beginning.**

Audio still starts where I drop the scrubber at the beginning of audio. This replay board is still busted as fuck, why are we smoking on this?  Also, shouldn't the laser pointer be caught in the replay???

---

### 2. iOS background-suspend drift

**Action:** **iPhone Safari** on the **Preview** URL (Web Inspector attached). Start recording → draw/speak a mark at **~1 min** ("mark one") → at **~4 min** press Home or lock screen → leave backgrounded **~3 min** → return to Safari → draw/speak a mark at **~8 min** ("mark two") → continue briefly → **End session** → replay from t=0, scrub across the background gap.

**Expect:** Strokes from **before** and **after** the background gap stay aligned with audio at replay (subjective **< ~250 ms** — strokes should not jump seconds ahead/behind speech). Console around background shows `[mic-recorder-audio] avx=… event=audiocontext-state-change state=suspended` (and likely `state=running` on return). Session does not silently lose the post-background segment.

**Ignore this run:** Exact AudioContext resume latency. Auto-pause banners from live A/V split-brain (different banner — `wb-recording-autopause-banner`). If iOS kills the tab entirely (must cold-reload), SKIP with reason — that is OS kill, not clock drift.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. iOS phone-call interrupt

**Action:** **iPhone** on **Preview**. Start recording → draw/speak at ~~15 s → receive and **accept** a phone call (~~30–60 s) → return to Safari → observe workspace for up to **90 s** → draw/speak again → **End session** → replay.

**Expect:** **Either** (a) `data-testid="wb-recording-stall-banner"` appears within ~60 s of the interrupt with copy *"Recording may have stopped — check your microphone."*, **or** (b) recording resumes cleanly (timer advances, new strokes timestamp correctly). On end: replay audio is **not** silently truncated mid-session without the stall banner having warned the tutor at some point during the interrupt window.

**Ignore this run:** Clean auto-resume after call if not yet implemented — **non-resume is acceptable** as long as the stall banner warned and/or replay honestly reflects what was captured (no silent data loss). Cellular vs Wi-Fi variance. VoIP apps instead of PSTN call — note in Notes if used.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. iOS timeslice playability (Whisper-decodable MP4)

**Action:** **iPhone Safari** on **Preview**. Start recording → keep session alive **~5 min** (talk intermittently; draw a few strokes) → **End session**. From review page, run **Generate notes** (or wait for auto pipeline). Open browser/server logs if available.

**Expect:** Console during recording includes `[useAudioRecorder] rid=… event=ios-no-timeslice mimeType=audio/mp4` (or `audio/mp4;…`). Produced audio is a **single** playable MP4 segment (replay `<audio>` plays full ~5 min, not truncated/fragmented). Notes generation **succeeds** and transcript text is **present** (Whisper could decode the file). No upload/transcribe hard-fail for "invalid media".

**Ignore this run:** Transcript wording quality. Transcription latency beyond ~2 min on preview. Desktop Chrome WebM path (different MIME — not in scope for this item).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. 50-min multi-segment drift (rollover boundary)

**Action:** **Preferred:** record a session that crosses the **50-minute** auto-rollover (segment chime may fire ~~5 min before boundary). At **~~45 min** draw/speak a distinctive mark ("forty-five minute star"). Continue **past 50 min** into segment 2 — draw/speak another mark. **Alternate (simulation):** on desktop Chrome only, if a full 50 min is impractical, use devtools console before Start: `(window as any).__SEGMENT_MAX_SECONDS_OVERRIDE = 300` (5 min) — record past one rollover, mark strokes just before and after boundary — **note simulation in Notes**; iOS hardware pass still required before merge if simulation used.

**Expect:** At replay, the ~45 min mark (or pre-boundary mark in simulation) stays visually in sync with audio. Segment boundary does **not** jump strokes seconds forward/back — cumulative `getAudioMs` carries across rollover (no reset-to-zero artifact in replay timeline).

**Ignore this run:** Rollover chime volume/UI polish. Upload queue lag for segment 1 while segment 2 records. Simulation-only runs on desktop — flag in Notes; do not mark PASS on item 5 without either full 50 min **or** explicit Andrew acceptance of simulation + spot-check on shorter iOS session.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. Watchdog stall banner (visual + truthful copy)

**Action:** Start recording on **desktop Chrome** or **iPhone Safari** (either acceptable for banner UX). While recording, **force a stall**: revoke microphone permission for the site (browser site settings → Microphone → Block) **or** disable/unplug the active input device for ~45–60 s without ending the session. Watch the workspace banner area.

**Expect:** Within **~30–60 s** (draft checkpoint interval — see N-WATCHDOG-60S), `[data-testid="wb-recording-stall-banner"]` appears with warning tone and copy **"Recording may have stopped — check your microphone."** Console may show `[useAudioRecorder] … event=watchdog-stall`. Tutor is informed — not a silent failure.

**Ignore this run:** Whether recording auto-recovers after re-granting mic (recovery is bonus). Remote-stream / student mic stalls. Empty-rollover watchdog (`empty-rollover` alert type) — different code path.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. macOS Safari — `audio/mp4` no-timeslice path (NOTE)

**Action:** **macOS Safari** on **Preview**. Open workspace → devtools console → **Start recording** → observe console for ~10 s → **End session** (short session is fine). Record whether `event=ios-no-timeslice` fired and which `mimeType` MediaRecorder selected.

**Expect:** **NOTE only — not a hard pass/fail gate.** Document whether macOS Safari hits the `audio/mp4` no-timeslice branch (heuristic: `mime.startsWith("audio/mp4")` in `startRecorderWithDraftPolicy`). If it does, flag for follow-up — UA-gate was deferred; desktop Safari should ideally use WebM/timeslice path. If macOS Safari uses `audio/webm`, note "no-timeslice path not taken — OK".

**Ignore this run:** Blocking merge on this item — it is observational. iOS behavior is covered by item 4.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Residual NOTEs


| ID                 | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N-CSP**          | AudioWorklet loads from a `blob:` URL — tight CSP may log console errors. With the 3-tier fallback (Worklet → ScriptProcessor → `performance.now()`), a CSP-blocked worklet on iOS now degrades gracefully instead of breaking replay: check console for `frame-counter=` source on graph init (`audioworklet` = best, `script-processor` = ok, `perfnow-fallback` = degraded-but-functional). If `perfnow-fallback` appears, investigate CSP and file a follow-up to allowlist `blob:` for AudioWorklet; do NOT block on this. Silent broken replay (t=0 stamps) is no longer possible on this path. |
| **N-WATCHDOG-60S** | Stall detection runs on the 30 s draft-checkpoint interval; first interval initializes baselines — expect **30–60 s** latency before banner, not instant.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **N-MACOSSAFARI**  | No-timeslice path keys off `audio/mp4` MIME, not UA sniff — macOS Safari may share iOS MP4 behavior. Item 7 captures finding; UA-gate deferred.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **N-PRIMING**      | ~47 ms AAC priming offset at segment baseline is accepted fixed error (within 250 ms bar).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **N-BUILD**        | Tip deploy for `636dc92` may still be **BUILDING** on Vercel at smokebook authoring time — branch alias is stable; allow ~2 min cold start.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |


---

## Cross-branch / post-merge

Run this section **after** `phase1/wb-reliability-floor` merges into `v1-redesign` (or `master`). Use the **integration branch preview** (fetch alias via Vercel MCP — do not guess).

**Integration branch:** `v1-redesign` (or `master` at cut time)  
**Integration tip commit:** *TBD at merge*  
**Integration preview:** *TBD — fetch from Vercel MCP*

**Overall integration result:**

- [ ] PASS
- [ ] FAIL

### 1. Regression spot-check — replay sync still holds after merge

**Action:** On the integration **Preview**, repeat item **1** (desktop Chrome short record → replay sync) and item **4** (iPhone ~2 min record → notes/transcript) if iOS hardware available.

**Expect:** No regression vs. this branch smoke; frame-counter logs still present; iOS MP4 path still Whisper-decodable.

**Ignore this run:** Unrelated v1-redesign visual changes.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Smoke findings — 2026-06-13 desktop run

**Finding: CSP-blocked AudioWorklet (all platforms, tier-1 dead)**

Desktop Chrome console showed a repeating CSP violation:

> `Loading the script 'blob:https://<preview>/...' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' 'unsafe-eval'". ... script-src is used as a fallback. The action has been blocked.`

Followed by:

> `[mic-recorder-audio] avx=? AudioWorklet init failed; falling back: Unable to load a worklet's module.`  
> `[mic-recorder-audio] avx=? frame-counter=script-processor`

**Root cause:** The AudioWorklet module was created inline as `new Blob([workletCode]) → URL.createObjectURL(blob)` and loaded via `audioContext.audioWorklet.addModule(blobUrl)`. Our CSP `script-src 'self' 'unsafe-inline' 'unsafe-eval'` does **not** allow `blob:` URLs for scripts, so the worklet was blocked on every platform (not just iOS). Tier-2 (ScriptProcessor) kept the recording clock functional, so no data was lost, but the preferred path was dead everywhere and the console spammed red CSP errors.

**Fix applied (commit on `phase1/wb-reliability-floor`):**

- Created `public/audio/frame-counter-worklet.js` — the processor code verbatim as a plain-JS static file served at `/audio/frame-counter-worklet.js`. Processor name changed from per-session dynamic string to fixed constant `'frame-counter-processor'` (safe because each `AudioContext` has its own isolated worklet scope).
- In `src/lib/mic-recorder-audio.ts`: removed all `Blob`/`createObjectURL` worklet-inlining code; replaced `addModule(blobUrl)` with `addModule('/audio/frame-counter-worklet.js')`.
- **No CSP change required** — same-origin static path loads under `script-src 'self'` without any directive relaxation.
- Added a jest test (`src/__tests__/mic-recorder-audio.test.ts`) asserting `addModule` is called with `/audio/frame-counter-worklet.js` and NOT a `blob:` URL.
- `npx next build` exit 0; `npx jest mic-recorder-audio` 10/10 green.

**Duplicate-init / `state=closed` verdict: BENIGN**

Console showed the graph created → `state=closed` → `state=running` → two `frame-counter=` lines. This is the expected preview-graph → recording-graph handoff: the workspace creates a preview `AudioContext` for mic-level monitoring before recording starts, disposes it (`state=closed`), then creates the real recording graph (`state=running`) when Start is pressed. Two inits per session is correct behavior; there is no double-context leak.

**Re-smoke required for item 1:** After deploying this commit to the preview branch, step 1 must be re-run to confirm:
- Console shows `[mic-recorder-audio] avx=… frame-counter=audioworklet` (no `frame-counter=script-processor`)
- **No CSP violation** errors in the console
- Replay sync still holds (strokes align with audio)

---

## Overall result

Check **PASS** only if every in-scope test item is PASS (deliberate per-item SKIPs must be called out in Notes). Check **FAIL** if any in-scope item fails. Leave both unchecked until the run is complete. Overall verdict is PASS/FAIL only — no overall SKIP.

- [ ] PASS
- [ ] FAIL