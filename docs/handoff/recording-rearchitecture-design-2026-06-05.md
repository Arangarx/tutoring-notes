# Recording / whiteboard re-architecture — capture-in-pieces → consolidate-to-one → play-as-one

> **Design date:** 2026-06-05  
> **Branch:** `design/recording-rearchitecture`  
> **Status:** **RATIFY-READY** — awaiting Andrew's ratification of open questions; **build is NOT yet authorized** (high blast radius)  
> **Authored by:** Composer-authored from Opus scope blob  
> **Deliverable type:** Design / ratify document only — no production code, no migrations applied  
> **Owner directive (Andrew, 2026-06-05):** STOP interim-patching the whiteboard recording/playback methodology; re-engineer it properly for scale and real use.  
> **Prerequisite reads:**
> 1. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — FSM, outbox, atomic end-session (sacred pillar)
> 2. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) — Vercel 300s ceiling, ffmpeg-static, iOS Safari constraints
> 3. [`docs/handoff/session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) — pause-semantics open item (this doc resolves it via D3/D4)
> 4. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) — draft store + outbox durability patterns

---

## Executive summary

Tutors think in **one continuous recording** with pause/continue. They care about session duration and billing — never about chunks, segments, or parts. Today's implementation leaks those internal pieces into playback, transcription assembly, and event timing, producing sync pain and a growing patch surface.

This design re-architects the pipeline as three invisible stages:

1. **Capture in pieces** — keep incremental capture (timeslice checkpoints, per-segment durable uploads) for crash durability only.
2. **Consolidate to one** — async server-side job ffmpeg-concats segment blobs into a single canonical audio file after session end.
3. **Play as one** — playback, transcription, and whiteboard events all key to a single monotonic **recording-time** clock; the UI never sees segments.

**What this supersedes:**

- Interim replay-stitching player polish (multi-segment `replay-audio-timeline.ts` stitch path).
- The per-pause-segment model (toolbar Pause → `stopAndUpload("final")` → new `MediaRecorder`).
- The [`session-lifecycle-redesign-brief-2026-06-02.md`](session-lifecycle-redesign-brief-2026-06-02.md) pause-semantics open item — resolved here via D3/D4 (collapse + monotonic recording-time clock).

---

## Ground-truth current state

Code inventory as of 2026-06-05 (`a1850fd`). This is the starting point; do not assume behavior from docs alone.

### Capture

- **One mixdown `MediaRecorder`** on `tutor:mic`. A Web Audio graph sums tutor mic + remote peers into a single stream.
- Workspace uses `MediaRecorder.start(30000)` — 30s timeslice → IndexedDB draft checkpoints (`dft` log prefix).
- **50-minute auto-rollover:** `segment-policy.ts` sets `SEGMENT_MAX_SECONDS = 50 * 60`. On rollover: stop → upload → new recorder (gapless pre-warm).
- **Toolbar "Pause recording":** calls `setUserWantsRecording(false)` → bridge calls `stopAndUpload("final")` → finalizes a segment, uploads blob, enqueues outbox, tears down mic. **Resume = NEW `MediaRecorder`** (not resume on the same instance).
- **Presence-pause** (student drops, tutor still wants to record): already uses real `MediaRecorder.pause()` / `resume()` on the **same** recorder — no new segment.

### Storage

- One Vercel Blob + one `SessionRecording` row per finalized segment.
- Rows registered atomically in `endWhiteboardSession` via `createMany`.
- `SessionRecording.durationSeconds` is NULL at insert; set later by Whisper.
- **Billing clock:** `WhiteboardSession.activeMs` (heartbeat presence).
- **Wall-clock duration:** `WhiteboardSession.durationSeconds` from session start.

### Transcription

- Per-segment Whisper pass.
- Within a segment, ffmpeg splits at 25MB (`WHISPER_MAX_BYTES`) into ~22MB / 240s parts.
- Multi-segment assembly is naive concat with **no wall-clock gap preserved**.

### Playback

- Client stitches N segments via [`replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts) — sums `durationSeconds` back-to-back, explicitly **no pause gaps**.
- [`WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) swaps hidden `<audio>` elements per segment.

### What does NOT exist today

- **No server-side audio concat.** ffmpeg is used only for Whisper splitting ([`transcribe-ffmpeg.ts`](../../src/lib/transcribe-ffmpeg.ts)).

### Known bugs / mismatches

| Issue | Detail |
|---|---|
| `audioStartedAtMs` bug | Outbox sets `audioStartedAtMs` to `Date.now()` at enqueue; should be recorder-start time. Replay ignores it anyway. |
| Event clock freeze | `getAudioMs` event clock **freezes** when `recordingActive` is false — event `t` is pause-collapsed today, but audio stitch path does not preserve pause gaps consistently across segments. |

---

## Constraint / threat model

| Constraint | Implication |
|---|---|
| **Tutor mental model** | ONE recording with pause/continue. Duration = billing (`activeMs`), not segment count. |
| **Crash durability** | Incremental capture (timeslice + IDB drafts + outbox) is non-negotiable — the only legitimate reason to chunk. |
| **Vercel 300s function ceiling** | Consolidation cannot run inline in `endWhiteboardSession` for long multi-segment sessions. |
| **iOS Safari** | `MediaRecorder.pause()` / `resume()` and timeslice behavior differ from desktop Chrome — Phase 2 is hardware-gated. |
| **Backward compatibility** | Existing multi-segment sessions must keep playing via stitch fallback until optionally backfilled. |
| **Data-loss bar** | Segments are never deleted until canonical blob is verified durable. |

---

## Core design decisions

### D1 — Keep incremental capture; make the pieces INTERNAL

**Decision:** Timeslice chunks + per-segment durable uploads (outbox / IDB) **stay**. They exist solely for crash durability and upload resilience.

**What changes:** Pieces are consolidated server-side after session end and **never leak** to playback, transcription UI, or tutor-facing surfaces.

**Rationale:** The W1 durability design ([`w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)) proved that incremental checkpointing is load-bearing. Throwing it away would regress crash recovery. The fix is to hide the seam, not remove the mechanism.

---

### D2 — Server-side consolidation = async post-end job

**Decision:** After `endWhiteboardSession` completes, an async job:

1. Reads all segment blobs for the session (ordered).
2. ffmpeg-concats into **one** canonical audio blob at `sessions/{studentId}/{wbsid}/canonical.webm`.
3. Writes canonical URL + consolidation status on `WhiteboardSession`.

**Not inline** — Vercel's 300s ceiling and long multi-segment sessions would blow an inline concat. The job is **idempotent + retryable**.

**Durability rule:** Segments are **never deleted** until the canonical blob is verified durable (write-then-flip-status).

**Rationale:** This is the lowest-risk first ship (Phase 1): capture untouched, playback pain eliminated for new sessions.

---

### D3 — Single monotonic "recording-time" clock for everything

**Decision:** Audio, whiteboard events, and transcript all key to **one clock** that advances **only while actively recording**. Pauses collapse — no dead air on the timeline.

**Separate concern:** Session billing duration stays on `WhiteboardSession.activeMs` (presence heartbeat). Wall-clock session duration stays on `WhiteboardSession.durationSeconds`. Neither is the recording-time clock.

**Rationale:** Today's audio-total vs event-span mismatch is the root of replay sync bugs. One primitive kills the mismatch: everything shares `recordingMs` offsets.

---

### D4 — Pauses collapse (gapless)

**Decision:** Both tutor-initiated pause and involuntary disconnect **collapse**:

- Audio is gapless (no silence inserted for pause duration).
- Recording-time clock **freezes** during pause.
- Post-pause content resumes at the pre-pause offset.

**Evidence:** Andrew's H1 hardware observation — collapse "looked okay": audio stayed in sync, strokes resumed at the right place.

**Rationale:** Matches tutor mental model. No replaying minutes of silence. Billing clock (`activeMs`) may still run during presence — that is intentional and separate.

---

### D5 — Toolbar pause becomes a TRUE pause

**Decision:** Switch whiteboard toolbar "Pause recording" from `stopAndUpload("final")` + new recorder to `pauseRecording()` / `resumeRecording()` on the **same** `MediaRecorder`.

**Effect:**

- One WebM header per rollover window → trivially concatenable.
- No per-pause segment. Segments come only from 50-min rollover and crash boundaries — all invisible post-consolidation.

**Gate:** Requires iOS hardware validation (Safari pause/resume + timeslice behavior differs). Phase 2 is blocked until Andrew's iPhone smoke passes.

**Rationale:** Per-pause segments are the primary source of stitch complexity and transcript gap bugs. True pause eliminates them without sacrificing durability (timeslice + IDB still run).

---

### D6 — Transcription assembles by recording-time

**Decision:** Still split ≤25MB for Whisper API limits, but assemble parts by **recording-time offsets** into one continuous transcript.

With the monotonic clock (D3), assembly is ordered concat with correct timestamps — the multi-segment gap problem disappears.

**Future:** When live transcription (LTX) merges, timeline-anchored assembly folds into the same recording-time primitive.

---

### D7 — Playback plays ONE file

**Decision:** Single canonical audio URL + single event log.

- [`WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) simplifies to one `<audio src>`.
- [`replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts) becomes deletable (or a trivial gap-aware shim during transition).
- This is the B4 "unified player" — now trivial because upstream consolidation did the hard work.
- Single-segment sessions use the same path (N=1).

---

### D8 — Additive, backward-compatible rollout

**Decision:** Add `WhiteboardSession.canonicalAudioUrl` + `consolidationStatus` (additive Prisma migration).

| `consolidationStatus` | Playback behavior |
|---|---|
| `done` + URL present | Play canonical |
| `pending` / `running` / `failed` / absent | Fall back to existing segment-stitch path |

- New sessions get consolidated.
- Existing multi-segment sessions keep working via fallback.
- Backfill is optional / later.

---

## Phasing (sequence by risk)

### Phase 1 — Consolidation + canonical playback (capture UNTOUCHED)

**Scope:**

- Server-side consolidation job + canonical blob write.
- Schema: `canonicalAudioUrl`, `consolidationStatus`.
- Playback prefers canonical when ready; stitch fallback otherwise.

**Risk:** Lowest. Capture path unchanged. Independently shippable.

**Acceptance:** New session with 2+ segments (50-min rollover or legacy pause segments) plays as one file after consolidation completes. Stitch fallback works while `pending`.

---

### Phase 2 — True pause + unified recording-time clock

**Scope:**

- D5: toolbar pause → `pause()` / `resume()` on same recorder.
- D3/D4: monotonic recording-time clock for audio + whiteboard events.

**Risk:** Medium. iOS Safari behavior is the unknown.

**Gate:** iOS hardware smoke of continuous pause/resume + timeslice durability on Andrew's device.

---

### Phase 3 — Transcription assembly by recording-time

**Scope:**

- D6: Whisper parts assembled by recording-time offsets.
- Fold in LTX timeline-anchored assembly when that branch merges.

**Risk:** Medium-low once D3 is stable.

---

### Phase 4 — Playback simplification

**Scope:**

- D7: delete stitch path once canonical is universal.
- Optional backfill of old sessions.

**Risk:** Low (cleanup only). Do not delete fallback until backfill decision (Q6) is resolved or canonical coverage is sufficient.

---

## 5-axis reliability review

Mandatory per [`reliability-bar.mdc`](../../../../agenticPipeline/.cursor/rules/reliability-bar.mdc). BLOCKERs fold into Phase-1 acceptance.

### Axis 1 — Data-loss / durability

| Risk | Mitigation |
|---|---|
| Canonical write fails mid-concat | Partial concat discarded; job retries from scratch (idempotent). |
| Segment deleted before canonical verified | **Never.** GC only after `consolidationStatus = done` + blob HEAD check. |
| Canonical URL flipped before blob durable | Atomic write-then-flip: upload blob → verify → update status + URL in one txn. |
| Consolidation overwrites good canonical | Idempotent job keyed by `wbsid`; skip if `done` unless forced re-run. |

### Axis 2 — Crash / failure recovery

| Risk | Mitigation |
|---|---|
| Consolidation job never succeeds | Playback falls back to segment-stitch **indefinitely** — no hard dependency on canonical. |
| Job crashes mid-run | Retryable queue; status `failed` with last error; manual re-trigger path. |
| Capture crash mid-session | Unchanged: timeslice + IDB drafts (`dft`) + outbox (`obx`). Phase 1 does not touch capture. |
| End-session txn held for ffmpeg | Consolidation triggered **after** `finalizeOutboxAfterEnd` — never inside end-session txn. |

### Axis 3 — Observability

| Requirement | Implementation |
|---|---|
| Per-session id logging | Every consolidation log line carries `wbsid=<id>`. |
| New log prefix | **`cns`** — register in `AGENTS.md` § Conventions. |
| State transitions | Log: start, segment-read (count + order), concat-start, blob-write, status-flip, done/failed. |
| Tutor-visible failure | None in Phase 1 (silent fallback to stitch). Admin/debug surface optional later. |

### Axis 4 — Concurrency / races

| Risk | Mitigation |
|---|---|
| Double-trigger on end-session | Guard: only enqueue if `consolidationStatus` is null or `failed`. |
| Concurrent consolidation runs | Status state machine: `pending → running → done | failed`. Optimistic lock on `running`. |
| New segment uploaded after job started | Job reads segment list at start; re-run if count mismatch detected post-concat. |
| Playback reads canonical mid-write | Status flip is atomic; URL only set when blob verified. |

### Axis 5 — Platform limits

| Limit | Mitigation |
|---|---|
| Vercel 300s function ceiling | Consolidation **must** be async/queued (or chunked concat for very long sessions). |
| ffmpeg-static availability | Mirror [`transcribe-ffmpeg.ts`](../../src/lib/transcribe-ffmpeg.ts) patterns; `serverExternalPackages` in Next config. |
| Blob path / size | Canonical at `sessions/{studentId}/{wbsid}/canonical.webm`; monitor total size for 2hr+ sessions. |
| iOS Safari pause/resume | Phase 2 **hardware gate** — do not ship D5 without Andrew iPhone smoke. See [`PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) §8. |

---

## Blast radius

Grouped by pillar. All paths verified against repo inventory.

### Capture

| File | Role |
|---|---|
| [`src/hooks/useAudioRecorder.ts`](../../src/hooks/useAudioRecorder.ts) | MediaRecorder lifecycle, timeslice, pause/resume |
| [`src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceAudioBridge.tsx) | Bridge: `stopAndUpload`, pause intent |
| [`src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`](../../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx) | `handleEndSession` ordering, recording state |
| [`src/hooks/useWhiteboardRecorder.ts`](../../src/hooks/useWhiteboardRecorder.ts) | Recorder orchestration, `getAudioMs` clock |
| [`src/lib/recording/lifecycle-machine.ts`](../../src/lib/recording/lifecycle-machine.ts) | FSM states, `recordingActive` |
| [`src/lib/recording/recording-draft-store.ts`](../../src/lib/recording/recording-draft-store.ts) | IDB draft checkpoints (`dft`) |
| [`src/lib/recording/segment-policy.ts`](../../src/lib/recording/segment-policy.ts) | `SEGMENT_MAX_SECONDS`, rollover |

### Finalize / consolidate (NEW + existing)

| File | Role |
|---|---|
| **NEW** `src/lib/recording/consolidate-audio.ts` (proposed) | ffmpeg-concat module — mirror `transcribe-ffmpeg.ts` |
| [`src/lib/recording/upload-outbox.ts`](../../src/lib/recording/upload-outbox.ts) | Outbox enqueue; fix `audioStartedAtMs` bug |
| [`src/app/admin/students/[id]/whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | `endWhiteboardSession`, consolidation trigger |
| [`src/lib/upload.ts`](../../src/lib/upload.ts) + `/api/upload/audio` | Blob upload path for canonical |
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | `canonicalAudioUrl`, `consolidationStatus` |
| [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) | New load-bearing assumptions |

### Playback

| File | Role |
|---|---|
| [`src/components/whiteboard/WhiteboardReplay.tsx`](../../src/components/whiteboard/WhiteboardReplay.tsx) | Replay UI — simplify to single `<audio>` |
| [`src/lib/whiteboard/replay-audio-timeline.ts`](../../src/lib/whiteboard/replay-audio-timeline.ts) | Segment stitch timeline — **deletable** in Phase 4 |
| Admin + share replay pages | Consume canonical URL with fallback |
| [`src/lib/audio/webm-duration-fix.ts`](../../src/lib/audio/webm-duration-fix.ts) | Duration metadata for WebM |

### Transcription

| File | Role |
|---|---|
| [`src/lib/transcribe.ts`](../../src/lib/transcribe.ts) | Whisper orchestration |
| [`src/lib/transcribe-ffmpeg.ts`](../../src/lib/transcribe-ffmpeg.ts) | Split patterns to reuse for concat |
| `generateNotesFromWB` in [`whiteboard/actions.ts`](../../src/app/admin/students/[id]/whiteboard/actions.ts) | Notes generation entry |
| LTX (`ltx-actions.ts`, `useLiveTranscription.ts`) | If merged — timeline-anchored assembly |

### Riskiest seams (call out explicitly)

| Seam | Why it matters |
|---|---|
| **`handleEndSession` ordering** | stop → flush → drain → assemble → `endWhiteboardSession` → `finalizeOutboxAfterEnd`. Consolidation must hook **after** outbox finalize, not inside txn. |
| **Outbox crash recovery** | Draft-vs-outbox boundary; consolidation reads uploaded segments only. |
| **Atomic end-session txn** | `createMany` for `SessionRecording` rows — canonical is separate async write. |
| **`audioStartedAtMs: Date.now()` bug** | Fix in Phase 2 when recording-time clock lands; consolidation ordering uses segment list, not this field. |
| **iOS timeslice durability** | Phase 2 gate — pause/resume must not break 30s IDB checkpoints. |

---

## Open questions — ratify before build

Reply **"ratify defaults"** to accept all recommended defaults, or specify per question.

| # | Question | Options | **Recommended default** |
|---|---|---|---|
| **Q1** | Pause model: collapse (gapless, recording-time clock) vs preserve wall-clock gap | Collapse / preserve gap | **Collapse** (D4) |
| **Q2** | Treat involuntary disconnect same as pause (collapse)? | Yes / no | **Yes** (H1 observation) |
| **Q3** | Consolidation timing: async-post-end vs inline-for-short | Async always / inline if ≤N segments | **Async always** (Vercel 300s) |
| **Q4** | Keep `SessionRecording` segment rows post-consolidation? | Keep (audit + fallback) / GC immediately | **Keep; GC later** |
| **Q5** | Keep 50-min rollover as internal mechanism? | Yes / remove | **Yes; revisit later** |
| **Q6** | Backfill consolidation for existing multi-segment sessions? | New-only + stitch fallback / backfill all | **New-only + stitch fallback for old** |
| **Q7** | Consolidation job log prefix | — | **`cns`** |
| **Q8** | Ship Phase 1 (consolidation + canonical, capture untouched) before Phase 2 (pause semantics)? | Yes / parallel | **Yes — Phase 1 is the contained win** |
| **Q9** | Gate Phase 2 on iOS hardware smoke of continuous pause/resume? | Yes / no | **Yes** |
| **Q10** | Canonical audio storage location / format | — | **Vercel Blob, `sessions/{studentId}/{wbsid}/canonical.webm`** |

---

## Proposed schema addition (Phase 1)

Additive migration only — no column drops or renames.

```prisma
// WhiteboardSession — additive fields
canonicalAudioUrl     String?
consolidationStatus   String?   // pending | running | done | failed
consolidationError    String?   // last error message when failed
consolidatedAt        DateTime?
```

---

## Consolidation job sketch (Phase 1)

```
endWhiteboardSession completes
  │
  ↓
finalizeOutboxAfterEnd (existing)
  │
  ↓
enqueue consolidation (if segments > 0 AND status not done)
  │  [cns] wbsid=<id> action=enqueue segmentCount=N
  ↓
async worker:
  │  flip status → running
  │  fetch SessionRecording rows ordered by createdAt
  │  download blobs from Vercel Blob
  │  ffmpeg concat → temp file
  │  upload → sessions/{studentId}/{wbsid}/canonical.webm
  │  verify blob durable (HEAD / size check)
  │  txn: set canonicalAudioUrl + status=done + consolidatedAt
  │  [cns] wbsid=<id> action=done canonicalBytes=B
  │
  └── on failure: status=failed, consolidationError=msg, retry eligible
```

---

## Ratification record

| Field | Value |
|---|---|
| **Awaiting** | Andrew — reply in orchestrator chat |
| **Quick path** | `"ratify defaults"` → all Q1–Q10 recommended defaults |
| **After ratify** | Orchestrator dispatches Phase 1 on isolated branch; no build until ratified |
| **Build authorized** | **No** — design only until Andrew confirms |

---

## What we are NOT doing in this doc

- No production code changes.
- No migrations applied.
- No redesign of session-lifecycle auto-recording (C decision in session-lifecycle brief) — that remains a separate thread; this doc only resolves pause-semantics and recording pipeline shape.
- No deletion of stitch path until Phase 4 + Q6 resolved.
