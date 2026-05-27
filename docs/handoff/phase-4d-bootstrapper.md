> **SUPERSEDED 2026-05-27.** See [`docs/PHASE-4D-STATUS.md`](../PHASE-4D-STATUS.md) for the shipped-state record. This file is preserved for archival reference; do not act on it directly. Reason: work shipped to master as merge `41bf006` 2026-05-16.

# Phase 4d — Executor bootstrapper

Copy everything below the rule line into a fresh executor chat. Do NOT include this header.

---

HALT — DO NOT EXECUTE ANY TOOLS YET.

You are the executor for Phase 4d (graceful degradation polish + bug fixes from pilot smoke + per-peer GainNode moderation restore + Playwright integration tests + `docs/LIVE-AV.md` + final cross-browser smoke + MODEL-SWITCH RETURN, 4th and LAST of 4 Phase 4 sub-chats) of the tutoring-notes pilot-ready master plan. Phase 4a/4b/4c all shipped to master. Phase 4c is at merge `d7fd583` (--no-ff, 30 commits, real-pilot smoke-tested refresh-free with 3 peers on real cellular 2026-05-15). Verify the merge sha with `git log master --oneline -10` before starting — if `d7fd583` is not in master, STOP and tell the user 4d cannot start.

Phase 4 has a MODEL-SWITCH GATE. Phase 4d inherits it through completion. The MODEL-SWITCH RETURN to Composer is at the END of Phase 4d (the final commit + handoff), NOT at the start. Stay on Opus through 4d. After your wrap-up message to the user, Phase 5+ will be back within Composer's scope.

Send the user this message verbatim and wait for explicit confirmation:

> "Phase 4d needs Claude Opus 4.7 (or an equivalent stronger model — same model class used for Phase 4a/4b/4c). This is the final Phase 4 sub-chat; after my wrap-up, the orchestrator will route Phase 5+ back to Composer. Please confirm you have switched and reply 'switched' so I can proceed."

Do not infer confirmation from anything else. Do not begin Task 1 until the user replies with "switched" or equivalent confirmation.

═══════════════════════════════════════════════════════════
EVERYTHING BELOW THIS LINE IS FOR AFTER THE USER CONFIRMS
═══════════════════════════════════════════════════════════

## Workspace + path discipline (read carefully)

Working repository root: **`c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`** (Windows absolute path).

**ALL file paths shown in this bootstrapper without a `c:\` drive-letter prefix are RELATIVE to that root.** Before any shell command, `Read`/`Write`/`Edit` tool call, file operation, or filename in a log message, you MUST prepend the absolute root. Example: `docs/PHASE-4C-STATUS.md` resolves to `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes\docs\PHASE-4C-STATUS.md`. Do NOT trust your shell's working directory to be set correctly — verify with `pwd` (or `Get-Location` on PowerShell) before any destructive operation. NEVER create files at a path that starts with a sibling-repo name (e.g. `agenticPipeline/...`) — sibling repos require their own absolute root.

## Branch discipline (read carefully)

- Create branch: `git checkout -b phase-4d-polish-tests-docs` (off master at `d7fd583` or later).
- Push immediately after Commit 1: `git push -u origin phase-4d-polish-tests-docs`. This triggers a Vercel Preview deploy. The preview URL appears in your `git push` output AND in the Vercel dashboard.
- Subsequent commits: `git push` (no `-u` needed); each push redeploys the preview.
- ALL browser smoke testing happens against the **branch Vercel Preview URL**, NEVER against `tutoring-notes.vercel.app` (which is master/production where Sarah's real sessions live).
- **NEVER push to master.** PR + review path only. If you accidentally `git push origin master`, STOP immediately and tell the user.

## Project context

Live commercial-pilot app — Sarah uses this for real sessions, and her real Monday 2026-05-18 session is the first post-4c real-user test. Never push broken code to master. The pilot is currently unblocked for live-A/V function (Sarah will still run a backup recorder Monday until Phase 2 + Phase 6 reliability work lands — see "CLAIM CORRECTION" in the master plan Status section for the honest framing); your job in 4d is to harden the live-A/V stack without regressing what 4c shipped.

## Read first (in order)

1. **`docs/PHASE-4C-STATUS.md`** (779 lines — canonical 4c handoff). This is your single most important read. It documents: the three hotfix root-cause blockquotes (late-camera-grant disposes mesh, Permissions-Policy soft-nav trap, late-subscribe race / peer stuck on Connecting), the AV architecture as it actually shipped, the mount-phase logging contract, and the open follow-ups list (mirrored in `docs/BACKLOG.md`).
2. **`docs/BACKLOG.md`** — full text of the 14 open follow-ups from 4c pilot smoke. You will be ADDRESSING items 1, 5, 6, 7, 8, 9, 10, 11 from that list (plus original 4d Task 8 graceful degradation polish + Task 9 `docs/LIVE-AV.md`). Items 3 (TURN), 8 (Whisper CJK), 9 (AI form-fill Assessment), 13 (rotateJoinToken), 4 (workspace SSR 500), 5 (tutor-tab follow) are slotted elsewhere — do not pull them into 4d.
3. `c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`. Focus on:
   - **Status section** — the Phase 4c shipped block (note the 7 architecturally-significant intermediate commits beyond the original 4c bootstrap scope; the operational `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT=false` Vercel Production env change).
   - **Phase 4 section header** — final 4d task partitioning (13 items) and **the 5 bootstrapper-deviation lessons captured from 4c execution** (Permissions-Policy site-wide, peer-mesh new methods, sync-client BufferedRemoteSignal, single mixdown architecture, auto-pause already shipped). You must honor all five.
   - **Pillar 2 update** — the 4c mixdown architecture trade-off (single audio file, not per-`streamId`). This is the load-bearing context for Task 4 (per-peer GainNode moderation restore).
   - **Captured 2026-05-15 from Phase 4c pilot smoke** subsection — the per-item slot table (so you know what's IN 4d vs slotted elsewhere).
4. `AGENTS.md` — workspace conventions. Per-session ID logging (`wbsid`, `rid`, `obx`, `snp`, `pvw`, `avx`, `peer`). CSP discipline (you are NOT changing Permissions-Policy in 4d; if you find yourself reaching for it, STOP — 4c's site-wide widening is final).
5. `src/lib/whiteboard/sync-client.ts` — note the `BufferedRemoteSignal` queue 4c added (64 entries / 8s TTL, mirrors `onRoomPeersChange` replay). Do NOT break this when wiring Playwright integration tests; your test mocks must preserve the late-subscribe replay semantic.
6. `src/lib/av/peer-mesh.ts` — read the CURRENT source for the API surface. **The original `docs/PHASE-4A-STATUS.md` "Public API" block is STALE.** 4c added `addLocalTrackToAllPeers` (hotfix #1 `63e9ed0` — for late camera grant without disposing mesh) and implicit-add-on-inbound-offer (hotfix #3 `5dd6314` — for the late-subscribe race). Confirm the current method list against the source before writing any test or doc that names methods.
7. `src/hooks/useLiveAV.ts` — the final hook contract. Read its return shape. Polish items must consume this as-is.
8. `src/lib/recording/mic-recorder-audio.ts` — the `addRemoteAudio` API. Single audio mixdown lives here. This is where per-peer GainNode moderation restore (Task 4) attaches.
9. `src/components/av/` — current state of `AVTile.tsx`, `AVTilesPanel.tsx`, `AVPermissionsPrompt.tsx`, `AVControls.tsx` as 4c left them. Polish items modify these; new components for the GainNode moderation row may live here too.
10. `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` — current tutor mount. Polish items 8 (waiting UI redundancy) and 9 (single-student name fallback) and 11 (recording-starts-2s-before-peer-audio race) live here or nearby.
11. `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` — current student mount. Polish items 6 (mute mic propagation bug) and 10 (AVTile autoplay-block overlay) touch the student side too.
12. `src/lib/recording/lifecycle-machine.ts` — FSM. Item 11 (recording-starts-2s-before-peer-audio) likely needs an FSM input or gate change to wait for first non-empty `audioStream` on a participant before allowing capture, not just presence.
13. `git log master --oneline -10` to confirm `d7fd583` is in master and master is your starting point.

Confirm to the user once these reads complete. Then start Task 1.

## YOUR SCOPE — what is IN this chat

**Goal**: Close out Phase 4. Take the live-A/V stack from "real-pilot-tested refresh-free with 3 peers" to "polished, regression-protected, documented, and cross-browser-validated." Restore the per-peer audio moderation toggle that the 4c mixdown refactor removed. Fix the bugs surfaced in 4c pilot smoke. Lock in the architecture in code via Playwright integration tests and in prose via `docs/LIVE-AV.md`. Then hand off Phase 5+ back to Composer.

**Deliverables (one branch, one PR — `phase-4d-polish-tests-docs` off master)**:

### Group A — Polish (small UI fixes, low risk, do first)

1. **Graceful degradation polish** (original 4d Task 8). In `src/components/av/`:
   - **Mic-denied placeholder copy.** When `useLiveAV.hasMicPermission === "denied"`, the AV tile (or local-tile preview) should show a clear, non-alarming message: "Microphone blocked — click the camera icon in your browser address bar to allow." Plus a "Try again" button that re-calls `requestMic()`. The "Try again" wiring is already in 4c; polish the copy + visual styling.
   - **Cam-denied initials placeholder.** When `hasCamPermission === "denied"` OR `isCamMuted === true`, the tile shows the participant's initials in a circle on a colored background (deterministic color from `peerId` hash so it's stable across reloads) instead of a blank `<video>` element. Initials source: `participant.label` first word(s); fall back to `participant.role` initial.
   - **Peer-failed "Reconnecting…" tile copy + styling.** Map `participant.peerConnectionState` and `iceConnectionState` to a clear pill: `"connected" → no pill`, `"connecting"/"new" → blue "Connecting…" pill`, `"disconnected" → amber "Reconnecting…" pill`, `"failed" → red "Connection failed" pill with a Retry button that triggers `mesh.restart(peerId)``, `"closed" → red "Disconnected" pill (no Retry — peer left)`. The ICE-vs-PC state mapping logic should live in a small helper (`src/components/av/connection-state-mapping.ts` or similar) with unit tests for each state combination.
   - DOM tests under `src/__tests__/components/av/` cover all denied-state + connection-state-pill variants.

2. **"Waiting for student" UI redundancy collapse** (4c smoke item 12). Today the workspace shows the same "waiting for student" message in 4 surfaces (3 pills + 1 banner) per Andrew's report. Audit `WhiteboardWorkspaceClient.tsx` + related components, identify the 4 redundant surfaces, collapse to ONE primary banner + at most ONE secondary status indicator. Preserve the FSM-`armed (awaiting_first_participant)` semantic — that state is the source of truth; UI just renders it. DOM test asserts only the intended surfaces render the message.

3. **Single-student name fallback** (4c smoke item 7). Today: when there's exactly one remote participant, the tile shows a `peerId`-derived label like "Student a3f7" instead of the actual `student.name`. Fix: when `participants.length === 1` AND `role === "tutor"` (i.e., one student on the tutor side), look up `student.name` from the workspace's student record and pass it as `participant.label`. Multi-student case keeps the peerId-derived fallback (until Phase 6 wires server-side participant identity). DOM test covers single-student and multi-student cases.

### Group B — Bug fixes (need root-cause investigation, do after polish so the codebase is settled)

4. **Duplicate participant tile when peer reloads mid-session** (4c smoke item 5). Symptom: when a peer reloads their tab, the old tile lingers ~30s before being pruned by the 5s presence-grace + WebRTC timeout. During that window the tutor sees TWO tiles for the same student. Root cause hypothesis: the new peer after reload has a fresh `peerId` (random per-mount via `crypto.randomUUID()`), so presence treats it as a new participant; the old peerId's tile waits for presence eviction to clean up. Fix options to evaluate (pick the cleanest):
   - **(a) Stable peer id derived from join token + browser-session.** Persist `peerId` in `sessionStorage` keyed by join token. Reload reuses the same `peerId`; presence sees it as "same peer reconnecting"; mesh.restart kicks in. Lowest-risk; doesn't touch wire schema.
   - **(b) Faster presence eviction on reload.** Add an explicit `peer-leave` envelope sent on `window.beforeunload`. Receivers prune the tile immediately. Doesn't fix the underlying "two peerIds for same user" issue — just reduces the window.
   - **(c) Both.** Belt and suspenders.
   - Recommendation: start with (a). Document the choice in `docs/PHASE-4D-STATUS.md`. DOM + jest tests for the reload scenario.

5. **Student-side "Mute mic" toggle doesn't propagate to remote** (4c smoke item 6). This is a BUG, not a feature gap — local `track.enabled = false` on the student's outbound audio track should make the tutor's `<audio>` element go silent (the track's silence flows through WebRTC). Verify with browser DevTools: when student clicks Mute mic, does the local track's `enabled` actually flip? If yes, why is remote audio still flowing? Hypothesis: the toggle is flipping a UI-only state without touching the actual `MediaStreamTrack`. Trace from `<AVControls />` mute-mic onClick → `useLiveAV.toggleMicMute()` → local stream's audio track. Fix at the layer that's broken. Add a regression test that asserts: when `toggleMicMute()` is called, the local stream's audio track `enabled` is `false`.

6. **Recording starts ~2s before peer audio is flowing** (4c smoke item 11). Race: FSM's `armed → recording` transition fires on presence (peer appeared), but WebRTC ICE convergence + first audio packet flow can take 2-3 seconds after presence. Result: first 2s of recording is silence. Fix: add an FSM input gate — `participantsWithFlowingAudio: Set<peerId>` — that requires `MediaStream.getAudioTracks()[0]` exists AND has produced at least one non-silent frame (or just "is unmuted and live") before the participant counts toward the `armed → recording` transition. Where to detect "audio is flowing": either (a) `track.muted === false` (cheap, may have false positives), or (b) `AudioContext` + `AnalyserNode` poll the byteTimeData and threshold (more accurate, modest CPU cost). Recommend (a) with a 200ms confirmation window. Update FSM + workspace integration + DOM test. **Important**: do NOT regress the existing `solo_tutor` mode where recording starts immediately on tutor mic (no peer required). This gate only applies to the `awaiting_first_participant → recording` transition.

### Group C — Feature restore (medium risk, needs care around the mixdown architecture)

7. **Per-peer audio moderation toggle restore via per-stream `GainNode`** (4c smoke item 6 / plan Pillar 2 item; promised in 4c bootstrapper but cut during the mixdown refactor). The 4c `mic-recorder-audio.ts addRemoteAudio` mixes all remote audio into a single recording. The original per-peer "Mute this student in MY recording" toggle (from the 4c bootstrapper spec) was removed because the mixdown collapsed the per-stream addressability.
   - Restore by inserting a `GainNode` per remote stream in `addRemoteAudio` (between the remote stream's source node and the mixdown destination). Default gain = 1.0 (audible). Tutor's moderation toggle for a given peer flips the GainNode to 0.0 (muted in recording only — live audio playback unaffected because the live `<audio>` element has its own srcObject path, independent of the recording mixdown).
   - Restore the per-participant moderation row in `<AVControls />` (tutor-only — same prop that hides student-side moderation rows still applies). Toggle calls a new `useLiveAV.setRemoteRecordingGain(peerId, gain: 0 | 1)` method, which threads through to `mic-recorder-audio.setRemoteGain(peerId, gain)`.
   - **API extension to `useLiveAV`** required. This is justified — it's restoring a contract the 4c bootstrapper promised and the user-visible feature the orchestrator decided to keep. Document the new method in the hook's return-shape comment.
   - Test: jest unit test for `mic-recorder-audio.setRemoteGain` (mocks AudioContext); DOM test for the moderation row toggle flipping the right hook method.

### Group D — Tests (do after Groups A/B/C so tests reflect the final code)

8. **Playwright integration tests** (`tests/integration/live-av.spec.ts` or matching project convention). The goal is regression protection for the 4c-shipped refresh-free behavior + the 4d fixes. Test scenarios (each in its own `test()` block):
   - **2-peer happy path**: tutor opens workspace, student opens join link, both grant permissions, both see two tiles, audio flows both directions. Use `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` browser flags (Playwright `chromium` launchOptions) so `getUserMedia` returns synthetic audio + video.
   - **3-peer canary**: same but a third tab joins. All 3 see 3 tiles.
   - **Late-subscribe race protection** (4c hotfix #3 regression test): peer A joins, peer B joins ~1s later. Both end up connected without refresh. Tests `BufferedRemoteSignal` queue + implicit-add-on-inbound-offer behavior.
   - **Late camera grant doesn't dispose mesh** (4c hotfix #1 regression test): peer A joins with mic only, peer B joins with mic only, peer A then grants camera. Mesh is preserved; peer B's tile for peer A now shows video.
   - **Permissions-Policy soft-nav stability** (4c hotfix #2 regression test): tutor opens dashboard (a non-workspace route), navigates to workspace via Next.js soft-nav (no hard refresh), `getUserMedia` works.
   - **Auto-pause-on-disconnect**: tutor + student connected, recording active. Student closes tab. Recording pauses (FSM transitions to `paused`). Student rejoins. Recording resumes.
   - **Reload-doesn't-duplicate-tile** (4d Task 4 regression test): peer A joins, peer A reloads. Tutor sees one tile (not two) within ~3s of reload.
   - **Student mute propagates** (4d Task 5 regression test): student clicks Mute mic. Tutor's `<audio>` for student goes silent within ~1s. Student unmutes. Audio resumes.
   - **Recording doesn't start before peer audio** (4d Task 6 regression test): tutor in `awaiting_first_participant`. Student joins but mic is muted (synthetic stream emits silence). FSM does NOT transition to `recording`. Student unmutes. FSM transitions.
   - WebRTC-mock setup helper in `tests/integration/helpers/webrtc-fake.ts` so each test doesn't repeat the synthetic-stream boilerplate.
   - **Important**: if Playwright proves to be a multi-day rabbit hole (WebRTC + Chromium fake-media + presence-replay timing can all be subtle), STOP after the first 2-3 scenarios are green and surface to the orchestrator. The 4-5 remaining scenarios can split to a Phase 4e if needed.

### Group E — Docs

9. **`docs/LIVE-AV.md`** (original 4d Task 9 — cross-cutting architecture overview). This is the canonical doc for anyone touching live A/V in the future. Pattern: detailed-but-not-exhaustive, like `docs/RECORDER-LIFECYCLE.md`. Sections:
   - **One-paragraph overview**: what the live-A/V stack does, what pillars it lives in (Pillar 6 transport, Pillar 5 UI panel, Pillars 1 + 2 recording integration).
   - **Architecture diagram (ASCII or mermaid)**: sync-client + signaling + peer-mesh + useLiveAV + AV components + remote audio mixdown into recording outbox. Show the wire envelopes (`webrtc-signal`, `presence`) ride the same encrypted channel as scene messages.
   - **Public APIs of the core modules**: `useLiveAV` return-shape, `peer-mesh` methods (use the CURRENT source, not the stale 4a doc), `signaling` muxer, sync-client extensions (`onRoomPeersChange`, `BufferedRemoteSignal`), `mic-recorder-audio.addRemoteAudio` + `setRemoteGain`.
   - **The mount-phase logging contract**: `wbsid=<id> avx=<id> peer=<id>` discipline. List every state transition that must log.
   - **Permissions-Policy decision**: site-wide widening, NOT per-route, with the Next.js soft-nav-reuses-document trap as the rationale. **This is a permanent warning** — future security-header phases must not "tighten" it back per-route.
   - **The single-mixdown recording architecture**: trade-offs (simpler replay, no per-speaker transcription without diarization), forward link to Phase 6's transcription approach.
   - **Common questions cheat sheet**: "Why is the participant tile stale after reload?", "Why doesn't the student's mute affect the recording?", "When does recording start?", "How do I add a new wire envelope?".
   - Cross-link from `docs/RECORDER-LIFECYCLE.md` (add a "see also" line at top) so the recorder doc points at this for live-A/V details.

10. **`docs/PHASE-4D-STATUS.md`** (per-sub-phase handoff, pattern matches PHASE-4A/4B/4C-STATUS.md). Document what shipped, the design choices for each Task (especially Task 4 reload fix option choice), what 4e would inherit if any items split out, and the cross-browser smoke matrix results from the user.

### Group F — Cross-browser smoke (user-driven, after code is shipped to preview)

11. **Cross-browser smoke matrix** (original 4d task). Provide the user with a checklist they run against the Vercel preview URL covering: Chrome (desktop), Firefox (desktop), Safari (desktop), Safari (iPadOS), Chrome (Android), Edge (desktop). Per browser: 2-peer + 3-peer + mute propagation + reload-doesn't-duplicate + recording-doesn't-start-early. Document Safari/iPadOS-specific quirks (`setLocalDescription({type: "rollback"})` semantics, device-picker behavior). Capture results in `docs/PHASE-4D-STATUS.md`.

### Group G — Wrap

12. **PR + handoff**: see WRAP-UP section below.
13. **MODEL-SWITCH RETURN** (final step before closing this sub-chat): your wrap-up message to the user MUST include the verbatim string `MODEL-SWITCH RETURN — Phase 4 complete. Phase 5+ is back within Composer's scope.` so the orchestrator's next chat knows to route to Composer.

## What is OUT of this chat (slotted elsewhere)

- **TURN deployment for cellular peers** (slotted Phase 5/6 timeframe; was in 4d revised scope but pulled OUT to keep 4d tractable for Sarah Monday). If a cellular peer cannot connect during your cross-browser smoke, capture the failure mode for the TURN spike but do not deploy TURN in 4d.
- **Workspace SSR 500** (slotted as opportunistic Composer-class investigation; needs Vercel function log dig — not in 4d scope).
- **Tutor-tab follow on fresh session create from dashboard** (slotted Phase 5 task 5).
- **Whisper transcribing English as CJK** (slotted Phase 6 task 7).
- **AI form-fill missed Assessment field** (slotted Phase 6 task 8).
- **`rotateJoinToken` affordance** (slotted Phase 8 task 9).
- **Privacy + terms mortensenapps.com link consistency** (slotted Phase 8 task 8 — may pull forward if Andrew's Google OAuth verification round specifically asks).
- **Per-student `recordingAutoPauseOnDisconnect` Prisma column** (the original Phase 2 task 1 second-half; auto-pause itself is shipped via FSM `armed` state; per-student opt-out deferred until Sarah asks).
- **Per-track audio in parent share** (Pillar 2 / Phase 6 architectural decision — speaker diarization on mixdown vs revisit recording architecture; not for 4d).
- **Wire-level mute hand-off** (post-v1, out-of-scope at every sub-phase including 4d).
- **Drag-to-dock + collapse for AVTilesPanel** (nice-to-have; if 4c didn't ship it and 4d's polish budget is thin, leave for post-pilot).

If you find yourself adding any of these in 4d, STOP and re-read the partitioning.

## CRITICAL CONSTRAINTS (architectural rules from 4c lessons + relevant Pillars)

- **DO NOT change Permissions-Policy.** 4c's site-wide widening (`c3a8bbe`) is final. The per-route trap (Next.js server-action soft-nav reuses the document) is real and documented. If you reach for `src/middleware.ts` to tighten or scope, STOP.
- **DO NOT regress the `BufferedRemoteSignal` queue** in `sync-client.ts` (4c hotfix #3 `5dd6314`). Playwright tests must preserve the late-subscribe replay semantic — your WebRTC-mock helper has to surface signals in the order the queue + implicit-add-on-inbound-offer expect.
- **DO NOT regress `peer-mesh.addLocalTrackToAllPeers`** (4c hotfix #1 `63e9ed0`). The late-camera-grant test (Group D, Playwright scenario "Late camera grant doesn't dispose mesh") protects this; if it goes red, the regression is what you must fix, not the test.
- **DO NOT roll back the single-mixdown architecture.** Task 4 (per-peer GainNode moderation) ADDS to the mixdown; it does not split it back into per-stream `MediaRecorder` instances. Per-stream recording was traded off in 4c for simpler replay; the trade-off stands. If you find yourself reaching for `useRemoteMicRecorders` (now removed), STOP.
- **`peer-mesh.ts` may be EXTENDED in 4d if a bug requires it, but the bar is high.** 4c set the precedent (two hotfix extensions) but only with clear justification documented in the merge commit + PHASE-4C-STATUS.md. If you need to extend it for 4d, do the same: justify in the commit message + PHASE-4D-STATUS.md.
- **`useLiveAV.ts` extension for `setRemoteRecordingGain(peerId, gain)` (Task 4)** is the only intentional API addition in 4d. Document it in the hook's return-shape comment + PHASE-4D-STATUS.md. Other API additions need stop-and-ask.
- **Pillar 1 (multi-participant FSM)**: 3-peer canary remains non-negotiable. Every Playwright scenario that exercises participants must include the 3-peer variant.
- **Pillar 2 (multi-stream outbox)**: outbox row schema unchanged. Tutor mic `streamId: "tutor:mic"`. The mixdown still writes under `tutor:mic` — GainNode moderation does NOT introduce a new `streamId` (the moderated peer's audio is just zeroed in the mixdown).
- **Pillar 3 (atomic end-session)**: do NOT change `endWhiteboardSession`. The 4c shipped behavior is correct and Sarah-tested.
- **Pillar 5 (audio control panel)**: `RecordingControlPanel` is the tutor mic surface. Per-peer moderation row lives in `<AVControls />`. Do NOT merge them.
- **Pillar 6 (Live A/V transport)**: presence + signal envelopes ride the same encrypted envelope as scene messages. Do NOT introduce a parallel transport. Do NOT touch encrypt/decrypt/IV/key handling.
- **Per-session ID logging is mandatory** for every new state transition you add. `wbsid=<id> avx=<id> peer=<id>` shape. Reuse existing prefixes; do NOT introduce new ones. New state transitions to log: GainNode moderation toggle flip per peer, reload-tile-pruning event, audio-flow-confirmed gate transition, mic-mute track.enabled flip.
- **Additive migrations only.** No DB schema changes expected in 4d (per-student `recordingAutoPauseOnDisconnect` was deferred; nothing else needs DB).
- **Don't modify `useAudioRecorder.ts`.** Tutor mic path is load-bearing.
- **Don't modify the `endWhiteboardSession` server action** or Phase 1b's atomic drain-then-end pattern.
- **Don't change wire-envelope encryption.**
- **Hotfix policy**: branch + PR. No master pushes. If you discover a blocking bug in master unrelated to 4d, STOP and ask the user (this happened during 4c with the late-subscribe race; the orchestrator may decide to fold it into 4d as a hotfix or kick to a separate chat).

## EXECUTION ORDER (recommended commit cadence)

Work in groups, polish first (low risk, settles the UI before tests pin behavior), then bugs (after polish so root-cause investigations don't fight UI churn), then GainNode restore (medium risk; the architectural-sensitive item), then tests (after code is stable so tests aren't rewritten), then docs (after everything is final). Smoke matrix is the user's job after you push.

1. **Commit 1 — Graceful degradation polish** (Group A item 1).
   - `AVTile.tsx` + helper + tests for mic-denied copy, cam-denied initials placeholder, connection-state pills.
   - Verify: `npx jest src/__tests__/components/av` green; `tsc --noEmit` clean.

2. **Commit 2 — Waiting-for-student UI redundancy collapse** (Group A item 2).
   - Audit + collapse; DOM test asserts only intended surfaces.
   - Verify: relevant jest + tsc clean.

3. **Commit 3 — Single-student name fallback** (Group A item 3).
   - Hook up `student.name` lookup; DOM test for single + multi-student cases.

4. **Commit 4 — Duplicate-tile-on-reload fix** (Group B item 4).
   - Implement chosen option (recommend (a) — stable peerId via sessionStorage).
   - Document choice in PHASE-4D-STATUS.md (start the doc here even if it's a stub).
   - Tests cover the reload scenario.

5. **Commit 5 — Student-side mic-mute propagation bug fix** (Group B item 5).
   - Trace the broken layer; fix; regression test asserts `track.enabled` flips.

6. **Commit 6 — Recording-starts-before-peer-audio race fix** (Group B item 6).
   - FSM input gate + integration in workspace mount; DOM test.
   - **Verify the solo_tutor mode still starts recording immediately** (regression test).

7. **Commit 7 — Per-peer GainNode moderation restore** (Group C item 7).
   - `mic-recorder-audio.setRemoteGain` + `useLiveAV.setRemoteRecordingGain` + AVControls row + tests.
   - This is the highest-risk change in 4d (touches the recording mixdown). Run the full `npx jest` after this commit.

8. **Commit 8 — Playwright integration tests** (Group D item 8).
   - Start with WebRTC-mock helper + happy-path scenarios (2-peer + 3-peer). Verify green.
   - Add regression-test scenarios one at a time, verifying green between adds.
   - If Playwright proves to be a multi-day rabbit hole, STOP at 2-3 green scenarios and surface to the orchestrator.

9. **Commit 9 — `docs/LIVE-AV.md`** (Group E item 9).
   - Full architecture doc per the spec above.
   - Add the cross-link from `docs/RECORDER-LIFECYCLE.md`.

10. **Commit 10 — `docs/PHASE-4D-STATUS.md` final** (Group E item 10).
    - Finalize the handoff doc started in commit 4.
    - Document Task 4 option choice, any deferrals, and the cross-browser smoke matrix structure (user fills in results).

After commit 10: full `npx jest` + `npx tsc --noEmit` + `npx playwright test` once more. Push.

## WRAP-UP

1. Full test suite: `npx jest` (modulo the 8 pre-existing DB-dependent failures); `npx playwright test` (new integration suite green); `npx tsc --noEmit` clean.
2. Push: `git push -u origin phase-4d-polish-tests-docs`.
3. Open PR via GitHub web UI: `https://github.com/Arangarx/tutoring-notes/compare/master...phase-4d-polish-tests-docs`.
4. PR title: `Phase 4d — live A/V polish + bug fixes + GainNode moderation + Playwright tests + LIVE-AV.md (Phase 4 complete)`.
5. PR body (keep tight, ~900 chars; longer summaries belong in `docs/PHASE-4D-STATUS.md`):

   ```markdown
   ## Phase 4d — live A/V polish + tests + docs (4 of 4, Phase 4 complete)

   Closes out Phase 4. Pilot is unblocked; this hardens what 4c shipped.

   - Polish: denied-state copy, cam-muted initials placeholder, connection-state pills, waiting-for-student UI dedupe, single-student name fallback.
   - Bugs from 4c pilot smoke: duplicate-tile-on-reload (stable peerId), student mute-mic propagation (track.enabled flip), recording-starts-before-peer-audio race (FSM audio-flow gate).
   - Per-peer audio moderation restored via `GainNode` per remote stream in the mixdown (live audio playback unaffected). Adds `useLiveAV.setRemoteRecordingGain`.
   - Playwright integration tests cover happy-path 2-/3-peer + the three 4c hotfix regressions + auto-pause + 4d fixes.
   - `docs/LIVE-AV.md` — cross-cutting architecture doc.

   See `docs/PHASE-4D-STATUS.md`. Phase 4 complete; Phase 5+ returns to Composer.
   ```

6. Report back to the user with: PR URL, total test counts (jest + playwright separately), any items that split out to a Phase 4e (especially TURN if cellular smoke surfaces it, Playwright scenarios if the rabbit hole hit), the cross-browser smoke checklist for them to run, and the verbatim string `MODEL-SWITCH RETURN — Phase 4 complete. Phase 5+ is back within Composer's scope.`

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

(Phase 4d adds polish + fixes; the user's job is to validate the fixes hold up in real browsers Sarah's family will use. Cross-browser is the new dimension vs 4c smoke.)

Per browser (Chrome desktop, Firefox desktop, Safari desktop, Safari iPadOS, Chrome Android, Edge desktop):

- [ ] I am on the **branch preview URL** (NOT `tutoring-notes.vercel.app`), and I have hard-refreshed since the last deploy.
- [ ] Vercel build completed cleanly for the `phase-4d-polish-tests-docs` branch.
- [ ] **2-peer happy path**: tutor opens workspace, student opens join link. Both grant permissions. Both see two tiles within ~5s. Audio flows both directions. (4c regression check.)
- [ ] **3-peer canary**: 3rd tab joins. All see 3 tiles. (4c regression check.)
- [ ] **Denied-state copy**: deny mic permission. Tile shows the polished "Microphone blocked" copy + "Try again" button (not raw state name). Click Try again, re-prompt fires.
- [ ] **Cam-muted initials placeholder**: mute camera. Tile shows initials in a colored circle, not a blank `<video>` element. Color is stable across reload.
- [ ] **Connection-state pill**: temporarily disable wifi on one peer. Other peer's tile shows "Reconnecting…" amber pill within ~10s. Re-enable wifi. Pill clears.
- [ ] **Waiting-for-student UI**: tutor mounts workspace alone. The "waiting for student" message appears in ONE primary banner (not 4 redundant surfaces). Pill is amber.
- [ ] **Single-student name fallback**: with exactly one student joined, tutor's tile for the student shows `student.name` (not "Student a3f7").
- [ ] **Reload-doesn't-duplicate-tile** (4d Task 4): peer reloads tab. Tutor sees ONE tile (not two) within ~3s. Stale tile does not linger 30s.
- [ ] **Student mute propagates** (4d Task 5): student clicks Mute mic. Tutor's audio for student goes silent within ~1s. Unmute. Audio resumes.
- [ ] **Recording doesn't start early** (4d Task 6): tutor in awaiting_first_participant. Student joins with mic muted (use AVControls to mute before joining). Recording does NOT start. Student unmutes. Recording starts within ~1s.
- [ ] **Per-peer moderation toggle** (4d Task 7): mid-session, tutor enables "Mute student in MY recording" for one peer. Student's live audio continues playing to tutor (live unaffected). End session, replay confirms muted-period student audio is absent from the recording.
- [ ] **AVTile "Tap to hear" autoplay overlay**: on Safari (which is strict about autoplay), the AV tile shows a "Tap to hear" overlay until the user interacts. After tap, audio plays. (4d follow-up item 10.)
- [ ] **Auto-pause-on-disconnect** (4c regression): student closes tab. Amber pill + banner appear. Recording pauses. Student rejoins. Recording resumes.
- [ ] **Replay strokes animate live** (4c regression): play a recorded session. Strokes appear progressively, not all-at-once at the end.
- [ ] **DevTools console**: no errors. New `[useLiveAV] avx=… peer=… …` and `[mic-recorder-audio] obx=… remoteGain=…` log lines visible. No CSP violations.
- [ ] **Existing whiteboard sync** (tutor draws → student sees strokes) still works. **Existing tutor-mic recording** still works.
- [ ] `npx jest` locally: green (modulo 8 documented DB failures).
- [ ] `npx playwright test` locally: green.
- [ ] `npx tsc --noEmit` clean.

Capture per-browser results in `docs/PHASE-4D-STATUS.md` cross-browser matrix section.

## STOP CONDITIONS

- **Don't change Permissions-Policy.** 4c's site-wide widening is final and load-bearing.
- **Don't roll back the single-mixdown architecture.** Task 4 adds GainNode to the mixdown; it does not split it back into per-stream recorders.
- **Don't extend `peer-mesh.ts` or `useLiveAV.ts` beyond `setRemoteRecordingGain`** without stopping to ask. (peer-mesh got two extensions in 4c with clear justification; 4d extends useLiveAV exactly once for Task 4.)
- **Don't modify `useAudioRecorder.ts`, `endWhiteboardSession`, or wire-envelope encryption.** All load-bearing.
- **Don't deploy TURN.** Slotted elsewhere; if cellular smoke surfaces a TURN-shaped failure, capture it and report.
- **Don't pull in items slotted to other phases.** Workspace SSR 500, Whisper CJK, AI form-fill Assessment, rotateJoinToken, tutor-tab-follow, mortensenapps.com links — all NOT in 4d.
- **Don't push to master.** Branch + PR.
- **Don't modify the master plan file.** Plan edits are the orchestrator's job.
- **Don't skip the MODEL-SWITCH RETURN message** at the end. The verbatim string `MODEL-SWITCH RETURN — Phase 4 complete. Phase 5+ is back within Composer's scope.` must appear in your wrap-up to the user so the orchestrator's next chat knows to route to Composer.
- If `tsc --noEmit` reveals a pre-existing error unrelated to 4d, STOP and ask.
- If Playwright proves to be a multi-day rabbit hole (WebRTC + Chromium fake-media + presence-replay timing all subtle), STOP after the first 2-3 scenarios are green and split the rest to Phase 4e.

## HARD RULES

- Never push to master. Branch + PR.
- Don't modify the master plan file. Orchestrator's job.
- Reuse existing primitives. Polish consumes `useLiveAV` as-is (except the one new method). Bug fixes touch the layer that's broken, not a parallel layer. GainNode restore extends `mic-recorder-audio`, not a new module.
- Per-session ID logging mandatory. `wbsid=<id> avx=<id> peer=<id>` shape. Reuse existing prefixes; do NOT introduce new ones.
- No DB migrations.
- CSP / Permissions-Policy is FROZEN — do not touch.
- Server actions assert ownership where applicable. (4d doesn't add server actions.)
- If anything in this bootstrapper is unclear, ask the user before guessing. The user will route the question back to the orchestrator chat if needed.
