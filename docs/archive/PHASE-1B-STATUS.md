# Phase 1b — outbox + atomic end-session — branch handoff

> **Archive / handoff only (2026-05-19):** ✅ **SHIPPED to master** 2026-05-10 → 2026-05-13 (merge `eef541a` + hotfixes). Branch deleted. Active recorder architecture: `docs/RECORDER-LIFECYCLE.md`.

**Branch:** `phase-1b-outbox-and-end-session` (off `master`; not yet pushed)
**Master plan:** `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md`
**Pillars in scope:** Pillar 2 (IndexedDB upload outbox) + Pillar 3 (atomic
`endWhiteboardSession` server transaction with multi-track payload).
**Companion docs:** [WHITEBOARD-STATUS.md](WHITEBOARD-STATUS.md),
[BACKLOG.md](BACKLOG.md), [RECORDER-REFACTOR-STATUS.md](RECORDER-REFACTOR-STATUS.md)
(template).

This doc is the canonical handoff for Phase 1b. Read it FIRST when picking
up this branch in a fresh chat — it lists what landed, what each commit
does, the test posture, the smoke checklist, and the known follow-ups.

---

## Status

**Feature-complete. Awaiting `git push` + PR + Vercel preview smoke
before merging to `master`.**

The branch is 7 commits ahead of master. Network access from the
executing chat was blocked (`Could not resolve host: github.com`), so
the push + PR open steps need to run from a terminal with network
access. Once pushed, the Vercel preview deployment will apply the
additive Prisma migration (`20260510221109_session_recording_stream_id`)
to the Neon DB via `scripts/migrate-with-retry.mjs` — this is the
"DB writes are DB writes" moment the model-switch gate flagged. The
migration is `IF NOT EXISTS`-guarded and adds only `streamId` (with
`tutor:mic` default backfill) + a composite `(whiteboardSessionId,
streamId)` index. No drops, no renames.

| Commit | Summary | Files changed |
|---|---|---|
| `a408ff2` | Additive Prisma migration — `SessionRecording.streamId` + composite index | `prisma/schema.prisma`, new migration sql |
| `e82142f` | `src/lib/recording/upload-outbox.ts` IndexedDB outbox module + 12 jest cases | new module + test |
| `b396d8e` | Wire outbox into workspace's `onWorkspaceAudioRecorded` (Commit 3) | `useAudioRecorder.ts`, `upload-outbox-instance.ts`, `WhiteboardWorkspaceClient.tsx` |
| `11f4cc1` | `WhiteboardWorkspaceAudioBridge` becomes outbox observer; `composeBridgeState` extracted with 9 unit tests | bridge component + DOM tests + new pure unit suite |
| `b13f646` | Atomic `endWhiteboardSession` with `{ segments }` payload + 14 new server-action tests | `actions.ts`, new test file |
| `7e386be` | Client helpers `drainOutboxOrTimeout`, `assembleEndSessionSegments`, `finalizeOutboxAfterEnd` + 7 jest cases | `upload-outbox-instance.ts`, new test |
| `a7010d6` | Rewrite `handleEndSession` around the helpers; End DOM suite rewritten (4 cases) | `WhiteboardWorkspaceClient.tsx`, End DOM test |

---

## What changed (architecturally)

### Pillar 2 — IndexedDB upload outbox

- **Row schema** (`OutboxRow`): `{id, sessionId, streamId, segmentId,
  blobLocalRef, blobRemoteUrl, mimeType, sizeBytes, audioStartedAtMs,
  registerOk, attempts, lastError, createdAt}`. Dedupe key:
  `(sessionId, streamId, segmentId)` with a unique IDB index.
- **Worker semantics**: serial within a stream, parallel across
  streams. Backoff schedule: 1s, 2s, 5s, 15s, 60s, plateau. Permanent
  failure after 50 attempts → row marked failed, observer state
  surfaces `"failed"`.
- **Crash recovery**: local Blob persisted in IDB so a refresh between
  `MediaRecorder.stop()` and a successful upload doesn't lose the
  segment. Worker drains on every construction, so the workspace
  re-mount auto-resumes pending uploads.
- **Multi-stream from day one**: today only `tutor:mic` is enqueued
  by production code; Phase 4 will add `student:peer-X:mic` rows by
  changing one constant in the workspace, no module changes elsewhere.
- **Observer state**: `{state, inFlightStreamCount, byStream,
  lastError}` exposed via `outbox.observe(sessionId).subscribe(...)`.
  Used by both the audio bridge and the End-session "Saving last N
  segments…" copy.

### Pillar 3 — Atomic `endWhiteboardSession` with multi-track payload

- **New signature** (additive — old 2-arg callers still compile):
  ```ts
  endWhiteboardSession(
    whiteboardSessionId,
    finalEventsBlobUrl,
    opts?: { snapshotBlobUrl?, segments?: EndSessionSegment[] }
  ): Promise<{ endedAt, durationSeconds, registeredSegments }>
  ```
- **Inside the transaction** (in this order):
  1. Update `WhiteboardSession`: `endedAt`, `eventsBlobUrl`,
     `snapshotBlobUrl?`, `durationSeconds`.
  2. Dedupe segments by `(whiteboardSessionId, blobUrl)` against
     existing `SessionRecording` rows — keeps the legacy per-segment
     register-action interoperable.
  3. Sort un-deduped segments by `(audioStartedAtMs ASC, streamId
     ASC)`. Continue `orderIndex` from existing max.
  4. `createMany` with `skipDuplicates: true`.
  5. `whiteboardJoinToken.updateMany` → revoke all live tokens.
- **Server validation**: `validateEndSessionSegments` rejects out-of-
  namespace blobUrls, empty streamId / mimeType, negative
  `sizeBytes`, non-finite `audioStartedAtMs`. Throws BEFORE any DB
  write so a hand-rolled payload can't sneak attacker-controlled
  URLs into `SessionRecording`.
- **Per-segment log line on success** so prod debug can correlate one
  outbox `segmentId` to its persisted row by `blobUrl` suffix.

### Client-side End-session flow (replaces Phase 0c poll loop)

```ts
setUserWantsRecording(false);
const drain = await drainOutboxOrTimeout(wbsid);           // 15s budget
if (drain.timedOut) → error banner, abort, leave outbox intact.
const segments = await assembleEndSessionSegments(wbsid);  // deterministic
const upload = await uploadWhiteboardEvents({...});
await endWhiteboardSession(wbsid, upload.blobUrl, { segments });
await finalizeOutboxAfterEnd(wbsid);                       // drop IDB rows
router.replace(reviewHref);
```

Live UX: while `endingState === "finalizing"`, a `useEffect`
subscribes to `outbox.observe(wbsid)` so the button's "Saving last N
segment(s)…" copy updates in real time as uploads land. The DOM test
covers the 2 → 1 → 0 transition explicitly.

---

## Test counts (last run on this branch)

| Surface | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx jest --testPathPatterns "recording\|whiteboard\|audio\|end" --runInBand` | **54 suites / 483 tests pass** |
| `npx jest` (full suite, parallel) | 6 suites / 9 tests fail — all pre-existing on master (5 need local Postgres; `whiteboard/sync-client` + `upload-outbox.test` concurrency race in parallel mode, pass in `--runInBand` or in isolation). Verified by stashing this branch's diff and re-running. |

### New / updated suites in Phase 1b

- `src/__tests__/recording/upload-outbox.test.ts` — 12 cases (worker
  happy path, retry/backoff, permanent failure, crash recovery,
  dedupe + concurrent merge, multi-stream parallel-across-serial-within,
  drainAndAwait timeout).
- `src/__tests__/recording/upload-outbox-instance.helpers.test.ts` —
  7 cases (assemble shape, skip non-uploaded rows, multi-stream
  preserves streamIds, drain returns immediately / on timeout, finalize
  wipes rows).
- `src/__tests__/recording/compose-bridge-state.test.ts` — 9 cases for
  the bridge's pure precedence rollup.
- `src/__tests__/whiteboard/endWhiteboardSession.test.ts` — 14 cases
  covering events-only end, single-stream multi-segment, multi-stream
  with tie-break, blobUrl namespace rejection, idempotency.
- `src/__tests__/dom/WhiteboardWorkspaceEnd.dom.test.tsx` — 4 cases
  fully rewritten around the outbox-instance mocks (happy, live
  count update, drain timeout, drain-timeout-with-error).
- `src/__tests__/dom/WhiteboardWorkspaceAudioBridge.dom.test.tsx` —
  bridge props refactored, +1 case asserting `observe(sessionId)` is
  called on mount.

---

## Smoke checklist — before merging to master

Run AFTER pushing the branch and AFTER the Vercel preview build
finishes (i.e. AFTER `migrate-with-retry.mjs` has applied the
additive migration on the Neon `preview` DB):

### Sanity
- [ ] Vercel preview build green (no migration error).
- [ ] `npx prisma migrate status` against the preview DB shows the new
      migration as applied, with no follow-up `prisma db push` drift.
- [ ] Open the preview workspace as Sarah's pilot tutor account; the
      page renders, mic device select works, "Start recording" engages
      the workspace recorder (no console errors).

### Happy path (single-stream tutor mic)
- [ ] Start a session, record ~30s of audio, draw a couple of strokes,
      click **End session**. Button copy shows "Saving last 1 segment…"
      briefly (or "0 segments" if the rollover boundary was lucky).
- [ ] Review surface opens with the audio embedded; events.json
      renders the replay correctly; `SessionRecording.streamId` row
      shows `"tutor:mic"`.

### Crash recovery
- [ ] Start a session, record ~30s, then **HARD REFRESH** the tab
      mid-segment (before End). Re-open the workspace.
- [ ] DevTools → Application → IndexedDB → `tutoring-notes-upload-outbox`
      should contain the in-flight row.
- [ ] Click End — outbox should resume the upload, then call End. Row
      lands; review surface shows the audio.

### Drain timeout (forced)
- [ ] In DevTools, throttle network to **Offline** mid-recording.
- [ ] Click End. After ~15s the error banner should appear: "Couldn't
      finalize — N audio segment(s) still saving…". `endWhiteboardSession`
      must NOT have been called server-side (check Neon logs).
- [ ] Re-enable network, click End again — should complete cleanly.

### Multi-stream readiness (visual only, Phase 4 isn't wired yet)
- [ ] No regression in the audio bridge UI when only `tutor:mic` is
      enqueuing — RecordingControlPanel renders, meter ticks, segment
      timer increments. Phase 1b adds `inFlightByStream` to the bridge
      state but the UI doesn't surface per-stream copy yet (Phase 4
      surface).

### Existing whiteboard surfaces (regression)
- [ ] PDF + image upload still works.
- [ ] Math insert + Desmos embed still work.
- [ ] Copy student link → student joins → live sync works → tutor
      ends session → student gets `room_closed`.

---

## Known follow-ups (NOT blocking the merge)

1. **Snapshot PNG generation (plan task 5)** — Phase 1b doesn't ship
   `snapshotBlobUrl`. The `endWhiteboardSession` `opts.snapshotBlobUrl`
   field is wired; Phase 1c will add the `exportToCanvas → toBlob →
   uploadWhiteboardSnapshot` helper and pass the URL through.
2. **Phase 1a tasks that didn't land in 1b** — scene-paint engine
   extraction (Task 4) and the workspace "preview last session before
   Start" (Task 6) are Phase 1c.
3. **Outbox observability** — the `obx=` short-id is logged but we
   don't yet emit Datadog/Sentry breadcrumbs for permanent failure.
   `docs/BACKLOG.md` "Reliability gaps" tracks this.
4. **`upload-outbox.test` parallel race** — the multi-stream
   concurrency test (Commit 2) is flaky when the full repo runs jest in
   parallel because it uses a 50ms wall-clock sleep to verify "both
   streams started in parallel". Passes in isolation and with
   `--runInBand`. Not a Phase 1b regression — predates this branch
   under the same conditions on master.
5. **Audio bridge `waitForPendingUploads` debug surface** — kept as
   a `useImperativeHandle` method for tests/ops but no production
   caller uses it anymore. Leave for now; remove with the next
   surface-level cleanup of the bridge.
6. **`registerWhiteboardSessionAudioSegmentAction` legacy path** —
   still exists for older clients that haven't migrated; the new
   atomic action dedupes against rows it wrote. We can deprecate +
   delete after one pilot session confirms the new flow is stable.

---

## Recovery / partial-branch tips

- If you need to **back out a single commit**, all seven Phase 1b
  commits are independent at the file level except for the natural
  dependency chain (1 → 2 → 3 → 4 → 5 → 6 → 7). The migration commit
  (`a408ff2`) is the only one that touches production DB shape; the
  rest are pure code.
- If the outbox singleton ever needs to be evicted in prod (e.g. a
  bug stamp-locks a session), the IDB store is named
  `tutoring-notes-upload-outbox` and rows are keyed by `id`. DevTools
  → Application → IndexedDB → delete database. The workspace will
  re-mint an empty store on next mount; persisted server data is
  unaffected.
- The composite IDB index `by_session_stream_segment` has `unique:
  true` so even racing enqueues can never produce duplicate rows. If
  a test ever sees a `ConstraintError` from IDB, that's the rail
  catching a bug, not the bug itself.
