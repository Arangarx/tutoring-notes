# Phase 4d — Polish + bug fixes + per-peer moderation restore + Playwright + docs — branch handoff

**Branch:** `phase-4d-polish-tests-docs` (off `master` at the 4c merge
commit `d7fd583`).
**Master plan:** `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Pillars in scope:** Pillar 6 polish + bug fixes from pilot smoke
(May 15 evening), Pillar 2 (per-peer audio moderation restore),
Group D Playwright integration tests, and the `docs/LIVE-AV.md`
cross-cutting architecture writeup.
**Position in Phase 4:** 4th and LAST of 4 sub-chats
(4a → 4b → 4c → **4d**). After this branch merges, the
MODEL-SWITCH RETURN closes — Phase 5+ routes back to Composer.
**Companion docs:**
[PHASE-4A-STATUS.md](PHASE-4A-STATUS.md) (peer-mesh + signaling
foundation),
[PHASE-4B-STATUS.md](PHASE-4B-STATUS.md) (hook + recorder),
[PHASE-4C-STATUS.md](PHASE-4C-STATUS.md) (AV UI + workspace/student
mounting + CSP unblock — the canonical handoff for what 4d
inherits),
[RECORDER-LIFECYCLE.md](RECORDER-LIFECYCLE.md) (ID-prefix registry —
no new prefix added; `avx` and `rid` cover the 4d surface).

This is the canonical handoff for Phase 4d. Read it FIRST when
picking up this branch in a fresh chat — it documents what landed in
each commit, the design choices Phase 4d made on top of 4c, the
public-API additions (and what stays internal), the explicit non-
regression list, and the cross-browser smoke checklist that gates
merging.

---

## Status

**4d in progress — commits 1-6 landed locally; commits 7-10 + wrap-up
pending.** See the commit-by-commit table below.

| Commit | Topic | Status |
| --- | --- | --- |
| 1 | Polish AV tiles: denied-state copy, cam-muted initials placeholder, connection-state pill helper | ✅ Landed |
| 2 | Collapse waiting-for-student UI redundancy (4 surfaces → 1 banner + 1 secondary indicator) | ✅ Landed |
| 3 | Single-student name fallback (tutor passes `student.name` when `liveAv.participants.length === 1`) | ✅ Landed |
| 4 | Duplicate-tile-on-reload fix via stable `localPeerId` in sessionStorage | ✅ Landed |
| 5 | Regression test for student mute-propagation (bug shipped pre-4d; BACKLOG entry now ✅) | ✅ Landed |
| 6 | Recording-doesn't-start-before-peer-audio: FSM `participantsWithFlowingAudio` gate + `useAudioFlowConfirmation` hook | ✅ Landed |
| 7 | Per-peer `GainNode` moderation restore: `addRemoteAudio` gain insertion + `setRemoteGain` + workspace rewire | ⏳ Pending |
| 8 | Playwright integration tests: webrtc-fake helper + happy-path 2-/3-peer + 4c hotfix regressions + 4d fix regressions | ⏳ Pending |
| 9 | `docs/LIVE-AV.md` cross-cutting architecture doc + cross-link from RECORDER-LIFECYCLE.md | ⏳ Pending |
| 10 | Finalize `docs/PHASE-4D-STATUS.md` with handoff + cross-browser smoke matrix scaffold | ⏳ Pending |

---

## Commit-by-commit notes

### Commit 1 — AV tile polish (denied-state copy, initials, connection pill)

**Files added:** `src/components/av/connection-state-mapping.ts`,
`src/components/av/initials-from-label.ts`, two unit-test suites.
**Files modified:** `AVTile.tsx`, `AVTilesPanel.tsx`,
`AVPermissionsPrompt.tsx`, two DOM-test suites.

Three polish wins from the May 15 pilot review:

1. **Denied-state copy** — `AVPermissionsPrompt` previously rendered
   the raw browser error message (`"NotAllowedError: Permission
   denied"`) which Sarah read as a system fault. New helper
   `deniedCopyFor(kind)` returns concise next-action copy
   (`"Microphone blocked — click the camera icon in your browser
   address bar to allow."`). Non-permission errors (no-device,
   over-constrained) still surface their original verbose message —
   those need the technical detail.

2. **Cam-muted initials placeholder** — previously cam-off rendered
   a generic spinner that looked like "still loading…". New helpers
   `getInitialsFromLabel(label, role)` + `getDeterministicColorFromPeerId(peerId)`
   produce 1-2 initials (e.g. "L" for "Liam", "TM" for "Taylor
   Morgan") on a stable per-peer dark-mode-friendly background
   pulled from a 12-color palette via FNV-1a hashing — same color
   across renders and (Commit 4 onwards) across reloads.
   `AVTile` branches between "Waiting for video…" (peer still
   connecting; no point showing initials yet) and the initials
   placeholder (peer connected, has audio, just no video track).

3. **Connection-state pill helper** — `getConnectionStatePill(pc, ice)`
   centralises the `RTCPeerConnectionState` × `RTCIceConnectionState` →
   UI pill mapping. The "connected" state now renders NO pill
   (`shouldHidePill` returns true) — pilot feedback was that a green
   "Connected" pill is noise. `connecting`/`new` → blue
   "Connecting…", `disconnected` → amber "Reconnecting…", `failed`
   → red "Connection failed" + Retry button (wired via the new
   `onReconnect` prop on `AVTilesPanel`), `closed` → red
   "Disconnected" (no retry — terminal state).

### Commit 2 — Collapse waiting-for-student UI redundancy

**Files added:** `src/lib/whiteboard/sync-pill-presentation.ts` +
unit tests.
**Files modified:** `WhiteboardWorkspaceClient.tsx`,
`tests/integration/group-session-presence.spec.ts`.

Pilot feedback: when waiting for the student to join, four UI
surfaces simultaneously said "waiting for student" — the recording
banner, the `wb-recording-pill`, the `wb-sync-pill`, and the
`wb-timer` qualifier `"(waiting for student)"`. Sarah's eye had
nowhere clean to land. Dedupe target: **one primary banner +
one secondary indicator**.

New helper `deriveSyncPillState({tutorSyncConnected,
bothPartiesInRoom})` returns `{show, label, color, reason}`:
- `bothPartiesInRoom: true` → `{show: true, label: "Student
  connected", color: "green"}`.
- `!tutorSyncConnected` → `{show: true, label: "Sync connecting…",
  color: "grey"}` (the sync-server itself is unreachable —
  genuinely useful information not duplicated elsewhere).
- Otherwise (the "awaiting student" hidden state) → `{show:
  false}`. The banner and recording-pill already carry this
  signal.

The `wb-timer` qualifier was likewise dropped: the timer simply
counts session-active-ms now. The Playwright
`group-session-presence` spec was updated to expect the sync-pill
to be EITHER hidden OR showing "Sync connecting…" during the
initial-mount window — must NEVER contain "Awaiting student".

### Commit 3 — Single-student name fallback

**Files added:** `src/lib/whiteboard/participant-label.ts` + unit
tests.
**Files modified:** `WhiteboardWorkspaceClient.tsx`,
`StudentWhiteboardClient.tsx`, `AVTilesPanel.tsx`, AVTilesPanel DOM
tests.

`resolveParticipantLabel(participant, {studentName,
totalRemotePeers})` returns `studentName` (trimmed) when there is
exactly one remote participant AND the participant is a student
AND `studentName` is non-empty; otherwise returns `undefined`
(letting `AVTilesPanel` use its default `Student · <suffix>`
label). The workspace passes `studentName` down from its SSR
props; the join-token is already scoped to a `studentId` so the
single-peer case is the typical pilot path. For multi-peer rooms
the function intentionally returns `undefined` for all peers
(we don't yet know which peer corresponds to which student —
BACKLOG `Student naming paradigm` row tracks design (b)
"explicit name capture on join" as a future v2).

`AVTilesPanel` also now accepts `onReconnect?: (peerId: string)
=> void` and wires it to `AVTile`'s Retry button when the
connection-state pill is `failed`. Both workspace + student
clients pass `liveAv.reconnectPeer` straight through.

### Commit 4 — Stable `localPeerId` via sessionStorage

**Files added:** `src/lib/whiteboard/local-peer-id.ts` + unit
tests.
**Files modified:** `WhiteboardWorkspaceClient.tsx`,
`StudentWhiteboardClient.tsx`.

Pilot bug: wife's tab reloaded → tutor saw the stale "wife" tile
remain (with a dead `RTCPeerConnection`) AND a new "wife" tile
from her fresh peer connection. Two tiles, two different
`peerId`s, same human.

Root cause: `localPeerId` was minted via `crypto.randomUUID()` on
every mount. Refresh → new peerId → tutor's presence layer treated
it as a NEW peer joining alongside the old (no eviction signal
fires because the old peer's sync connection never sent `leave` —
the tab process just died).

Fix: `getOrCreateLocalPeerId(whiteboardSessionId, rolePrefix)`
reads/writes `sessionStorage[wb-peerid:<sessionId>]`. Same tab
across reloads → same peerId. Different tab → different peerId
(by design — each tab is a separate human-equivalent). SSR-safe
fallback (returns a fresh UUID without persistence when
`sessionStorage` is unavailable). The role-prefix (`tutor-` /
`student-`) is purely a debugging aid in logs; the FSM and peer-
mesh don't parse it.

The stale-tile eviction path (peer goes silent for >30s on a dead
PC → evict from `liveAv.participants[]`) is a separate BACKLOG
item; this commit only fixes the cause, not the lingering symptom
on first-affected-session-after-deploy.

### Commit 5 — Student mute regression guards

**Files modified:** `src/__tests__/dom/useLiveAV.dom.test.tsx`,
`docs/BACKLOG.md`.

User confirmed mid-flight: the student-mute-doesn't-propagate
bug had ALREADY been fixed pre-4d (likely as a side effect of
the May 15 Web Audio fan-out refactor `5ac2f76`) but the BACKLOG
entry never got the ✅ flip. Three regression guards were added
to lock the fix in:

1. **Multi-track / stereo capture** — `toggleMic` flips
   `enabled` on EVERY local audio track, not just `tracks[0]`.
2. **Identity check** — the track `toggleMic` mutates is the
   SAME identity as `result.current.localAudioStream
   .getAudioTracks()[i]`, so peer-mesh's `getLocalTracks()` closure
   can't drift onto a different track.
3. **`externalAudioStream` path** — when the tutor passes the
   recorder's publishStream as `externalAudioStream`, `toggleMic`
   still flips its tracks. (Recording's separate Web Audio
   destination keeps capturing — only the wire-side mute changes.)

BACKLOG entry annotated `✅ SHIPPED (pre-4d; annotated 4d Commit
5)` with the full archival diagnosis preserved.

### Commit 6 — Audio-flow gate on the FSM

**Files added:** `src/hooks/useAudioFlowConfirmation.ts` + DOM
tests.
**Files modified:** `src/lib/recording/lifecycle-machine.ts`,
`src/__tests__/recording/lifecycle-machine.test.ts`,
`WhiteboardWorkspaceClient.tsx`, `docs/BACKLOG.md`.

Pilot bug: recording started ~200ms–2s before the student's
remote audio track actually flowed. The first half-second of
student speech was lost to silence in the mixdown.

Root cause: `evaluateLifecycle` step 4b transitioned to
`recording` as soon as `participants.size >= 1`. WebRTC
negotiation can land the audio track in `muted=true` state for
~200ms–2s while it waits for the first audio frame to arrive
(typical on cellular; Chrome's `MediaStreamTrack.muted` flips
false on the first decoded RTP packet).

Fix: two new optional `LifecycleInputs`:

- `participantsWithFlowingAudio: ReadonlySet<string>` — set of
  peer ids whose audio is confirmed flowing
  (`MediaStreamTrack.muted === false` for ≥200ms).
- `everHadAudioFlow: boolean` — sticky latch; once we've
  transitioned to `recording` via the audio-flow path, this
  flips to true and stays true. Prevents a mid-session blip
  (network hiccup, mic glitch) from causing record-stop/restart
  churn — same pattern as `everHadParticipants`.

Step 4b now gates: if `everHadAudioFlow` is false AND
`participantsWithFlowingAudio` was provided AND the intersection
with `participants` is empty → hold in `armed` with new reason
`awaiting_audio_flow`. When undefined (pre-4d callers, solo
modes, tests that don't care), the FSM treats every participant
as audio-flowing — full backward compatibility.

`derivePresentation` adds copy for the new reason:
- Banner: `"Student is here — waiting for their audio to start
  flowing before recording."`
- Pill: `"Waiting for audio…"` (amber).
- `awaitingStart: false` (distinct from `awaiting_first_participant`
  because the student HAS joined — different troubleshooting
  actions for the tutor).

New hook `useAudioFlowConfirmation(participants, {confirmMs=200})`
subscribes to each peer's audio track `mute`/`unmute`/`ended`
events:
- Track unmuted at subscribe → scheduled to add after `confirmMs`.
- `unmute` event → scheduled add (cancels any prior pending add).
- `mute` / `ended` / participant-removed → IMMEDIATE removal
  (better to pause briefly than to record a dropout).
- Cleanup on unmount + on every participant-list change.

The workspace maps real WebRTC peer ids into the synthetic
`peer-N` namespace `lifecycleParticipants` already uses (legacy
contract from Phase 1a — only `.size` matters to the pre-gate
path). For 1:1 sessions (the pilot's only shape) the mapping is
exact; for groups it's permissive — any flowing peer unblocks
recording, which matches the FSM's intended semantics.

Sticky latch lives in `everHadAudioFlowRef` and flips on the
first non-empty `audioFlowingPeerIds`.

---

## Public-API additions (Phase 4d)

These are the new surfaces other code can rely on; everything else
in this branch is internal-implementation:

- `getOrCreateLocalPeerId(sessionId, rolePrefix)` —
  `src/lib/whiteboard/local-peer-id.ts`. Stable per-tab peerId.
- `resolveParticipantLabel(participant, {studentName,
  totalRemotePeers, applyToTutors?})` —
  `src/lib/whiteboard/participant-label.ts`.
- `deriveSyncPillState({tutorSyncConnected, bothPartiesInRoom})` —
  `src/lib/whiteboard/sync-pill-presentation.ts`.
- `getConnectionStatePill(pcState, iceState)` /
  `shouldHidePill(pill)` —
  `src/components/av/connection-state-mapping.ts`.
- `getInitialsFromLabel(label, role?)` /
  `getDeterministicColorFromPeerId(peerId)` —
  `src/components/av/initials-from-label.ts`.
- `useAudioFlowConfirmation(participants, {confirmMs?})` —
  `src/hooks/useAudioFlowConfirmation.ts`.
- `LifecycleInputs.participantsWithFlowingAudio?:
  ReadonlySet<string>` and `LifecycleInputs.everHadAudioFlow?:
  boolean` —
  `src/lib/recording/lifecycle-machine.ts`. Both optional; pre-4d
  callers keep the legacy behaviour.
- `AVTilesPanelProps.onReconnect?: (peerId) => void` and
  `AVTilesPanelProps.resolveLabel?: (participant) =>
  string|undefined` — `src/components/av/AVTilesPanel.tsx`.

---

## Non-regression contract

Phase 4d MUST NOT regress any of:

- Per-route Permissions-Policy is **gone**; site-wide CSP
  Permissions-Policy stays as the only source of truth (4c
  hotfix #2 contract — must not be reverted).
- `BufferedRemoteSignal` 64-entry / 8s TTL replay buffer in
  `sync-client.ts` (4c hotfix #3 — peer-stuck-on-Connecting
  fix). Tests in `sync-client.test.ts` cover it.
- `peer-mesh.ts` `addLocalTrackToAllPeers` mid-session add path
  (4c "late-cam acquisition no longer disposes mesh" fix).
- Single audio mixdown via `addRemoteAudio` (4c redesign — per-
  peer recorders were intentionally removed).
- `hasEverHadLocalMedia` latch in `useLiveAV` (4c — keeps the
  mesh-build effect from re-running on every stream change).
- All 415 pre-4d AV + whiteboard + useLiveAV DOM tests must
  still pass. All 1005 pre-4d unit tests in non-DB suites must
  still pass.

Commits 6 and 7 touch the FSM contract and the Web Audio graph
respectively — both are additive (new optional inputs / new
optional gain path), so the non-regression contract holds.

---

## Cross-browser smoke checklist

To be finalised in Commit 10 once Group D Playwright passes. The
scaffold:

- [ ] Chrome (latest stable) on Mac — tutor + student, 1:1.
- [ ] Chrome (latest stable) on Windows — tutor + student, 1:1.
- [ ] Safari (latest stable) on Mac — tutor side.
- [ ] Safari (latest stable) on iOS — student side
      (camera/mic permissions UX is iOS-specific).
- [ ] Firefox (latest stable) on Mac — best-effort; not a
      target browser for Sarah but useful to know if it works.
- [ ] Chrome on Android (a parent's phone) — student side.

Each row to record: did the connection establish without a
hard refresh? Did recording include the first second of student
speech? Did the mute toggle propagate? Did the cam-off initials
render with the student's name (single-student session)?

---

## What's explicitly OUT of scope for 4d

- TURN server deployment (BACKLOG: "Live-A/V — slow first peer
  connect" — separate ticket).
- Stale-tile eviction beyond the Commit 4 sessionStorage fix
  (BACKLOG: "Duplicate participant tile when a peer reloads
  mid-session" — separate ticket).
- Whisper language-detect / AI-fill quality issues (BACKLOG: two
  rows from the May 15 evening smoke).
- Tutor-tab navigation on new-session-create (BACKLOG).
- Workspace SSR 500 dig (BACKLOG).
- Resume-session encryption rotation (already ✅ shipped pre-4d).

These all sit in `docs/BACKLOG.md` with their own analysis +
acceptance + effort estimates.

---

## Handoff checklist (for Composer when 4d ends)

(To be completed when Commit 10 lands — placeholder for now.)
