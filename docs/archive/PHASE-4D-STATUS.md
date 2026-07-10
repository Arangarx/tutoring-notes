# Phase 4d — Polish + bug fixes + per-peer moderation restore + Playwright + docs — branch handoff

> **Archive (2026-05-19):** ✅ **SHIPPED to master** merge `41bf006` 2026-05-16.

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

**4d feature-complete locally. All 10 commits landed. Awaiting
cross-browser smoke pass (Sarah's pilot path = Chrome on Windows
tutor + Chrome on Android student) before merging to `master`.**
See the commit-by-commit table below.

> **Merge convention** (per AGENTS.md, solo-pilot stage): when
> smoke passes, merge to master via `git merge --no-ff
> phase-4d-polish-tests-docs` to preserve a clean revertable
> merge commit. Then the orchestrator's MODEL-SWITCH RETURN
> closes Phase 4 and routes Phase 5+ back to Composer.

| Commit | Topic | Status |
| --- | --- | --- |
| 1 | Polish AV tiles: denied-state copy, cam-muted initials placeholder, connection-state pill helper | ✅ Landed |
| 2 | Collapse waiting-for-student UI redundancy (4 surfaces → 1 banner + 1 secondary indicator) | ✅ Landed |
| 3 | Single-student name fallback (tutor passes `student.name` when `liveAv.participants.length === 1`) | ✅ Landed |
| 4 | Duplicate-tile-on-reload fix via stable `localPeerId` in sessionStorage | ✅ Landed |
| 5 | Regression test for student mute-propagation (bug shipped pre-4d; BACKLOG entry now ✅) | ✅ Landed |
| 6 | Recording-doesn't-start-before-peer-audio: FSM `participantsWithFlowingAudio` gate + `useAudioFlowConfirmation` hook | ✅ Landed |
| 7 | Per-peer `GainNode` moderation restore: `addRemoteAudio` gain insertion + `setRemoteGain` + workspace rewire | ✅ Landed |
| 8 | Playwright integration tests: 4d regression canaries (stable-peerId-on-reload, Permissions-Policy, FSM smoke) — 2-/3-peer happy-path covered by existing `group-session-presence.spec.ts` | ✅ Landed |
| 9 | `docs/LIVE-AV.md` cross-cutting architecture doc + cross-link from RECORDER-LIFECYCLE.md | ✅ Landed |
| 10 | Finalize `docs/PHASE-4D-STATUS.md` with handoff + cross-browser smoke matrix scaffold | ✅ Landed |

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

### Commit 7 — Per-peer GainNode moderation restore

**Files modified:** `src/lib/mic-recorder-audio.ts`,
`src/hooks/useAudioRecorder.ts`,
`WhiteboardWorkspaceClient.tsx`,
`src/components/av/AVControls.tsx` (no code change — its
`moderation` prop existed since 4c; only the workspace
re-passes it now), `src/__tests__/mic-recorder-audio.test.ts`,
two test-stub fixtures.

Phase 4c intentionally dropped per-peer "Don't record this
student" because the May 15 mixdown redesign (`addRemoteAudio` —
every participant summed into the tutor's single recording
stream) made the previous per-peer-MediaRecorder gating
inoperative. The `mutedPeerIdsInRecording` state + handler
stayed in scope, but the `moderation` prop was hidden from
`AVControls`. Commit 7 wires it back in via per-stream
`GainNode`.

Graph topology now: `remoteSource → remoteGain → recordingDest`
(was: `remoteSource → recordingDest`). Each `addRemoteAudio`
invocation creates a fresh `GainNode` with `gain.value = 1`,
stored on the `RemoteEntry` and indexed by stream identity in a
new `remoteByStream` map. New method
`setRemoteGain(stream, gainLinear)` clamps to >=0 and flips the
gain value live — no graph rebuild, no disconnect. Replay then
sees a clean silence during the muted window (not a gap)
because the source stays connected; this matters because the
existing replay UI plays a single audio file per session with
no multi-track-sync metadata, so any "gap" would manifest as a
hard-to-explain time-shift.

`addRemoteAudio` is now idempotent — re-attaching the same
stream returns a fresh-closure unsubscribe but does NOT create
a second source/gain pair. The workspace's reconcile effect
already guards against double-attach with a per-stream sub
map, but defending at the graph level prevents future callers
from accidentally inflating the mixdown.

`useAudioRecorder` exposes
`setRemoteRecordingGain(stream, gainLinear)` (ref-stable
`useCallback`) which forwards to the graph's `setRemoteGain`
when the graph is built, no-ops otherwise.
`WhiteboardWorkspaceClient` re-passes the `moderation` prop to
`AVControls` and runs a reconcile effect that maps
`mutedPeerIdsInRecording` × `liveAv.participants` → gain 0/1
per participant. The effect re-runs whenever either set
changes OR when the audio graph rebuilds
(`workspaceAudio.localMicStream` flips non-null again).

Wire-level mute (asking the remote peer to stop transmitting)
stays out of scope — the student's voice is still audible in
the tutor's live A/V playback (the `<audio>` element on the
`AVTile` is independent of the recording graph). Only the
recording mixdown is affected. This matches the original 4c
plan and the BACKLOG description.

3 new graph tests; all 195 pre-4d recorder/graph/outbox tests
still pass. Existing `node.connect(recordingDest)` assertions
on the old direct-connect topology were rewritten to assert
the new per-remote-gain hop.

### Commit 8 — Playwright regression canaries

**Files added:** `tests/integration/live-av-4d-regressions.spec.ts`.

Three deterministic Playwright canaries that DON'T require a
real sync server — chosen to maximise regression coverage with
zero rabbit-hole risk (the existing
`tests/integration/group-session-presence.spec.ts` already
covers the sync-gated 2-peer happy path):

1. **Stable `localPeerId` across reload** (4d Commit 4): mount
   the workspace, read
   `sessionStorage[wb-peerid:<sessionId>]`, reload, assert the
   same value persists. Prevents the duplicate-tile-on-reload
   regression by construction.
2. **Permissions-Policy site-wide is permissive** (4c hotfix
   #2 non-regression): assert the workspace HTTP response's
   `Permissions-Policy` header does NOT contain `camera=()`
   or `microphone=()`. Catches the "I have to hard refresh
   EVERY page" symptom that drove the May 15 hotfix #2 if
   anyone ever re-introduces a per-route policy.
3. **FSM smoke**: workspace mounts without crash, recording
   pill is FSM-driven, and the new "Waiting for audio…" copy
   does NOT erroneously appear when no participant is in the
   room (the copy is gated on `awaiting_audio_flow` which
   requires a present-but-non-flowing peer).

The full audio-flow gate behaviour is exercised by the Jest
tests (`useAudioFlowConfirmation.dom.test.tsx` + the new FSM
tests in Commit 6); a real-browser confirmation lives in the
cross-browser smoke checklist below.

Run the spec with `npm run test:integration` (requires
PostgreSQL at `127.0.0.1:5432` per the existing integration
test contract).

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
- `MicAudioGraph.setRemoteGain(stream, gainLinear)` —
  `src/lib/mic-recorder-audio.ts`. Clamps to >=0; no-op when
  stream is not attached.
- `UseAudioRecorderReturn.setRemoteRecordingGain(stream,
  gainLinear)` — `src/hooks/useAudioRecorder.ts`.

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

The pre-merge gate. Run on the Vercel Preview URL (the dev's
local Next.js doesn't reach Vercel's CDN / TURN — pilot devices
hit the production-shaped path). Each test pairs a tutor browser
with a student browser; both join the same `whiteboardSessionId`
via the tutor's "Copy join link" UI.

For each row, record PASS / FAIL / N/A with a one-line note. Any
FAIL on a Sarah-pilot row (rows marked **P0**) blocks merge —
either fix or surface the gap + decide explicitly to ship anyway.

**P0 pilot paths (must pass):**

- [ ] **P0 — Chrome (latest stable) on Windows tutor +
      Chrome on Android student.** Sarah's actual setup. Cover
      all 4d scenarios end-to-end (see "Per-scenario checklist"
      below).
- [ ] **P0 — Chrome (latest stable) on Mac tutor + Chrome on
      iOS Safari student.** Wife-on-iPhone path from the May 15
      smoke.

**Tier-2 coverage (nice to have; tag-only on FAIL):**

- [ ] Chrome (latest stable) on Mac — tutor + student, 1:1
      (no mobile asymmetry).
- [ ] Safari (latest stable) on Mac — tutor side. Known partial
      WebRTC quirks; record as discovered.
- [ ] Firefox (latest stable) on Mac — best-effort, not a target.

### Per-scenario checklist (run for each P0 row)

For each P0 browser pair, walk through:

1. **First-peer connection (no hard refresh).** Tutor opens
   workspace, sends join link, student clicks. PASS = student
   tile reaches `pcState === "connected"` within 10s, NO refresh
   needed on either side. Tests 4c hotfix #3 (BufferedRemoteSignal).

2. **Recording starts AFTER student audio flows.** Open the
   resulting recording's first 2 seconds. PASS = first second of
   student speech IS in the recording (no silence at the start).
   Tests 4d Commit 6 (audio-flow gate).

3. **Student mute toggle propagates.** Student clicks Mute on
   their tile. PASS = tutor hears silence within 1 frame.
   Already-shipped fix; smoke confirms no regression.

4. **Per-peer recording-mute works.** Tutor flips "Don't record
   <student>" → student speaks for 5s → tutor un-flips → student
   speaks 5 more seconds → End session. PASS = recording has the
   first 5s of student audio, then 5s of clean silence (NOT a
   gap — total duration unchanged), then 5s of student audio.
   Tests 4d Commit 7.

5. **Single-student name fallback.** Tutor's view of the student
   tile shows the student's actual name (from `Student.name`),
   not `Student · <peerId-suffix>`. Tests 4d Commit 3.

6. **Stable peerId across reload.** Student reloads their tab.
   PASS = tutor sees ONE tile (the same student, fresh
   connection), NOT two tiles (the dead one + the new one).
   Tests 4d Commit 4. NOTE: the dead-tile-residue from PRE-4d
   sessions may linger for ~30s; that's a separate BACKLOG item.

7. **Cam-off shows initials.** Tutor turns off own camera. PASS
   = tutor's own tile shows initials in a colored circle, NOT
   "Waiting for video…". Tests 4d Commit 1.

8. **Permissions denied gives friendly copy.** Tutor revokes
   camera permission in browser settings, reloads. PASS =
   `AVPermissionsPrompt` says "Camera blocked — click the
   camera icon in your browser address bar to allow." (not the
   raw `NotAllowedError`). Tests 4d Commit 1.

9. **End-session captures full session.** Tutor clicks End.
   PASS = navigation to replay; replay's audio file plays full
   session including tutor + student audio (mixdown).

10. **Permissions-Policy non-regression.** Open DevTools Network
    tab → workspace document response → Headers tab. PASS =
    `Permissions-Policy` header allows camera + microphone (NOT
    `camera=()`). Tests 4c hotfix #2 + 4d Playwright canary.

Mark the smoke matrix done in this doc when both P0 rows are
green. Any FAIL needs a BACKLOG entry with the symptom +
suspected cause before merging.

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

When the cross-browser smoke matrix has both P0 rows green and
the branch is merged to master, hand back to Composer with:

1. **State of the branch.** Branch `phase-4d-polish-tests-docs`
   merged into master at `<merge-sha>` (--no-ff). 10 commits +
   1 merge commit. Branch is preserved (cleaned up later by
   the stale-branch sweep utility).

2. **What was delivered.** Reference the commit-by-commit table
   above. Three pilot-blocking bugs fixed (audio-flow gate, dup
   tile on reload, mute-propagation regression guard). One
   restored feature (per-peer recording-mute via GainNode). All
   AV polish from the May 15 pilot review. New architectural
   doc (`LIVE-AV.md`) + STATUS doc (this file). 4d Playwright
   regression canaries.

3. **What was NOT delivered (in scope).** Nothing — all 10
   planned commits landed.

4. **What was NOT delivered (out of scope).** Every "out of
   scope" item listed in the previous section is now in
   `docs/BACKLOG.md` with its own row, acceptance criteria,
   and effort estimate.

5. **Test counts.**
   - Jest: full suite passes (the existing 8 DB-touching
     failures are pre-existing local-env limitation, not 4d
     regressions). Affected suites (FSM, audio-flow hook,
     useLiveAV, AV components, whiteboard helpers,
     mic-recorder-audio) all green.
   - `tsc --noEmit`: clean.
   - Playwright: smoke matrix run on Vercel Preview before
     merge.

6. **What Composer should pick up next.** Phase 5+ per the
   master plan (`~/.cursor/plans/tutoring_notes_pilot_ready_
   master_plan_9aaca460.plan.md`). The Pillar 6 epic is now
   closed — live A/V is feature-complete for the pilot. Any
   future live-A/V work picks up from the BACKLOG rows.

7. **Regression risk surface.** See "Non-regression contract"
   above. Three areas particularly worth a glance in any future
   live-A/V change: the audio graph topology in
   `mic-recorder-audio.ts`, the mesh-build effect deps in
   `useLiveAV.ts` (`hasEverHadLocalMedia` latch), and the
   site-wide `Permissions-Policy` in `middleware.ts`.

---

## MODEL-SWITCH RETURN line

When the cross-browser smoke matrix passes and the branch is
merged to master, the orchestrator delivers this verbatim to
Composer (per the original Phase 4 model-switch gate):

> Phase 4d shipped to master at merge `<merge-sha>`. The Phase
> 4 sub-chat sequence (4a → 4b → 4c → 4d) is now closed; the
> live-A/V Pillar 6 epic is feature-complete for the pilot.
> Routing Phase 5+ back to Composer. Companion docs to read
> when scoping Phase 5+: `docs/LIVE-AV.md` (architecture
> invariants — touch with care) and `docs/PHASE-4D-STATUS.md`
> (this doc — cross-browser smoke checklist + handoff).
