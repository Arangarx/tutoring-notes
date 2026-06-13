# Phase 1 — WB Reliability Floor: Detailed Executable Plan

> **Branch:** `phase1/wb-reliability-floor` (off `v1-redesign`)  
> **Program:** Experience-Driven Wedge — Phase 1 is the **GATE**; nothing above it ships until this is solid.  
> **Authored:** 2026-06-13 (planning pass — no source modified)  
> **Strategy root:** [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](../research/continuity-wedge-brainstorm-2026-06-12.md)  
> **Program roadmap:** `~/.cursor/plans/experience-driven_wedge_ae2776e1.plan.md`

---

## Context: what is and isn't done

The engine is already wired end-to-end. What Phase 1 is NOT is a rebuild. What it IS:

| Workstream | Status |
|---|---|
| Two-way live sync (tutor ↔ student) | ✅ Wired — unvalidated post-redesign |
| FSM + outbox + atomic end-session | ✅ Wired (Pillar 1/2/3) |
| In-shell review flip (A3) | ✅ Wired |
| Lazy replay + TutorNote reduce | ✅ Wired |
| Audio-clock surrogate (`performance.now()`) | ⚠️ KNOWN DEBT — documented in `WhiteboardWorkspaceClient.tsx` L306-311 |
| Waiting room (`mode="waiting"`) | 🔲 RESERVED STUB — comment says "future Phase" |
| `bothConnectedAt` timer-on-admit | ⚠️ WRONG — stamped at student link-open, not admit |

---

## Pre-existing test failure (do not count as a regression)

`sync-client.test.ts > broadcastSignal bypasses the scene throttle` fails deterministically (expects 1 broadcast, gets 2). `git diff 300ef0b HEAD src/lib/whiteboard/**` is empty — this predates the redesign and is NOT a Phase 1 task. Route to the WB-sync/live-AV thread.

---

## Workstream 1a — Baseline validation

### Purpose

Establish a known-good baseline for the post-redesign wired flow before building anything. Find any regressions that the `v1-design-system` chrome work may have introduced into the live session engine.

### What can be covered by automated harnesses

| Test | Tool | Notes |
|---|---|---|
| `npm run test:wb-sync` | Jest + Playwright hermetic relay | Verifies real-browser two-way sync invariants; currently green on Playwright half; one Jest failure pre-exists (see above) |
| Event log integrity (events < 500KB, `schemaVersion` present, `t` monotonic) | Jest (existing: `useWhiteboardRecorder.test.ts` + `event-log.test.ts`) | Run `npx jest --testPathPatterns "whiteboard"` |
| FSM state-machine invariants | Jest (`lifecycle-machine.test.ts`) | Pure function, no DOM |
| Outbox dedupe + drain | Jest (`upload-outbox.test.ts` — run `--runInBand`) | Pre-existing flakiness in parallel mode; use `--runInBand` |
| `endWhiteboardSession` atomic action | Jest (`endWhiteboardSession.test.ts`) | Needs local Neon/Postgres; skip on CI without DB |
| In-shell mode flip (live → review) | Jest DOM (`WhiteboardWorkspaceEnd.dom.test.tsx`) | Already covers the E1 no-navigation fix |

**Agent-runnable pre-check command:**
```
npx jest --runInBand --testPathPatterns "whiteboard|recording|lifecycle|outbox|upload"
```
Expected: all pass except the one pre-existing `broadcastSignal` failure.

### What REQUIRES Andrew's 2-device hardware smoke

The following CANNOT be covered by jsdom or the hermetic Playwright relay alone — they require real WebRTC, real microphone, real student device:

1. Tutor draws on one device → student sees stroke on another (real browser ↔ real browser via live Fly.io relay)
2. Student draws → tutor sees (asymmetric v2/v3 wire)
3. Tutor ends session → in-shell review mode flips → notes generate → save completes → replay available
4. Session timer starts when student opens link and shows correctly on tutor's screen
5. Both themes (light + dark) verified on the live workspace and review mode

### Smokebook stub

This stub conforms to [`docs/handoff/SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md).  
**Preview URL:** Must be fetched via Vercel MCP before smoke — `list_deployments` matching `meta.githubCommitRef=phase1/wb-reliability-floor`. Do not guess the hash.

---

# Phase 1a — WB Baseline Smoke Runbook (STUB)

**Branch:** `phase1/wb-reliability-floor`  
**Tip commit:** `[run git log -1 --format=%H to fill]`  
**Preview:** `<unverified — fetch from Vercel MCP: list_deployments → meta.githubCommitRef=phase1/wb-reliability-floor → https://<meta.branchAlias>>`

---

### 1. Automated harness — all green before smoke

**Action:** In a terminal on the branch, run:
```
npx jest --runInBand --testPathPatterns "whiteboard|recording|lifecycle|outbox|upload"
```

**Expect:** All pass except the one pre-existing `broadcastSignal` failure in `sync-client.test.ts`. Zero new failures.

**Ignore this run:** Pre-existing `broadcastSignal bypasses the scene throttle` failure (predates redesign, not a Phase 1 regression — confirmed by `git diff 300ef0b HEAD src/lib/whiteboard/**` = empty).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 2. Start + live sync — tutor draws, student sees (light theme)

**Action:** As tutor on device A (desktop Chrome), navigate to the Preview URL. Sign in as the pilot tutor account. Open a student and start a whiteboard session (consent acknowledged). Copy the student join link. On device B (phone or second desktop), open the student join link. On tutor device: draw 3 strokes on different areas of the canvas.

**Expect:** Within 1-2s, all 3 strokes appear on the student screen in approximately the same position. No console errors containing "CSP" or "sync". The sync indicator on the tutor toolbar shows connected.

**Ignore this run:** Laser position (L2/L3 deferred — re-smoke after WB interface unified). Student-to-tutor student-wand sync deferred.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 3. Student draws, tutor sees (light theme)

**Action:** Continuing from item 2. On student device B, draw 2 strokes on the canvas.

**Expect:** Within 1-2s, student strokes appear on tutor's canvas in a visually distinct color (tutor and student strokes are attributed differently). No freeze or blank-canvas events.

**Ignore this run:** Exact stroke position pixel-accuracy (viewport-sync regression bar is 5/5 PASS on `master` @ `750d494`; this item checks rough presence, not coordinate precision).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 4. Start + live sync — both themes

**Action:** Repeat items 2 and 3 with the app switched to **dark** theme (use the theme toggle in the top bar). Then switch back to **light** and confirm both themes work.

**Expect:** Canvas background, toolbar, and chrome update to dark theme. Stroke recording and sync still work. No "unreadable" text or blank areas introduced by the `@layer base` CSS fixes.

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 5. End session → in-shell review flip

**Action:** From an active session on the Preview, click **End session**. Observe what happens to the workspace tab.

**Expect:** The workspace tab does NOT navigate away. The tab URL stays the same. The view flips in-place to the review mode showing the session notes panel and a "Generate notes" / session info section. No window.confirm or browser alert. Console shows `[nsi]` log lines for the session-note transition.

**Ignore this run:** Phase B polish (loading state, end-confirmation modal) — both deferred per ORCHESTRATOR-STATE.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 6. AI notes generation + save

**Action:** After the in-shell review flip (item 5), click "Generate notes" (or equivalent — the `triggerNotesGenerationAction` trigger). Wait for the notes to appear. Edit one word. Click Save.

**Expect:** Notes appear in the panel within ~30s (Whisper transcription + reduction). Edit is reflected. Save succeeds (no error toast). Navigating to the student's session detail page (outside the workspace) shows the saved note.

**Ignore this run:** Note quality (accuracy of the reduction — this is a Phase 3 concern, not a Phase 1 blocker). The `durationMs null on Vercel` known issue (ffmpeg probe in serverless) may affect some metadata display — not a blocker.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 7. Lazy replay

**Action:** After the session note is saved (item 6), scroll to the "Replay" section of the review page (inside the shell). Click the replay play button.

**Expect:** Replay starts. Strokes appear on the canvas in time with the audio. Audio plays. Scrubbing works (approximate — the R1/R2 multi-segment player regression is a separate thread). For a short session with a single audio segment, audio + strokes stay in sync throughout.

**Ignore this run:** R1/R2 multi-segment scrub regression (dedicated fix thread, not Phase 1). Drift measurement requires a separate 50-min harness (1b task).

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

### 8. Session timer — starts on student join, survives student disconnect

**Action:** Start a fresh session. Observe the session timer on the tutor's workspace. Have the student open the join link. Observe the timer start. Have the student briefly close and reopen the tab.

**Expect:** Timer shows "Waiting for student" until the student opens the link. Timer starts counting after the student joins. When the student briefly disconnects and reconnects, the timer does NOT reset — it continues from where it was (per Sarah's explicit stated expectation: "I've just never had the counter start over").

**Ignore this run:** Nothing.

- [ ] PASS
- [ ] FAIL
- [ ] SKIP

**Notes:**

---

## Overall result

- [ ] PASS
- [ ] FAIL

---

*(End of 1a smokebook stub)*

---

## Workstream 1b — Audio-clock fix

### The problem (confirmed in code)

`WhiteboardWorkspaceClient.tsx`, lines 305-330:

```typescript
// File: src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx
// Lines 305-330

/**
 * Audio-clock surrogate. The plan calls for `MediaRecorder.getElapsedAudioMs()`
 * (blocker #2) — the audio recorder doesn't expose that yet (tracked
 * in `docs/BACKLOG.md` "Reliability gaps"). Until it lands, we drive
 * `getAudioMs` off `performance.now()` deltas, accumulating across
 * pauses. ms precision; doesn't account for iOS background-tab clock
 * throttling (the BACKLOG item covers that follow-up).
 */
function useAudioMsClock(active: boolean): () => number {
  const startedAtRef = useRef<number | null>(null);
  const accruedMsRef = useRef(0);
  useEffect(() => {
    if (active) {
      startedAtRef.current = performance.now();
    } else if (startedAtRef.current !== null) {
      accruedMsRef.current += performance.now() - startedAtRef.current;
      startedAtRef.current = null;
    }
  }, [active]);
  return useCallback(() => {
    if (startedAtRef.current === null) return Math.floor(accruedMsRef.current);
    return Math.floor(
      accruedMsRef.current + (performance.now() - startedAtRef.current)
    );
  }, []);
}
```

**Why this drifts:** `performance.now()` runs at the OS scheduler rate. On iOS when the browser tab is backgrounded:
- iOS throttles JS execution and `performance.now()` advancement (to save battery)
- The MediaRecorder however records at hardware audio rate (the iOS audio system does not throttle)
- Consequently, after a backgrounded period, `performance.now()` reads LESS elapsed time than the audio actually contains
- Stroke `t` values are therefore SMALLER than their true audio position
- On replay: strokes appear too early relative to the audio (audio has advanced more than strokes show)

This is plan blocker #2 from `docs/WHITEBOARD-STATUS.md` (adversarial review item 2).

**Drift magnitude:** iOS background throttling can skip tens of milliseconds per minute. Over a 50-minute session where the student backgrounds their tab for 5 minutes: potentially 1-5 seconds of drift, making replay unwatchable at the affected segments.

### Drift threshold

Target: **< 250ms over 50 minutes** (per the program roadmap). This is a looser bound than the original "< 100ms" from the adversarial review, reflecting the challenge of eliminating all OS-level sources. < 250ms is imperceptible to a user reviewing a replay.

### The fix

#### Why `AudioContext.currentTime` is the right clock

`AudioContext.currentTime` is driven by the Web Audio hardware scheduler, not the OS job scheduler:

1. It runs at sample-accurate precision (44100 Hz granularity)
2. On iOS, it matches the physical hardware audio timeline — it does NOT slow down when the tab is backgrounded, because the audio subsystem is still running
3. It is the same clock that drives the `recordingStream`'s MediaRecorder input (the stream goes through the AudioContext graph)

The `AudioContext` is already created in `src/lib/mic-recorder-audio.ts` at `createMicAudioGraph` (line 118). Currently it is NOT exposed through the `MicAudioGraph` interface.

#### Three-file change

**File 1: `src/lib/mic-recorder-audio.ts`**

Add `getAudioContextElapsedMs: () => number` to the `MicAudioGraph` interface and implement it:

```typescript
// In MicAudioGraph type (after line 104):
/**
 * Returns elapsed milliseconds since the AudioContext was created,
 * based on AudioContext.currentTime (hardware clock, not JS scheduler).
 * Callers must handle the accumulation-across-pauses pattern themselves
 * if they want a pause-aware elapsed — this is the raw AudioContext clock.
 */
getAudioContextElapsedMs: () => number;
```

Implementation (in `createMicAudioGraph`, after `const audioContext = new AudioContext()`):
```typescript
// Capture the audioContext creation time once; all elapsedMs calls
// are relative to this anchor (not relative to when recording started).
const ctxCreatedAt = audioContext.currentTime;
```
Return from the factory:
```typescript
getAudioContextElapsedMs: () =>
  Math.floor((audioContext.currentTime - ctxCreatedAt) * 1000),
```

**File 2: `src/hooks/useAudioRecorder.ts`**

Add `getAudioMs: () => number` to `UseAudioRecorderReturn` (new field — backward compatible, existing callers don't need to use it).

Internally: store a ref to the graph's `getAudioContextElapsedMs`. Implement the accumulation-across-pauses pattern analogous to the current `useAudioMsClock` but using the AudioContext clock:

```typescript
// New field in UseAudioRecorderReturn:
/**
 * Pause-aware audio-clock getter backed by AudioContext.currentTime.
 * Returns elapsed recording-active milliseconds (0 when not yet started).
 * Use this instead of performance.now()-based surrogates for WB event `t`.
 */
getAudioMs: () => number;
```

Implementation adds two refs in `useAudioRecorder`:
- `audioContextAccruedMsRef`: total ms accumulated from all completed recording intervals
- `audioContextActiveStartMsRef`: the `getAudioContextElapsedMs()` reading when the current recording interval started (null when not active)

These are updated in the same `active`-state-change effect where `startedAtRef` is currently managed. The `getAudioMs` callback returns `audioContextAccruedMsRef + (getAudioContextElapsedMs() - audioContextActiveStartMsRef)` when active, or just `audioContextAccruedMsRef` when paused.

**Fallback:** if `graphRef.current` is null (mic not yet acquired), fall back to `performance.now()` deltas — this preserves the current behavior during the pre-mic period (before `handleStartRecording` succeeds).

**File 3: `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx`**

Replace the `getAudioMs` local derivation:

```typescript
// Current (lines 1858-1860):
const getAudioMs = useAudioMsClock(recordingActive);

// New:
const getAudioMs = audioRecorder.getAudioMs;
// (delete useAudioMsClock entirely — it becomes dead code)
```

The `audioRecorder` variable already holds the `useAudioRecorder(...)` return value (lines ~1730-1740 area). Adding `getAudioMs` to that return and consuming it here is a one-line change.

### Drift threshold verification test (agent-runnable)

**The challenge:** jsdom does not implement Web Audio API — `new AudioContext()` throws in jsdom. Real timing cannot be injected via jest fake timers because `AudioContext.currentTime` is a read-only property on the real object.

**Approach: injectable clock interface (no jsdom AudioContext)**

The fix introduces an abstraction layer:

```typescript
// New type in mic-recorder-audio.ts or a shared types file:
export type AudioClockSource = {
  /** Returns elapsed ms on the hardware audio clock. */
  getElapsedMs: () => number;
};
```

`useAudioRecorder` accepts an optional `_clockSourceOverride?: AudioClockSource` in its options for testing. In production, the clock source is derived from `graph.getAudioContextElapsedMs`.

**Test file:** `src/__tests__/recording/audio-clock-alignment.test.ts`

Test structure:
1. Create a mock `AudioClockSource` with a manually-advanceable `currentMs` ref
2. Mount `useAudioRecorder` (via `renderHook`) with the mock clock source injected
3. Simulate recording start (flip `recordingActive` to true)
4. Advance the mock audio clock by 10,000ms
5. Simultaneously advance `jest.fakeTimers` by a DIFFERENT amount (e.g. 11,500ms) — simulating iOS clock drift
6. Call a stroke-record action and capture the `t` value
7. **Oracle assertion:** `t === 10000` (follows audio clock, NOT performance.now())
8. Simulate a pause → advance audio clock 5000ms → resume → advance 3000ms
9. Assert total `getAudioMs()` = 13000ms (accumulated correctly across pause)

This test has zero hardware/real-browser dependency and can run in CI. The injected clock replaces `performance.now()` at the source, making the oracle independent of the implementation.

### Additional verification: replay drift measurement harness

For the **< 250ms over 50 min** threshold claim:

**File:** `src/__tests__/recording/replay-drift-50min.test.ts`

Test: simulate a 50-minute "session" by injecting 180,000 stroke events at 100ms intervals, each stamped from the mock AudioContext clock. Introduce a simulated iOS background period (audio clock advances at 1x, `performance.now()` advances at 0.3x for 10 minutes). Verify the max |`t` - expected audio position| < 250ms across all events. This test runs in well under a second since it's pure data manipulation with no DOM.

### Acceptance criteria for 1b

- [ ] `src/__tests__/recording/audio-clock-alignment.test.ts` green (new)
- [ ] `src/__tests__/recording/replay-drift-50min.test.ts` green (new)  
- [ ] `npx jest --runInBand --testPathPatterns "whiteboard|recording"` all green (no regressions)
- [ ] Manual replay smoke (part of 1a smoke or a dedicated 1b smoke item): 30-min session, replay stays visually in-sync through the whole recording
- [ ] `performance.now()` no longer appears in the `getAudioMs` call path (grep audit)

### Founding-constraint flag for 1b

No schema changes. No new egress. The AudioContext is a browser-internal resource — no CSP change needed. This fix does NOT foreclose any future marketplace/portability constraints.

---

## Workstream 1c — Thin waiting room

### What "thin" means here

Authenticated learner login and session invite management are **explicitly deferred**. The thin waiting room stays on the existing **anonymous-token flow** (`/w/[joinToken]`) — the student's auth story doesn't change. What we're fixing:

1. **Student lands in a visual "waiting" state** before the tutor admits them
2. **`bothConnectedAt` is stamped at admit, not at link-open** (currently stamped the moment the student opens the URL — this is incorrect per Sarah's timer expectation)
3. **Tutor gets an "Admit" affordance** in the workspace before starting the session
4. **Timer starts on admit** — the already-wired `GET /api/whiteboard/[id]/timer-anchor` polling mechanism just works once `bothConnectedAt` is set at the right time

### Current behavior (code confirmed)

`src/app/w/[joinToken]/page.tsx`, lines 93-99:
```typescript
// Stamps bothConnectedAt the moment the student opens the link.
// This is WRONG for a waiting room — it should be stamped at admit.
await db.whiteboardSession.updateMany({
  where: { id: tokenRow.whiteboardSessionId, bothConnectedAt: null },
  data: { bothConnectedAt: now },
});
```

### Proposed architecture (4-file change surface)

**Signaling approach:** DB polling (not relay-based).  
Rationale: Using the sync relay for admit signaling would require the student to connect to the relay room BEFORE being admitted, which would flip `everHadParticipants` in the FSM prematurely. DB polling with a 3s interval avoids this entirely — student joins the relay room only after the tutor admits.

#### Step 1: Remove the premature `bothConnectedAt` stamp

**File: `src/app/w/[joinToken]/page.tsx`**

Remove lines 93-99 (the `db.whiteboardSession.updateMany` that stamps `bothConnectedAt`). The student page no longer stamps the timestamp — only the tutor's admit action does.

Pass a new prop to `StudentWhiteboardClient`: `isAdmitted: false` initially.

#### Step 2: Student waiting room UI

**File: `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`**

Add a "waiting" display mode. When `isAdmitted = false`, the student sees a waiting screen ("Your tutor will let you in shortly"). The student polls `GET /api/whiteboard/[sessionId]/admission-status` every 3 seconds. When the endpoint returns `{ admitted: true }`, the student transitions to the live board (connects to sync relay, full Excalidraw loads).

**New API route: `src/app/api/whiteboard/[sessionId]/admission-status/route.ts`**

Auth: gated by the joinToken (sent as a query param or header) — the student is not an authenticated user. Returns `{ admitted: boolean }` based on whether `bothConnectedAt` is set on the session row.

**Security note:** the student's knowledge of the joinToken already proves they're the intended student. This endpoint only reveals whether the session has been admitted, not any PII — safe to gate on token.

#### Step 3: Tutor waiting room + Admit button

**File: `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell.tsx`**

Current:
```typescript
type ShellMode = "live" | "review";
```

New:
```typescript
type ShellMode = "waiting" | "live" | "review";
```

The shell detects "is there a student waiting?" by reading from a prop or polling the admission status endpoint. Tutor's initial mode is determined by server-fetched `bothConnectedAt === null`:

- `bothConnectedAt === null && !sessionEnded` → `mode = "waiting"`
- `bothConnectedAt !== null && !sessionEnded` → `mode = "live"` (direct start, or already admitted)
- `sessionEnded` → `mode = "review"`

The **waiting mode render** (replaces the current `"waiting"` stub comment):
- Shows a minimal "Student is waiting to be admitted" panel
- Has an **Admit** button
- The `WorkspaceResumeGate` / `WhiteboardWorkspaceClient` are NOT mounted yet (key for FSM: `everHadParticipants` stays false, recording not armed)

**Admit button handler:** calls `admitStudentAction(whiteboardSessionId)` (new server action), then transitions `mode → "live"`.

#### Step 4: New server action

**File: `src/app/admin/students/[id]/whiteboard/actions.ts`**

```typescript
export async function admitStudentAction(whiteboardSessionId: string) {
  const session = await assertOwnedSession(whiteboardSessionId); // ownership check
  await db.whiteboardSession.update({
    where: { id: whiteboardSessionId },
    data: { bothConnectedAt: new Date() },
  });
  console.log(`[nsi] wbsid=${whiteboardSessionId} action=student_admitted`);
}
```

**Ownership assertion:** `assertOwnedSession` must run `assertOwnsStudent(adminUserId, session.studentId)` — same pattern as all other whiteboard server actions.

### FSM / timer perturbation analysis

| FSM Input | Current behavior | After 1c | Risk |
|---|---|---|---|
| `participants` | Flips to non-empty when student joins relay (at link-open) | Stays empty until after admit (student joins relay only after admit) | ✅ Correct — `everHadParticipants` latch does not flip prematurely |
| `everHadParticipants` latch | Flips at student link-open | Flips at student relay-join (post-admit) | ✅ No regression — just delayed |
| `audioClockMs` / `wbClockMs` | Starts when FSM enters `recording` | Unchanged — FSM doesn't change | ✅ No regression |
| `bothConnectedAt` (session timer) | Stamped at student link-open | Stamped at tutor admit action | ✅ This IS the fix — timer now starts at the right moment |
| `endWhiteboardSession` step order | Steps 1-8 per RECORDER-LIFECYCLE.md | Unchanged — tutor can End from waiting mode (session never started recording) | ⚠️ See note below |

**End from waiting mode:** if the tutor clicks End Session while in `mode="waiting"` (before admitting), the `handleEndSession` flow runs. Since `WhiteboardWorkspaceClient` was never mounted, `userWantsRecording` was never set to true. The outbox is empty. `drainOutboxOrTimeout` returns immediately. `assembleEndSessionSegments` returns []. `endWhiteboardSession` runs with no segments — valid (just stamps `endedAt`, no audio to register). The shell transitions to `mode="review"`. This is safe and correct.

**One concern (flag, don't block):** the current DB schema has `bothConnectedAt` as nullable, set on first student join. A waiting room where the tutor admits means `bothConnectedAt` can now be set by the TUTOR (via `admitStudentAction`) rather than only by the student's page. This is a semantic change in who sets it — architecturally fine, but worth noting in the commit message.

### Consent input thread

The waiting room shell (`mode="waiting"`) is shown BEFORE `WhiteboardWorkspaceClient` mounts. The `StartWhiteboardSession` consent modal (which gates session creation) has already fired BEFORE the tutor shares the join link — session creation requires consent acknowledgment. So the waiting room is AFTER consent and AFTER session creation. No consent perturbation.

### Engagement-ready schema flag (founding constraint)

Phase 1 thin waiting room doesn't add new schema, but flag this for Phase 4 (instrumentation): the time delta between `studentJoinedAt` (when student opened the link) and `bothConnectedAt` (when tutor admitted) is a useful **waiting room latency metric**. If Phase 4 wants this, it needs a `studentJoinedAt` column added (additive migration). Phase 1 doesn't need it, but don't foreclose it — if implementing the admission-status API, consider logging `[nsi] wbsid=... action=student_arrived_waiting` as a soft signal without a new DB column for now.

### CSP note

The new `/api/whiteboard/[sessionId]/admission-status` route is same-origin. No new external origins. No CSP change.

### New per-session ID logging

Add `wt=<short>` prefix (waiting-room transition) for the admit lifecycle:
- `[wt] wbsid=<id> action=student_arrived` (when student enters waiting poll)
- `[wt] wbsid=<id> action=student_admitted tutor=<adminId>` (when admit action fires)
- `[wt] wbsid=<id> action=student_transitioned_to_live` (when student poll detects admitted)

Register `wt` in the AGENTS.md prefix registry.

### Test/verification strategy for 1c

**Agent-runnable:**
- Server action test: `admitStudentAction` stamps `bothConnectedAt` and asserts ownership (extends `endWhiteboardSession.test.ts` pattern)
- API route test: `GET /api/whiteboard/[sessionId]/admission-status` returns `{ admitted: false }` when `bothConnectedAt === null`, `{ admitted: true }` after
- DOM test: `WhiteboardSessionShell` renders waiting mode when `bothConnectedAt === null`, transitions to live mode after admit (mock the server action)

**Requires Andrew's 2-device smoke:**
- Student opens join link → sees waiting UI
- Tutor clicks Admit → session timer starts → student transitions to live board
- Session timer on tutor side starts after admit (NOT at link-open)
- End session from waiting mode: session ends cleanly with no audio, no error

### Acceptance criteria for 1c

- [ ] Student sees "waiting" UI when they open the join link
- [ ] Tutor sees "Student is waiting" affordance and Admit button
- [ ] Session timer starts only after Admit (not at link-open)  
- [ ] `bothConnectedAt` is null until Admit fires (confirmed in DB)
- [ ] FSM `everHadParticipants` latch is not prematurely set (no relay join before admit)
- [ ] End from waiting mode works cleanly (no error, no audio loss, session ends)
- [ ] Ownership assertion in `admitStudentAction` verified (test)
- [ ] No regression in `npx jest --runInBand --testPathPatterns "whiteboard|shell"`

---

## Workstream 1d — Validate save segmentation + same-WB-page notes review

### Status: ALREADY WIRED — confirm, don't rebuild

The save segmentation + in-shell notes review is the combined Phase 1b (outbox + atomic end) + A3 (in-shell flip) work that was shipped to `v1-redesign` in smoke round 1. Per RECORDER-LIFECYCLE.md, `handleEndSession` steps 1-8 are load-bearing and ordered.

**DO NOT reorder `handleEndSession` steps.** The order is:
1. `setUserWantsRecording(false)` → FSM stops capture
2. `drainOutboxOrTimeout(wbsid, 15s)` → all in-flight uploads land
3. `assembleEndSessionSegments(wbsid)` → deterministic segment list
4. `uploadWhiteboardEvents({...})` → canonical events.json to Vercel Blob
5. `generateSessionSnapshotPng(api)` → best-effort, never blocks step 6
6. `endWhiteboardSession(wbsid, eventsBlobUrl, { segments, snapshotBlobUrl? })` → atomic DB transaction
7. `finalizeOutboxAfterEnd(wbsid)` → drop IDB rows
8. `onSessionEnded?.()` → shell flips `mode="review"`

### What to verify (agent-runnable)

All existing tests for these flows should still be green after Phase 1b and 1c changes:

```
npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"
```

Expected: all pass (these were green at smoke round 1 merge `5922c6f` + `27ac5db`).

### What to verify (2-device hardware smoke, part of 1a smoke)

Items 5 and 6 of the 1a smokebook above cover this:
- Item 5: end → in-shell flip (no navigation)
- Item 6: notes generate → save → persisted

Additional targeted check:

**Segmentation verification:** After a session with ≥ 2 auto-rollover segments (record for > the segment max duration), the review page should show all audio segments playable in sequence. Confirm `SessionRecording` rows in DB match the number of segments.

**Same-WB-page notes review:** the in-shell review renders the notes panel alongside a read-only view of the final whiteboard state (the `WorkspacePreviousSessionPreview` or equivalent in `SessionReviewMode`). Confirm: notes panel is visible; whiteboard canvas shows the last-frame state; no blank canvas.

### Acceptance criteria for 1d

- [ ] `npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"` green
- [ ] 2-device smoke: end → in-shell flip → notes → save → persisted (items 5-6 of 1a smokebook)
- [ ] Session with ≥ 2 segments plays all audio in sequence
- [ ] `handleEndSession` step order NOT changed (lint: read the function before any edit)

---

## Founding-constraint audit (cross-cutting)

These are the constraints that must not be foreclosed by any Phase 1 decision, per the program roadmap's "Founding constraints":

| Constraint | Phase 1 status | Notes |
|---|---|---|
| Record portable to future/next tutor | ✅ Not foreclosed | Schema has `adminUserId` + `studentId` separately; `endWhiteboardSession` writes per `whiteboardSessionId`; no tutor-specific lock-in |
| Account/record persists free through dormancy | ✅ Not foreclosed | Phase 1 adds no forced-expiry or paused-account deletion logic |
| Event schema engagement-ready (effort/coverage signals from session 1) | ⚠️ Partial — flag | Stroke events carry `clientId` tags (author attribution) and `t` (timing) — enough for effort/coverage analytics. 1c's `bothConnectedAt` at admit-time gives a real session-duration anchor. **Flag:** Phase 4 instrumentation should use `bothConnectedAt` - `endedAt` delta as the canonical session-length signal. |
| Egress keyed on learner type | ✅ Not affected | Phase 1 adds no analytics egress |
| Migrations additive | ✅ Honored | No schema changes in 1a/1b/1d. 1c makes no DB schema changes (only behavior change in when `bothConnectedAt` is set) |
| Server actions assert ownership | ✅ Required | `admitStudentAction` (1c) MUST call `assertOwnsStudent` — this is in the plan above |
| CSP stays tight | ✅ No new origins | 1a-1d add no external origins |

**One potential foreclosure risk (flag, not block):** if Phase 4 wants `studentJoinedAt` (time the student opened the link, separate from `bothConnectedAt` which is now admit-time), Phase 1 no longer records that. Consider logging `[wt] wbsid=... action=student_arrived` without a DB column as a soft signal that Phase 4 can later persist if the metric proves useful. **Do not add the column in Phase 1 — wait for Phase 4's instrumentation design.**

---

## 5-Axis reliability review (Phase 1 acceptance gate)

Per `docs/WHITEBOARD-STATUS.md` adversarial review and the `reliability-bar.mdc` rule:

| Axis | Workstream 1b | Workstream 1c | Overall risk |
|---|---|---|---|
| **Data loss** | Low — clock fix doesn't affect the outbox/atomic-end pipeline | Low — End from waiting mode drains an empty outbox cleanly | Low |
| **Crash recovery** | No change to IDB checkpoint logic | No change — waiting mode is pre-session, no checkpoint to recover | Low |
| **Sync fidelity** | No change to sync client | Student deferred from relay until admitted — net improvement (no phantom peers) | Low |
| **Replay accuracy** | HIGH GAIN — fixes the core drift source | No change | High gain, low risk |
| **Availability (tutor flow)** | Low — clock fix is opt-in fallback path; if AudioContext null → falls back to performance.now() | Medium — new code path for admit; test thoroughly | Monitor with 2-device smoke |

**BLOCKERs that must be resolved before 1c ships:**

1. **B1c-1:** `admitStudentAction` ownership assertion must pass the same ownership model as `endWhiteboardSession`. Test first.
2. **B1c-2:** student polling must not create an observable "admission denial" race where the student connects to the relay before the FSM has finished transitioning. Enforce: student ONLY connects to relay after the admission-status endpoint returns `admitted: true` AND the `bothConnectedAt` DB write has committed. (The DB write is synchronous in `admitStudentAction` before it returns — this is safe with polling; not safe if using push/websocket with optimistic update.)
3. **B1c-3:** the 3s poll interval adds a maximum 3s admission latency. Acceptable for a pilot-stage thin waiting room. Flag in the smoke runbook as expected behavior.

---

## Sequencing recommendation

### HARD sequencing constraint

**1a → 1b → 1c (in order). Do NOT start 1c before 1a smoke confirms a known-good baseline.**

Rationale:

- **1c modifies the session initiation flow** (`/w/[joinToken]/page.tsx` + `WhiteboardSessionShell.tsx`). These files are coupled to the FSM, timer, and end-session flow. Any pre-existing regression that 1c masks would be invisible without a prior baseline.
- **1b is safer to run in parallel with 1a baseline prep** because the clock fix is isolated to 3 files (`mic-recorder-audio.ts`, `useAudioRecorder.ts`, `WhiteboardWorkspaceClient.tsx`) and adds only new code paths with fallback.
- **1d runs concurrently with 1a verification** — it's validation, not new code. The 1d tests should be green before 1a smoke to confirm the save pipeline is working.

### Recommended execution order

```
Night 1 (agent-runnable, no hardware):
  1. Run automated baseline: npx jest --runInBand --testPathPatterns "whiteboard|recording"
  2. Build + lint check: npx next build (verify no build regressions on branch)
  3. 1b: implement audio-clock fix (3 files) + new tests
  4. Confirm 1d existing tests still green

Night 2 (requires Andrew's 2-device smoke):
  5. Andrew runs 1a smokebook items 1-8 on the Preview
  6. Andrew confirms 1d (items 5-6 of 1a smoke)
  7. If 1a + 1d PASS: proceed to 1c build

Night 3 (agent-runnable + hardware):
  8. 1c: implement thin waiting room (4 files) + server-action tests
  9. Andrew runs 1c hardware smoke (waiting room → admit → live → end)
```

**CRITICAL:** If 1a smoke reveals regressions (e.g. broken two-way sync, broken in-shell flip), STOP and fix regressions before 1b or 1c work begins. The baseline must be clean.

---

## Summary and execution checklist

### What this plan covers

| | |
|---|---|
| **1a** | Baseline validation — 2-device hardware smoke + automated harness. Defines the known-good floor. |
| **1b** | Audio-clock fix — replaces `performance.now()` surrogate with `AudioContext.currentTime`. Three files, agent-runnable unit tests, < 250ms drift proof. |
| **1c** | Thin waiting room — adds `"waiting"` shell mode, admit button, corrects `bothConnectedAt` timing. Four files, FSM/timer fully analyzed. |
| **1d** | Save segmentation + notes review validation — confirm existing pipeline, no code changes. |

### Safe to execute tonight (agent, no hardware)

1. `npx jest --runInBand --testPathPatterns "whiteboard|recording"` — baseline check (10min)
2. `npx next build` — build-surface sanity (5min)
3. **1b implementation:** `src/lib/mic-recorder-audio.ts` + `src/hooks/useAudioRecorder.ts` + `WhiteboardWorkspaceClient.tsx` + 2 new test files — clock fix + drift proof
4. **1d test pass:** `npx jest --runInBand --testPathPatterns "endWhiteboardSession|upload-outbox|AudioBridge|WhiteboardWorkspaceEnd"` — confirm save pipeline green
5. Commit the above to branch with message referencing this plan

### Must wait for Andrew's 2-device hardware smoke

- All 8 items in the 1a smokebook (items 2-8 require real devices + live relay)
- 1d segmentation + notes-review validation (items 5-6 of 1a smokebook)
- 1c hardware smoke (waiting room → admit → session timer → end)

### Open decisions for Andrew

1. **1c scope: sync-relay vs. DB-poll for admit signaling.** This plan proposes DB polling (3s interval). Alternative: tutor broadcasts "admit" via the sync relay and student receives it. DB-poll is simpler and avoids the premature-relay-join FSM risk. Recommend: go with DB-poll unless Andrew wants sub-second admit latency (pilot stage doesn't need it).

2. **1c scope: should the waiting room show a live "student is here" indicator on the tutor side?** Currently proposed: the `WhiteboardSessionShell` detects `bothConnectedAt === null` at page load (server-rendered). If the student arrives AFTER the tutor has already loaded the workspace, the tutor's waiting screen won't update until either (a) the tutor refreshes, or (b) the tutor-side also polls. For a thin waiting room, option (a) is acceptable at pilot scale. Flag this if Sarah complains the tutor can't tell when a student has arrived.

3. **1b: AudioContext fallback threshold.** The plan says: fall back to `performance.now()` if the AudioContext graph is not yet built (pre-mic-acquire). This covers the edge case where a session starts recording before the mic is acquired (unlikely but possible in the FSM's `solo` mode). Confirm this fallback behavior is acceptable.

4. **1a smoke: should the baseline smoke include PDF upload, math editor, Desmos embed?** These are wired in the engine and were smoked in smoke round 1. This plan focuses 1a smoke on the sync+record+end flow. The broader regression test (including PDF/math/Desmos) should be part of the pre-master comprehensive smoke, not the Phase 1a targeted smoke. Confirm.
