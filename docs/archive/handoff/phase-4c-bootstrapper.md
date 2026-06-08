> **SUPERSEDED 2026-05-27.** See [`docs/PHASE-4C-STATUS.md`](../PHASE-4C-STATUS.md) for the shipped-state record. This file is preserved for archival reference; do not act on it directly. Reason: work shipped to master as merge `d7fd583` 2026-05-15.

# Phase 4c — Executor bootstrapper

Copy everything below the rule line into a fresh executor chat. Do NOT include this header.

---

HALT — DO NOT EXECUTE ANY TOOLS YET.

You are the executor for Phase 4c (UI components + workspace/student mounting + CSP unblock, 3rd of 4 Phase 4 sub-chats) of the tutoring-notes pilot-ready master plan. Phase 4a shipped to master 2026-05-14 at merge `59d13ad`; Phase 4b shipped to master 2026-05-14 (verify the merge sha with `git log master --oneline -10` before starting — the orchestrator updated the plan with 4b execution-complete pending PR/merge; if 4b's PR has not yet been merged to master when you read this, STOP and tell the user 4c cannot start until 4b is in master).

Phase 4 has a MODEL-SWITCH GATE. Phase 4c inherits it. Phase 4 requires Claude Opus 4.7 or equivalent stronger model — the workspace mounting work coordinates the lifecycle FSM, the upload outbox, the existing `useAudioRecorder`, the new `useLiveAV` hook, sync-client peer ids, AV tile rendering with per-remote `<audio autoplay>` + `<video muted>` elements, AND a CSP/Permissions-Policy unblock that must not regress any existing route. The MODEL-SWITCH RETURN to Composer is at the END of Phase 4 (after 4d), NOT after each sub-phase, so stay on Opus through 4c/4d.

Send the user this message verbatim and wait for explicit confirmation:

> "Phase 4c needs Claude Opus 4.7 (or an equivalent stronger model — same model class used for Phase 4a/4b). Please confirm you have switched and reply 'switched' so I can proceed."

Do not infer confirmation from anything else. Do not begin Task 1 until the user replies with "switched" or equivalent confirmation.

═══════════════════════════════════════════════════════════
EVERYTHING BELOW THIS LINE IS FOR AFTER THE USER CONFIRMS
═══════════════════════════════════════════════════════════

Working in `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`. Live commercial-pilot app — Sarah uses this for real sessions. Never push broken code to master.

## Read first (in order)

1. `docs/PHASE-4B-STATUS.md` — **canonical handoff for what you inherit.** Public API of `useLiveAV` (the FINAL contract — orchestrator landed a mid-execution surface realignment via commit `eaa6a0c`), presence envelope schema, `streamId: "student:peer-<id>:mic"` convention, FSM integration shape, what 4c must add, and the smoke deferrals 4c must wire (sync-reconnect mid-negotiation via `mesh.restart(peerId)` on sync-client `onConnect`; late mic-permission grant "Try again" affordance).
2. `docs/PHASE-4A-STATUS.md` — public API of `peer-mesh.ts` + `signaling.ts` (immutable in 4c, same as in 4b). The wire-schema discriminants and logging contract (`avx=<sessionId>` + `peer=<peerId>`).
3. `c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` — focus on:
   - Status section (where Phase 4b just landed, what's open, the **revised 4c/4d task partitioning** — CSP moved up to 4c).
   - Phase 4 task list — you are doing **Tasks 4 + 6 + 7** (UI components, mounting, CSP unblock). Tasks 8 (graceful degradation polish) + 9 (`docs/LIVE-AV.md`) + Playwright integration tests are 4d.
   - Pillar 1 (multi-participant FSM) — you populate `inputStreams` with one entry per active student-mic stream, mapping `peerConnectionState → StreamHealth` (or whatever the FSM's stream-health enum is — read `lifecycle-machine.ts` for the actual type).
   - Pillar 5 (audio control panel) — `RecordingControlPanel` already mounts in the workspace; AV controls are NEW and live in `src/components/av/`. Don't conflate them. Tutor's mic capture continues through `useAudioRecorder` + `RecordingControlPanel`; per-remote-peer audio capture goes through `useLiveAV` + `AVTilesPanel` + the `remote-stream-recorder` instance you wire per peer.
   - Pillar 6 (Live A/V transport).
4. `AGENTS.md` — workspace conventions: per-session ID logging (`avx`, `obx`, `wbsid`, `rid` already in use), additive migrations rule, ownership assertions, tokenized share links, **CSP discipline** (you ARE adding camera+mic to Permissions-Policy in this phase — document the change in your Phase 4c status doc per workspace convention).
5. `src/middleware.ts` — current Permissions-Policy header. Today: `camera=(), microphone=(self)`. You will widen to `camera=(self), microphone=(self)` on the workspace + student-join routes ONLY (NOT site-wide).
6. `src/lib/security/csp.ts` (if it exists) — site-wide CSP helpers. Cross-reference with `src/middleware.ts` to know which is the source of truth for the Permissions-Policy header.
7. `src/__tests__/regressions/csp-headers.test.ts` — existing CSP regression test. Extend to assert the new policy on workspace + join routes; also assert OTHER routes still have the tighter policy (defense in depth).
8. `src/hooks/useLiveAV.ts` — the final hook contract from 4b. Read its return shape to know exactly which fields you're rendering.
9. `src/lib/recording/remote-stream-recorder.ts` — the per-remote-peer MediaRecorder lifecycle from 4b. You'll instantiate one per peer in 4c.
10. `src/lib/recording/lifecycle-machine.ts` — FSM. You'll populate `inputStreams` with student-mic stream ids derived from `useLiveAV.participants[]`.
11. `src/lib/whiteboard/sync-client.ts` — note the constructor option `peerId?: string` (~line 169). Workspace-minted `localPeerId` is passed to BOTH `createWhiteboardSyncClient({peerId: localPeerId})` and `useLiveAV({localPeerId})` so both layers see the same id. **This resolves the open scoping question from 4b.**
12. `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` — the tutor mounting surface. Current size is large (~1700 lines per the plan); your additions should be minimal and well-encapsulated (e.g. a single `<AVTilesPanel ... />` mount + the `useLiveAV` hook call near the existing recording hooks).
13. `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` — the student mounting surface.
14. `git log master --oneline -10` to confirm 4b is in master and master is your starting point.

Confirm to the user once these reads complete. Then start Task 1.

## YOUR SCOPE — what is IN this chat

**Goal**: Mount Phase 4b's `useLiveAV` hook in the tutor and student clients, render the participant tiles, wire per-remote `MediaRecorder` instances into the recording outbox via the FSM, and unblock `getUserMedia` at the Permissions-Policy header so the whole stack actually fires in a real browser. After 4c, Sarah-style live A/V works end-to-end for the tutor + 1 student case (and the 3-peer canary); 4d adds polish, integration tests, and architecture docs.

**Deliverables (one branch, one PR — `phase-4c-av-ui-and-mounting` off master)**:

1. **CSP / Permissions-Policy unblock** (Task 7 — moved from 4d to 4c per the orchestrator's revised partitioning, since without it 4c cannot be smoked at all). In `src/middleware.ts` (or `src/lib/security/csp.ts` if that's the source of truth — verify):
   - Workspace route (`/admin/students/[id]/whiteboard/[id]/workspace` and any nested workspace paths): `Permissions-Policy: camera=(self), microphone=(self)`.
   - Student-join route (`/w/[joinToken]` and any nested student paths): same.
   - All OTHER routes: keep the existing tighter policy (`camera=(), microphone=(self)` or whatever ships today). Defense in depth — we don't widen camera permission site-wide.
   - Update `src/__tests__/regressions/csp-headers.test.ts` to assert (a) the workspace + join routes have the widened policy, (b) at least one non-workspace, non-join admin route still has the tighter policy.
   - Document the change in your `docs/PHASE-4C-STATUS.md` per the AGENTS.md CSP-discipline convention.

2. **AV UI components under `src/components/av/`** (Task 4):
   - `AVTile.tsx` — single participant tile. Props: `participant: { peerId, role, label?, audioStream, videoStream, peerConnectionState, iceConnectionState }` from `useLiveAV.participants[]`. Renders `<video autoplay muted playsInline>` element with `srcObject = participant.videoStream` (muted on the video element so live audio plays only via `<audio>` — see below; this avoids the audio-doubling-and-echo trap). Renders a separate `<audio autoplay>` element with `srcObject = participant.audioStream`. Shows a label (`participant.label` or `participant.role` fallback). Shows a connection-state pill (basic mapping in 4c; the polished "Reconnecting…" / "Disconnected" state-to-copy mapping is 4d's graceful-degradation work). Shows an audio-level indicator if non-trivial (use `AudioContext` + `AnalyserNode`, but keep it lightweight — if it adds a measurable CPU hit at 3+ peers, gate it behind a prop and let 4d optimize).
   - `AVTilesPanel.tsx` — collection of tiles. Props: `participants[]`, plus host-supplied `localTile?: { audioStream, videoStream, label, isMicMuted, isCamMuted }` so the tutor's own preview tile renders alongside remote participants. Layout: simple flex grid in 4c (drag/dock + collapse are 4c-acceptable but may slip to 4d if they bloat the diff). Position: top-right corner of the workspace canvas in the tutor view; sidebar / top-of-page in the student view.
   - `AVPermissionsPrompt.tsx` — first-mount permission ask. Reads `hasMicPermission` and `hasCamPermission` from `useLiveAV`. Three states per permission: `"unknown" | "prompt" | "granted" | "denied"`. UI flow: if either is `"prompt"` (OR `"unknown"` after a short permissions-API try), show a card with copy "Allow your microphone and camera so you can talk and see each other during the lesson" and two buttons that call `requestMic()` and `requestCam()` respectively (independent — graceful degradation requires this; do NOT collapse them into a single "Allow Both" button). After both are `"granted"` OR `"denied"`, hide the prompt. **Late-permission "Try again" affordance** (4b deferral): if `"denied"`, surface a small "Try again" button that re-calls `request*()`. The actual user-friendly polish of the denied-state copy is 4d.
   - `AVControls.tsx` — local mute controls. Renders mic-mute toggle, cam-mute toggle, and (tutor-only) per-participant moderation rows. Per-participant moderation in 4c is minimal — a "Mute this student in MY recording" toggle per remote participant. That toggle flips a per-`streamId` `shouldCapture` override the host (workspace) feeds to `lifecycleMachine.evaluate({ ...inputs, streamCaptureOverrides: Map<streamId, boolean> })`. Wire-level mute (asking the remote peer to actually stop transmitting) is post-v1 and explicitly out of scope.
   - Tests under `src/__tests__/components/av/`: dom tests for each component. Mock `MediaStream` and `<audio>`/`<video>` `srcObject` setter. Cover: tile renders with audio + video streams; permissions prompt shows/hides correctly; mute toggles flip the right callbacks; moderation toggle flips the right host callback.

3. **Mount in `WhiteboardWorkspaceClient.tsx`** (Task 6, tutor side):
   - Mint `localPeerId` once per session mount via `crypto.randomUUID()`. Persist it in a ref so HMR doesn't churn it. **Pass it to BOTH `createWhiteboardSyncClient({peerId: localPeerId, ...})` AND `useLiveAV({localPeerId, ...})`** — this is the resolution to 4b's open scoping question per the orchestrator decision. Verify before commit: same id flows through sync-client wire envelopes (`peerId` field) AND through useLiveAV's signaling/mesh layer.
   - Hook `useLiveAV` with `role: "tutor"` and a `localPeerLabel` derived from the current admin user's display name (fall back to "Tutor" if unavailable; do NOT block hook usage on the label being present).
   - Render `<AVPermissionsPrompt />` near the top of the workspace surface (above or alongside `RecordingControlPanel`).
   - Render `<AVTilesPanel participants={participants} localTile={{...}} />` in the workspace's tile region.
   - Wire `createRemoteStreamRecorder` per active participant: when `useLiveAV.participants[]` adds a new peer with a non-null `audioStream`, instantiate a recorder for that peer's audio with `streamId: "student:peer-<peerId>:mic"`. When the participant is removed (or `audioStream` becomes null), tear down the recorder.
   - Populate FSM `inputStreams`: for each active participant, add an entry `student:peer-<peerId>:mic → mapPcStateToStreamHealth(participant.peerConnectionState)` (the mapping function is small and lives next to the workspace mount; "connected" → ok, "connecting"/"disconnected" → degraded, "failed"/"closed" → failed). Also feed the tutor's own mic stream as `tutor:mic → ok`. The FSM's `shouldCapture(streamId)` output is what each `remote-stream-recorder` reads to decide start/stop (this is the pattern Phase 4b set up).
   - Wire the **sync-reconnect resilience** (4b deferral): when sync-client fires `onConnect` after a previous `onDisconnect`, call `mesh.restart(peerId)` for each current peer. This recovers any in-progress negotiation that lost an SDP mid-flight. The sync-client itself reconnects automatically (`reconnection: true` in its socket.io config); 4c just adds the mesh-restart side effect.
   - Per-session ID logging mandatory: every state change and lifecycle event in your workspace integration logs with `wbsid=<id> avx=<id> peer=<id>` keys. Reuse existing `wbsid` for whiteboard-session-level events; new `avx` for live-A/V; `peer` for per-participant events. Do NOT introduce new prefixes.
   - DOM tests under `src/__tests__/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx`: mock `useLiveAV` with a stub that surfaces a synthetic 2-peer participant set; assert AVTilesPanel renders both tiles; assert remote-stream-recorder is instantiated per peer; assert FSM `inputStreams` contains both stream ids; assert mesh.restart is called on a simulated sync reconnect.

4. **Mount in `StudentWhiteboardClient.tsx`** (Task 6, student side):
   - Same `localPeerId` minting + threading pattern as the tutor side, but `role: "student"`.
   - Render `<AVPermissionsPrompt />` and `<AVTilesPanel />`.
   - Student side does NOT get per-participant moderation controls (that's tutor-only). Student CAN mute their own mic/cam via `<AVControls />` (the same component, with a prop that hides the moderation rows).
   - Student does NOT instantiate `remote-stream-recorder` (recording lives only on the tutor side; the student's audio is captured by the tutor's recorder via the WebRTC stream).
   - Student does NOT populate FSM `inputStreams` (no FSM on the student side; the FSM is workspace-only, recording-side concern).
   - Sync-reconnect mesh-restart wiring identical to tutor side.
   - DOM tests under `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx` mirroring the tutor-side tests minus recorder instantiation + FSM population.

5. **Phase 4c handoff status doc** (`docs/PHASE-4C-STATUS.md`). Pattern matches `docs/PHASE-4A-STATUS.md` and `docs/PHASE-4B-STATUS.md`. Document:
   - The CSP/Permissions-Policy change (which routes, exact header value, how to verify).
   - The AV component public API surface (props + behavior contracts).
   - The workspace mounting wiring diagram (localPeerId source → sync-client + useLiveAV → peer-mesh → remote-stream-recorder → outbox; FSM `inputStreams` shape).
   - The student mounting wiring (subset).
   - What 4d inherits: graceful degradation polish (mic-denied placeholder copy, cam-denied initials, peer-failed "Reconnecting…" tile copy/styling), Playwright integration tests, `docs/LIVE-AV.md`, final cross-browser smoke matrix, MODEL-SWITCH RETURN to Composer.
   - Known not-yet-tested edge cases (cross-browser quirks especially Safari/iPadOS, large-mesh CPU on low-end Chromebook — defer to 4d smoke).

## What is OUT of this chat (defer explicitly to Phase 4d)

- **Graceful degradation polish** (Task 8): mic-denied placeholder copy + design, cam-denied initials placeholder, peer-failed "Reconnecting…" tile copy + styling, ICE-failed vs PC-closed tile state mapping. 4c surfaces basic state pills and lets 4d polish the user-facing copy/visuals.
- **Playwright integration tests** in `tests/integration/live-av.spec.ts`: 4d. Two-tab + three-tab flows with mocked `getUserMedia` returning generated audio/video streams. 4c stops at jsdom DOM tests.
- **`docs/LIVE-AV.md`** (architecture overview): 4d. The status doc 4c writes (`PHASE-4C-STATUS.md`) is per-sub-phase handoff; the cross-cutting architecture overview is its own deliverable.
- **Cross-browser smoke matrix** (Safari/iPadOS quirks per `setLocalDescription({type: "rollback"})` + the device-picker behavior matrix): 4d.
- **Wire-level mute hand-off**: post-v1, intentionally out-of-scope at every Phase 4 sub-phase.
- **Recording the participant VIDEO tracks**: out-of-scope per plan.
- **TURN server**: out-of-scope per plan; `peer-mesh` accepts an `iceServers` override.
- **SFU**: out-of-scope; mesh handles ≤5 peers per Sarah's realistic max.
- **Drag-to-dock + collapse for AVTilesPanel**: nice-to-have; if it bloats the diff, defer to 4d as polish.

If you find yourself adding any of these in 4c, STOP and re-read the partitioning.

## CRITICAL CONSTRAINTS (architectural rules from the relevant Pillars)

- **Pillar 1 (multi-participant FSM)**: `participants[]` is N. `inputStreams` is a Map. The 3-peer canary is non-negotiable — your workspace mount tests must include a 3-peer canary (tutor + 2 students) and assert all three audio streams produce outbox lanes. No code path may assume exactly 2 peers.
- **Pillar 2 (multi-stream outbox)**: every remote audio segment is `streamId: "student:peer-<peerId>:mic"`. Tutor mic stays `tutor:mic`. Outbox row schema is unchanged from Phase 1b.
- **Pillar 3 (atomic end-session)**: do NOT change `endWhiteboardSession` server action or its payload. The existing drain-outbox-then-end pattern handles all `streamId`s atomically. Just verify your new student-mic outbox rows are produced before `handleEndSession` is invoked.
- **Pillar 5 (audio control panel)**: `RecordingControlPanel` is the tutor mic surface. AV components are SEPARATE — they live in `src/components/av/` and never modify or wrap `RecordingControlPanel`. The two surfaces coexist; don't merge them.
- **Pillar 6 (Live A/V transport)**: presence + signal envelopes ride the same encrypted envelope as scene messages. Do NOT introduce a parallel transport. Do NOT touch encrypt/decrypt/IV/key handling.
- **Treat `peer-mesh.ts`, `signaling.ts`, `useLiveAV.ts`, `remote-stream-recorder.ts` as IMMUTABLE in 4c.** They were finalized in 4a and 4b. If you need a new method on any, STOP and ask the user — that's a 4a or 4b addendum that warrants its own sub-phase or hotfix discussion.
- **CSP / Permissions-Policy widening is SCOPED**. ONLY workspace + student-join routes get `camera=(self), microphone=(self)`. All other routes keep the tighter policy. Test this asymmetry explicitly. Trust model: widening site-wide would let any compromised dev page request camera/mic; scoping is defense in depth.
- **Per-session ID logging is mandatory** for the workspace integration glue. `wbsid=<id> avx=<id> peer=<id>` shape. Log every state transition: localPeerId mint, useLiveAV permission grant/deny per stream, AVTilesPanel mount/unmount, AV component mount/unmount, remote-stream-recorder start/stop per peer, FSM `inputStreams` reconcile, sync-reconnect mesh-restart trigger, moderation toggle flip.
- **Additive migrations only**. No DB schema changes expected in 4c. If you discover one is needed, STOP.
- **Don't modify `useAudioRecorder.ts`**. The tutor mic path is load-bearing. AV recording is parallel to it, not modifying it.
- **Don't modify the `WhiteboardWorkspaceAudioBridge`** (or whatever it's called today after Phase 1b's outbox-observer refactor). The audio bridge handles the tutor mic outbox observation; AV recorders write to the SAME outbox via the same `enqueueSegment` API but their own lifecycle is separate.
- **Hotfix policy**: phase work is branch + PR. No master pushes. If you discover a blocking bug in master that's unrelated to 4c, STOP and ask the user.

## EXECUTION ORDER (recommended commit cadence)

Work bottom-up: CSP first (so the Vercel preview build can actually exercise getUserMedia), then UI components in isolation, then mounts. Verify between commits.

1. **Commit 1 — CSP / Permissions-Policy unblock + regression test.**
   - Modify `src/middleware.ts` (or `src/lib/security/csp.ts` if that's the source of truth — verify before editing) to widen `camera`/`microphone` to `(self)` ONLY on workspace + student-join routes. All other routes keep tight policy.
   - Update `src/__tests__/regressions/csp-headers.test.ts` to assert (a) widened policy on workspace + join, (b) tight policy on a non-workspace, non-join admin route.
   - Verify: `npx jest src/__tests__/regressions/csp-headers` green; `tsc --noEmit` clean. Push the branch immediately so Vercel starts building — preview URL is needed for browser-real smoke later.

2. **Commit 2 — AV UI components (`src/components/av/`) + dom tests.**
   - Implement `AVTile.tsx`, `AVTilesPanel.tsx`, `AVPermissionsPrompt.tsx`, `AVControls.tsx` per the spec above.
   - Implement dom tests for each.
   - Verify: `npx jest src/__tests__/components/av` green; `tsc --noEmit` clean.

3. **Commit 3 — Tutor-side mount in `WhiteboardWorkspaceClient.tsx`.**
   - Mint localPeerId, thread to sync-client + useLiveAV.
   - Mount `<AVPermissionsPrompt />` + `<AVTilesPanel />`.
   - Wire `createRemoteStreamRecorder` per active participant.
   - Wire FSM `inputStreams` with student-mic streams + tutor mic.
   - Wire sync-reconnect mesh-restart.
   - Implement dom tests for the workspace integration (3-peer canary).
   - Verify: full `npx jest` green (modulo the same 8 pre-existing DB-dependent failures Phase 4a/4b documented); `tsc --noEmit` clean.

4. **Commit 4 — Student-side mount in `StudentWhiteboardClient.tsx`.**
   - Same minting + threading pattern, role: "student".
   - Mount `<AVPermissionsPrompt />` + `<AVTilesPanel />`.
   - NO recorder instantiation, NO FSM population (student has no FSM).
   - Sync-reconnect mesh-restart.
   - Dom tests mirroring tutor minus recorder/FSM assertions.
   - Verify: full `npx jest` green; `tsc --noEmit` clean.

5. **Commit 5 — `docs/PHASE-4C-STATUS.md` handoff doc.**
   - Document everything per the spec above.
   - No code changes.

After commit 5: full `npx jest` + `tsc --noEmit` once more. Push.

## WRAP-UP

1. Full test suite: `npx jest`. Expect the same pre-existing 8 DB-dependent failures Phase 4a/4b documented; everything else green, including the new `src/__tests__/components/av/*.dom.test.tsx`, `src/__tests__/dom/WhiteboardWorkspaceClient.av-mount.dom.test.tsx`, `src/__tests__/dom/StudentWhiteboardClient.av-mount.dom.test.tsx`.
2. `npx tsc --noEmit` clean.
3. Push: `git push -u origin phase-4c-av-ui-and-mounting`.
4. Open PR via the GitHub web UI (gh CLI not authed): `https://github.com/Arangarx/tutoring-notes/compare/master...phase-4c-av-ui-and-mounting`.
5. PR title: `Phase 4c — AV UI + workspace/student mounting + CSP unblock (Pillar 6)`.
6. PR body (keep tight, ~800 chars; longer summaries belong in `docs/PHASE-4C-STATUS.md`):

   ```markdown
   ## Phase 4c — AV UI + mounting + CSP unblock (3rd of 4)

   First sub-phase that actually mounts live A/V in the tutor and student clients. Smokeable end-to-end.

   - `Permissions-Policy: camera=(self), microphone=(self)` widened on workspace + student-join routes ONLY (other routes still tight). Regression test asserts asymmetry.
   - `src/components/av/{AVTile, AVTilesPanel, AVPermissionsPrompt, AVControls}.tsx` — render participant tiles, prompt for mic/cam permission with independent grants, local + tutor-moderation mute controls.
   - Workspace mount: workspace-minted `localPeerId` threaded through `createWhiteboardSyncClient` + `useLiveAV`. `createRemoteStreamRecorder` per participant; FSM `inputStreams` populated; sync-reconnect → `mesh.restart(peerId)` per peer.
   - Student mount: same hook + tile pattern, no recording / no FSM.
   - Jest dom only; Playwright integration tests + UI polish + `docs/LIVE-AV.md` land in 4d.

   See `docs/PHASE-4C-STATUS.md`.
   ```

7. Report back to the user with: PR URL, total test counts (existing + new), any deferred items or surprises (in particular: any scoping the AV UI components forced you to revisit on `useLiveAV` — that would be info Phase 4b should know about), and what 4d inherits / where 4d should pick up.

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

This is the FIRST sub-phase where live A/V actually fires in the browser. Smoke is real, not just non-regression.

- [ ] I am on the **branch preview URL** (NOT `tutoring-notes.vercel.app`), and I have hard-refreshed since the last deploy.
- [ ] Vercel build completed cleanly for the `phase-4c-av-ui-and-mounting` branch.
- [ ] Open the workspace as tutor. `AVPermissionsPrompt` appears. Click "Allow microphone" — browser prompts for mic permission, accept. Click "Allow camera" — browser prompts for camera permission, accept. Prompt disappears. Local tile shows tutor's own video (mirrored is fine; flipping is a 4d polish).
- [ ] Open the student join link (`/w/[token]#k=...`) in a second window. `AVPermissionsPrompt` appears. Allow both. Both windows now show two tiles each (self + remote) within ~5 seconds. Audio plays both directions (talk in one window, hear in the other).
- [ ] Mute mic on the tutor side. Speak. Student window does not hear you. Unmute. Student hears you again.
- [ ] Mute camera on the student side. Tutor's tile for the student goes black (or shows the basic placeholder; the polished initials placeholder is 4d).
- [ ] Open a 3rd tab to the same join link (simulates 2 students). All three windows show 3 tiles. Audio routes correctly across all three.
- [ ] Tutor records a 30-second session. End the session. Replay shows the tutor's mic audio + the student-mic audio as separate tracks (replay UI for mixing is post-v1; the data lands).
- [ ] Tutor's "Mute this student in MY recording" toggle: enable mid-session. The student's mic continues to play live audio to the tutor (it's only muted in the recording). End session, replay does NOT include the muted-period student audio.
- [ ] Refresh the tutor window mid-session. Reopen. Live A/V re-establishes within ~10 seconds via sync-reconnect → `mesh.restart`. Outbox flushes any in-flight recorded segments.
- [ ] DevTools console for all windows: no errors. New `[useLiveAV] avx=… peer=… …` log lines and `[remote-stream-recorder] obx=… streamId=student:peer-…:mic …` log lines visible per participant. No CSP violations in the console.
- [ ] Existing whiteboard sync (drawing tutor → strokes appear on student) still works. **Existing tutor-mic recording (the load-bearing audio path Sarah uses today) still works**. Phase 4c must not regress either.
- [ ] `npx jest` locally: all suites green (modulo the documented 8 pre-existing DB failures).
- [ ] `npx tsc --noEmit` clean.

## STOP CONDITIONS

- **Don't write Playwright integration tests.** That's 4d. Stick to Jest + jsdom in 4c.
- **Don't write `docs/LIVE-AV.md`.** That's 4d. Phase 4c gets `docs/PHASE-4C-STATUS.md` (per-sub-phase handoff).
- **Don't polish graceful-degradation copy/visuals beyond basic state pills.** That's 4d. The 4c "Reconnecting…" tile can show literally the connection state string; 4d makes it user-friendly.
- **Don't widen the CSP / Permissions-Policy site-wide.** Workspace + student-join routes ONLY. Defense in depth.
- **Don't modify `peer-mesh.ts`, `signaling.ts`, `useLiveAV.ts`, or `remote-stream-recorder.ts`.** Treat them as immutable. If you find yourself wanting to add a method, STOP and ask the user.
- **Don't conflate `RecordingControlPanel` with AV components.** They are separate surfaces serving separate purposes (tutor-mic capture controls vs live A/V tiles).
- **Don't change `useAudioRecorder.ts` or the Phase 1b `endWhiteboardSession` server action.** Both are load-bearing.
- **Don't drift into 4d scope.** When you finish the mount and feel tempted to "polish the denied-state placeholder real quick" — STOP. That's 4d's whole job. Get to a smokeable state and hand off.
- **Don't add wire-level mute coordination.** Post-v1, out-of-scope at every sub-phase.
- **Don't touch DB schema.** No migrations expected in 4c.
- **Don't change the wire-envelope encryption** (`encryptMessage`/`decryptMessage`/`importAesKey`/IV/key handling).
- If `tsc --noEmit` reveals a pre-existing error unrelated to 4c, STOP and ask the user.

## HARD RULES

- Never push to master. Branch + PR.
- Don't modify the master plan file. Plan edits are the orchestrator's job.
- Reuse existing primitives. AV components consume `useLiveAV` as-is. Workspace mount uses existing FSM + outbox APIs as-is. Do NOT bolt parallel transports, parallel state machines, or parallel outboxes.
- Per-session ID logging mandatory. `wbsid=<id> avx=<id> peer=<id>` shape. Reuse existing prefixes; do NOT introduce new ones.
- No DB migrations.
- CSP / Permissions-Policy change is SCOPED to workspace + student-join routes. Document the change in `docs/PHASE-4C-STATUS.md` per the AGENTS.md CSP-discipline convention.
- Server actions assert ownership where applicable. (4c doesn't add server actions.)
- If anything in this bootstrapper is unclear, ask the user before guessing. The user will route the question back to the orchestrator chat if needed.
