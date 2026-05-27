> **SUPERSEDED 2026-05-27.** See [`docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md`](../PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md) for the shipped-state record. This file is preserved for archival reference; do not act on it directly. Reason: work shipped to master as merge `ac92137` 2026-05-17.

# Live A/V device management — mic + camera picker + hotswap — Executor bootstrapper

Copy everything below the rule line into a fresh Composer chat. Do NOT include this header.

---

You are running a feature build for the tutoring-notes app. Composer-class. ~1-1.5 days scope. **Branch + smoke + direct merge to master** — NO PR step. See `AGENTS.md` → "Merging convention (solo-tutor pilot stage)" for the policy: while the pilot is solo and no adversarial CI exists, PRs are pure ceremony with no review value; the smoke against the Vercel Preview URL is the gate. **Target ship: Sunday evening 2026-05-17 so it lands before Sarah's Monday 2026-05-18 session.**

## Workspace + path discipline (read carefully)

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown in this bootstrapper without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `src/hooks/useLiveAV.ts` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useLiveAV.ts`. Do NOT trust your shell's working directory — verify with `Get-Location` (PowerShell) before any file write. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`) — sibling repos are OUT OF SCOPE.

## Branch discipline (read carefully)

**You are starting in a workspace where the active branch may be ANYTHING** — possibly `master`, possibly `phase-4d-polish-tests-docs`, possibly `pdf-page-picker-and-per-page-boards`, possibly something else from earlier work. Cursor's per-workspace git state is shared across chats; you cannot assume the branch is correct just because the chat opened. **Your FIRST action after the read-first reads is to set up the branch correctly.**

Run these commands in order in PowerShell, verifying each succeeds before the next:

```powershell
git status                                            # observe current state; if uncommitted changes exist, STOP and ask the user
git fetch origin                                      # pull latest refs without changing the working tree
git checkout master                                   # explicitly switch to master
git pull origin master                                # ensure master is at the latest (fast-forward; if conflict, STOP and ask)
git log -1 --format='%H %s'                           # verify master tip; expect 9ff5b11 (PDF merge) or later
git checkout -b live-av-device-management             # branch off the now-current master
git status                                            # confirm you are on the new branch with a clean tree
```

If `git log -1` shows master is at a commit OLDER than `9ff5b11` (PDF merge), STOP and tell the user — master is in a state you don't expect.

**After branch setup:**
- Push after Commit 1: `git push -u origin live-av-device-management`. This triggers a Vercel Preview deploy.
- ALL browser smoke testing happens against the **branch Vercel Preview URL**, NEVER against `tutoring-notes.vercel.app` (which is master/production where Sarah's real sessions live).
- **NEVER push directly to master.** Branch → commit → push → smoke on Preview URL → wait for Andrew to confirm smoke pass → only then merge to master (the merge step is in "FINAL STEPS" below; do NOT run it until Andrew has confirmed).

## Project context

Live commercial-pilot app. Sarah's Monday 2026-05-18 session is ~18-24 hours away. Sarah tutors from a Windows desktop using a USB webcam (Andrew confirmed 2026-05-17). The current Live A/V stack (Phase 4a → 4d, shipped) has:

- **Mic picker** in `src/components/recording/MicControls.tsx` with full `enumerateDevices()` + selection, but locked via `lockDevice` flag (`src/hooks/useAudioRecorder.ts:1102-1105`) whenever `recordState === "recording" | "paused" | ("uploading" && segment)`. No mid-recording swap path. **Empirical context: Andrew's USB webcam has an integrated mic; Chrome on Windows defaults to that mic, but only thanks to the existing picker was Andrew able to reliably select it during testing. The mic picker has proven its value on real hardware Sarah will likely use.**
- **NO camera picker at all.** `useLiveAV.requestCamera()` calls `getUserMedia({ video: true })` with no `deviceId` constraint — whatever the browser defaults to is what you get. **By direct analogy to the mic-side empirical proof above, this is the same Chrome-default-device-pick-is-wrong-with-no-in-app-fix risk Andrew personally hit on mic before the mic picker existed. For Sarah on Monday with multiple cameras (webcam + any other camera the system enumerates), Chrome's default may not be her USB webcam, with no in-app way to fix it.**

**Why this is critical for Monday**: the camera picker isn't hotswap insurance — it's "make the camera work on first contact." The mic hotswap is real protection against mid-session USB/Bluetooth disconnect on 60-90 min sessions.

This is a **v1 build**, not perfect-everything. The picker UX should be minimal and clear. Hotswap behavior must not glitch the live stream meaningfully (a <50ms audio swap moment is acceptable; a visible UI freeze or peer-drop is not).

## Read first (in order)

1. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\AGENTS.md` — workspace conventions (additive migrations, ownership assertions, per-session ID logging, CSP discipline, the new solo-pilot merging convention).
2. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\LIVE-AV.md` — **canonical architectural reference** with 11 numbered invariants. You MUST not violate these; if a fix requires bending one, STOP and ask the orchestrator.
3. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useLiveAV.ts` — the live-A/V hook. Read fully. Specifically understand:
   - `requestCamera()` and `requestMic()` — the one-shot acquisition pattern (no swap support today).
   - `localAudioStream`, `localVideoStream` — what's exposed to the workspace.
   - `addLocalTrackToAllPeers` integration with `peer-mesh` — the pattern for getting new tracks onto existing peers.
4. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\av\peer-mesh.ts` — peer-mesh API. You will ADD `replaceLocalTrackOnAllPeers(kind, newTrack)` as sibling to existing `addLocalTrackToAllPeers`. Additive, no breaking change.
5. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\hooks\useAudioRecorder.ts` — read the `lockDevice` logic (lines 1102-1105) and the AudioContext graph construction. You will:
   - Loosen `lockDevice` so the picker stays usable mid-recording.
   - Add a mic source-swap method to the AudioContext graph (disconnect old `MediaStreamAudioSourceNode`, create new from new mic stream, connect to same downstream graph). The MediaRecorder consuming the mix sees no interruption.
6. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\lib\mic-recorder-audio.ts` — read the mixdown graph (`addRemoteAudio` pattern is the template for the new `swapLocalMicSource` method).
7. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\components\recording\MicControls.tsx` — existing mic picker. You will mirror its shape for the new `VideoControls.tsx`.
8. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\components\av\AVTilesPanel.tsx` — where the new `VideoControls` will be mounted (or adjacent — confirm during read).
9. `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\src\app\admin\students\[id]\whiteboard\[whiteboardSessionId]\workspace\WhiteboardWorkspaceClient.tsx` — orchestration layer. Read how it wires `useLiveAV` + `useAudioRecorder` + UI components. The new device-swap flow needs to flow through this.
10. `git log master --oneline -5` — confirm master tip is `9ff5b11` (PDF merge) or later before starting.

## YOUR SCOPE — what is IN this chat

**Goal**: Make camera selection work for first-time-with-webcam users (Sarah Monday). Enable mic + camera hotswap mid-session. Both swap paths use `RTCRtpSender.replaceTrack` for the live WebRTC path. Mic swap additionally swaps the AudioContext source for the recording path.

**Deliverables (one branch — `live-av-device-management` off master — smoke + direct merge, no PR)**:

### Group A: peer-mesh API extension (~30 min)

**Commit 1 — `peer-mesh: replaceLocalTrackOnAllPeers`** at `src/lib/av/peer-mesh.ts`.
- Sibling to `addLocalTrackToAllPeers`. Iterates peers, calls `RTCRtpSender.replaceTrack(newTrack)` on the sender matching `kind`. No SDP renegotiation needed.
- Unit tests in `src/__tests__/av/peer-mesh.test.ts` covering: (a) replaceTrack called on each peer's sender for the matching kind, (b) no-op if no peers, (c) no-op if no matching sender (defensive).
- Log via existing `[peer-mesh] avx=<peerId> event=replace-track kind=<kind>` pattern.
- Push after this commit. Verify Vercel build green.

### Group B: VideoControls component + device enumeration (~half day)

**Commit 2 — `VideoControls.tsx` component scaffold** at `src/components/av/VideoControls.tsx`.
- Mirror the shape of `src/components/recording/MicControls.tsx` (device picker + currently-selected indicator). Camera does NOT need: gain slider, level meter, chime config — strip those.
- Props: `devices: MediaDeviceInfo[]`, `selectedDeviceId: string`, `onDeviceChange: (id) => void`, `isLive: boolean`, `disabled?: boolean`.
- Picker is `<select>` styled to match `MicControls.tsx` chrome (consistency for tutors).
- Show "(allow camera access to choose)" placeholder when `devices.length === 0`.
- Show currently-selected device label as title attribute (long device names like "USB2.0 HD UVC WebCam (1908:2310)" need ellipsis + tooltip).
- DOM tests in `src/__tests__/components/av/VideoControls.dom.test.tsx`.

**Commit 3 — Device enumeration + `ondevicechange` wiring** in `src/hooks/useLiveAV.ts`.
- Add `videoDevices: MediaDeviceInfo[]` and `selectedVideoDeviceId: string | null` to the hook's return shape (additive — existing consumers unaffected).
- On `requestCamera()` success, call `navigator.mediaDevices.enumerateDevices()` and filter to `kind === "videoinput"`. Update `videoDevices`.
- Subscribe to `navigator.mediaDevices.ondevicechange` — on fire, re-enumerate. Critical for "tutor plugs in webcam mid-session" scenario.
- Default `selectedVideoDeviceId` to whatever Chrome picked (`localVideoStream.getVideoTracks()[0].getSettings().deviceId`). User can change via the new `setVideoDevice(deviceId)` method (see Commit 4).
- Unit tests in `src/__tests__/dom/useLiveAV.dom.test.tsx` covering enumeration + ondevicechange.

**Commit 4 — `setVideoDevice(deviceId)` swap method** in `src/hooks/useLiveAV.ts`.
- New method: `setVideoDevice(deviceId: string): Promise<void>`.
- Steps: (1) call `getUserMedia({ video: { deviceId: { exact: deviceId } } })` to acquire new track; (2) stop the OLD video track (release the device); (3) replace `localVideoStream`'s track with the new one; (4) call `peer-mesh.replaceLocalTrackOnAllPeers("video", newTrack)`; (5) update `selectedVideoDeviceId`.
- Error handling: if `getUserMedia` fails (device in use, permission revoked), surface via existing `UseLiveAVError` machinery; do NOT stop the existing track (preserve fallback).
- Log via `[useLiveAV] avx=<peerId> event=set-video-device deviceId=<...>` pattern.
- Unit tests covering happy path + acquisition failure + already-on-that-device no-op.

**Commit 5 — Wire `VideoControls` into the workspace** in `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`.
- Mount `VideoControls` adjacent to existing AV tile chrome (consult `AVTilesPanel.tsx` for placement — likely in or near the local-tutor tile, OR in a new "Devices" section. Use judgment based on existing layout; prefer minimal disruption to existing AV chrome).
- Pass through `useLiveAV.videoDevices`, `useLiveAV.selectedVideoDeviceId`, `useLiveAV.setVideoDevice`.
- Student client (`src/app/w/[joinToken]/StudentWhiteboardClient.tsx`) ALSO gets `VideoControls` — students with webcams (Sarah's adult tutees? unknown but worth supporting) benefit equally.

**Smoke checkpoint after Group B**: Push and have Andrew verify:
- Camera picker appears in workspace.
- Picker enumerates all video devices (he can plug in his webcam to verify multi-device handling).
- Selecting a different camera swaps the live video tile correctly (no peer drop, no UI freeze).
- Plugging/unplugging a webcam updates the picker live.

### Group C: Mic picker unlock + AudioContext source swap (~half day)

**Commit 6 — Loosen `lockDevice` in `useAudioRecorder.ts`** at `src/hooks/useAudioRecorder.ts:1102-1105`.
- Today: `lockDevice = recordState === "recording" || "paused" || ("uploading" && segment)`. This was the right design when there was no way to source-swap the AudioContext mid-recording. Commit 7 below provides that capability; this commit loosens the lock to ONLY `lockDevice = recordState === "uploading" && uploadMode === "segment"` (the upload-in-flight case where swapping would corrupt the in-flight payload).
- Update `MicControls` consumer in the workspace to pass the loosened flag.
- Add a regression test in `src/__tests__/dom/useAudioRecorder.dom.test.tsx` covering: mid-recording picker IS enabled; mid-segment-upload picker IS disabled.

**Commit 7 — AudioContext source swap method** in `src/lib/mic-recorder-audio.ts`.
- New method: `swapLocalMicSource(newMicStream: MediaStream): void`.
- Steps: (1) find the current local-mic `MediaStreamAudioSourceNode`; (2) disconnect it from the downstream graph (the gain + mixdown nodes); (3) create a new `MediaStreamAudioSourceNode` from `newMicStream`; (4) connect it to the same downstream nodes. The MediaRecorder consuming the mix continues uninterrupted (modulo a <50ms swap moment).
- Defensive: if the graph isn't initialized (mic never acquired), no-op.
- Log via `[mic-recorder-audio] avx=<peerId> event=swap-local-source` pattern.
- Unit tests in `src/__tests__/mic-recorder-audio.test.ts` covering: graph topology preserved post-swap; MediaRecorder destination unchanged; no-op when graph absent.

**Commit 8 — Wire mic swap end-to-end** in `useAudioRecorder.ts` + `useLiveAV.ts` + `WhiteboardWorkspaceClient.tsx`.
- `useLiveAV` adds `setMicDevice(deviceId)`: (1) acquire new mic via `getUserMedia({ audio: { deviceId: { exact: deviceId } } })`; (2) stop OLD mic track; (3) replace `localAudioStream`'s track with new one; (4) call `peer-mesh.replaceLocalTrackOnAllPeers("audio", newTrack)` for live peers; (5) call `micRecorderAudio.swapLocalMicSource(newMicStream)` for the recording graph; (6) update `useAudioRecorder`'s `selectedDeviceId` to keep the picker in sync.
- The workspace passes `setMicDevice` as the `onDeviceChange` handler to `MicControls` (replacing whatever stub was there).
- Persist new device choice to localStorage so reload reuses it.
- Acceptance: mid-recording swap → live audio + ongoing recording both pick up the new mic; recording artifact playback shows both pre-swap and post-swap audio mixed correctly.

**Smoke checkpoint after Group C**: Push and have Andrew verify the full smoke matrix below.

### Group D: Docs + tests (~30 min)

**Commit 9 — Update `docs/LIVE-AV.md`** to add a 12th invariant covering the device-swap pattern + the `replaceLocalTrackOnAllPeers` API. Document the AudioContext swap moment as a known "<50ms audible glitch is acceptable" behavior. Document the `ondevicechange` listener.

**Commit 10 — `docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md`** — handoff doc with: feature summary, smoke checklist (mirror the one below), known limitations (none expected, but document AudioContext swap moment + any iOS Safari quirks discovered), follow-ups.

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

Andrew runs this against the branch Preview URL after Commit 8 lands. Don't merge until smoke is green AND Andrew has confirmed.

### Camera picker (Sarah's Monday-blocking path)
- [ ] On the **branch preview URL**, hard-refreshed since the last deploy.
- [ ] Open workspace as tutor. Grant camera permission. Camera picker is visible somewhere in the workspace chrome.
- [ ] Picker dropdown shows ALL video devices (built-in cam, USB webcam, anything else plugged in).
- [ ] Currently-selected device matches what's actually showing in the AV tile.
- [ ] Select a different camera. AV tile swaps to the new camera within ~1s. NO peer drop on the student side. NO UI freeze.
- [ ] Unplug the webcam mid-session. Picker dropdown updates (the unplugged device disappears). AV tile shows the fallback device (or empty state if none).
- [ ] Plug the webcam back in. Picker updates (device reappears). Selecting it re-acquires.
- [ ] Reload tutor tab. Camera selection is restored from localStorage (last-selected device used).

### Mic picker hotswap (the audio-disconnect insurance)
- [ ] Start a session. Tutor speaks for 5s into mic A. Student joins, hears tutor audio fine.
- [ ] Mid-recording, tutor opens mic picker and selects mic B (different USB device). Verify:
  - [ ] Picker IS enabled (not greyed out — the loosened `lockDevice`).
  - [ ] Live audio switches to mic B within ~1s. Student keeps hearing tutor without a peer drop.
  - [ ] Tutor speaks into mic B for 5s. End session.
  - [ ] Recording playback: hear 5s of mic A audio, then ~<50ms swap moment, then 5s of mic B audio. Both should be audible (no silent dropout > 100ms).
- [ ] Picker IS disabled briefly during segment upload (the remaining `lockDevice` condition). Re-enables once upload completes.

### Regression non-regressions
- [ ] All Phase 4d scenarios still pass (re-run a subset from `docs/PHASE-4D-STATUS.md` cross-browser smoke checklist — specifically scenarios 1, 2, 3, 4, 9, 10).
- [ ] PDF page-picker + per-page-board flow still works (smoke a quick 3-page PDF insert).
- [ ] FSM audio-flow gate still releases correctly across all 4 latches (a/b/c/d).

### Tests + lint
- [ ] `npx jest src/__tests__/av src/__tests__/components/av src/__tests__/dom src/__tests__/recording` → green (modulo the pre-existing DB-touching suites).
- [ ] `npx tsc --noEmit` clean.
- [ ] `npx eslint` 0 errors.

## WRAP-UP

1. Full test suite: `npx jest` green (modulo the documented DB failures from prior phases).
2. `npx tsc --noEmit` clean.
3. Final push: `git push origin live-av-device-management`.
4. Report back to Andrew with:
   - **Branch name**: `live-av-device-management`
   - **Preview URL**: `https://tutoring-notes-git-live-av-device-management-arangarx.vercel.app` (deterministic from branch name; confirm via Vercel dashboard if different)
   - **Test counts** (passed / failed; note any new failures vs the baseline)
   - **Smoke checklist** (link or paste the full list above)
   - **Deferred items or surprises** (especially: any AudioContext swap quirks observed on Chrome-Windows, any device-enumeration edge cases)
5. **STOP and wait for Andrew's smoke result. Do NOT merge to master yourself.**
6. **If Andrew confirms smoke pass and asks you to merge**, the merge sequence is:

   ```powershell
   git checkout master
   git pull origin master
   git merge --no-ff live-av-device-management
   git push origin master
   ```

   Per `AGENTS.md` "Merging convention", no PR is required.

## STOP CONDITIONS

- **Don't change `peer-mesh.ts` semantics or the perfect-negotiation pattern.** Only ADD `replaceLocalTrackOnAllPeers`. Don't modify offer/answer flow, ICE handling, or the existing add-track paths.
- **Don't introduce a server-side device-management API.** Pure client-side feature.
- **Don't touch the FSM `lifecycle-machine.ts`.** Device swaps are below the FSM's level of abstraction; the FSM doesn't care what specific device is providing the audio, only that audio is flowing.
- **Don't change recording outbox shape or the upload pipeline.** Mic swap happens at the AudioContext source level; the downstream graph + MediaRecorder + outbox are unchanged.
- **Don't add chrome that distracts from the existing AV UX.** New `VideoControls` should mirror existing `MicControls` styling discipline (compact, side-panel-friendly, no big modal dialogs).
- **Don't drift past Sunday evening 2026-05-17.** Sarah Monday morning is the soft deadline. If you're at hour 8 and Group C (mic swap) isn't done, STOP and ship Groups A+B (camera picker only) as a partial — that closes the Sarah-Monday-blocking piece. Andrew will decide whether to ship mic swap as a follow-up branch.
- **Don't merge to master yourself.** Branch + push + smoke + WAIT for Andrew's go-ahead.
- **Don't modify the master plan file.** Orchestrator's job.

## HARD RULES

- Never push directly to master without smoke + Andrew's confirmation. Branch + smoke + merge per `AGENTS.md`.
- Don't modify the master plan file. Orchestrator's job.
- Reuse existing primitives. New `VideoControls` mirrors `MicControls` shape. New `replaceLocalTrackOnAllPeers` mirrors `addLocalTrackToAllPeers` shape. New `swapLocalMicSource` follows the AudioContext graph pattern already established by `addRemoteAudio` in `mic-recorder-audio.ts`.
- Per-session ID logging mandatory. Reuse `avx` prefix; new sub-events: `set-video-device`, `set-mic-device`, `replace-track`, `swap-local-source`.
- Smoke against the **branch Vercel Preview URL** only. Never smoke against production.
