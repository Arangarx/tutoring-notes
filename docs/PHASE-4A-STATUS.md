# Phase 4a — peer-mesh + signaling foundation — branch handoff

> **Archive / handoff only (2026-05-19):** ✅ **SHIPPED to master** merge `59d13ad`. Branch deleted. Live A/V stack complete through 4d + device-management (`ac92137`). See `docs/LIVE-AV.md`.

**Branch:** `phase-4a-peer-mesh-signaling` (off `master` at `ac9a066`).
**Master plan:** `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Pillar in scope:** Pillar 6 (Live A/V transport architecture) —
WebRTC peer-mesh + signaling muxer foundation.
**Position in Phase 4:** 1st of 4 sub-chats (4a → 4b → 4c → 4d).
**Companion docs:** [PHASE-1B-STATUS.md](PHASE-1B-STATUS.md) (template),
[AGENTS.md](../AGENTS.md), [RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md)
(ID-prefix registry — `avx` added here).

This doc is the canonical handoff for Phase 4a. Read it FIRST when
picking up Phase 4b (or the branch in a fresh chat) — it lists what
landed, what each commit does, the public API 4b inherits, what is
explicitly NOT done yet, and the smoke checklist.

---

## Status

**Foundation feature-complete. Awaiting `git push` + PR + Vercel
preview smoke before merging to `master`.**

This sub-chat covers Phase 4 Task 1 (peer-mesh) and Task 2 (signaling
+ encrypted envelope extension). Everything else — `useLiveAV`,
`getUserMedia`, UI tiles, recording integration, CSP, acceptance tests
— is explicitly deferred to 4b/4c/4d per the master plan's "Suggested
chat partitioning" section.

| Commit | Summary | Files changed |
|---|---|---|
| `92cc43c` | Additive `webrtc-signal` envelope on sync-client; v1 schema + validator; `broadcastSignal` / `onRemoteSignal` API; wire-schema regression tests | `src/lib/whiteboard/sync-client.ts`, `src/__tests__/whiteboard/sync-client.test.ts` |
| `317fa27` | `src/lib/av/signaling.ts` — typed signal muxer over sync-client; `targetPeerId === localPeerId` demux; 32 Jest cases | `src/lib/av/signaling.ts`, `src/__tests__/av/signaling.test.ts` |
| `82f2232` | `src/lib/av/peer-mesh.ts` — `Map<peerId, RTCPeerConnection>` with perfect-negotiation, ICE trickle, glare rollback, auto-restart on ICE-failed (polite side), mesh fan-out; 29 Jest cases against a typed `FakePc` double | `src/lib/av/peer-mesh.ts`, `src/__tests__/av/peer-mesh.test.ts` |
| _this commit_ | `docs/PHASE-4A-STATUS.md` + `avx` prefix in `AGENTS.md` + `docs/RECORDER-LIFECYCLE.md` registry | docs + registry only |

---

## What changed (architecturally)

### Pillar 6 — live A/V transport foundation

Three layers, kept strictly bottom-up so that 4b can consume them
without re-coupling:

1. **`sync-client.ts` envelope extension (Commit 1).** A new
   `WhiteboardWireSignal` envelope (`v: 1`, `kind: "webrtc-signal"`)
   rides the **same AES-GCM-256 envelope** as scene/document
   messages. The relay never sees plaintext SDP / ICE. Discriminated
   from scene messages by presence of the `kind` field (existing
   v1/v2/v3 scene messages have no `kind`; the validator treats
   `kind` as the high-priority discriminator and falls through to
   scene validation when absent). Unknown `kind` values are rejected
   cleanly — a newer client's future envelope cannot crash an older
   one. The encrypt/decrypt code path and the IV/key handling are
   **untouched** (trust-model invariant).

2. **`signaling.ts` (Commit 2).** A typed muxer that subscribes to
   `sync-client.onRemoteSignal` and demultiplexes by `targetPeerId
   === localPeerId`. Peer-mesh asks signaling to `sendOffer /
   sendAnswer / sendIce / sendLeave`; signaling injects the
   sender's `peerId` (from the closure, NOT from caller args) so
   identity-spoofing is impossible from the public API surface.
   Defense-in-depth: signals from self are dropped even though
   sync-client already suppresses own echoes.

3. **`peer-mesh.ts` (Commit 3).** A typed wrapper owning a
   `Map<peerId, RTCPeerConnection>`. Implements the full
   perfect-negotiation pattern per pair:
   - **Lex-based polite role**: `localPeerId > remotePeerId` is
     polite for that pair. The two peers compute opposite values for
     the same pair; this is the standard WebRTC convention.
   - **Glare**: simultaneous offers — polite peer rolls back its
     local offer and applies the remote one, impolite peer ignores
     the inbound offer. Either way, convergence is one round-trip.
   - **ICE trickle queue**: candidates received before
     `setRemoteDescription` are queued and drained in arrival order
     after the description is applied. End-of-candidates (`null`)
     before description is a no-op (spec-equivalent).
   - **Auto-restart**: on `iceConnectionState === "failed"`, the
     polite peer fires `createOffer({ iceRestart: true })`; impolite
     waits. Public `restart(peerId)` is also available for a host-
     driven retry (4c will wire this to a UI "Reconnect" button).
   - **Mesh fan-out**: independent PC per remote peer; no cross-
     talk. `addPeer("B")` then `addPeer("C")` creates two PCs;
     signals from each are routed by `fromPeerId` to the right
     entry.
   - **Cleanup**: `removePeer(p)` detaches every event handler
     **before** `pc.close()`, deletes the map entry, and sends a
     `leave` signal to the remote. Late callbacks on a closed PC
     are silently dropped via a `closed` flag inside the entry.

### `peer-mesh.ts` is pure-JS by construction

No DOM. No `MediaStream` instantiation. No `getUserMedia`. The host
supplies local tracks via `getLocalTracks(remotePeerId)`. This keeps
the module unit-testable in node-env Jest without browser
permissions, and lets 4b own all browser media-capture concerns.

---

## Public API — what Phase 4b inherits

Phase 4b's `useLiveAV` hook is the next consumer. It will:
1. Call `getUserMedia` to obtain the local mic/cam stream.
2. Construct a single `signaling = createSignaling({...})` and a
   single `mesh = createPeerMesh({signaling, ...})` per session.
3. Pass `getLocalTracks: (peerId) => [...localStream.getTracks()]`.
4. Call `mesh.addPeer(peerId)` for every non-self room member
   reported by `sync-client.onPeerCountChange` / participant tracking.
5. Subscribe to `mesh.onRemoteTrack` to wire remote tracks into
   `<audio autoplay>` (live playback) AND into the multi-stream
   outbox via `MediaRecorder` with `streamId: "student:peer-X:mic"`.

### `signaling.ts` surface

```ts
function createSignaling(opts: {
  syncClient: SignalingSyncDependency;   // {broadcastSignal, onRemoteSignal}
  localPeerId: string;                    // throws if empty
  sessionId?: string;                     // threaded into avx=<id> logs
  log?: SignalingLogger;
}): Signaling;

type Signaling = {
  onSignal: (cb: (fromPeerId, payload) => void) => () => void;
  sendOffer:  (remotePeerId, sdp) => void;
  sendAnswer: (remotePeerId, sdp) => void;
  sendIce:    (remotePeerId, candidate: RTCIceCandidateInit | null) => void;
  sendLeave:  (remotePeerId) => void;
  isDisposed: () => boolean;
  dispose: () => void;
};
```

### `peer-mesh.ts` surface

```ts
function createPeerMesh(opts: {
  signaling: Signaling;
  localPeerId: string;                                       // throws if empty
  iceServers?: ReadonlyArray<RTCIceServer>;                  // default: public STUN
  getLocalTracks?: (remotePeerId: string) => MediaStreamTrack[]; // default: []
  sessionId?: string;
  log?: PeerMeshLogger;
  _pcFactory?: PeerConnectionFactory;                        // test-only
}): PeerMesh;

type PeerMesh = {
  addPeer: (peerId: string) => void;          // idempotent; rejects self
  removePeer: (peerId: string) => void;       // closes PC, emits leave
  peers: () => ReadonlySet<string>;           // snapshot, not live
  restart: (peerId: string) => void;          // manual ICE restart
  onRemoteTrack: (cb) => () => void;
  onPeerConnectionStateChange: (cb) => () => void;
  onIceConnectionStateChange: (cb) => () => void;
  isDisposed: () => boolean;
  dispose: () => void;
};
```

### Wire-schema discriminants (sync-client.ts)

```ts
type WhiteboardWireSignal = {
  v: 1;
  kind: "webrtc-signal";
  peerId: string;            // sender (injected by sync-client, not caller)
  targetPeerId: string;
  payload:
    | { type: "offer";  sdp: string }
    | { type: "answer"; sdp: string }
    | { type: "ice"; candidate: RTCIceCandidateInit | null }
    | { type: "leave" };
};
```

Validation rules (enforced in `validateWireMessage`):
* `kind === "webrtc-signal"` selects the signal validator BEFORE
  the scene-message `v` check.
* Absent `kind` → existing v1/v2/v3 scene validation (unchanged).
* Present-but-unknown `kind` → cleanly rejected with `[sync-client]
  decoded payload: unknown kind '...'`, NOT a crash.
* `peerId` / `targetPeerId` must be non-empty strings.
* `payload.type` must be one of the four discriminants above; SDP
  must be a string; ICE candidate must be `null` or an init shape
  with a string `candidate` field.

---

## Logging — `avx=<sessionId>` + `peer=<peerId>` (mandatory)

Every state transition in `peer-mesh.ts` and `signaling.ts` emits a
log line in this shape:

```
[peer-mesh]  avx=<sessionId> peer=<remotePeerId> event=<offer-send|answer-send|ice-send|ice-state|conn-state|glare-rollback|auto-restart|remove|...> [from=<state>] [to=<state>] [reason=<...>]
[signaling]  avx=<sessionId> peer=<localPeerId>  send|recv kind=<offer|answer|ice|leave> target=<remotePeerId> [from=<remotePeerId>] [endOfCandidates=<bool>]
[sync-client] wbsync=<roomShort> kind=webrtc-signal from=<peerId> target=<targetPeerId> type=<offer|answer|ice|leave>
```

`avx` is the **live-A/V session-level prefix** (new in Phase 4a). The
per-peer subkey `peer=<id>` scopes every line so prod debugging of a
mesh with ≥3 peers can grep one peer's events out of the mix.

If `sessionId` is omitted by the host, the prefix falls back to
`avx=?`. 4b should pass `sessionId: whiteboardSessionId` so the av-
lines correlate with `wbsid=` on the same scrollback.

---

## Test counts

| Surface | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `src/__tests__/whiteboard/sync-client.test.ts` (existing + new signal cases) | all green |
| `src/__tests__/av/signaling.test.ts` (NEW) | 32 cases, all green |
| `src/__tests__/av/peer-mesh.test.ts` (NEW) | 29 cases, all green |
| `npx jest` (full repo) | **781 of 789 unit tests pass.** The 8 failing tests are pre-existing DB-dependent tests (`auth.test.ts`, `email.test.ts`, `note-and-share.test.ts`, `password-reset.test.ts`, `transcribe-late-hallucination.test.ts`) — they fail because no local Postgres is reachable at `127.0.0.1:5432`. They are NOT regressions from Phase 4a. The `[globalSetup] Could not reach test database` banner confirms the env condition. |

### What the new suites assert

**`src/__tests__/whiteboard/sync-client.test.ts`** adds round-trip
coverage for the signal envelope: encrypt → decrypt → validate; scene
messages still validate post-extension; unknown `kind` rejects
cleanly; malformed payload shapes rejected; `broadcastSignal` injects
sender peerId; `onRemoteSignal` delivers every non-self signal.

**`src/__tests__/av/signaling.test.ts`** (32 cases):
- Constructor invariants (empty localPeerId throws, one onRemoteSignal
  subscription, dispose unsubscribes + clears).
- Send side: all four send kinds forward correctly, reject empty peer
  / self / empty SDP / dispose-after.
- Recv side: target demux (signal for "C" does NOT fire "A"'s
  handler), unsubscribe lifecycle, mid-fan unsubscribe safe, handler
  throw doesn't poison others, self-echo dropped, empty `fromPeerId`
  dropped, post-dispose silenced, 3-peer mesh scoping pinned.
- Log shape: `avx=<sid>` prefix; missing sessionId falls back to `?`.

**`src/__tests__/av/peer-mesh.test.ts`** (29 cases):
- Constructor invariants.
- Polite/impolite role from lex comparison — both directions.
- `addPeer` / `removePeer` lifecycle: idempotency, reject-self,
  closed PC silences late callbacks, `peers()` is a snapshot.
- Outgoing offer happy path: negotiation → offer → answer → ICE → connected.
- Inbound offer happy path with no local offer in flight.
- ICE trickle queue: candidates before remote description are queued
  AND applied in arrival order AFTER setRemoteDescription; late
  candidates apply immediately; null-before-description is no-op.
- Glare resolution: cross-mesh sim with two peer-mesh instances,
  one polite + one impolite — polite rolls back, impolite ignores,
  convergence via answer.
- ICE restart: polite auto-restarts on `iceConnectionState ===
  "failed"`; impolite does NOT; manual `restart()` works for any role.
- 3-peer mesh fan-out (tutor + 2 students canary): independent PCs,
  per-peer routing for send AND recv AND track callbacks AND ICE
  state callbacks, no cross-talk. `removePeer` one of three leaves
  the other two intact.
- Unknown-peer signal warns and drops (no auto-add in 4a).
- Inbound `leave` closes locally without echoing leave back.
- `dispose` closes every PC, silences late callbacks; addPeer/
  removePeer/restart post-dispose are no-ops.
- Log shape: `avx=<sid>` + `peer=<id>` subkeys present on every
  transition; default `?` when no sessionId.

---

## What Phase 4b must add (not done here)

This is the explicit handoff list. Each item is OUT of scope of 4a
and IN scope of 4b unless noted otherwise.

1. **`src/hooks/useLiveAV.ts`** — React hook owning
   `getUserMedia`, mute states, and the lifecycle of `signaling` +
   `mesh` instances. Surfaces `participants[]`, `localAudioStream`,
   `localVideoStream`, `isMicMuted`, `toggleMic`, etc. (Master plan
   Task 3.)
2. **Recording outbox integration** (master plan Task 5). Each
   remote participant's audio `MediaStream` flows through a
   `MediaRecorder` into the outbox with `streamId: "student:peer-
   X:mic"`. Lifecycle FSM's `shouldCapture(streamId)` decides per-
   stream recording. Phase 4a's peer-mesh exposes `onRemoteTrack`;
   4b decides what to do with the track.
3. **Participant discovery wiring**: 4b reads
   `sync-client.onRoomUserChange` (NOT yet wired — sync-client
   currently exposes a count, not per-peer ids) and calls
   `mesh.addPeer(peerId)` / `mesh.removePeer(peerId)`. If
   per-peer ids aren't exposed by sync-client today, a small
   additive extension to sync-client will be needed in 4b — that's
   one of the first scoping decisions for the 4b chat.
4. **UI components, CSP, acceptance tests** — Phase 4c / 4d (see
   master plan for the full split).

### Assumptions 4b inherits from 4a (do not violate)

- The wire envelope discriminants are stable. Adding a new envelope
  kind in the future is additive; do not change the existing
  `webrtc-signal` shape without a `v` bump.
- The peer-mesh signaling handler **drops signals from peers with no
  PC entry**. 4b is responsible for calling `addPeer(peerId)`
  **before** the first inbound signal lands. If 4b ever needs
  auto-add-on-first-inbound-offer, that's a future feature flag, not
  a silent change.
- The peer-mesh does NOT touch `navigator.mediaDevices`. 4b owns
  every camera/mic capture concern.
- Logging contract: `avx=<sessionId>` MUST be threaded by 4b. The
  `?` fallback exists for tests; production logs need the real id.

---

## Known not-yet-tested edge cases (deferred per plan)

These are explicitly out-of-scope of 4a per the master plan; flagged
here so 4b/4c/4d know what to pick up.

1. **TURN server**. 4a ships public STUN only (`stun.l.google.com`).
   The plan says: only add hosted TURN if NAT-traversal failures
   show up in real Sarah-pilot field reports. Until then, peer-mesh
   accepts an `iceServers` override so the workspace can configure
   TURN without code changes.
2. **SFU**. Out of scope. Mesh handles Sarah's realistic max (≤5
   peers). SFU is deferred until N>5 becomes a real load problem.
3. **Per-track mute/unmute** (UI-driven moderation). Phase 4c. The
   peer-mesh API does not currently expose a per-peer track mute;
   muting is done at the `MediaStreamTrack.enabled = false` level
   inside `useLiveAV` (4b).
4. **Reconnect on sync-client drop**. The encrypted Socket.IO
   channel already auto-reconnects (sync-client's
   `reconnection: true`). When sync reconnects, peer-mesh's signals
   simply flow again — no special wiring needed, BUT 4b should
   verify that an in-progress negotiation that lost the SDP
   mid-flight recovers (likely via `mesh.restart(peerId)` on
   sync-reconnect of all current peers). Mark as a smoke item for
   the live-A/V phase.
5. **Browser fallback for `setLocalDescription({ type: "rollback" })`**.
   Some older Safari versions throw if there's no offer to roll back.
   Peer-mesh logs the error and continues — `setRemoteDescription`
   below it will fail-then-recover if the rollback was needed for
   real. Worth a smoke pass on iPadOS Safari once 4b/4c ship the UI.

---

## Smoke checklist — before merging to master

Phase 4a is invisible plumbing (no UI is mounted yet). The smoke for
the live-A/V experience itself lands in 4c/4d. Smoke 4a only as a
non-regression check.

- [ ] On the **branch preview URL** (NOT `tutoring-notes.vercel.app`),
      hard-refreshed since the last deploy.
- [ ] Vercel build green for the `phase-4a-peer-mesh-signaling` branch.
- [ ] Open a 2-tab whiteboard session (tutor + student via join link).
      Tutor draws → student sees strokes within ~1 second. (Sync-client
      envelope additive change must not regress scene messages.)
- [ ] DevTools console for both tabs: no errors. The new
      `[sync-client] wbsync=… kind=webrtc-signal …` log lines should
      NOT appear yet (no Phase 4b/c code is calling signaling). If they
      DO appear, something is wrong — there should be exactly zero
      live-A/V code paths invoked in this phase.
- [ ] `npx jest` locally: pre-existing 8 DB-dependent failures only;
      the new `src/__tests__/av/*` suites green.
- [ ] `npx tsc --noEmit` clean.

---

## When picking up Phase 4b mid-feature

1. Read **this doc** top-to-bottom for the API contracts you inherit.
2. Read the master-plan's Phase 4 section, especially Task 3
   (`useLiveAV` hook) and Task 5 (recording outbox integration).
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes. Expect the same 781/789 pre-existing posture.
4. The first scoping decision: how does `useLiveAV` discover
   participant peer ids? Sync-client today exposes a peer count, not
   per-peer ids. Likely answer: extend sync-client's `room-user-
   change` to surface stable peer ids (additive — adds a callback or
   a new method, doesn't change existing ones). 4b can include that
   sync-client extension.
5. Update **this doc** as you finish 4b sub-phases, and create
   `docs/PHASE-4B-STATUS.md` per the established pattern.

---

## Recovery / partial-branch tips

- The three commits are independent at the file level except for the
  natural dependency chain (1 → 2 → 3). The doc commit is purely
  documentation and can be reverted without affecting code.
- No DB migrations. No middleware / CSP changes. No new server
  actions. The only production-surface change is two new client-side
  exports on `WhiteboardSyncClient` (`broadcastSignal` /
  `onRemoteSignal`) and one new envelope kind that older clients will
  reject cleanly.
- If a 4a regression shows up post-merge, the safe rollback is
  `git revert 92cc43c..82f2232` — the envelope and the av/ modules
  are pure additions, no existing call site uses them yet.
