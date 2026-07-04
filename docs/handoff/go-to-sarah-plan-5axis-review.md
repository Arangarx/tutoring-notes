# 5-axis adversarial reliability review — `go-to-sarah-master-cut-plan.md`

**Reviewer:** Sonnet 4.6 (subagent)  
**Plan reviewed:** `docs/handoff/go-to-sarah-master-cut-plan.md` @ `wb-wave5-polish` tip `affc1e1`  
**Date:** 2026-07-04  
**Verdict:** Plan has **5 BLOCKERs** and **9 SHOULD-FIXes** that must be resolved before execution starts.  The architecture is largely sound; the issues are in implementation details and under-specified interfaces that will cause real failures or regression loops.

---

## How to read this doc

- **BLOCKER** — must be folded into the plan before any execution starts. Execution will either produce silent data loss, an unrecoverable race, or trip the "2nd-failed-attempt" escalation tripwire without this fix.  
- **SHOULD-FIX** — must be addressed before the relevant workstream executes. Omitting these causes test gaps, hidden failures, or predictable maintenance traps.  
- **NICE** — real improvements, but deferrable without blocking Sarah delivery.

Each item: axis tag, plan section cited, code location, concrete plan edit.

---

## BLOCKER findings

---

### BLOCKER-1 — `registerWhiteboardSessionAudioSegmentAction` orderIndex is non-atomic (Axis 1 + 2)

**Plan section:** WS-A §A2; `actions.ts` L1476–1502

**Problem:** The action does a `db.sessionRecording.findFirst({orderBy: {orderIndex: desc}}) → db.sessionRecording.create(…, orderIndex: last+1)` as two separate DB calls, not inside a transaction. With VAD cutting segments every 2–3 minutes, two outbox drain callbacks can fire within milliseconds of each other (one for the mixdown VAD cut, one for a per-speaker chunk). Both reads return the same `MAX(orderIndex)`, both compute the same `orderIndex = N`, and both create rows. `SessionRecording` has no unique constraint on `(whiteboardSessionId, orderIndex)`, so both rows are silently inserted with identical `orderIndex`. At finalize time, `endWhiteboardSession`'s `skipDuplicates` on `blobUrl` deduplicates the row but the orderIndex collision causes ambiguous replay ordering.

This is also a race between the incremental callback and `endWhiteboardSession`'s own `aggregate({_max: orderIndex}) → createMany`. The end-session transaction uses `findMany → aggregate → createMany` inside `db.$transaction`, so it correctly isolates. But the incremental path does not, meaning it can insert between the aggregate and createMany inside the end-session transaction — at Neon's default read-committed isolation, the end-session `aggregate` read may precede the incremental insert, assigning overlapping orderIndex values.

**Fix:**

In A2, wrap the incremental `registerWhiteboardSessionAudioSegmentAction` extension in a `db.$transaction`:

```typescript
// actions.ts — replace the findFirst → create pair with:
const row = await db.$transaction(async (tx) => {
  const last = await tx.sessionRecording.findFirst({
    where: { whiteboardSessionId },
    orderBy: { orderIndex: "desc" },
    select: { orderIndex: true },
  });
  const orderIndex = (last?.orderIndex ?? -1) + 1;
  return tx.sessionRecording.create({
    data: { …, orderIndex },
    select: { id: true, orderIndex: true },
  });
});
```

Additionally, add a `@@unique([whiteboardSessionId, orderIndex])` constraint to `SessionRecording` in schema (additive migration) so the DB enforces it. Because the existing `skipDuplicates` on `createMany` in `endWhiteboardSession` uses `blobUrl`, the new unique orderIndex constraint would surface any races that were previously silent.

---

### BLOCKER-2 — WS-B batchSeq 409 semantics are ambiguous; cascading silent batch loss (Axis 1 + 2)

**Plan section:** WS-B §B2; `checkpoint/route.ts`

**Problem:** The plan says "reject out-of-order `batchSeq` with 409." This is under-specified in two failure modes that happen in production:

**(a) Transient network error → batch N-1 is not received by server.** Client fires batch N-1, gets a timeout or 500. The plan does not specify whether the client retries or advances its `lastPersistedIndex`. If the client advances on error (to "keep up"), batch N-1 events are silently dropped server-side. If the client retries, the server's `@@unique([whiteboardSessionId, batchSeq])` handles idempotency correctly — but the plan says "reject out-of-order" not "accept idempotent re-send." Whether a retry of batch N-1 after a 500 is treated as "in-order" or "out-of-order" is unspecified.

**(b) Server sees batch N before batch N-1 (proxy reorder, rare).** Server's `lastPersistedBatchSeq = N-2`, incoming batchSeq is `N`. 409 returned. Client gets 409 — does it treat this as "skip and advance" or "retry from N-1"? The plan doesn't say. If the client treats 409 as success (idempotent), it advances cursor and N-1's events are permanently lost. If it treats 409 as error and retries, it retries batch N forever because batch N-1 still hasn't arrived.

The `@@unique([whiteboardSessionId, batchSeq])` constraint means a retry of the SAME batchSeq is handled by Prisma — but the plan uses `insert` not `upsert`, so the constraint would throw on a retry.

**Fix — three concrete plan changes:**

1. Change the server route to use **`upsert`** on `(whiteboardSessionId, batchSeq)`, not raw `insert`. Retries of the same batch are idempotent.
2. Change the "reject out-of-order" rule: the server should accept any batch with `batchSeq > 0` that has a valid `fromEventIndex ≥ lastPersistedBatchToIndex`. Reject **duplicate** batchSeqs (already persisted) with 200/no-op. Do not reject out-of-order by sequence number — instead, use `(fromEventIndex, toEventIndex)` as the canonical ordering, not batchSeq.
3. Add explicit client retry policy in the plan: `runServerPersist` retries up to 3 times with exponential backoff on non-409 errors; on 409, logs a warning and **does not advance `lastPersistedIndex`** (lets the next tick retry).

Without this, a single dropped network request silently ends server-side WB persist for the rest of the session.

---

### BLOCKER-3 — `OutboxConfig` missing `onUploadSuccess` callback; WS-A A2/A3 has no wiring path (Axis 3)

**Plan section:** WS-A §A2, §A3; `src/lib/recording/upload-outbox.ts` L216–260

**Problem:** The plan says:  
> "Wire from `upload-outbox.ts` drain success path (~L650–659) via **injected callback** in outbox config (do **not** rewrite drain loop semantics)."

But the current `OutboxConfig` type has no callback fields. `drainStreamOnce`'s upload-success path at L650–659 calls `writeRow(…)` and `refreshStateAndNotify(sessionId)` — no callback hook. 

The executor must add a new field to `OutboxConfig` + `drainStreamOnce` to make A2 and A3 wiring possible **without rewriting the drain loop**. If this interface change isn't specified in the plan, two things happen: (a) the executor either rewrites the drain semantics (fragile-surface violation) or (b) wires the callback at the `upload-outbox-instance.ts` level by wrapping `getOrCreateUploadOutbox()` — which is possible but puts session-specific callback logic into the singleton, causing cross-session callback contamination.

**Fix — add to plan, WS-A §A2 file touch-points table:**

Add `upload-outbox.ts` change: "Add `onSegmentUploaded?: (row: OutboxRow) => Promise<void>` to `OutboxConfig`; call from `drainStreamOnce` after successful `writeRow` (non-`transcriptionOnly` → A2; `transcriptionOnly` → A3). Callback is fire-and-forget with error isolation (callback throw must not crash the drain loop)."

Add `upload-outbox-instance.ts` change: "Pass `onSegmentUploaded` in the `createUploadOutbox` call inside `getOrCreateUploadOutbox()`; route to `registerWhiteboardSessionAudioSegmentAction` (non-transcriptionOnly) or `enqueueChunkTranscriptionAction` (transcriptionOnly) based on row type."

---

### BLOCKER-4 — WS-A timer surgery: plan citation L637–645 is imprecise; hard-stop safety valve is at L628–635 in the same block (Axis 3)

**Plan section:** WS-A §A1; `src/hooks/useAudioRecorder.ts` startTimer(), L609–646

**Problem:** The current `startTimer()` setInterval callback has three adjacent blocks:
- L616–626: `shouldFireApproachingChime` → chime (delete with 50-min rollover)
- L628–635: `shouldHardStopSession` → hard stop (MUST KEEP)
- L637–645: `shouldRolloverSegment` → `rolloverSegmentGapless()` (delete; replaced by VAD)

The plan says "delete rollover timer branch + chime calls" and cites "L616–645." L628–635 is the hard stop, which is inside this range. An executor who follows "delete L616–645" literally removes the hard-stop safety valve. At the bottom of the plan section it says "keep `SESSION_SAFETY_MAX_SECONDS` hard stop if desired" — **"if desired" is not an instruction; it's optional language on a safety-critical guard.**

The 8-hour hard stop is the only server-side protection against a runaway session that drains all storage and bills indefinitely if VAD malfunctions.

**Fix — precise surgical instructions in the plan:**

Replace the current wording with:
> "In `startTimer()`, KEEP the `shouldHardStopSession` block (L628–635 on tip `affc1e1`) unchanged — this is the mandatory runaway guard. DELETE the `shouldFireApproachingChime` block (L616–626) and the `shouldRolloverSegment` block (L637–645). Verify `shouldHardStopSession(totalSessionElapsedRef.current)` remains in the resulting timer callback. Red-before on a test that drives `SESSION_SAFETY_MAX_SECONDS` to confirm the guard still fires."

Also: the plan says "Remove `isWarning` / `formatSegmentTimeLeft` exports" from `segment-policy.ts`. Add: "Keep `shouldHardStopSession` and `SESSION_SAFETY_MAX_SECONDS`." These are different functions in the same file and the executor needs explicit keep/delete labels.

---

### BLOCKER-5 — C1 (`finalizeWhiteboardSessionFromBackend`) must not share transaction logic with `endWhiteboardSession`; plan as written duplicates a fragile surface (Axis 3)

**Plan section:** WS-C §C1; `actions.ts` L668–911

**Problem:** C1 step 5 says "Single transaction mirroring `endWhiteboardSession` L759–861: stamp `endedAt`, set `eventsBlobUrl`, revoke tokens, participant `leftAt`, skip duplicate segments." This describes **duplicating the transaction logic** of `endWhiteboardSession` — one of the most load-bearing and hard-to-get-right surfaces in the codebase (comment at L892–904 explains why `revalidatePath` is deliberately excluded; consent check at L727–742; erasure short-circuit at L744–753; ordering at L822–849). Duplicating this in C1 means any future fix to `endWhiteboardSession` MUST also be applied to C1. This is the composition-over-duplication rule and a maintainability trap that becomes a reliability trap.

Additionally: C1 step 6 says "Post-tx: `kickSessionChunksAction` + `triggerNotesGenerationAction` (same as client end path)." These are consent-gated in `endWhiteboardSession` via `audioConsentGranted`. The plan does not specify that C1 also runs `resolveModeAwareAudioRecordingConsent` before calling them — if C1 skips this, notes are generated for sessions where audio recording consent was denied.

**Fix — two concrete plan changes:**

1. **C1 should call `endWhiteboardSession` internally, not duplicate it.** C1's job is to assemble the inputs (`finalEventsBlobUrl`, `segments[]` from `SessionRecording` rows, optional `snapshotBlobUrl`) and then call `endWhiteboardSession(wbsid, finalEventsBlobUrl, { snapshotBlobUrl, segments })`. This reuses the tested transaction, consent gates, erasure short-circuit, and token revocation. If `endedAt` is already set, `endWhiteboardSession` currently throws — C1 catches this and returns the existing review payload (idempotency path).  
2. **Explicitly add consent check for notes generation** to C1's description. OR: document that C1 delegates to `endWhiteboardSession` which already contains the gate, so the gate is inherited. The plan must state which path is taken.

The plan currently has backward-compat language ("Client `endWhiteboardSession` remains for backward compat until C1 proven — then thin-wrap to C1"). This is the right direction: C1 calls `endWhiteboardSession`. Change plan language to: "C1 assembles inputs, then calls `endWhiteboardSession` directly (C1 is the assembly layer; end-session is the commit layer). No transaction logic is duplicated."

---

## SHOULD-FIX findings

---

### SF-1 — WS-B: `runServerPersist` ↔ End flush race on `lastPersistedIndex` (Axis 2)

**Plan section:** WS-B §B1; `useWhiteboardRecorder.ts`

The 1s persist tick and the End-session "flush last WB delta" call both advance `lastPersistedIndex`. If a tick is mid-flight when End fires, two batches can race to send overlapping event slices. The plan says "separate mutex from IDB checkpoint" but gives no implementation guidance.

**Plan fix:** Add to WS-B §B1 guardrails: "Guard `runServerPersist` with a `persistInProgressRef = useRef(false)` flag (mirroring `rolloverInProgressRef` in the audio recorder). If a tick fires while a persist is in progress, skip the tick. The End-side flush calls `runServerPersist()` directly (not via interval) and awaits it; if `persistInProgressRef` is true, End waits for it to complete rather than skipping." Specify this is a `useRef` (not `useState`) to avoid re-renders.

---

### SF-2 — WS-B: `boardDocumentJson` must be sent on every batch, not "periodically" (Axis 1)

**Plan section:** WS-B §B1, §B2; `useWhiteboardRecorder.ts`

The plan says batches include "periodic full `boardDocument` from `getBoardDocumentForCheckpointRef`." If the tutor navigates to page 2 and the tab crashes before the next "periodic" boardDocument batch, the server-side batch history has multi-page events but no `boardDocumentJson` that captures page 2's existence. WS-D's resume would reconstruct only page 1 (because `reconstructSceneAt` on flat events without `pageId` cannot reconstruct multi-page state — confirmed in the current-state facts: "Flat event timeline — no `pageId` on events").

**Plan fix:** Change WS-B §B1: "`boardDocumentJson` is sent with **every** batch, not just periodically. The extra JSON adds ~2–5 KB per batch; at 1s intervals this is acceptable. 'Periodic snapshot' language is removed." Add to WS-D §D1 acceptance: "`boardDocumentJson` present in at least the most-recent batch for all ACTIVE sessions with pages > 1."

---

### SF-3 — WS-B: optional Blob put should be removed; DB is the durability source (Axis 5)

**Plan section:** WS-B §B2

The plan says "Optional: still `put` Blob for redundancy — **DB row is source of truth** for WS-C/D." At 1s intervals over a 1-hour session this is 3600 Blob writes + 3600 Blob objects in the Vercel private store. The Vercel Blob free tier has rate limits and costs per-put. This is unnecessary: the DB row already has the full `eventsJson`, and the existing checkpoint Blob (written every 30s by `runCheckpoint`) provides the Blob-level redundancy for the cross-device-recovery edge case.

**Plan fix:** Remove the "Optional: still `put` Blob for redundancy" clause from WS-B §B2. Update erasure section: checkpoint Blobs under `whiteboard-checkpoints/{sessionId}/` are covered by the existing cleanup; no additional Blob path added.

---

### SF-4 — WS-A: VAD polling mechanism not specified; 1s timer granularity has implications (Axis 2)

**Plan section:** WS-A §A1

The plan says "Reuse analyser RMS: `readAnalyserRmsLevel` / `getLevel()`" but doesn't specify WHERE the silence detection runs. Two options:

**(a) Piggyback on the existing meter RAF** (`startMeter` in `useAudioRecorder.ts`): sub-100ms detection, but `rolloverSegmentGapless()` would be called from a RAF callback. The function creates a new `MediaRecorder` synchronously — this is safe from RAF, but the `rolloverInProgressRef` guard must be checked before calling.

**(b) Add a new polling interval in `useAudioRecorder` or in `WhiteboardWorkspaceClient`**: simpler but adds up to 200ms jitter (at 200ms poll).

Without specifying (a) or (b), the executor will invent an approach. On iOS Safari, the `AudioContext` may be suspended while the tab is backgrounded, making both approaches fail silently. The 2–3 min safety cap (mentioned in A1 but not made concrete) is the only fallback.

**Plan fix:** Add to WS-A §A1:
1. "VAD state machine runs inside the existing meter RAF callback (`startMeter`). This gives sub-100ms silence detection and reuses the already-running graph. Guard `rolloverSegmentGapless()` calls with `rolloverInProgressRef.current === false` before firing."
2. "Safety cap is a concrete constant: `VAD_MAX_SEGMENT_SECONDS = 150` (2.5 min). Add to `segment-policy.ts` alongside the removed 50-min constant. If VAD is not operational (e.g., `getLevel()` returns 0 for >VAD_MAX_SEGMENT_SECONDS), the safety cap triggers `rolloverSegmentGapless()` directly. This is the iOS fallback."
3. "iOS/Safari note: if `AudioContext.state === 'suspended'` when the tab backgrounds, VAD stops cutting. The safety cap fires on the next resumed tick (up to cap seconds late). Document in smokebook as 'best-effort, iOS hardware validation pending.'"

---

### SF-5 — WS-A: IDB store version bump is unnecessary and harmful (Axis 2)

**Plan section:** WS-A §A3 (open question Q4); `upload-outbox.ts` L197, `onupgradeneeded`

The plan says "IDB store version bump (migration wave 0)" for adding `recordingTimeOffsetMs` and `speakerId` to `OutboxRow`. These are **optional fields** (TypeScript optional `?`) on a JS object stored via `store.put(row)`. IndexedDB stores arbitrary JS objects — adding new optional fields to new rows requires no schema migration. A version bump is only needed when adding or modifying IDB **indexes** or **object store key paths**.

A spurious version bump (from 1 to 2) triggers `onupgradeneeded` in every tab simultaneously. The `onupgradeneeded` handler must run while no other tab has the DB open. On Chrome/Safari, a second tab holding the DB connection blocks the upgrade indefinitely (no `blocked` error recovery is implemented beyond a warning log). This can silently brick the outbox in multi-tab scenarios.

**Plan fix:** Remove "IDB store version bump" from migration wave 0. The new fields are optional on `OutboxRow`; existing rows without them are handled by checking `row.recordingTimeOffsetMs ?? 0` in the callback. Add a note: "`DB_VERSION` stays at 1; no `onupgradeneeded` change needed. Old rows lacking the new fields default to `recordingTimeOffsetMs = 0` in the upload-success callback."

---

### SF-6 — WS-B Playwright spec: `window.stop()` does not simulate tab kill (Axis 4)

**Plan section:** WS-B Playwright spec step 2; `tests/integration/wb-live-persist-tab-kill.spec.ts`

`window.stop()` halts pending resource loads but does **not** terminate the JS execution context or close the tab. It will not simulate `beforeunload`, `visibilitychange`, or `pagehide` events. The tab-kill scenario requires `context.close()` to close the browser context, then `browser.newContext() + page.goto()` to re-open. A test using `window.stop()` can pass even if tab-kill durability is broken.

**Plan fix:** Replace the spec's step 2 with: "`await context.close()` (closes the page without firing `End session`). Create a new context and navigate to the roster." Specify that the test-helper route `GET /api/test/whiteboard/[sessionId]/db-state` (test-env-only, gated on `process.env.NODE_ENV === 'test'` or `PLAYWRIGHT_TEST=1`) is used in step 5 to assert `WhiteboardEventBatch.count ≥ 1` without requiring a full UI re-open.

---

### SF-7 — WS-A Playwright spec: "direct Prisma in test setup" for DB assertions is unsafe (Axis 4)

**Plan section:** WS-A Playwright spec step 4; `tests/integration/wb-vad-per-speaker-durability.spec.ts`

"Query DB (test helper route or **direct Prisma in test setup**): ≥2 `SessionRecording` rows for `wbsid` before End click." Direct Prisma in Playwright test setup means the test file imports Prisma client and queries production-schema tables. This:
- Requires the test runner to have `DATABASE_URL` pointing at a test DB (already present for `test:wb-sync`) — acceptable.
- Bypasses ownership asserts (the query hits the DB directly, not through the API) — this could mask test-vs-production assertion divergence.
- Creates a maintenance coupling: if `SessionRecording` schema changes, tests fail at import time.

**Plan fix:** Specify a test helper route for all DB assertions in Playwright tests:
```
GET /api/test/whiteboard/[sessionId]/recording-count
Authorization: Bearer $PLAYWRIGHT_TEST_SECRET
Returns: { count: number, byStream: Record<string, number> }
```
This route is only compiled/registered in `process.env.NODE_ENV === 'test'`. The Playwright spec calls `page.evaluate(() => fetch('/api/test/...'))` or uses `request.get(…)` from the `APIRequestContext`. The route runs the Prisma query server-side with proper auth context. Add this route to the plan's WS-A file touch-points table.

---

### SF-8 — WS-B: `runServerPersist` failures are invisible to the tutor (Axis 5)

**Plan section:** WS-B §B1; `[wbp] action=error` log

The plan specifies `[wbp] action=error` logging on persist failures. But persist failures are silent from the tutor's perspective — they only discover durability was broken when they tab-kill and re-open to find missing strokes. The tutor cannot act on information they don't have.

**Plan fix:** Add to WS-B §B1 guardrails: "Track a `serverPersistConsecutiveFailures` counter. After ≥3 consecutive failures, surface a non-blocking `[wbp]`-keyed toast or the existing `checkpointStatus=error` indicator from `useWhiteboardRecorder` (reuse the same UI channel, different message: 'Backup save paused — strokes protected by local draft'). Reset counter on success. This is the same pattern as `checkpointStatus='error'` for the IDB path."

---

### SF-9 — Open questions: Q4 resolution contradicts removal of IDB version bump (Axis 3)

**Plan section:** Open questions Q4

Q4 says "Add fields in A3 + IDB store version bump (migration wave 0)." SF-5 above establishes the version bump is unnecessary and harmful. The open question is listed as "resolved" with the bump, but the resolution is wrong.

**Plan fix:** Update Q4 resolution to: "Add optional fields to `OutboxRow` TypeScript type only. No IDB schema migration needed — `DB_VERSION` remains 1. Existing rows without the new fields are handled by null-coalescing in the upload-success callback."

---

## NICE-to-have

---

### NICE-1 — C1 test spec: log-line assertion is fragile (Axis 4)

**Plan section:** WS-C Playwright spec step 4

"Assert no `wjg action=auto_end_fired` without live board mount" — this asserts an internal log prefix. Log format changes silently break the assertion. Better: `expect(page.locator('[data-testid="excalidraw-canvas"]')).not.toBeVisible()` before the review overlay appears. No coupling to log format.

---

### NICE-2 — WS-B Blob optional put rate limit risk (Axis 5)

Already covered in SF-3. If the optional Blob put is kept despite SF-3's recommendation, add to `docs/PLATFORM-ASSUMPTIONS.md`: "WS-B server persist: ≤3600 Vercel Blob `put` calls per session-hour at 1s intervals; check Vercel Blob rate limits and cost implications before shipping."

---

### NICE-3 — `assembleEndSessionSegments` type safety with new `OutboxRow` fields (Axis 3)

**Plan section:** WS-A §A3; `upload-outbox-instance.ts` L194–221

`assembleEndSessionSegments` maps `OutboxRow` to `EndSessionSegment`. The `EndSessionSegment` type (imported from `actions.ts`) does not include `recordingTimeOffsetMs` or `speakerId`. New plan adds these fields to `OutboxRow`. The mapper at L213–220 should explicitly list the fields it copies (not use spread `...r`). With spread, new `OutboxRow` fields silently appear in the `EndSessionSegment` payload. This is likely harmless (server ignores extra fields) but could surface as a TypeScript type error if `EndSessionSegment` is validated. Add plan note: "Update `assembleEndSessionSegments` mapper to use an explicit field list, not object spread, when copying `OutboxRow` to `EndSessionSegment`."

---

### NICE-4 — E4 spec: specify the replay interaction precisely (Axis 4)

**Plan section:** WS-E E4 Playwright spec

"Playwright replay with 2+ boards shows correct active tab over timeline scrub" — the spec doesn't describe the interaction. Specify: "Advance the replay scrubber to the timestamp when the tutor first navigated to page 2 (known from the `page-switch` event injected in the test). Assert that the `[data-testid='replay-board-tab-2']` element has `aria-selected='true'` and `[data-testid='replay-board-tab-1']` has `aria-selected='false'`."

---

## Open-questions validation

| # | Plan resolution | Assessment |
|---|---|---|
| Q1 | Worktree path `tutoring-notes-polishwt` — correct | OK |
| Q2 | A2 explicitly wires drain callback — correct | OK |
| Q3 | `streamId` on `SessionRecording` already exists; no migration for A2 tutor-mixdown path | OK — but see BLOCKER-3: the wiring path requires `OutboxConfig` extension |
| Q4 | "Add fields + IDB version bump" — **WRONG.** See SF-5 | Fix required |
| Q5 | 8s `REACHABLE_LOSS_DEBOUNCE_MS` — correct, do not re-open | OK |
| Q6 | Executor clone spike branch — reasonable workaround | OK |
| Q7 | Update stale checkpoint route comment in same PR — correct | OK |
| Q8 | "Verify at cut with `prisma migrate diff`" — correct | OK |
| Q9 | Out of scope unless Andrew revives — correct | OK |
| Q10 | `WB_EVENT_LOG_SCHEMA_VERSION` bump + replay player switch — correct | OK |

---

## Sequencing validation

The Gantt is correct for fragile-serial isolation. One gap:

**E3 declares "fragile-serial" but WS-A (A3) reads from `useLiveAV`'s peer state.** The Gantt shows WS-A completing before E3 starts (time 1–5 vs 8–10). If A3 is still in code review / integration when E3 starts, E3's changes to `useLiveAV.ts` (BUG-8 rejoin path) could conflict with A3's new peer-state read-path for `reconcileSpeakers`. The plan should add to the sequencing rule: "E3 must see A3's peer-state read-path before shipping BUG-8 rejoin fix; verify A3 + E3 integration with `test:wb-sync` after E3 lands (the `wb-sync` gate fires once at integrated tip anyway — no extra run needed)."

---

## Master-cut migration order validation

Steps 4 and 5 (deploy migrations then merge to master) are correct. Specific additions to the plan's cut checklist:

- **Add to Step 4:** "Run `prisma migrate diff --from-schema-datasource --to-schema-datamodel prisma/schema.prisma` against the Neon **production** branch to confirm exactly which migrations are pending (per Q8). Expected: `WhiteboardEventBatch` table create + `WhiteboardSession.lastPersistedBatchSeq` column add as the new additions on top of the existing ~19 pending migrations. If more show up, investigate before proceeding."
- **Add to Step 3 (master-cut smoke):** "Verify `[fzb]` logs appear in Vercel Function Logs after first End-and-review smoke. Verify `[wbp]` logs appear within 2s of first stroke after `Start recording`. If either is absent, the feature is not wired — block the cut."

---

## Summary for orchestrator

**5 BLOCKERs (fold into plan before any executor dispatch):**

| ID | Axis | One-line |
|---|---|---|
| BLOCKER-1 | Concurrency | `registerWhiteboardSessionAudioSegmentAction` orderIndex non-atomic → wrap in `db.$transaction` + add unique constraint |
| BLOCKER-2 | Durability | WS-B batchSeq 409 spec ambiguous → specify server UPSERT + client retry policy with cursor semantics |
| BLOCKER-3 | Fragile surface | `OutboxConfig` missing `onUploadSuccess` callback → add to interface spec before executor starts A2/A3 |
| BLOCKER-4 | Fragile surface | "Delete L637–645" includes the hard-stop safety valve at L628–635 → add precise keep/delete line labels |
| BLOCKER-5 | Fragile surface | C1 duplicates `endWhiteboardSession` transaction logic → C1 must CALL `endWhiteboardSession`, not re-implement it |

**9 SHOULD-FIXes (address per workstream before execution):**

| ID | When | One-line |
|---|---|---|
| SF-1 | Before WS-B dispatch | Add `persistInProgressRef` mutex for 1s tick + End flush race |
| SF-2 | Before WS-B dispatch | `boardDocumentJson` required on every batch, not periodic |
| SF-3 | Before WS-B dispatch | Remove optional Blob put from 1s persist path |
| SF-4 | Before WS-A dispatch | Specify VAD polling mechanism (meter RAF) + concrete safety cap constant |
| SF-5 | Before WS-A dispatch | Remove IDB version bump for optional fields (harmful, not needed) |
| SF-6 | Before WS-B spec authoring | Playwright tab-kill simulation: `context.close()` not `window.stop()` |
| SF-7 | Before WS-A spec authoring | Playwright DB assertions via test helper route, not direct Prisma |
| SF-8 | Before WS-B dispatch | Surface N-consecutive-persist-failure warning to tutor |
| SF-9 | Before migration wave 0 | Update Q4 open question resolution (IDB bump removed) |

**What the plan gets right (no changes needed):**
- Architecture diagram (A→B→C→D serial chain with parallel E bugs) correctly models the dependencies.
- Consent projection: all new capture lanes are gated on Block B snapshot; A3 consent check mirrors `resolveModeAwareAudioRecordingConsent`.
- Attribution chain: C-core `perspeaker-identity.ts` cherry-pick is the right mechanism; `transcriptionOnly` exclusion from replay is correct.
- `rolloverSegmentGapless()` as the sole VAD cut mechanism is correct — not inventing a parallel stop path.
- IDB-level deduplication on `(sessionId, streamId, segmentId)` prevents double-enqueue races.
- `endWhiteboardSession`'s `skipDuplicates` + `blobUrl` dedupe already handles A2's incremental rows at finalize time.
- iOS platform posture: "best-effort, validation pending hardware" is the right call given the pilot constraints; no iOS-proof gate is correct.
- `test:wb-sync` once at integrated tip (not per wave) is correct per AGENTS.md merge-boundary cadence.
