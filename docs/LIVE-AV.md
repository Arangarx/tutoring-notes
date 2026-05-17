# Live A/V — architecture + cheat sheet

> Audience: an agent (or a future you) picking up live-A/V work
> in this repo for the first time. Read this BEFORE editing
> `peer-mesh.ts`, `useLiveAV.ts`, `sync-client.ts`,
> `mic-recorder-audio.ts`'s `addRemoteAudio`, the workspace's
> participants-reconcile effect, or anything that claims to
> "simplify" how peers connect or how audio gets recorded.

This doc is the contract surface for the workspace's live-A/V
stack (Phase 4 of the
[pilot-ready master plan](../AGENTS.md#north-star)):

1. **Pillar 6 — Live A/V transport** — WebRTC peer mesh
   (`peer-mesh.ts`), encrypted signaling (`sync-client.ts`),
   per-peer UI (`AVTile`, `AVTilesPanel`, `AVControls`),
   permissions UX (`AVPermissionsPrompt`).
2. **Recording integration** — Web Audio fan-out
   (`mic-recorder-audio.ts`) routes the tutor mic into BOTH the
   live-A/V `publishStream` AND the `recordingStream`, plus
   sums every participant's remote audio into the recording
   mixdown (one MediaRecorder, one blob, one replay file).

> **Reliability rule of thumb:** If you can't draw the data-flow
> on a napkin from memory, don't change it. The architecture
> exists *because* the pilot lost real sessions to: (a) per-peer
> MediaRecorder fleets racing for "first audio file by createdAt"
> in replay; (b) `getUserMedia` double-acquisition causing Chrome
> to send silence on the WebRTC track; (c) per-route
> Permissions-Policy that didn't survive Next.js server-action
> redirects; (d) signaling that dropped offers on the floor when
> a peer subscribed after the offer arrived; (e) recording that
> started before the remote audio track was actually flowing.
> Every one of those scars is reflected in a documented
> invariant below.

See companion docs:
- [RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) — the three
  pillars of the audio recording pipeline. `useLiveAV` and
  `useAudioRecorder` cooperate at the `externalAudioStream`
  boundary; the FSM input
  `participantsWithFlowingAudio` (Phase 4d Commit 6) is
  defined here in Live A/V territory but consumed in Pillar 1.
- [PHASE-4A-STATUS.md](PHASE-4A-STATUS.md),
  [PHASE-4B-STATUS.md](PHASE-4B-STATUS.md),
  [PHASE-4C-STATUS.md](PHASE-4C-STATUS.md),
  [PHASE-4D-STATUS.md](PHASE-4D-STATUS.md) — chronological
  branch handoffs that built this stack.

---

## Map of source files

| Concern | File | Notes |
|---|---|---|
| **Peer mesh** (Pillar 6) | `src/lib/av/peer-mesh.ts` | Wraps N `RTCPeerConnection`s; perfect-negotiation glare resolution; ICE restart on `failed`; `addLocalTrackToAllPeers` for mid-session cam/mic add; `replaceLocalTrackOnAllPeers` for device hotswap (`replaceTrack`). |
| **Signaling envelope** | `src/lib/av/signaling.ts` | `createSignaling(syncClient)` — typed `offer`/`answer`/`ice`/`leave` envelopes. Subscribes to `syncClient.onRemoteSignal`. |
| **Sync client** | `src/lib/whiteboard/sync-client.ts` | E2E-encrypted transport over the sync server. Owns presence (`onRoomPeersChange`) AND signaling fan-out. Buffered replay of in-TTL signals — see 4c hotfix #3. |
| **AV hook (host integration)** | `src/hooks/useLiveAV.ts` | Owns the mesh + signaling lifecycle; exposes `participants`, `localAudio/VideoStream`, `requestMic/Cam`, `toggleMic/Cam`, `reconnectPeer`. |
| **Audio-flow detection** (Phase 4d) | `src/hooks/useAudioFlowConfirmation.ts` | Subscribes to remote audio tracks' `mute`/`unmute`/`ended` events with 200ms confirm debounce. Output feeds the FSM's `participantsWithFlowingAudio` input. |
| **Per-tile UI** | `src/components/av/AVTile.tsx` | Connection-state pill, cam-muted initials placeholder, mute overlays, retry button. Pure component. |
| **Multi-tile panel** | `src/components/av/AVTilesPanel.tsx` | Renders local-preview + per-remote `AVTile`. Accepts `onReconnect` + `resolveLabel`. |
| **Local + moderation controls** | `src/components/av/AVControls.tsx` | Tutor mic/cam toggles + per-peer "Don't record this student" toggles (`moderation` prop). |
| **Permissions UX** | `src/components/av/AVPermissionsPrompt.tsx` | Inline prompts + friendly denied-state copy. |
| **Connection-state mapping** | `src/components/av/connection-state-mapping.ts` | `getConnectionStatePill(pc, ice)` → UI pill descriptor. |
| **Initials + deterministic colour** | `src/components/av/initials-from-label.ts` | Per-peer cam-off placeholder. |
| **Stable peerId** (Phase 4d) | `src/lib/whiteboard/local-peer-id.ts` | `getOrCreateLocalPeerId(sessionId, rolePrefix)` — `sessionStorage`-persisted to survive reloads. |
| **Single-student label** (Phase 4d) | `src/lib/whiteboard/participant-label.ts` | `resolveParticipantLabel()` — uses `studentName` when there's exactly one remote peer. |
| **Sync pill state** (Phase 4d) | `src/lib/whiteboard/sync-pill-presentation.ts` | `deriveSyncPillState()` — hides the pill in the "awaiting student" steady state to reduce UI redundancy. |
| **Audio graph + mixdown** | `src/lib/mic-recorder-audio.ts` | Web Audio fan-out: mic → gain → (recordingDest + publishDest). `addRemoteAudio(stream)` sums remote audio into recordingDest only via per-stream `GainNode`. `setRemoteGain(stream, gain)` for per-peer recording-mute. |
| **Audio recorder hook** | `src/hooks/useAudioRecorder.ts` | Owns the audio graph + MediaRecorder. Exposes `localMicStream` (the publishStream), `addRemoteAudio`, `setRemoteRecordingGain`. |
| **Tutor workspace integration** | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` | Hosts both hooks. Reconcile effects for: per-participant `addRemoteAudio` attach/detach; `mutedPeerIdsInRecording` → per-peer gain; sync-reconnect → `mesh.restart`; FSM input wiring. |
| **Student workspace integration** | `src/app/w/[joinToken]/StudentWhiteboardClient.tsx` | Lighter — no per-peer moderation; no audio mixdown (students don't record). |
| **Per-route bindings** | `src/middleware.ts` | Site-wide `Permissions-Policy: camera=*, microphone=*, ...`. See 4c hotfix #2 invariant below. |

---

## Data flow — first peer joining

The most common pilot scenario: tutor opens workspace, copies join
link to wife on her phone, wife clicks the link. The path the
data takes from "wife clicks" to "tutor sees wife's video and
hears her voice":

```text
wife clicks join link
  ↓
StudentWhiteboardClient mounts
  ↓
syncClient connects to WHITEBOARD_SYNC_URL (encrypted with key from URL hash)
  ↓
useLiveAV mounts (inert until requestMic/Cam)
  ↓
AVPermissionsPrompt shows → wife taps Allow
  ↓
useLiveAV.requestMic() → getUserMedia → localAudioStream
  ↓
hasEverHadLocalMedia latches true
  ↓
mesh-build effect runs → signaling.createSignaling(syncClient)
  ↓
signaling subscribes to syncClient.onRemoteSignal
  ↓
syncClient REPLAYS in-TTL buffered offers via BufferedRemoteSignal
(or first new offer arrives)
  ↓
peer-mesh.signal-no-entry guard implicit-creates a peer entry for offer-only
  ↓
RTCPeerConnection negotiates (offer/answer/ICE)
  ↓
ontrack fires on tutor side → liveAv.participants updated
  ↓
useAudioFlowConfirmation detects audio frames flowing after 200ms confirm
  ↓
WhiteboardWorkspaceClient maps real peerId → synthetic peer-N
  ↓
FSM step 4b: participants ∩ participantsWithFlowingAudio non-empty
  ↓
FSM transitions to "recording" → MediaRecorder.start()
  ↓
WhiteboardWorkspaceClient.workspaceAudio.addRemoteAudio(wifeStream)
  ↓
wifeSource → wifeGain → recordingDest (gain=1, full volume)
  ↓
Web Audio sums tutor mic + wife audio into recordingStream → MediaRecorder captures both
```

Two paths from "tutor mic" — one to recording, one to WebRTC out:

```text
                        ┌─→ recordingDest → MediaRecorder (one mixdown per session)
tutor mic → gain → analyser
                        └─→ publishDest → peer-mesh outbound (every remote peer hears tutor)

wife's audio (over WebRTC) → wifeSource → wifeGain → recordingDest (NEVER publishDest)
```

`publishDest` carrying remote audio would create a tutor-mediated
feedback loop (every peer hears every other peer through the
tutor on top of their direct connection). The graph intentionally
keeps publishDest at "tutor mic only".

---

## Per-prefix log convention

Every live-A/V event logs with the session-scoped `avx=<sessionId>`
prefix, plus a `peer=<peerId>` when the event is per-peer. The
prefixes used today:

| Prefix | Meaning | Owner |
|---|---|---|
| `avx=<sessionId>` | Live-A/V session (Phase 4a+) | `useLiveAV`, peer-mesh, signaling |
| `peer=<peerId>` | Per-peer event | peer-mesh, workspace reconcile |
| `rid=<id>` | Audio recorder session | `useAudioRecorder` |
| `wbsid=<id>` | Whiteboard session | workspace + student clients |
| `obx=<row>` | Upload outbox row | `upload-outbox.ts` |
| `snp=<id>` | Snapshot PNG generation | `snapshot-png.ts` |
| `pvw=<id>` | Workspace preview-before-Start | `WorkspacePreviousSessionPreview` |

No new prefix was added in Phase 4d — `avx` + `peer=` are
sufficient for the new surfaces.

---

## Architectural invariants (the non-regression list)

These are load-bearing decisions. **Do not change without proof
of an equivalent or better outcome** — every one of them is a
fix for a real pilot-blocking bug.

1. **Site-wide Permissions-Policy in middleware** (4c hotfix #2).
   Per-route policies do NOT survive Next.js server-action
   `redirect()`s (the document inherits the source page's policy
   on a client-side soft-nav). Sarah's "I have to hard refresh
   EVERY page" was this bug. Keep `Permissions-Policy: camera=*,
   microphone=*, ...` site-wide unless a strictly stronger
   constraint is needed.

2. **`hasEverHadLocalMedia` latch in `useLiveAV`** (4c). The
   mesh-build effect's dependency array CANNOT depend on
   `localAudioStream` / `localVideoStream` identity — stream
   identity change → effect re-run → cleanup → mesh teardown →
   remote peers' audio drops for 5-10s during re-negotiation.
   The latch flips true on first non-null and stays true; the
   effect re-runs only on `syncClient` / `localPeerId` /
   `sessionId` changes.

3. **`peer-mesh.addLocalTrackToAllPeers(track)` for mid-session
   adds** (4c). Cam grant arriving AFTER the mesh built must
   `addTrack` to every existing PC (idempotent per sender id),
   NOT rebuild the mesh. Triggers `onnegotiationneeded` → the
   existing perfect-negotiation handler turns it into a fresh
   offer→answer without disturbing the already-flowing tracks.

4. **`BufferedRemoteSignal` in `sync-client.ts`** (4c hotfix #3).
   64-entry cap, 8s TTL. Replays in-TTL signals to a subscriber
   on its first subscribe via `queueMicrotask`. Sized to cover
   slow-cold-mount on cellular while bounding the never-
   subscribed leak. Mirrors the `lastRoomPeersSnapshot` pattern
   already used for `onRoomPeersChange`. The "peer stuck on
   Connecting…" pilot bug was this missing.

5. **`peer-mesh` `signal-no-entry → implicit-add for offers
   only`** (4c hotfix #3). Answers/ICE/leave for an unknown
   peer still drop with the original warning (those are genuine
   anomalies, not race victims). Offers create the peer entry
   on the fly; the host's later `addPeer(id)` is a no-op via
   the existing idempotency check.

6. **Single audio mixdown via `addRemoteAudio`** (4c May 15
   redesign). One `MediaRecorder`, one blob, one DB row, one
   replay file. Per-peer MediaRecorder fleets cause the replay
   UI to play whichever segment's `createdAt` happens to be
   smallest — non-deterministic and effectively unfixable
   without multi-track-sync metadata. The mixdown reads the
   tutor mic AND every participant's remote audio summed into
   the same `MediaStreamAudioDestinationNode`.

7. **`publishStream` is tutor-mic ONLY** (4c). Routing remote
   audio back into publishStream would feed every peer's audio
   back to every other peer through the tutor as a relay,
   creating an infinite feedback loop. The graph keeps
   publishDest and recordingDest as independent destinations
   off the same shared analyser tap.

8. **`useLiveAV` accepts `externalAudioStream`** (4c). The tutor
   workspace passes the recorder's publishStream here so live-A/V
   does NOT call `getUserMedia` a second time. Two simultaneous
   acquisitions of the same hardware mic trigger Chrome's shared
   audio-processing pipeline in a way that can suppress the
   source signal in BOTH streams via echo-cancellation cross-
   talk. The hook clones the stream so the live-mute path
   stays independent of the recording's own track.

9. **Stable `localPeerId` via `sessionStorage`** (4d Commit 4).
   `crypto.randomUUID()` on every mount → reload mints a new
   peerId → tutor's presence layer sees a NEW peer joining
   alongside the dead old one. `getOrCreateLocalPeerId(sessionId,
   rolePrefix)` writes-through `sessionStorage` so the SAME tab
   keeps the same peerId across reloads. A new tab is a new
   peerId by design (each tab is a separate human-equivalent).

10. **FSM audio-flow gate** (4d Commit 6). Recording must NOT
    start until at least one participant's audio is actually
    flowing (`MediaStreamTrack.muted === false` for ≥200ms).
    `participantsWithFlowingAudio` + `everHadAudioFlow` sticky
    latch in `LifecycleInputs`. Without the gate, the first
    200ms-2s of student speech is captured as silence in the
    mixdown.

11. **Per-peer recording-mute keeps the source connected** (4d
    Commit 7). `setRemoteGain(stream, 0)` flips the gain value
    live without disconnecting the source. Replay sees a clean
    silence during the muted window rather than a gap — the
    single-blob/single-row replay pipeline has no multi-track-
12. **Client-side device pick + `replaceLocalTrackOnAllPeers`** (live
    device management). Tutor camera/mic selection and mid-session
    hotswap are implemented entirely in the browser: `getUserMedia`
    for the new hardware, `RTCRtpSender.replaceTrack` on the existing
    peer mesh (no mesh teardown — invariant 2), `navigator.mediaDevices`
    enumeration + `devicechange` for plug/unplug, and for the recording
    path a `swapLocalMicSource` swap of the local
    `MediaStreamAudioSourceNode` in `mic-recorder-audio` so MediaRecorder
    stays on one mixdown graph. A sub-50ms audible glitch on mic swap is
    acceptable; dropping remote peers or freezing the UI is not.

---

## Cheat sheet — common questions

### "Why is the peer stuck on Connecting…?"

Three real causes from the pilot:

- (4c hotfix #3 — FIXED) Offer arrived before the peer's
  signaling layer subscribed. `BufferedRemoteSignal` + implicit-
  add now cover both halves. If this regresses, look first at
  `sync-client.ts` `lastSignalsByTopic` / `onRemoteSignal` and
  `peer-mesh.ts` line ~422.
- TURN not deployed → mobile-cellular peer fails symmetric-NAT
  traversal. Open backlog ticket.
- Camera grant arrived after mesh built → was tearing down the
  mesh until 4c. `addLocalTrackToAllPeers` is the fix.

### "Why is the recording missing the first second of speech?"

(4d Commit 6 — FIXED) The FSM transitioned to `recording` as
soon as a participant joined the room (sync presence), even
before WebRTC negotiated their audio. The audio-flow gate
holds in `armed/awaiting_audio_flow` until
`MediaStreamTrack.muted === false` for ≥200ms.

### "Why does the tutor see two tiles for the same student after a reload?"

(4d Commit 4 — FIXED) `localPeerId` was regenerated on every
mount. `getOrCreateLocalPeerId` keeps the same id across
reloads. The stale tile (from the pre-fix pilot session) may
linger for ~30s on the tutor's side; that residual symptom is
in the BACKLOG as "stale-tile eviction" (different cause from
the peerId regen).

### "Why is the student's voice in the recording even after I muted them?"

(4d Commit 7 — FIXED) Per-peer "Don't record this student"
flips `setRemoteRecordingGain(stream, 0)` which sets the
per-stream `GainNode` value to 0. The source stays connected
so replay shows clean silence, not a gap.

### "Why does the tutor's voice sound thin / cut out on the wire?"

Likely `getUserMedia` double-acquisition. `useLiveAV` MUST be
passed `externalAudioStream: workspaceAudio.localMicStream` so
it uses the recorder's already-acquired stream. If you see
this regress, check `useLiveAV.ts` and the tutor workspace's
`useLiveAV({...})` call.

### "Why is the sync pill hidden when I'm waiting for a student?"

(4d Commit 2 — INTENTIONAL) The banner + recording pill already
say "Waiting for student"; the sync pill in that state was
fourth-redundant clutter. The pill IS visible for "Student
connected" (green) and "Sync connecting…" (grey — the sync
server itself is unreachable).

### "Where do I add a new live-A/V log?"

Use `avx=${sessionId}` for session-scoped, append `peer=${peerId}`
when per-peer. If you're adding a NEW capture/sync feature with a
distinct lifecycle, pick a 3-letter prefix and add it to the
table above + to AGENTS.md per the per-session ID logging
convention.

---

## When in doubt

1. Read the relevant `PHASE-4*-STATUS.md` doc — there's one per
   sub-chat with the design choices preserved.
2. Search for the relevant invariant number above in code
   comments — the workspace + hook + graph files reference them
   inline.
3. Re-read this file's "Architectural invariants" section. If
   the change you're contemplating touches any of them, write
   the equivalent-or-better proof in the PR description.
