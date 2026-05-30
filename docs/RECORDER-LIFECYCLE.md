# Recorder lifecycle — architecture + cheat sheet

> Audience: an agent (or a future you) picking up whiteboard / recording
> work in this repo for the first time. Read this BEFORE editing
> `lifecycle-machine.ts`, `upload-outbox.ts`, `endWhiteboardSession`,
> `WhiteboardWorkspaceClient.handleEndSession`, or anything that
> claims to "improve" how segments are uploaded.

This doc is the contract surface for the workspace's three-pillar
recording stack (Phase 1 of the
[pilot-ready master plan](../../tutoring-notes/AGENTS.md#north-star)):

1. **Pillar 1 — Lifecycle FSM** — pure function, single source of
   truth for "are we capturing right now?".
2. **Pillar 2 — IndexedDB upload outbox** — durable queue for audio
   segments; survives refreshes; serial-within-stream, parallel-
   across-streams.
3. **Pillar 3 — Atomic `endWhiteboardSession`** — one server
   transaction stamps `endedAt`, swaps the canonical `eventsBlobUrl`,
   registers every uploaded segment, persists the optional
   `snapshotBlobUrl`, and revokes live join tokens.

Plus the Phase 1c surfaces that the three pillars enable:

4. **Snapshot PNG generation** — best-effort thumbnail rendered on
   End and persisted via the optional `snapshotBlobUrl` column.
5. **Workspace preview-before-Start** — the same Phase 1a scene-paint
   engine that powers replay, embedded into the workspace route for
   ended sessions.

**Companion doc — [LIVE-AV.md](LIVE-AV.md).** The live-A/V stack
(peer mesh, signaling, Web Audio fan-out, per-peer recording-mute,
audio-flow gate) is the workspace's other half of the recording
contract. Phase 4d's `participantsWithFlowingAudio` /
`everHadAudioFlow` FSM inputs are owned by LIVE-AV but consumed
by Pillar 1 here. Read LIVE-AV.md BEFORE editing `useLiveAV.ts`,
`peer-mesh.ts`, or `mic-recorder-audio.ts` `addRemoteAudio`.

> **Reliability rule of thumb:** If you can't draw the data-flow on
> a napkin from memory, don't change it. The pillars exist *because*
> Sarah lost real sessions to an earlier flat poll-loop end-flow.

---

## Map of source files

| Concern | File | Notes |
|---|---|---|
| FSM (Pillar 1) | `src/lib/recording/lifecycle-machine.ts` | Pure `evaluateLifecycle(inputs) → outputs`. Multi-stream + multi-participant from day one. |
| FSM tests | `src/__tests__/recording/lifecycle-machine.test.ts` | Plain Jest, no DOM. |
| Outbox (Pillar 2) | `src/lib/recording/upload-outbox.ts` | IndexedDB-backed; per-`(sessionId, streamId, segmentId)` dedupe; serial-within-stream, parallel-across-streams. |
| Outbox singleton + helpers | `src/lib/recording/upload-outbox-instance.ts` | `getOutbox()`, `drainOutboxOrTimeout`, `assembleEndSessionSegments`, `finalizeOutboxAfterEnd`. |
| Atomic end action (Pillar 3) | `src/app/admin/students/[id]/whiteboard/actions.ts` → `endWhiteboardSession` | One Prisma transaction. Never call its sub-mutations directly. |
| Workspace integration | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx` → `handleEndSession` | Stage-by-stage; see "End-session flow" below. |
| Snapshot PNG (Phase 1c) | `src/lib/whiteboard/snapshot-png.ts` | `generateSessionSnapshotPng(api)` — best-effort, never blocks End. |
| Snapshot upload | `src/lib/whiteboard/upload.ts` → `uploadWhiteboardSnapshot` | Reuses `/api/upload/blob` with `kind: "whiteboard-snapshot"`. |
| Workspace preview-before-Start (Phase 1c) | `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WorkspacePreviousSessionPreview.tsx` | Read-only Excalidraw + scene-paint engine. Second consumer of the engine after `WhiteboardReplay`. |
| Scene-paint engine | `src/lib/whiteboard/scene-paint.ts` | `buildSceneAt`, `createScenePainter`, `createCameraFitter`. Pure module — no Excalidraw runtime import. |

---

## Pillar 1 — Lifecycle FSM

`evaluateLifecycle(inputs) → outputs` is a **pure function**. Re-render
of the workspace re-evaluates with current props; same inputs always
produce the same outputs. The host owns all latches that need to
survive across renders (the canonical example is `everHadParticipants`
— once true, stays true).

### Inputs you must thread (read the docblock for each)

```text
LifecycleInputs {
  tutorWantsRecording: boolean
  participants:        ReadonlySet<peerId>
  everHadParticipants: boolean       // host-owned latch
  soloEnabled:         boolean       // env flag
  syncEnabled:         boolean       // WHITEBOARD_SYNC_URL set?
  inputStreams:        ReadonlyMap<streamId, "ok"|"degraded"|"failed">
  networkOk:           boolean
  audioClockMs:        number
  inFlightStreamCount?: number       // from outbox observer
  endIntent?:          "stopping"|"uploading"|"done"|"failed"
  // Phase 4d Commit 6 — see LIVE-AV.md invariant #10
  participantsWithFlowingAudio?: ReadonlySet<peerId>
  everHadAudioFlow?:   boolean       // host-owned sticky latch
}
```

### Outputs you must consume

```text
LifecycleOutputs {
  state:               "idle"|"armed"|"recording"|"paused"|"stopping"|
                       "uploading"|"done"|"failed"
  armedReason?:        "awaiting_first_participant" | "awaiting_audio_flow" | ...
  pausedReason?:       "all_participants_disconnected" | ...
  shouldCaptureWB:     boolean
  shouldCapture:       (streamId) => boolean   // gate MediaRecorder.start
  wbClockMs:           number
  uiPillKind:          "off"|"armed"|"recording"|"paused"|"saving"|"error"
  inFlightStreamCount: number
  recordingActive:     boolean      // legacy boolean for old call sites
}
```

### Multi-stream + multi-participant: rules to remember

* `inputStreams` is the **only** place capture-stream IDs live in the
  FSM. Today only `tutor:mic` is added by the workspace. Phase 4 adds
  `student:peer-<peerId>:mic` rows by mutating the host map; the FSM
  contract does not change.
* `participants` is "non-tutor peer IDs". `participants.size === 0`
  with `soloEnabled === true` and `!everHadParticipants` ⇒ **armed
  with solo grace**, not paused. Group sessions are
  `participants.size >= 2` and continue recording as long as **at
  least one** student is present (`paused` only when *all* drop).
* Failed streams (`health === "failed"`) are excluded from
  `shouldCapture(...)` but do **not** alone push the FSM into
  `paused` — that's reserved for participant / network conditions.

### Don't do this

* ❌ Don't read `participants.size === 2` anywhere. The FSM is
  correct for N participants; hard-coding 2 will silently break
  group sessions.
* ❌ Don't add a side effect inside `evaluateLifecycle`. Pure
  function. If you need to fire something on a state change, do it
  in the host's `useEffect` keyed off the FSM's output.
* ❌ Don't bypass `shouldCapture(streamId)` and start a
  `MediaRecorder` on your own. The FSM is the gate.

---

## Pillar 2 — IndexedDB upload outbox

The outbox is a **per-browser singleton** (`getOutbox()` from
`upload-outbox-instance.ts`). It owns:

* Persistence of audio Blob refs across refresh
  (IDB store: `tutoring-notes-upload-outbox`, keyed by row `id`).
* Retry / backoff (1s, 2s, 5s, 15s, 60s; permanent-fail at 50 attempts).
* Per-`(sessionId, streamId, segmentId)` dedupe via a `unique: true`
  IDB index — racing enqueues can't double-insert.
* Worker scheduling: **serial within a stream** (so segment N+1 can't
  pass segment N) and **parallel across streams** (so a future
  `student:peer-7:mic` upload doesn't queue behind `tutor:mic`).
* `obx=<short>` log lines per row transition for prod debugging.

### Lifecycle of one segment

```text
MediaRecorder.stop() in useAudioRecorder
        ↓
useAudioRecorder.onWorkspaceAudioRecorded({ blob, mimeType, ... })
        ↓
WhiteboardWorkspaceClient.handleAudioRecorded
        ↓
outbox.enqueue({ sessionId, streamId: "tutor:mic", segmentId, blob, ... })
        ↓ IDB write
        ↓ worker picks up
        ↓ POST /api/upload/audio (Vercel Blob client-direct)
        ↓ row.blobRemoteUrl set; row marked uploaded
        ... (waits for End to register against SessionRecording)
        ↓
endWhiteboardSession({ segments: [...all uploaded rows] })
        ↓ SessionRecording.createMany inside the atomic txn
        ↓ finalizeOutboxAfterEnd(sessionId) drops the IDB rows
```

### Observers

```ts
const sub = outbox.observe(sessionId).subscribe((state) => {
  // state: { state, inFlightStreamCount, byStream, lastError }
});
sub.unsubscribe();
```

Used by:
* `WhiteboardWorkspaceAudioBridge` (drives the recording-pill copy).
* `WhiteboardWorkspaceClient.handleEndSession` (drives the End
  button's "Saving last N segment(s)…" copy).

### Don't do this

* ❌ Don't bypass the outbox to "just upload directly". The outbox
  is what makes recovery from a refresh possible. A direct upload
  that crashes between MediaRecorder.stop() and the network call
  silently drops audio.
* ❌ Don't add a per-stream worker outside the outbox. The
  serial-within / parallel-across guarantee depends on a single
  worker scheduling all rows.
* ❌ Don't schema-version the IDB rows ad-hoc. The outbox migration
  story is "additive only" — deletes / renames must be paired with
  a guarded read path.

---

## Pillar 3 — Atomic `endWhiteboardSession`

```ts
endWhiteboardSession(
  whiteboardSessionId,
  finalEventsBlobUrl,
  opts?: {
    snapshotBlobUrl?: string;
    segments?: EndSessionSegment[];
  }
): Promise<{ endedAt, durationSeconds, registeredSegments }>
```

One Prisma transaction. In order:

1. **Update `WhiteboardSession`**: `endedAt`, `eventsBlobUrl`,
   `snapshotBlobUrl?` (Phase 1c), `durationSeconds`.
2. **Validate + dedupe** the `segments` payload via
   `validateEndSessionSegments` (rejects out-of-namespace blob
   URLs, empty `streamId`/`mimeType`, negative `sizeBytes`,
   non-finite `audioStartedAtMs`). Throws BEFORE any DB write.
3. **Sort un-deduped segments** by `(audioStartedAtMs ASC, streamId
   ASC)`; continue `orderIndex` from the existing max for this
   session.
4. **`SessionRecording.createMany`** with `skipDuplicates: true`
   (each row stamped with `streamId`).
5. **Revoke join tokens**: `whiteboardJoinToken.updateMany` flips
   active tokens off so no late-joining student can land in a closed
   room.

`snapshotBlobUrl` is **optional** — passing `undefined` is a no-op
on that column, which is exactly what the snapshot pipeline relies
on when generation fails best-effort.

### Don't do this

* ❌ Don't call `db.sessionRecording.create` from anywhere in the
  workspace. Use `endWhiteboardSession` (or, for the legacy single-
  segment path, `registerWhiteboardSessionAudioSegmentAction`) so
  the dedupe + ownership checks run.
* ❌ Don't `await` snapshot upload before `endWhiteboardSession`.
  The snapshot is best-effort; events + audio finalization is the
  durability boundary. See `WhiteboardWorkspaceClient.handleEndSession`
  step 5b for the structural pattern.

---

## End-session flow (the diagram you'll wish you'd had)

```text
[End button click]
        │
        ▼
1. setUserWantsRecording(false)            # FSM stops capture
        │
        ▼
2. drainOutboxOrTimeout(wbsid, 15s)        # all in-flight uploads land
        │      timeout? → error banner, abort, leave outbox intact
        ▼
3. segments = assembleEndSessionSegments(wbsid)   # deterministic order
        │
        ▼
4. uploadWhiteboardEvents({ wbsid, eventsJson })  # canonical events.json
        │
        ▼
5. snapshot = generateSessionSnapshotPng(api)     # PHASE 1c
        │      try/catch, returns null on any failure
        ▼
5b. snapshotBlobUrl = uploadWhiteboardSnapshot({ ... })  # PHASE 1c
        │      try/catch — never blocks step 6
        ▼
6. endWhiteboardSession(wbsid, eventsBlobUrl, { segments, snapshotBlobUrl? })
        │      atomic txn — see Pillar 3
        ▼
7. finalizeOutboxAfterEnd(wbsid)           # drop IDB rows
        │
        ▼
8. router.replace(reviewHref) + router.refresh()    # land on review page
```

**Order is load-bearing.** Steps 1-4 must happen exactly in that
order; step 5/5b can fail without affecting steps 6-8; step 7 must
happen after step 6 succeeds (otherwise a refresh between 6 and 7
would leak orphan rows and re-upload them on next mount).

**Phase 1c clarification on step 8:** the immediate post-End
destination is still the read-only **review** page, *not* the
preview-before-Start surface. Most of the high-value
immediate-post-session actions (AI-generate notes from the
session audio — the wedge — plus replay scrub, snapshot capture,
share-link copy) live on the review page; landing the tutor
there directly avoids an extra click for those flows. The
preview-before-Start surface (Pillar 4 Task 6) is for the
**re-entry** case: a tutor returning to `/workspace` later (via
a pinned tab, a browser bookmark, or a manually-edited URL) sees
the read-only final-frame preview + the Start-new affordance
instead of the old "session has already ended" 404. See the
"Workspace preview-before-Start" section below for the routing.

---

## Phase 1c surfaces

### Snapshot PNG (`src/lib/whiteboard/snapshot-png.ts`)

* `generateSessionSnapshotPng(api, { whiteboardSessionId, ... })`
  returns `{ blob, sizeBytes, mimeType: "image/png" } | null`.
* **Best-effort by contract.** Every failure mode (null api, empty
  scene, dynamic import fails, `exportToCanvas` throws,
  `canvas.toBlob` returns null or hangs past 8s) returns `null` and
  logs `[snapshot-png] snp=<short> wbsid=<id> skip: <reason>`.
* Caller (workspace `handleEndSession`) wraps the call AND the
  upload in try/catch so a snapshot bug can never block the atomic
  end-session.

### Workspace preview-before-Start (`WorkspacePreviousSessionPreview.tsx`)

* Triggered by `workspace/page.tsx` when the loaded session has
  `endedAt` set — instead of redirecting to the review surface, the
  page renders this component inside the workspace shell.
* Fetches the canonical `events.json` via the existing admin proxy
  (`/api/whiteboard/[sessionId]/events`).
* Parses with `parseEventLogBySchema` (same validator the replay
  uses), then paints the **final frame** with
  `createScenePainter(...).applyAt(maxEventTimestampMs(log))` and
  centres the camera with `createCameraFitter(...).fit()`.
* Excalidraw is mounted with `viewModeEnabled: true`, no
  `loadScene` / `changeViewBackgroundColor` actions exposed.
* Always renders the existing `<StartWhiteboardSession>` consent-
  modal trigger, even on loading / empty / error states. A snapshot
  fallback `<a>` is shown whenever `snapshotBlobUrl` is present.
* Per-session ID logging: `pvw=<short>` + `wbsid=<id>` on every
  load / paint / error transition.

---

## Cheat sheet — common questions

**Q: I want to add a new audio source (e.g. `student:peer-7:mic`).
Where do I touch?**
A: Two places. (1) FSM: ensure the host adds the new stream id to
`inputStreams` with the right health when capture engages. The FSM
will start gating it. (2) Outbox: enqueue rows with the new
`streamId`. The worker will run that stream's segments in parallel
to the tutor's. The atomic action already handles the multi-stream
payload — don't change `endWhiteboardSession`.

**Q: I want to "speed things up" by uploading the snapshot in
parallel with the events.json.**
A: Don't. The snapshot is intentionally LAST so it never delays
durability. If the snapshot is on the critical path, a snapshot bug
becomes a session loss.

**Q: I want to skip the outbox for a specific case.**
A: Don't. Even a single bypass eliminates the refresh-recovery
guarantee for that path. If the outbox contract doesn't fit, change
the contract (with tests) — don't sneak around it.

**Q: My new feature needs the FSM to react to a new condition.**
A: Add a typed input field (with a docblock that says when the host
sets it), update the decision tree in `evaluateLifecycle` with
explicit precedence, add tests in
`src/__tests__/recording/lifecycle-machine.test.ts`. Then thread the
input from the host. Do NOT introduce side effects in the FSM.

**Q: Where do I see the rid / wbsid / obx / dft / pvw / snp / avx / pvs prefixes
documented?**
A: AGENTS.md "Per-session ID logging is mandatory." section. The
3-letter prefixes used in this stack are `wbsid` (whiteboard
session id), `obx` (outbox row), `dft` (in-progress audio draft
IndexedDB row — W1 crash/refresh durability), `snp` (snapshot generation),
`pvw` (preview-before-start), `pvs` (per-page whiteboard pan/zoom —
Phase 5 task 8), `rid` (audio recorder), `avx`
(live-A/V session — Phase 4a `peer-mesh.ts` + `signaling.ts`; per-peer
events also carry a `peer=<remotePeerId>` subkey), and the
component-specific ones in `useAudioRecorder` (`aud=`).

### Whiteboard per-page viewport (`pvs`, Phase 5 task 8)

Per-tab pan/zoom lives on `WhiteboardBoardDocumentV1.pageList[].viewState`
(sessionStorage draft, IndexedDB checkpoint, server checkpoint — same JSON
document). Tutor flush triggers: **page switch** (debounced preflush + explicit
capture), **~200ms debounce** after interactive viewport/`onChange`, **tab hide /
pagehide / beforeunload** (best-effort). Live sync uses an immediate encrypted
`kind: "pageViewState"` envelope in parallel with v3 full-document broadcasts;
students apply tutor patches only.

---

## Where to look first when something breaks

| Symptom | Probably here |
|---|---|
| Tutor reports "lost a session" | `WhiteboardWorkspaceClient.handleEndSession` step ordering, `drainOutboxOrTimeout` timeout, atomic-action server logs grepped by `wbsid=` |
| "Recording pill says off but I'm recording" | FSM inputs at the top of `WhiteboardWorkspaceClient` — usually `everHadParticipants` not latched, or `inputStreams` missing |
| "End button is grey forever" | `inFlightStreamCount` from the outbox observer; check `obx=` lines for permanent failure |
| "Tab died mid-recording — audio gone" | `dft=` lines + `tutoring-notes-recording-draft` IDB; workspace recovery banner (`wb-audio-draft-recovery-banner`) should offer Keep → outbox enqueue |
| "Replay/preview shows blank canvas" | `parseEventLogBySchema` rejected the log (schema version), or `restoreElements` failed; check the replay/`pvw=` console lines |
| "Snapshot link is missing on the share page" | Best-effort by design. Grep `snp=` lines in the workspace console for the skip reason; null means End succeeded without a snapshot |
| "Group session paused even though one student is still here" | FSM input `participants` — make sure the sync layer is putting peer ids in, and `participants.size >= 1` for non-paused state |

---

## When picking up recorder work mid-feature

1. Read this doc top to bottom.
2. Read the master plan
   (`~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_*.plan.md`)
   — the Status section tells you which pillars are shipped.
3. Read the most recent `docs/PHASE-*-STATUS.md` for the current
   phase.
4. Run `npx jest` to know your baseline.
5. Update the STATUS doc as you finish each sub-phase.
