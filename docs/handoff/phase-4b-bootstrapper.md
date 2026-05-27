> **SUPERSEDED 2026-05-27.** See [`docs/PHASE-4B-STATUS.md`](../PHASE-4B-STATUS.md) for the shipped-state record. This file is preserved for archival reference; do not act on it directly. Reason: work shipped to master (Phase 4b in the 4c train).

# Phase 4b — Executor bootstrapper

Copy everything below the rule line into a fresh executor chat. Do NOT include this header.

---

HALT — DO NOT EXECUTE ANY TOOLS YET.

You are the executor for Phase 4b (`useLiveAV` hook + recording outbox integration, 2nd of 4 Phase 4 sub-chats) of the tutoring-notes pilot-ready master plan. Phase 4a shipped to master 2026-05-14 at merge `59d13ad`.

Phase 4 has a MODEL-SWITCH GATE. Phase 4b inherits it. Phase 4 requires Claude Opus 4.7 or equivalent stronger model — the React hook lifecycle that owns `getUserMedia`, signaling, mesh, multiple `MediaRecorder` instances, AND threads remote audio streams into the multi-stream outbox under the lifecycle FSM's `shouldCapture` decision is the kind of multi-file interlocking design that reliably stalls Composer-class models. The MODEL-SWITCH RETURN to Composer is at the END of Phase 4 (after 4d), NOT after each sub-phase, so stay on Opus through 4b/4c/4d.

Send the user this message verbatim and wait for explicit confirmation:

> "Phase 4b needs Claude Opus 4.7 (or an equivalent stronger model — same model class used for Phase 4a). Please confirm you have switched and reply 'switched' so I can proceed."

Do not infer confirmation from anything else. Do not begin Task 1 until the user replies with "switched" or equivalent confirmation.

═══════════════════════════════════════════════════════════
EVERYTHING BELOW THIS LINE IS FOR AFTER THE USER CONFIRMS
═══════════════════════════════════════════════════════════

Working in `c:\Users\arang\Documents\Andrew\dev\agentic-projects\tutoring-notes`. Live commercial-pilot app — Sarah uses this for real sessions. Never push broken code to master.

## Read first (in order)

1. `docs/PHASE-4A-STATUS.md` — **canonical handoff for what you inherit.** Public API of `peer-mesh.ts` + `signaling.ts`, wire-schema discriminants, logging contract (`avx=<sessionId>` + `peer=<peerId>`), assumptions you must NOT violate (peer-mesh drops signals from peers with no PC entry — you must call `addPeer(peerId)` BEFORE the first inbound signal lands), and the explicit "first scoping decision" for Phase 4b: how does `useLiveAV` discover participant peer ids?
2. `c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` — focus on:
   - Status section (where Phase 4a just landed, what's open).
   - Pillar 1 (multi-participant FSM) — `inputStreams` map, `shouldCapture(streamId)` per-stream decision, no "us vs them" booleans.
   - Pillar 2 (multi-stream outbox) — `streamId` row column already exists, `streamId: "student:peer-<id>:mic"` is the convention you'll add.
   - Pillar 3 (atomic end-session) — the payload already accepts `segments[]` keyed by `streamId`. You don't need to change the server action; just make sure your new student-mic segments land in the same payload.
   - Pillar 6 (Live A/V transport) — what 4a built, what 4b adds on top.
   - Phase 4 task list — you are doing **Tasks 3 + 5** only. Task 4 (UI components) is 4c. Task 6 (mounting) is 4c. Task 7 (CSP) is 4d. Task 8 (graceful degradation polish) is 4d. Task 9 (`docs/LIVE-AV.md`) is 4d.
3. `AGENTS.md` — workspace conventions: per-session ID logging (`avx`, `obx`, `wbsid`, `rid` already in use), additive migrations rule, ownership assertions, tokenized share links, CSP discipline.
4. `src/lib/whiteboard/sync-client.ts` — existing transport. You will add an additive `presence` envelope kind alongside the `webrtc-signal` kind 4a added.
5. `src/lib/av/peer-mesh.ts` — `Map<peerId, RTCPeerConnection>` with `addPeer/removePeer/onRemoteTrack/onPeerConnectionStateChange/restart/dispose`. Treat this API as IMMUTABLE in 4b — if you find yourself needing a new method on peer-mesh, STOP and ask the user (that's a 4a addendum, not 4b scope).
6. `src/lib/av/signaling.ts` — same: treat as immutable.
7. `src/lib/recording/lifecycle-machine.ts` — Phase 1a FSM. Read its `inputStreams` and `shouldCapture` outputs; you will feed it new entries.
8. `src/lib/recording/upload-outbox.ts` — Phase 1b outbox. Read its `enqueueSegment` API. New segments use the same API with a different `streamId`.
9. `src/hooks/useAudioRecorder.ts` — existing tutor-mic path. **Do NOT modify it.** 4b's `useLiveAV` adds a parallel pipeline for remote tracks; tutor mic continues through this hook unchanged.
10. `git log master --oneline -8` to confirm 4a is in master at `59d13ad` and master is your starting point.

Confirm to the user once these reads complete. Then start Task 1.

## YOUR SCOPE — what is IN this chat

**Goal**: Wire 4a's pure-JS foundation into a real React hook (`useLiveAV`) and into Phase 1's multi-stream recording outbox. Mic-only end-to-end is the priority; video gets a separate commit so the test surface stays manageable. No UI components, no mounting in workspace/student client, no CSP edits, no Playwright. UI lands in 4c, CSP + acceptance tests in 4d.

**Deliverables (one branch, one PR — `phase-4b-uselife-av-and-outbox-integration` off master)**:

1. **Sync-client `presence` envelope + `onRoomPeersChange`** (additive). Extend `src/lib/whiteboard/sync-client.ts` so peers can announce stable identity to the room and observe other peers' identity:
   - New envelope kind `presence` (alongside `webrtc-signal` + scene messages). Schema: `{ v: 1, kind: "presence", peerId, role: "tutor" | "student", label?: string }`. Same encrypted envelope as scene/signal messages (do NOT touch encrypt/decrypt/IV/key).
   - Sync-client broadcasts our own presence (a) once on connect and (b) once whenever sync-client receives `new-user` (so the new joiner immediately learns about us).
   - Sync-client maintains an internal `Map<peerId, { role, label?, lastSeenMs }>` keyed on peer id (NOT socket id), populated from inbound presence envelopes. When the map changes, fire `onRoomPeersChange(peers: ReadonlyArray<{ peerId, role, label? }>)`. Self is excluded from the callback (same convention as `onPeerCountChange`).
   - When sync-client receives `room-user-change` and a previously-known socket disappears, the corresponding `peerId` is dropped from the map (with a 5-second grace period for transient socket flaps — peer ids that reappear within 5s do NOT fire a remove/re-add cycle). Document this grace window in the doc-comment.
   - Tests in `src/__tests__/whiteboard/sync-client.test.ts`: presence round-trip; presence delivers stable id; `onRoomPeersChange` fires once per change with the correct member list; self exclusion; grace window behavior; presence after `new-user` re-announces; existing scene + signal envelopes still validate post-extension.
2. **`src/hooks/useLiveAV.ts`** — React hook (Tasks 3). Owns:
   - Local mic stream from `getUserMedia({ audio: true })`. Camera is added in commit 3 (kept separate so the surface area per commit stays reviewable).
   - One `signaling` + one `peerMesh` instance per `whiteboardSessionId` (cleanup in the effect's return).
   - Subscribes to `syncClient.onRoomPeersChange` and reconciles the peer set: for each peer in the new list not in `mesh.peers()`, call `mesh.addPeer(peerId)`; for each peer no longer in the new list, call `mesh.removePeer(peerId)`. **Reconcile order matters** — addPeer first, then removePeer (so glare resolution sees the new set).
   - Subscribes to `mesh.onRemoteTrack` and `mesh.onPeerConnectionStateChange` to populate a `participants` map keyed on peerId.
   - `getLocalTracks: (remotePeerId) => localStream?.getAudioTracks() ?? []` — peer-mesh asks; we hand it the current mic tracks. Re-create the mesh entry's senders if `localStream` changes mid-session (e.g. mic permission granted late, or device hot-swap which is post-v1 backlog but the architecture should not preclude it).
   - Public surface (return type):
     ```ts
     {
       participants: Array<{
         peerId: string;
         role: "tutor" | "student";
         label?: string;
         audioStream: MediaStream | null;
         videoStream: MediaStream | null;
         audioMuted: boolean;
         videoMuted: boolean;
         connectionState: "new" | "connecting" | "connected" | "disconnected" | "failed" | "closed";
       }>;
       localAudioStream: MediaStream | null;
       localVideoStream: MediaStream | null;
       isMicMuted: boolean;
       isCamMuted: boolean;
       toggleMic: () => void;
       toggleCam: () => void;
       hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
       hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
       requestMic: () => Promise<void>;
       requestCam: () => Promise<void>;
       error: string | null;
     }
     ```
   - Mute is implemented by toggling `MediaStreamTrack.enabled` on every track in the relevant local stream. Remote audio playback is a 4c concern (a `<audio autoplay>` element keyed by peerId); 4b just exposes the streams via `participants[].audioStream`.
   - Permission discovery uses `navigator.permissions.query({ name: "microphone" })` and `{ name: "camera" })` where supported, with a try/catch fallback that maps to `"unknown"` (Safari may throw on the camera permission name).
   - Tests in `src/__tests__/hooks/useLiveAV.test.tsx` (jsdom): mock `getUserMedia`, mock `sync-client`, mock `peer-mesh` (or use the real one with mocked `RTCPeerConnection`). Cover: peer reconcile add/remove ordering, mute toggle, permission denial path, two-tab simulated flow (tutor + 1 student peer arrives, tracks land, participants populated), three-tab fan-out (canary), peer disconnect cleans up the participants entry.
3. **Camera support in `useLiveAV`** (kept as commit 3 so commits 1+2 stay reviewable). Add `localVideoStream`, `isCamMuted`, `toggleCam`, `requestCam`, `hasCamPermission`. Cam is purely additive on top of the mic-only hook from commit 2. Tests extend with cam-permission flow + cam-only mute toggle (mic stays live).
4. **Recording outbox integration** (Task 5). New file: `src/lib/recording/remote-stream-recorder.ts`. Per-remote-audio `MediaRecorder` lifecycle:
   - Subscribe inside `useLiveAV` to `mesh.onRemoteTrack` for the `audio` track kind. For each (peerId, audioTrack) pair, create a `MediaStream` containing just that track, instantiate a `MediaRecorder` with the same MIME settings the tutor's `useAudioRecorder` uses (steal the constants — do NOT duplicate them; if needed, hoist to `src/lib/recording/mime.ts`), and start recording with the same segment cadence the tutor mic uses.
   - On every segment finalize, write to the outbox via the existing `upload-outbox` API with `streamId: "student:peer-<peerId>:mic"`. The outbox row schema already supports any `streamId` (Phase 1b shipped this).
   - **Lifecycle integration with FSM**: extend `lifecycle-machine.ts`'s `inputStreams` input to include the new remote audio streams. The host (`WhiteboardWorkspaceClient.tsx` — but note 4c does the actual mounting; 4b only ensures the API supports it) feeds remote streams into the FSM. The FSM's `shouldCapture(streamId)` returns true when (a) the FSM is in `recording` state AND (b) the host hasn't muted that stream's recording (per-stream record toggle is a 4c UI; 4b just plumbs the shouldCapture-driven start/stop).
   - When `mesh.onPeerConnectionStateChange` fires `disconnected | failed | closed`, stop and finalize the in-flight `MediaRecorder` for that peer. Outbox flushes the trailing segment via the existing trailing-segment-await pattern (Phase 1b hotfix `33b2c28`).
   - Tutor's mic continues to flow through `useAudioRecorder` → outbox with `streamId: "tutor:mic"` (existing path; do NOT change).
   - Tests in `src/__tests__/recording/remote-stream-recorder.test.ts`: mock `MediaRecorder`, mock `MediaStreamTrack`, mock outbox; cover: track arrival → recording starts; segment finalize → outbox row with correct `streamId`; peer disconnect → recording stops, trailing segment in outbox; FSM `shouldCapture` returns false → no MediaRecorder is started for that stream; FSM transitions out of `recording` → all remote recorders stop in lockstep.
5. **Phase 4b handoff status doc**: new `docs/PHASE-4B-STATUS.md`. Pattern matches `docs/PHASE-4A-STATUS.md`. Document the public API of `useLiveAV`, the presence envelope schema, the `streamId` convention for student mics, the FSM integration shape, what 4c will consume from `useLiveAV`, and known not-yet-tested edge cases (sync-reconnect mid-negotiation, late mic-permission grant, device hot-swap, large-mesh CPU envelope).

## What is OUT of this chat (defer explicitly to other Phase 4 sub-chats)

- **UI components** (`src/components/av/AVTile.tsx`, `AVTilesPanel.tsx`, `AVPermissionsPrompt.tsx`, `AVControls.tsx`): Phase 4c.
- **Mounting in workspace + student client** (`WhiteboardWorkspaceClient.tsx`, `StudentWhiteboardClient.tsx`): Phase 4c. 4b's `useLiveAV` is a hook that 4c will call; 4b does NOT call it from any component.
- **`<audio autoplay>` per-remote-stream live playback element**: Phase 4c (it's a UI concern; the hook just exposes `participants[].audioStream`).
- **Per-participant mute moderation UI** (tutor mutes student): Phase 4c. The peer-mesh API doesn't have a per-peer track mute; muting is at `MediaStreamTrack.enabled` inside `useLiveAV` for the local side. Tutor moderating a student's audio is a 4c+ concern (likely a "mute this student in MY recording" toggle that flips a per-streamId `shouldCapture` override in the FSM).
- **CSP / Permissions-Policy update** (`camera=(self), microphone=(self)` in `src/middleware.ts`): Phase 4d. **HOWEVER** — `getUserMedia` in 4b WILL fail on Vercel preview if the existing `microphone=()` Permissions-Policy header is in place. Test 4b locally and via the Vercel preview build, but if `getUserMedia` is blocked by CSP on the preview deploy, that's expected — 4d unblocks it. The fact that the hook itself is correct is what 4b's Jest tests prove.
- **Graceful degradation polish** (mic-denied placeholder, cam-denied initials, peer-failed "Reconnecting…" tile): Phase 4d. The hook surfaces `hasMicPermission: "denied"` and `participants[].connectionState: "failed"`; 4d's UI polish maps those to user-friendly states.
- **Playwright integration tests** in `tests/integration/live-av.spec.ts`: Phase 4d (they need 4c's UI to drive). Stick to Jest for 4b.
- **`docs/LIVE-AV.md`** (architecture overview): Phase 4d.
- **Per-track mute on the WIRE** (i.e. signaling a remote peer to mute its outbound track): out of scope. Mute is local-only in 4b/4c. Wire-level mute hand-off is post-v1.
- **TURN server**: out-of-scope per plan; 4a's `peer-mesh` accepts an `iceServers` override so future config changes don't need code.
- **SFU**: out-of-scope; mesh handles ≤5 peers per Sarah's realistic max.
- **Recording the participant VIDEO tracks**: out-of-scope per plan. Phase 4 ships live video, recording video is deferred until Sarah explicitly asks. The architecture does not preclude it — when added, a video-capable `MediaRecorder` reuses this remote-stream-recorder pattern with a new `streamId` shape.

If you find yourself adding any of these in 4b, STOP and re-read the partitioning. Each Phase 4 sub-chat exists to keep scope tight enough that the model converges.

## CRITICAL CONSTRAINTS (architectural rules from the relevant Pillars)

- **Pillar 1 (multi-participant FSM)**: `participants` is a Set, `inputStreams` is a Map. Tutor + N students from day one. No code path may assume exactly 2 peers, exactly 1 student, or exactly 2 streams. The 3-peer canary in `peer-mesh.test.ts` proves the foundation; your `useLiveAV` tests must include a 3-peer canary too.
- **Pillar 2 (multi-stream outbox)**: every remote audio segment is `streamId: "student:peer-<peerId>:mic"`. Tutor mic stays `tutor:mic`. The outbox row schema already supports any `streamId` — do NOT alter the schema. If you discover the schema needs widening, STOP — that belongs in a separate sub-phase.
- **Pillar 3 (atomic end-session)**: don't change the server action. The end-session payload already accepts `segments[]` keyed by `streamId`. Just make sure your new student-mic outbox rows are drained alongside tutor-mic rows by `handleEndSession`'s existing drain logic.
- **Pillar 6 (Live A/V transport)**: presence + signal envelopes ride the SAME encrypted envelope as scene messages. Do NOT introduce a parallel WebSocket / fetch path. Do NOT change `encryptMessage`/`decryptMessage`/`importAesKey` or the IV/key handling. Adding a new envelope `kind` is additive; structural envelope changes are NOT.
- **Trust model invariant**: identity is sender-injected (sync-client puts the local `peerId` into the broadcast presence envelope). The PUBLIC API of `useLiveAV` does NOT take a peerId from caller args; it reads from sync-client. Defense in depth — the recv side also drops self-echoes.
- **Treat `peer-mesh.ts` and `signaling.ts` as IMMUTABLE in 4b.** They were finalized in 4a. If you need a new method on either, STOP — that's a 4a addendum that warrants its own sub-phase or hotfix discussion with the orchestrator.
- **Per-session ID logging is mandatory**. Threading: `avx=<whiteboardSessionId>` for `useLiveAV` hook lifecycle; `peer=<peerId>` for per-peer events; `obx=<rowId> streamId=student:peer-<id>:mic` for outbox writes (the `obx` prefix is already in the registry from Phase 1b). Log every state transition: hook mount/unmount, mic/cam permission grant/deny, peer reconcile add/remove, MediaRecorder start/stop/segment, outbox write.
- **Additive migrations only**. No DB schema changes expected in 4b — `SessionRecording.streamId` already exists. If you discover one is needed, STOP.
- **No CSP / Permissions-Policy edits in 4b**. Yes, `getUserMedia` will be blocked by the current `microphone=()` Permissions-Policy on the Vercel preview build. That's expected. The hook's correctness is provable via Jest. Real-browser smoke comes after 4d unblocks the headers.
- **Hotfix policy**: phase work is branch + PR. No master pushes. If you discover a blocking bug in master that's unrelated to 4b, STOP and ask the user.
- **Don't modify `useAudioRecorder.ts`** beyond hoisting shared MIME constants to `src/lib/recording/mime.ts` (if they aren't already there). The tutor mic path is the load-bearing audio path Sarah uses today; adding remote-stream recording must be PARALLEL to it, not modifying it.

## EXECUTION ORDER (recommended commit cadence)

Work bottom-up: presence first (so `useLiveAV` has stable peer ids to consume), mic-only hook second, video third (kept separate so commits 1+2 stay reviewable), recording integration last. Verify between commits.

1. **Commit 1 — sync-client presence envelope + `onRoomPeersChange`.**
   - Add `WhiteboardWirePresence` type and validator branch in `validateWireMessage` (presence kind takes priority alongside `webrtc-signal`).
   - Sync-client broadcasts our presence on `connect` and on inbound `new-user`. Implement the inbound-presence handler that updates the internal `Map<peerId, ...>` and fires `onRoomPeersChange`.
   - Add the 5-second grace window for `room-user-change` peer drops.
   - Public API additions to `WhiteboardSyncClient`: `onRoomPeersChange(cb)` returning unsubscribe.
   - Test: round-trip presence; new peer triggers fire; departing peer (after grace) triggers fire; transient flap (≤5s) does NOT trigger remove/re-add; 3-peer canary; existing scene + signal envelopes still validate.
   - Verify: `npx jest src/__tests__/whiteboard/sync-client` green; `tsc --noEmit` clean. Existing 2-tab whiteboard sync still works (presence is purely additive — no scene-message behavior changes).

2. **Commit 2 — `useLiveAV` hook (mic-only, no recording yet).**
   - Implement the hook with all surface fields above EXCEPT `localVideoStream`, `isCamMuted`, `toggleCam`, `requestCam`, `hasCamPermission` (those land in commit 3).
   - `getUserMedia({ audio: true })` is only called via `requestMic()`; mounting the hook does NOT prompt the user. (Permission UX belongs to 4c; 4b just exposes the request function.)
   - Reconcile loop: subscribe to `syncClient.onRoomPeersChange`, diff against `mesh.peers()`, addPeer-then-removePeer ordering.
   - `getLocalTracks` factory passed to `createPeerMesh` reads from a ref that always points at the current `localStream`.
   - Tests: peer reconcile add/remove, mute toggle, permission denial, two-tab simulated, three-tab canary, peer disconnect cleans up.
   - Verify: `npx jest src/__tests__/hooks/useLiveAV` green.

3. **Commit 3 — Camera support in `useLiveAV`.**
   - Add `localVideoStream`, `isCamMuted`, `toggleCam`, `requestCam`, `hasCamPermission`. Cam is additive on top of mic.
   - When cam permission is granted mid-session (after mic was already granted), the new video tracks must be added to existing peer connections via `pc.addTrack()`. Peer-mesh exposes `getLocalTracks` as a callback — when local tracks change, you cannot retroactively re-call `getLocalTracks`. **Open question for the orchestrator if you hit this**: either (a) accept that camera-after-mic mid-session requires renegotiation that 4b doesn't implement (defer "switch on camera mid-session" to 4c with a UI gate that grants both permissions up front), or (b) extend `useLiveAV` to teardown and recreate peer connections when the local stream shape changes. **Recommended**: option (a) — keep 4b simple; 4c's permissions UI grants both up front.
   - Tests: cam-permission flow, cam-only mute, cam-denied path.
   - Verify: `npx jest src/__tests__/hooks/useLiveAV` green.

4. **Commit 4 — Recording outbox integration (`remote-stream-recorder.ts`).**
   - New module implementing the per-remote-audio `MediaRecorder` lifecycle described above.
   - Hoist any tutor-mic MIME constants to `src/lib/recording/mime.ts` if not already there; share them.
   - Wire the recorder lifecycle into `useLiveAV`'s `mesh.onRemoteTrack` subscription. The recorder reads `lifecycleMachine.shouldCapture(streamId)` to decide start/stop.
   - Outbox writes use the existing `upload-outbox` API with `streamId: "student:peer-<peerId>:mic"`.
   - Tests in `src/__tests__/recording/remote-stream-recorder.test.ts`: mock MediaRecorder, mock outbox; track arrival starts recording; segment finalize writes outbox row with correct `streamId`; peer disconnect stops + finalizes; FSM transition out of `recording` stops all remote recorders; multi-peer (3 students) recording produces three independent outbox lanes.
   - Verify: full `npx jest` green (modulo the same pre-existing 8 DB-dependent failures Phase 4a documented). `tsc --noEmit` clean.

5. **Commit 5 — Phase 4b handoff status doc + (optional) AGENTS.md addition.**
   - New `docs/PHASE-4B-STATUS.md`: phase status table; public API of `useLiveAV`; presence envelope schema; `streamId: "student:peer-<id>:mic"` convention; FSM integration shape; what 4c inherits + what 4c must add; known not-yet-tested edge cases (mid-session permission grant deferred, sync-reconnect mid-negotiation, large-mesh CPU envelope).
   - If a new prefix is introduced (e.g. `lva` for live-A/V hook events distinct from session-level `avx`), update the ID registry in `docs/RECORDER-LIFECYCLE.md` + `AGENTS.md`. **Recommendation**: don't add a new prefix; reuse `avx` for hook events and `obx` for outbox events. Keeps the registry tight.

After commit 5: full `npx jest` + `tsc --noEmit` once more. Push.

## WRAP-UP

1. Full test suite: `npx jest`. Expect the same pre-existing 8 DB-dependent failures Phase 4a documented (`auth.test.ts`, `email.test.ts`, `note-and-share.test.ts`, `password-reset.test.ts`, `transcribe-late-hallucination.test.ts`); everything else green, including the new `src/__tests__/hooks/useLiveAV.test.tsx` and `src/__tests__/recording/remote-stream-recorder.test.ts` suites.
2. `npx tsc --noEmit` clean.
3. Push: `git push -u origin phase-4b-uselife-av-and-outbox-integration`.
4. Open PR via the GitHub web UI (gh CLI not authed): `https://github.com/Arangarx/tutoring-notes/compare/master...phase-4b-uselife-av-and-outbox-integration`.
5. PR title: `Phase 4b — useLiveAV hook + multi-stream outbox integration (Pillar 6)`.
6. PR body (keep tight, ~700 chars; longer summaries belong in `docs/PHASE-4B-STATUS.md`):

   ```markdown
   ## Phase 4b — useLiveAV + outbox integration (2nd of 4)

   Wires Phase 4a's pure-JS foundation into a React hook + the multi-stream recording outbox.

   - Additive `presence` envelope on the encrypted sync-client → `onRoomPeersChange` exposes stable per-peer ids.
   - `src/hooks/useLiveAV.ts` — owns `getUserMedia`, signaling+mesh per session, mute states, permission surface. Pure hook; no UI mounted yet.
   - `src/lib/recording/remote-stream-recorder.ts` — per-remote-audio `MediaRecorder` writes outbox rows with `streamId: "student:peer-<id>:mic"`. FSM `shouldCapture` gates start/stop.
   - Jest only (mocked `getUserMedia` + `MediaRecorder`); no Playwright. UI + CSP + acceptance tests land in 4c/4d.

   See `docs/PHASE-4B-STATUS.md` for the API + what 4c consumes.
   ```

7. Report back to the user with: PR URL, total test counts (existing + new), the open question on mid-session camera-after-mic permission grant (was option (a) "defer to 4c permissions-up-front" or option (b) "renegotiate" chosen?), any other deferred items or surprises, and what 4c inherits / where 4c should pick up.

## SMOKE CHECKLIST FOR USER ON VERCEL PREVIEW

Phase 4b adds the hook but does not mount it in any component. The hook is invisible to the tutor through the UI surface — smoke 4b primarily as a non-regression check against existing whiteboard + audio paths.

- [ ] I am on the **branch preview URL** (NOT `tutoring-notes.vercel.app`), and I have hard-refreshed since the last deploy.
- [ ] Vercel build completed cleanly for the `phase-4b-uselife-av-and-outbox-integration` branch.
- [ ] Open a 2-tab whiteboard session (tutor + student via join link). Tutor draws → student sees strokes within ~1 second. **Existing whiteboard sync is the load-bearing path; the additive `presence` envelope must NOT regress it.**
- [ ] Tutor records a 30-second solo audio segment, ends session, replay shows audio. **Existing tutor-mic outbox path is load-bearing; the new remote-stream-recorder pipeline must NOT alter it.**
- [ ] DevTools console for both tabs: no errors. New `[sync-client] wbsync=… kind=presence …` log lines appear once per peer per join (one for self-broadcast on connect, one per inbound new-user). No `[useLiveAV]` log lines appear (no component mounts the hook in 4b).
- [ ] `npx jest` locally: all suites green (modulo the documented 8 pre-existing DB failures); the new `src/__tests__/hooks/useLiveAV.test.tsx` and `src/__tests__/recording/remote-stream-recorder.test.ts` suites green.
- [ ] `npx tsc --noEmit` clean.

(No live A/V smoke is possible in 4b because no component mounts the hook. Live A/V smoke arrives with 4c's UI.)

## STOP CONDITIONS

- **Don't write any UI components.** No `AVTile.tsx`, `AVTilesPanel.tsx`, `AVPermissionsPrompt.tsx`, `AVControls.tsx`, `<audio>` elements, or any JSX outside the test files. That's 4c.
- **Don't mount `useLiveAV` in any component.** `WhiteboardWorkspaceClient.tsx` and `StudentWhiteboardClient.tsx` are 4c's work. 4b only delivers the hook.
- **Don't touch the CSP or `Permissions-Policy` headers.** That's 4d. Yes, `getUserMedia` will be blocked on the Vercel preview by the existing `microphone=()` policy. Jest proves correctness; real-browser smoke comes after 4d.
- **Don't modify `peer-mesh.ts` or `signaling.ts`.** Treat them as immutable. If you find yourself wanting to add a method, STOP and ask the user.
- **Don't change `useAudioRecorder.ts`'s public surface.** You may hoist shared MIME constants to `src/lib/recording/mime.ts` if needed; that's the only allowed touch.
- **Don't change the `endWhiteboardSession` server action or its payload schema.** It already accepts multi-stream `segments[]`. If you find you need to change it, STOP — that's a Phase 1 addendum.
- **Don't add Playwright integration tests.** They need 4c's UI. Jest only in 4b.
- **Don't change the wire-envelope encryption** (`encryptMessage`/`decryptMessage`/`importAesKey`/IV/key handling). Adding a new `kind` discriminant is additive; structural changes are not.
- **Don't drift into 4c scope.** When you finish the hook and feel tempted to "just mount it real quick to verify in browser" — STOP. That's 4c's whole job. The hook's correctness is provable via Jest; real-browser verification arrives with 4c's UI + 4d's CSP unblock.
- **Don't add live participant labels by reading the workspace's student record from inside the hook.** The hook accepts `localPeerLabel?: string` from its caller (the host) and broadcasts it via the presence envelope. The hook itself does NOT know about students, tutors-by-name, or any DB-derived identity. Keep the hook framework-free of app-specific data shapes.
- **Don't introduce auto-add-on-first-inbound-signal in peer-mesh.** Phase 4a explicitly chose to drop signals from peers with no PC entry. 4b's reconcile loop ensures `addPeer(peerId)` is called BEFORE peer-mesh sees a signal from that peer (because presence arrives via sync-client BEFORE the WebRTC offer; the offer is queued by peer-mesh's signaling subscription). If you observe a race here, STOP and ask — that's an architectural decision for the orchestrator.

## HARD RULES

- Never push to master. Branch + PR. PR body uses the template above (or a tight variant ≤900 chars).
- Don't modify the master plan file (`c:\Users\arang\.cursor\plans\tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`). Plan edits are the orchestrator's job.
- Reuse existing primitives. Extend `sync-client.ts` envelope additively. Reuse `upload-outbox.ts` API as-is. Reuse `lifecycle-machine.ts` outputs. Do NOT bolt parallel transports, parallel outboxes, or parallel state machines.
- Per-session ID logging mandatory. `avx=<whiteboardSessionId>` for hook events; `peer=<peerId>` per-peer subkey; `obx=<rowId> streamId=student:peer-<id>:mic` for outbox writes. Log every state transition: hook mount/unmount, permission grant/deny, peer reconcile add/remove, MediaRecorder start/stop/segment, outbox write.
- No DB migrations. `SessionRecording.streamId` already exists. If you discover one is needed, STOP.
- No CSP / Permissions-Policy edits in 4b. That's 4d.
- Server actions assert ownership where applicable. (4b doesn't add server actions.)
- If anything in this bootstrapper is unclear, ask the user before guessing. The user will route the question back to the orchestrator chat if needed.
