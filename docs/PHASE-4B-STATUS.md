# Phase 4b — useLiveAV + recording outbox integration — branch handoff

**Branch:** `phase-4b-uselife-av-and-outbox-integration` (off `master`
at `59d13ad`).
**Master plan:** `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Pillars in scope:** Pillar 6 (Live A/V transport — React glue) +
Pillar 2 (multi-stream upload outbox — student-mic lane).
**Position in Phase 4:** 2nd of 4 sub-chats (4a → **4b** → 4c → 4d).
**Companion docs:** [PHASE-4A-STATUS.md](PHASE-4A-STATUS.md)
(foundation API this consumes), [AGENTS.md](../AGENTS.md),
[RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) (ID-prefix registry —
`avx` continues to identify live-A/V; no new prefix added here).

This doc is the canonical handoff for Phase 4b. Read it FIRST when
picking up Phase 4c (or this branch in a fresh chat) — it lists what
landed, the public API of `useLiveAV` + `remote-stream-recorder`,
what 4c is expected to consume, what is explicitly NOT done yet, and
the smoke checklist.

---

## Status

**Hook + recording integration feature-complete. Awaiting `git push`
+ PR + Vercel preview smoke before merging to `master`.**

This sub-chat covers Phase 4 Tasks 3 (`useLiveAV` hook) and 5
(recording outbox integration). UI components (Task 4), workspace
mounting (Task 6), CSP / `Permissions-Policy` (Task 7), graceful
degradation polish (Task 8), and the `docs/LIVE-AV.md` overview
(Task 9) are explicitly deferred to 4c/4d per the master plan's
"Suggested chat partitioning" section.

| Commit | Summary | Files changed |
|---|---|---|
| `c936155` | Additive `presence` envelope on sync-client; `Map<peerId, RoomPeer>` with 5s grace-window peer pruning; `onRoomPeersChange` API; 16 new Jest cases | `src/lib/whiteboard/sync-client.ts`, `src/__tests__/whiteboard/sync-client.test.ts` |
| `7fb9d65` | `src/hooks/useLiveAV.ts` initial mic-only hook + 24 jsdom Jest cases. **Superseded by `eaa6a0c`.** | `src/hooks/useLiveAV.ts`, `src/__tests__/dom/useLiveAV.dom.test.tsx` |
| `7ff7a04` | Camera support added to `useLiveAV` + 7 cam-specific tests. **Superseded by `eaa6a0c`.** | same |
| `eaa6a0c` | **Realignment to final 4b contract.** Drops auto-acquire-on-mount in favour of `requestMic()` / `requestCam()`; adds `hasMicPermission` / `hasCamPermission` via Permissions API; renames `isCameraOff` → `isCamMuted`, `toggleCamera` → `toggleCam`. 40 jsdom tests post-realignment. | `src/hooks/useLiveAV.ts`, `src/__tests__/dom/useLiveAV.dom.test.tsx` |
| `d1fbc2c` | `src/lib/recording/remote-stream-recorder.ts` — per-remote-audio `MediaRecorder` lifecycle writing `studentMicStreamId(peerId)` outbox rows; 22 Jest cases | `src/lib/recording/remote-stream-recorder.ts`, `src/__tests__/recording/remote-stream-recorder.test.ts` |
| _this commit_ | `docs/PHASE-4B-STATUS.md` — this handoff doc | docs only |

> **Note on commits 7fb9d65 + 7ff7a04**: these were the initial mic +
> cam-support landings whose public API auto-acquired on mount and
> used `isCameraOff` / `toggleCamera`. After orchestrator review, the
> hook was realigned in `eaa6a0c` to a request-driven model that
> better supports 4d's mic-granted-cam-denied graceful-degradation
> path. The pushed history is preserved (no amend) so the reasoning
> trail stays auditable. **The realigned surface in `eaa6a0c` is the
> authoritative 4b contract for 4c.**

---

## What changed (architecturally)

### Pillar 6 — React glue for live A/V

Four pieces, kept layered so 4c can mount the hook without touching
the lower layers:

1. **Presence envelope on sync-client (Commit `c936155`).** A new
   `WhiteboardWirePresence` envelope (`v: 1`, `kind: "presence"`,
   `peerId`, `role: "tutor" | "student"`, optional `label`) rides
   the same AES-GCM-256 envelope as scene / signal messages. The
   relay never sees plaintext role / label.
   - Self broadcasts presence on every `socket.connect` AND
     whenever an inbound `new-user` event fires (so a fresh joiner
     immediately learns about us without waiting for our re-fire).
   - Sync-client maintains `Map<peerId, { role, label?, lastSeenMs }>`.
     `onRoomPeersChange(cb)` fires with the current non-self peers
     whenever the map changes.
   - **5-second grace window on peer drop**: when
     `room-user-change` says a socket left, the matching peer id is
     queued for removal 5 s in the future. A re-`new-user` for the
     same peer id within the window cancels the prune (transient
     socket flap on the encrypted relay is invisible to peer-mesh).
   - Trust-model invariant preserved: identity (`peerId`, `role`,
     `label`) is sender-injected from the closure, NOT from caller
     args. The recv side drops self-echoes defensively.

2. **`useLiveAV` hook (Commit `eaa6a0c`, post-realignment).** The
   single React seam between sync-client + peer-mesh + signaling
   from 4a and the host workspace. Owns:
   - `getUserMedia` for mic + cam (separate `requestMic()` /
     `requestCam()` calls; the hook is INERT on mount).
   - Permissions API discovery: `hasMicPermission` /
     `hasCamPermission` are populated on mount via
     `navigator.permissions.query` with a try/catch for Safari's
     known throw on the camera descriptor.
   - One `signaling` + one `peerMesh` per session, gated on
     `localAudioStream !== null && syncClient !== null`. Mounting
     a hook with a null sync-client (tutor-solo workspace mode) is
     safe — the mesh stays torn down.
   - `getLocalTracks` callback to peer-mesh reads from refs at
     `addPeer` time so toggling cam BEFORE peers connect
     transparently lights up video. Adding tracks to existing PCs
     mid-session requires renegotiation, which 4b does NOT
     implement (see "Open question resolved" below).
   - Reconcile loop on `syncClient.onRoomPeersChange`: addPeer
     first, then removePeer. Stable lexicographic peer-id sort on
     output.
   - Remote tracks (`audio` + `video`) accumulate into per-peer
     `MediaStream`s exposed via `participants[].audioStream` /
     `participants[].videoStream`.

3. **`remote-stream-recorder.ts` (Commit `d1fbc2c`).** Per-peer
   `MediaRecorder` lifecycle that bridges
   `participants[i].audioStream` → upload outbox under
   `studentMicStreamId(peerId)` (= `"student:peer-<peerId>:mic"`).
   Reuses `chooseMimeType()` from `src/lib/recording/mime.ts` so
   tutor + student segments share the webm-first / mp4-fallback
   policy. Each `MediaRecorder.dataavailable` writes one outbox
   row; `stop()` awaits the trailing `dataavailable` + every
   in-flight `outbox.enqueue` promise so a host-side
   `await recorder.stop()` is safe for end-session drain ordering.

4. **Lifecycle FSM integration (host-side, NOT inside this hook).**
   The recorder is deliberately FSM-agnostic. The 4c host
   (`WhiteboardWorkspaceClient.tsx`) is expected to:
   - Compute `evaluateLifecycle({...inputs, inputStreams: { ..., 'student:peer-<id>:mic': 'ok' }})`.
   - Watch `outputs.shouldCapture(streamId)` per participant.
   - Flip `recorder.start()` / `recorder.stop()` on shouldCapture
     transitions.

   This keeps `remote-stream-recorder.ts` unit-testable without
   FSM input shapes and gives the host full control over pause /
   resume / per-stream-mute policy.

### Why the realignment commit was added (and not amended)

The original commits (`7fb9d65` + `7ff7a04`) implemented `useLiveAV`
with auto-acquire-on-mount and `isCameraOff` / `toggleCamera` naming.
On orchestrator review, the auto-acquire design couldn't represent
the mic-granted-cam-denied path that 4d's graceful-degradation work
depends on (a single binary `enabled` flag can't gate two
independent streams with separate permission grants). Rather than
amend pushed history, the realignment landed as `eaa6a0c`. The
reasoning trail (initial design + orchestrator review + realignment)
is preserved on the branch for auditability.

---

## Public API — what Phase 4c inherits

### `useLiveAV` (post-realignment, the authoritative contract)

```ts
function useLiveAV(opts: {
  syncClient: WhiteboardSyncClient | null;   // null in tutor-solo mode
  localPeerId: string;                        // MUST match sync-client envelope peerId
  sessionId?: string;                         // threaded into avx=<id> logs
  audioConstraints?: MediaTrackConstraints | boolean; // default true
  videoConstraints?: MediaTrackConstraints | boolean; // default true
  _getUserMedia?: (constraints) => Promise<MediaStream>;     // test override
  _createPeerMesh?: (opts: PeerMeshOptions) => PeerMesh;     // test override
  _createSignaling?: (opts: SignalingOptions) => Signaling;  // test override
  _permissions?: PermissionsLike | null;                     // test override
  log?: { log, warn, error };                                // default console
}): {
  // -------- participants --------
  participants: ReadonlyArray<{
    peerId: string;
    role: "tutor" | "student";
    label?: string;
    audioStream: MediaStream | null;
    videoStream: MediaStream | null;
    peerConnectionState: RTCPeerConnectionState;    // "new" until first transition
    iceConnectionState: RTCIceConnectionState;
  }>;

  // -------- local streams --------
  localAudioStream: MediaStream | null;
  localVideoStream: MediaStream | null;

  // -------- mute / camera-off --------
  isMicMuted: boolean;                              // default false
  isCamMuted: boolean;                              // default true (no track yet)
  toggleMic: () => void;                            // flips track.enabled
  toggleCam: () => void;                            // flips track.enabled

  // -------- permissions --------
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  requestMic: () => Promise<void>;                  // idempotent
  requestCam: () => Promise<void>;                  // idempotent

  // -------- status --------
  isAcquiring: boolean;                             // true while requestMic OR requestCam in flight
  isActive: boolean;                                // syncClient !== null && localAudioStream !== null && error === null
  error: AvAcquireError | null;                     // mic acquire error (typed)
  videoError: AvAcquireError | null;                // cam acquire error (separate)

  // -------- recovery --------
  reconnectPeer: (peerId: string) => void;          // mesh.restart
  retryAcquire: () => Promise<void>;                // re-runs request* for whichever errored
};
```

### `AvAcquireError` (typed; superseded `error: string | null` from spec)

```ts
type AvAcquireError =
  | { type: "permission-denied";    message: string; raw: unknown }
  | { type: "no-device";            message: string; raw: unknown }
  | { type: "device-in-use";        message: string; raw: unknown }
  | { type: "constraints-not-met";  message: string; raw: unknown }
  | { type: "browser-unsupported";  message: string; raw: unknown }
  | { type: "unknown";              message: string; raw: unknown };
```

4c maps `error.type` to user-facing copy + recovery affordances.
Separate `error` (mic) + `videoError` (cam) supports 4d's separate-
tile placeholders (mic-granted-cam-denied is a representable state).

### Presence envelope (sync-client)

```ts
type WhiteboardWirePresence = {
  v: 1;
  kind: "presence";
  peerId: string;        // sender — injected by sync-client, NOT caller
  role: "tutor" | "student";
  label?: string;
};

type RoomPeer = {
  peerId: string;
  role: "tutor" | "student";
  label?: string;
};

// On WhiteboardSyncClient:
onRoomPeersChange: (cb: (peers: ReadonlyArray<RoomPeer>) => void) => () => void;
```

### `remote-stream-recorder.ts` surface

```ts
function studentMicStreamId(peerId: string): string;
// Convention: "student:peer-<peerId>:mic"

function createRemoteStreamRecorder(opts: {
  stream: MediaStream;                      // participants[i].audioStream
  streamId: string;                         // studentMicStreamId(peerId)
  sessionId: string;                        // whiteboardSessionId
  outbox: UploadOutbox;                     // Phase 1b instance
  mimeType?: string;                        // defaults to chooseMimeType()
  timesliceMs?: number;                     // omit for one big segment per start/stop
  log?: Pick<Console, "log" | "warn" | "error">;
  _MediaRecorder?: typeof MediaRecorder;    // test override
  _now?: () => number;                      // test override
  _uuid?: () => string;                     // test override
}): {
  start: () => void;
  stop: () => Promise<void>;                // awaits trailing enqueue
  isRecording: () => boolean;
  dispose: () => void;                      // sync teardown, no await
};
```

### Wire-schema discriminants (sync-client.ts, post-4b)

```ts
type AnyWhiteboardWireMessage =
  | WhiteboardWireMessageV1               // scene v1
  | WhiteboardWireMessageV2               // scene v2
  | WhiteboardWireMessageV3               // scene v3
  | WhiteboardWireSignal                  // 4a: kind === "webrtc-signal"
  | WhiteboardWirePresence;               // 4b: kind === "presence"
```

Validation:
- Presence kind takes priority alongside `webrtc-signal` (validator
  branches on `kind` BEFORE the scene `v` check).
- Unknown `kind` values rejected cleanly — forward-compat.
- Existing scene + signal validation paths untouched (regression
  tests assert this).

---

## Logging — `avx=<sessionId>` + `streamId=...` (mandatory)

No new prefix added in 4b (per the orchestrator's "keep the registry
tight" recommendation). Hook events reuse `avx`; outbox rows continue
to use `obx`; the new recorder lines pair them so grep stays cheap:

```
[useLiveAV]                  avx=<sid> requestMic start audio=<...>
[useLiveAV]                  avx=<sid> mic acquired tracks=<N> muted=<bool>
[useLiveAV]                  avx=<sid> requestCam start video=<...>
[useLiveAV]                  avx=<sid> cam acquired tracks=<N>
[useLiveAV]                  avx=<sid> addPeer peer=<peerId> role=<...>
[useLiveAV]                  avx=<sid> removePeer peer=<peerId>
[useLiveAV]                  avx=<sid> track received peer=<peerId> kind=<audio|video>
[useLiveAV]                  avx=<sid> pcState peer=<peerId> state=<...>
[useLiveAV]                  avx=<sid> iceState peer=<peerId> state=<...>
[useLiveAV]                  avx=<sid> toggleMic next=<muted|unmuted>
[useLiveAV]                  avx=<sid> toggleCam next=<muted|unmuted>
[useLiveAV]                  avx=<sid> reconnectPeer peer=<peerId>
[useLiveAV]                  avx=<sid> retryAcquire <mic|cam|no-op>
[remote-stream-recorder]     avx=<sid> streamId=<...> started mime=<...> timesliceMs=<...>
[remote-stream-recorder]     avx=<sid> streamId=<...> segment ready segmentId=<...> bytes=<N>
[remote-stream-recorder]     avx=<sid> streamId=<...> MediaRecorder stop fired
[remote-stream-recorder]     avx=<sid> streamId=<...> disposed
[sync-client]                wbsync=<roomShort> kind=presence peer=<id> role=<...>
```

---

## Test counts

| Surface | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `src/__tests__/whiteboard/sync-client.test.ts` (presence + grace + 4 pre-existing scene tests re-asserted with `countSceneEmits`) | all green |
| `src/__tests__/dom/useLiveAV.dom.test.tsx` (post-realignment) | **40 cases, all green** |
| `src/__tests__/recording/remote-stream-recorder.test.ts` (NEW) | **22 cases, all green** |
| `npx jest` (full repo) | **861 of 869 unit tests pass.** Same 8 pre-existing DB-dependent failures Phase 4a documented (`auth.test.ts`, `email.test.ts`, `note-and-share.test.ts`, `password-reset.test.ts`, `transcribe-late-hallucination.test.ts`). NOT regressions. |

### What the new suites assert

**`src/__tests__/whiteboard/sync-client.test.ts` (presence block, 16 cases)**:
presence round-trip, peerId-not-self exclusion, self-echo drop,
`onRoomPeersChange` fires once per change with correct member list,
3-peer canary, presence rebroadcast on `new-user`, 5s grace window
honored, transient flap (≤5s) does NOT fire remove/re-add, dispose
cleans presence state, AES-key-late path replays presence after key
resolves, existing scene/signal messages still validate
post-extension.

**`src/__tests__/dom/useLiveAV.dom.test.tsx` (40 cases)**:
- INERT on mount: no getUserMedia, no mesh, all defaults.
- Permissions API: query populates state; live `change` event
  updates; Safari camera-throw fallback; `_permissions: null`
  leaves state "unknown".
- `requestMic`: happy path; classified errors
  (permission/no-device/device-in-use); idempotence (in-flight +
  post-success); no-trigger of `requestCam`.
- `requestCam`: happy path; permission denial; independent of mic;
  parallel mic+cam acquisition; idempotence.
- `retryAcquire`: re-runs mic on error; re-runs cam on videoError;
  no-op when neither.
- Mesh + signaling lifecycle: built only after requestMic resolves;
  not built before; syncClient=null = no mesh; `getLocalTracks`
  returns current local audio (then audio+video after requestCam).
- Peer reconciliation: addPeer/removePeer ordering, lexicographic
  sort, 3-peer canary, label updates on re-emit.
- Remote tracks: per-kind routing to audio/videoStream; track
  `ended` event removes from stream; PC/ICE state propagation.
- Mute control: toggleMic + toggleCam flip track.enabled +
  state; toggleCam before requestCam is a state-only flip;
  reconnectPeer happy + no-mesh warn.
- Teardown: unmount disposes mesh + signaling, stops local + remote
  tracks; peer removal stops remote tracks; unmount stops local
  video tracks acquired via requestCam.

**`src/__tests__/recording/remote-stream-recorder.test.ts` (22 cases)**:
- `studentMicStreamId(peerId)` → exact `student:peer-<id>:mic`.
- start/stop basics: ctor mime + stream; double-start no-op;
  no-audio-tracks no-op; missing MediaRecorder ctor error; disposed
  recorder no-op; `timesliceMs` passthrough.
- dataavailable: correct streamId/segmentId/audioStartedAtMs/
  sizeBytes/mimeType on outbox row; empty trailing chunk skipped;
  multi-segment timeslice; audioStartedAtMs advances; outbox
  enqueue rejection logged not thrown.
- stop() lifecycle: awaits trailing dataavailable + MediaRecorder
  stop event; not-recording resolves immediately; double-stop
  shares promise; stop() awaits outbox.enqueue completion (the
  important guarantee for end-session drain ordering).
- dispose(): sync teardown; resolves pending stop(); listener
  detach (late dataavailable ignored); dispose-then-start no-op.
- 3-peer canary: independent outbox lanes by streamId, no
  cross-talk; per-peer counts correct (2/0/1 mix).

---

## What Phase 4c must add (not done here)

This is the explicit handoff list. Each item is OUT of scope of 4b
and IN scope of 4c (or later sub-chats as noted).

1. **UI components** (master plan Task 4):
   - `src/components/av/AVTile.tsx` (one per participant; renders
     `<audio autoplay srcObject>` + optional `<video>` + name label
     + mute indicator).
   - `src/components/av/AVTilesPanel.tsx` (responsive grid).
   - `src/components/av/AVPermissionsPrompt.tsx` (modal driven by
     `hasMicPermission`/`hasCamPermission`; calls `requestMic()` /
     `requestCam()`).
   - `src/components/av/AVControls.tsx` (mute toggle, cam toggle,
     reconnect, mic+cam picker once `enumerateDevices` lands).
2. **Mounting `useLiveAV`** in:
   - `src/components/whiteboard/WhiteboardWorkspaceClient.tsx`
     (tutor side; reads `participants` for AV tile grid; wires
     `createRemoteStreamRecorder` per participant gated by
     `lifecycle.shouldCapture('student:peer-<id>:mic')`).
   - `src/components/whiteboard/StudentWhiteboardClient.tsx`
     (student side; reads `participants` for the AV tile of the
     tutor; no recording — students are receive-only consumers of
     remote-stream-recorder).
3. **Lifecycle FSM input wiring** for student-mic streams. The host
   must populate `inputStreams: Map<streamId, StreamHealth>` with
   one entry per active student peer. Suggested wiring:
   ```ts
   inputStreams: Map([
     ['tutor:mic', tutorMicHealth],
     ...participants.map(p => [
       studentMicStreamId(p.peerId),
       healthFromConnectionState(p.peerConnectionState)
     ])
   ])
   ```
   With `healthFromConnectionState` mapping `connected` → `"ok"`,
   `connecting`/`new` → `"degraded"`, `disconnected`/`failed`/`closed`
   → `"failed"`.
4. **`<audio autoplay>` per remote participant** for live playback.
   `useLiveAV.participants[i].audioStream` is the source.
   Important: do NOT also play `videoStream` audio — set
   `<video muted>` so audio comes exclusively from the audioStream
   companion (avoids double-playback at different latencies).
5. **Per-participant tile placeholder copy** for connectionState
   transitions (`connecting` → spinner, `disconnected` →
   "Reconnecting…", `failed` → "Cannot connect" + Reconnect button
   wired to `reconnectPeer(peerId)`).
6. **CSP / `Permissions-Policy` headers** (Phase 4d): the existing
   `microphone=()` / `camera=()` Permissions-Policy on Vercel
   blocks `getUserMedia`. 4d unblocks them.
7. **Graceful-degradation polish** (Phase 4d): wire `error.type` /
   `videoError.type` to user-facing copy; auto-retry recipes;
   mic-granted-cam-denied tile placeholder; peer-failed
   "Reconnecting…" banner.
8. **`docs/LIVE-AV.md`** (Phase 4d): architecture overview pulling
   together 4a + 4b + 4c + 4d.

### Assumptions 4c inherits from 4b (do not violate)

- `useLiveAV` is INERT until `requestMic()` (and optionally
  `requestCam()`) are called. Mounting it in a component does NOT
  prompt for permissions. 4c's UI is responsible for prompting.
- Adding tracks to existing peer connections mid-session requires
  renegotiation — `useLiveAV` does NOT do this. Pattern: 4c's
  permissions modal gates the entire session entry, so mic+cam are
  granted (or one explicitly declined) BEFORE the sync-client
  connects and peers start arriving. This is the orchestrator's
  recommendation (option (a) from the bootstrapper, NOT the
  renegotiate path).
- `remote-stream-recorder` is FSM-agnostic. 4c is responsible for
  calling `start()` / `stop()` based on
  `lifecycle.shouldCapture(streamId)` transitions.
- `streamId: "student:peer-<peerId>:mic"` is the single source of
  truth. Use `studentMicStreamId(peerId)` from
  `remote-stream-recorder.ts` so a future rename has one edit point.
- The outbox row schema already supports any `streamId` (Phase 1b
  shipped this). No DB migration required.
- The end-session server action already accepts multi-stream
  `segments[]` keyed by `streamId`. No change required.

### Open question resolved (mid-session permission grant)

> Recorded for posterity. The bootstrapper flagged this as needing
> orchestrator decision: cam-after-mic mid-session — accept the
> renegotiation gap (option a) or extend useLiveAV to teardown /
> recreate peer connections on local-track shape changes (option b)?

**Decision: option (a) — defer to 4c.** 4c's permissions UI is
expected to gate the entire session entry (modal at workspace mount
asking for mic+cam together; if cam is declined, the session
proceeds audio-only and cam cannot be enabled mid-call without a
reconnect). This keeps 4b's mesh-build sequence simple and avoids
the corner case where adding a local track mid-session breaks the
ICE state machine.

---

## Known not-yet-tested edge cases (deferred per plan)

These are explicitly out-of-scope of 4b; flagged here so 4c/4d know
what to pick up.

1. **Sync-reconnect mid-negotiation.** If the encrypted Socket.IO
   transport drops mid-SDP-exchange and reconnects, the in-flight
   negotiation may stall. Peer-mesh's auto-restart kicks in only on
   `iceConnectionState === "failed"` (after a longer browser
   timeout). 4c should consider calling `mesh.restart(peerId)` for
   every current peer when sync-client's `onConnect` fires after a
   reconnect. Mark as a smoke item for 4c.
2. **Late mic-permission grant after the modal was dismissed.** 4c's
   permissions modal may need to support a "Try again" affordance
   for users who initially declined. `useLiveAV.retryAcquire()`
   covers the retry of an already-attempted-and-failed call; an
   initial-decline-then-grant path needs the host to call
   `requestMic()` again.
3. **Device hot-swap** (user plugs in a new mic mid-session). 4b
   does NOT detect `navigator.mediaDevices.devicechange` events.
   The current local tracks keep flowing on the old device until
   the user manually triggers a re-acquire. Post-v1 backlog;
   `useLiveAV`'s `getLocalTracks` is already callback-based so the
   API doesn't preclude a future "re-acquire and update PC senders"
   helper.
4. **Large-mesh CPU envelope.** Sarah's realistic max is ≤5 peers.
   Each remote audio track gets its own `MediaRecorder` running in
   parallel; on low-end hardware this could become non-trivial. No
   profiling done in 4b. Smoke check on a sub-$300 student Chromebook
   under 4c+ once UI lands.
5. **Track-mute on the wire.** 4b's mute (toggleMic/toggleCam) only
   flips local `track.enabled`. The remote peer still receives RTP
   (silence). Wire-level mute coordination (tutor moderating a
   student's audio across the wire) is post-v1 and intentionally
   out-of-scope.
6. **Remote video tracks are NOT recorded.** `remote-stream-recorder`
   only enqueues audio. Recording the video tracks is out-of-scope
   per the master plan; the architecture does not preclude it (a
   future video-capable recorder reuses the same pattern with a new
   streamId shape).

---

## Smoke checklist — before merging to master

Phase 4b adds the hook + recorder but does NOT mount them in any
component. The hook is invisible to the tutor through the UI surface;
smoke 4b primarily as a non-regression check against existing
whiteboard + audio paths.

- [ ] On the **branch preview URL** (NOT `tutoring-notes.vercel.app`),
      hard-refreshed since the last deploy.
- [ ] Vercel build green for the
      `phase-4b-uselife-av-and-outbox-integration` branch.
- [ ] Open a 2-tab whiteboard session (tutor + student via join link).
      Tutor draws → student sees strokes within ~1 second. **Existing
      whiteboard sync is load-bearing; the additive `presence`
      envelope must NOT regress it.**
- [ ] Tutor records a 30-second solo audio segment, ends session,
      replay shows audio. **Existing tutor-mic outbox path is
      load-bearing; the new `remote-stream-recorder` must NOT alter
      it.**
- [ ] DevTools console for both tabs: no errors. New
      `[sync-client] wbsync=… kind=presence …` log lines appear
      once per peer per join. NO `[useLiveAV]` or
      `[remote-stream-recorder]` log lines appear (no component
      mounts the hook in 4b).
- [ ] `npx jest` locally: 861/869 unit tests green (pre-existing 8
      DB failures only).
- [ ] `npx tsc --noEmit` clean.

(No live A/V smoke is possible in 4b because no component mounts the
hook. Live A/V smoke arrives with 4c's UI + 4d's CSP unblock.)

---

## When picking up Phase 4c mid-feature

1. Read **this doc** top-to-bottom for the API contracts you inherit.
2. Read the master plan's Phase 4 section, especially Task 4 (UI
   components) and Task 6 (workspace mounting).
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes. Expect the same 861/869 pre-existing posture.
4. The first scoping decision for 4c: **where does
   `localPeerId` come from?** It must match the sync-client's own
   envelope `peerId`. Options:
   - Have sync-client expose its own peerId via a getter, and
     `useLiveAV` reads it.
   - Have the workspace mint one id, pass it to both sync-client
     AND `useLiveAV`.

   The second is cleaner (single source of truth = the workspace),
   but requires verifying sync-client can take a caller-provided
   peerId rather than minting its own. Inspect sync-client and
   decide.
5. Update **this doc** as you finish 4c sub-phases, and create
   `docs/PHASE-4C-STATUS.md` per the established pattern.

---

## Recovery / partial-branch tips

- The five code commits chain naturally: presence (1) → mic-only
  hook (2) → cam support (3) → realignment (4) → recorder (5).
  Commits 2 and 3 are **superseded** by commit 4 — they are kept
  on the branch for history but should not be treated as the
  authoritative API.
- No DB migrations. No middleware / CSP changes. No new server
  actions. The only production-surface changes are:
  - One new envelope kind (`presence`) and one new method
    (`onRoomPeersChange`) on `WhiteboardSyncClient`.
  - One new React hook (`useLiveAV`) — not mounted anywhere yet.
  - One new module (`remote-stream-recorder.ts`) — not imported
    anywhere yet.
- If a 4b regression shows up post-merge, the safe rollback is
  `git revert c936155..d1fbc2c`. The presence envelope, the hook,
  and the recorder are pure additions; no existing call site uses
  them.
