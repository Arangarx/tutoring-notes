# Phase 1 WB Reliability Floor — 5-Axis Adversarial Review

> **Branch:** `phase1/wb-reliability-floor`  
> **Plan reviewed:** [`docs/handoff/phase-1-wb-floor-plan-2026-06-13.md`](phase-1-wb-floor-plan-2026-06-13.md)  
> **Reliability standard:** `reliability-bar.mdc` (found at `C:/Users/arang/Documents/Andrew/dev/agenticPipeline/.cursor/rules/reliability-bar.mdc` — **not** at the AGENTS.md-referenced path `../../agenticPipeline/.cursor/rules/reliability-bar.mdc`, which resolves to a non-existent directory from the workspace root; the file was located by searching the sibling directory at `C:/Users/arang/Documents/Andrew/dev/agenticPipeline/`; reviewers on a fresh machine should verify this path)  
> **Strategy doc:** [`docs/research/continuity-wedge-brainstorm-2026-06-12.md`](../research/continuity-wedge-brainstorm-2026-06-12.md)  
> **Reviewer posture:** Independent adversarial. No cheerleading.  
> **Authored:** 2026-06-13

---

## Preface: what the review found

The plan is technically detailed and has done genuine work — sequencing, FSM analysis, code citations that check out, and a reasonable implementation path. It is NOT a vague "things to think about" bullet list. Specifically: the `handleEndSession` step ordering is faithfully copied from the real code, the `bothConnectedAt` bug is real (confirmed in `src/app/w/[joinToken]/page.tsx` lines 93-99), and the `useAudioMsClock` / `performance.now()` problem is real and documented in the source code.

Where the plan goes wrong is in being _optimistically credulous_ about its own hardware assumptions and architecturally incomplete on 1c's mechanics. Two areas will cause problems at execution time if not resolved first: a core technical claim about iOS AudioContext behavior that is unverified and may be false, and a mechanical gap in the waiting-room End-session flow.

---

## Code verification summary

All plan assertions checked against the actual source:

| Plan claim | Code truth |
|---|---|
| `useAudioMsClock` uses `performance.now()` | ✅ Confirmed — `WhiteboardWorkspaceClient.tsx` L313-330 |
| `getAudioMs = useAudioMsClock(recordingActive)` at ~L1860 | ✅ Confirmed — L1860 |
| `bothConnectedAt` stamped on student link-open (`/w/[joinToken]/page.tsx` L93-99) | ✅ Confirmed — exact lines match |
| `MicAudioGraph` does NOT currently expose `getAudioContextElapsedMs` | ✅ Confirmed — `src/lib/mic-recorder-audio.ts` interface has no elapsed-ms method |
| `WhiteboardSessionShell` has only `"live" | "review"` modes, no `"waiting"` | ✅ Confirmed — L34: `type ShellMode = "live" | "review"` |
| `WhiteboardWorkspaceClient` does NOT use `bothConnectedAtIso` for the timer | ✅ Confirmed — L2660: `void bothConnectedAtIso; // kept on the prop boundary for SSR; not used here` |
| `handleEndSession` is defined INSIDE `WhiteboardWorkspaceClient` | ✅ Confirmed — L2884 inside the component function |
| `ShellMode="waiting"` described in shell's comment as "reserved for a future Phase" | ✅ Confirmed — shell comment L20: "waiting room ('waiting' mode, A5 or later)" |
| `createMicAudioGraph` calls `await audioContext.resume()` after creation | ✅ Confirmed — `mic-recorder-audio.ts` L118-119 |
| `useAudioRecorder` does NOT currently expose `getAudioMs` | ✅ Confirmed — `UseAudioRecorderReturn` type has no `getAudioMs` field |

---

## Axis 1 — Data Durability

**Scope:** crash recovery, refresh during session, outbox drain, segment ordering.

### Assessment

The audio outbox pipeline (IDB → upload → `endWhiteboardSession` atomic transaction) is **not changed** by 1a, 1b, or 1d. The plan is correct to call this "validate, don't rebuild." The step-order analysis in the plan faithfully matches `RECORDER-LIFECYCLE.md`.

The one new data path is 1c: `admitStudentAction` writes `bothConnectedAt`. This is a simple DB update (not audio data), and writing the wrong `bothConnectedAt` would at worst corrupt the session timer (showing wrong duration), not lose audio.

**End from waiting mode**: The plan analyzes this path as "safe — outbox empty, `endWhiteboardSession` runs with no segments." This analysis is conceptually correct but **depends on an End button existing in waiting mode that doesn't exist in the current architecture**. See B2 (Axis 3).

**IDB crash recovery** is unaffected by all of Phase 1.

### Findings

> **SHOULD-FIX S1:** The plan's acceptance criterion for 1d says "Session with ≥ 2 segments plays all audio in sequence." This requires a session with a rollover. Smoke item 7 in the 1a runbook uses "a short session with a single audio segment." A dedicated rollover-path smoke item is missing from the runbook — add a separate 1d smoke item requiring a session long enough to trigger auto-rollover (or manually ending and re-starting within a single session). Without this, the multi-segment case is not covered in Andrew's hardware smoke.

> **NOTE N1:** The outbox `--runInBand` instruction is correct (pre-existing flakiness in parallel mode is a known issue). However, the plan doesn't state why — a future executor who removes `--runInBand` and sees flakiness may not know why it's there. Worth a one-liner in the 1d acceptance criteria.

---

## Axis 2 — Clock + Ordering Correctness

**Scope:** drift over 50+ minutes, monotonicity, single source of truth for `t`, iOS backgrounding.

### B1 — SUPERSEDED (original `AudioContext.currentTime` approach)

> **Status: SUPERSEDED.** The original B1 blocker ("`AudioContext.currentTime` iOS suspension claim is unverified and may be false") has been resolved by choosing a different approach entirely. The revised 1b plan now uses a **frame-counting node** in the Web Audio graph rather than `AudioContext.currentTime`. The original B1 text is preserved below for audit trail; all findings from S2–S5 and N2 have been incorporated into the revised design or explicitly addressed.

**Original B1 (archived):**
> *The plan's core assertion for 1b — that `AudioContext.currentTime` tracks the hardware audio timeline on iOS even when the tab is backgrounded — is stated as fact but is unverified in the codebase, unverified by any cited reference, and contradicted by the known iOS behavior of suspending AudioContext instances for backgrounded tabs.*

**Why the frame-counter approach resolves B1:** When iOS suspends the AudioContext, two things happen simultaneously: (1) the frame-counting node stops receiving samples (no `onaudioprocess` / worklet `process()` calls), (2) `MediaRecorder` receives no data from the AudioContext's `recordingDest` stream. Both the frame counter and the encoded audio freeze by the same amount. This is the correct behavior for clock alignment — not because we detect and compensate for the suspension, but because the clock IS the encoder's signal path. The original B1 risk (that the clock advances while encoding freezes, or vice versa) is structurally eliminated.

---

### Red-team of the revised 1b: frame-counting node approach

#### Assessment

The frame-counter design replaces one clock source with another. The adversarial review of the NEW approach follows.

**Axis 2.1 — Drift immunity**

The frame counter's alignment guarantee: `frames_counted × 1000 / sampleRate` = elapsed ms of recording-active audio — because counted frames ARE the encoded frames. This is correct by construction for the ScriptProcessorNode path (frames counted in `onaudioprocess` = frames delivered to `recordingDest`). For the AudioWorklet path, frames counted in `process()` = frames in the worklet's input buffer = frames that flow into `recordingDest` (same signal path).

**No new drift source is introduced** for the normal-operation case. The question is edge cases.

**Axis 2.2 — Codec priming offset (NEW NOTE)**

AAC/MP4 (iOS path) has an encoder priming period: the first ~2112 samples (@ 44100 Hz = ~47.9ms) are silence that the decoder skips. The frame counter counts these priming frames. If the replay timeline's `durationSeconds` (from ffprobe) reports the container duration INCLUDING priming (as is common), the offset is zero — both the frame counter and the replay timeline include the same priming samples. If ffprobe excludes priming from its `duration` report, there is a ~47ms undercount per segment boundary.

For a session with 6 segments (each ~8 minutes at `SEGMENT_MAX_SECONDS`), the worst case is 6 × 47ms = 282ms — barely over the 250ms budget. The revised plan proposes zeroing the counter at first `ondataavailable` per segment to skip priming frames. **This is a NEW SHOULD-FIX.**

> **SHOULD-FIX S2-NEW (codec priming offset):** The executor must verify the priming behavior on both WebM (desktop Chrome) and MP4 (iOS). If ffprobe's `durationSeconds` includes priming, no action needed. If it excludes priming, implement the "zero counter at first `ondataavailable`" mitigation in the rollover path. Add a test: record a 3-segment session, compare `getAudioMs()` at the start of segment 3 against `sum(Whisper durationSeconds for segments 1+2) × 1000`. Discrepancy > 50ms per boundary = priming issue present.

**Axis 2.3 — ScriptProcessorNode buffer granularity (NOTE)**

ScriptProcessorNode processes 256 frames per `onaudioprocess` call. At 44100 Hz, this is one call every 5.8ms. `getAudioMs()` can be called between two `onaudioprocess` calls, introducing up to 5.8ms of read lag. This is negligible and within the 250ms budget. No action needed.

**Axis 2.4 — AudioWorklet postMessage latency (NOTE)**

The AudioWorklet sends frame count updates every 1024 frames (~23ms @ 44100). Between updates, `getAudioMs()` reads the last received count. Max read lag: 23ms. Well within the 250ms budget. No action needed.

**Axis 2.5 — Rollover boundary (MUST VERIFY)**

The revised plan explicitly states: "Do NOT call `frameClockSetActive(false/true)` around `rolloverSegmentGapless()`. The counter runs uninterrupted." An executor who misreads this and adds a `setActive(false); setActive(true)` around rollover would:
- Miss ~100ms of frames during the brief old-recorder-stop / new-recorder-start overlap
- Create a monotonicity gap in `t` values (a brief jump backward then forward)

The test `audio-clock-rollover.test.ts` (in the revised plan) specifically catches this by asserting `getAudioMs() > SEGMENT_MAX_SECONDS * 1000 + 900` after a rollover + 1s advance. Green = the counter was not reset.

**Axis 2.6 — Performance.now() fallback boundary (MUST SPECIFY)**

The revised plan states: "the fallback accumulator only starts when recording starts (same gate as `frameClockSetActive`)." This correctly means pre-recording events have `t = 0`. The executor must NOT start the `perfFallbackStartRef` at hook mount — only at `startMediaRecorder()` / `resumeRecording()`. This is specified in the File 2 section above. The test suite's fake-graph path bypasses the fallback entirely, so this must be verified via a code review at PR time.

**Axis 2.7 — `onaudioprocess` on Firefox audio thread (NOTE)**

In Firefox, `ScriptProcessorNode.onaudioprocess` may fire on a separate audio thread (not the main thread), while `frameClockSetActive` is called from the main thread. This creates a potential data race: a frame is counted between `setActive(false)` and when the node actually reads the flag. At most 1 buffer (256 samples = 5.8ms) of over-counting. This is negligible. Document as an acknowledged 5.8ms tolerance.

### Findings for revised 1b (Axis 2)

> **SHOULD-FIX S2-NEW:** Codec priming verification (see §2.2). Verify per-rollover priming offset. If ffprobe excludes priming from `durationSeconds`, implement "zero counter at first `ondataavailable`" mitigation. Add a multi-segment test comparing frame counter offset vs Whisper durations.

> **NOTE N2-NEW:** ScriptProcessorNode `onaudioprocess` fires on the Firefox audio thread — acknowledged 5.8ms data-race tolerance on pause/resume boundaries. Acceptable and within the 250ms budget. No action required.

> **NOTE N3-NEW:** AudioWorklet postMessage latency: 23ms max read lag between worklet updates. Within budget. No action required.

> **NOTE N4-NEW (replacing original N2):** `audioContext.onstatechange` is now included in the revised design (File 1 of the plan) as an observability hook, logging `event=audiocontext-state-change state=X`. This closes the observability gap identified in original S2.

---

## Axis 3 — Race Conditions on User Input

**Scope:** double-click, mid-transition events, admit race, student reconnect.

### Assessment

**1b race conditions:** The three-file change adds a new method to the return type of `useAudioRecorder`. There is no new user action path in 1b — it's purely an internal clock source change. Race conditions are unchanged from the existing implementation.

**1c race conditions — Admit button:**

The `admitStudentAction` as specified uses `db.whiteboardSession.update` (not `updateMany`) with no null-check guard:
```typescript
await db.whiteboardSession.update({
  where: { id: whiteboardSessionId },
  data: { bothConnectedAt: new Date() },
});
```

If the tutor double-clicks Admit (button not disabled before the server response returns), two concurrent calls run. Both succeed: the first sets `bothConnectedAt = T1`, the second sets `bothConnectedAt = T2` (a few milliseconds later). The student poll will return `admitted: true` immediately after T1, so the student transitions correctly. The second write moves the timer anchor forward by a few ms — not a data loss issue but the session timer would show 0 at T2 rather than T1. For a pilot-stage thin waiting room, this is acceptable but worth fixing.

**1c race conditions — student disconnect from waiting room:**

The plan specifies that the student polls `GET /api/whiteboard/[sessionId]/admission-status` every 3 seconds. If the student opens the link, enters the waiting room, then closes the tab before being admitted: the poll stops. The tutor's waiting mode (if it has a "student has arrived" indicator) has no signal that the student left. The plan explicitly flags this in Open Decision #2: "if the student arrives AFTER the tutor has already loaded the workspace, the tutor's waiting screen won't update." But this also applies in reverse — the student leaving is invisible.

**1c End from waiting mode — ARCHITECTURAL GAP:**

This is the most critical race condition / architectural gap in the plan. The plan states:

> *"if the tutor clicks End Session while in `mode="waiting"` (before admitting), the `handleEndSession` flow runs. Since `WhiteboardWorkspaceClient` was never mounted, `userWantsRecording` was never set to true. The outbox is empty..."*

This analysis is correct in its conclusion (no audio to save, clean exit) but the premise is **broken**: `handleEndSession` is defined at line 2884 INSIDE `WhiteboardWorkspaceClient`'s function body. In `mode="waiting"`, `WhiteboardWorkspaceClient` is **NOT mounted** (per the plan's own design — "The `WorkspaceResumeGate` / `WhiteboardWorkspaceClient` are NOT mounted yet"). There is no `handleEndSession` in scope when the shell is in waiting mode.

The End Session button in the live session is rendered at `WhiteboardWorkspaceClient.tsx` line 4472. If the workspace client is not mounted, that button doesn't exist either.

The plan analyzes the END-FROM-WAITING path as if it works, but provides no implementation for it. The shell's waiting mode render is described as having only: "a minimal 'Student is waiting to be admitted' panel" and "an Admit button." There is no End/Cancel button specified, no server action to call for a cancel-without-session, and no architectural path from `WhiteboardSessionShell` to `endWhiteboardSession`.

For a session that was created (consent acknowledged, `WhiteboardSession` row exists, join token issued) but the tutor abandoned before admitting: the session row would sit with `endedAt = null` indefinitely. This is not data loss (no audio was captured), but it is a leaked live session that blocks the join token from being reused and shows up incorrectly in session lists.

**1c — Tutor workspace loads after student arrives:**

The plan explicitly defers real-time tutor-side "student arrived" detection (Open Decision #2). The plan's waiting mode render shows "Student is waiting to be admitted" — but this copy would be displayed even before any student has opened the link, because the copy is unconditional. The tutor's shell enters waiting mode when `bothConnectedAt === null`. At that point, no student may be present. Showing "Student is waiting" when no student has arrived is a **honesty violation** per the founding principle (total transparency: "not one single claim unless backed by specific provable data").

### Findings

> **BLOCKER B2:** The plan's "End from waiting mode" analysis is architecturally impossible with the proposed design. `handleEndSession` lives inside `WhiteboardWorkspaceClient`, which is not mounted in waiting mode. The plan must specify: either (a) add a Cancel/End button to the waiting-mode render in `WhiteboardSessionShell` that calls a separate thin server action (`cancelWaitingSessionAction`), or (b) mount a minimal workspace client skeleton in waiting mode that exposes `handleEndSession`. Option (a) is simpler and more correct. This must be resolved before 1c can execute — the missing cancel path leaves sessions permanently in an unended state when tutors abandon waiting rooms.

> **BLOCKER B3 (also Honesty/Transparency axis):** The waiting mode shell displays "Student is waiting to be admitted" copy unconditionally when `bothConnectedAt === null`. This text is false when no student has opened the link yet. Per the founding principle: "not one single claim unless backed by specific provable data, with a natural drill-down to the evidence." A "Student is waiting" indicator without evidence (the student actually being in the waiting room) is a dark pattern of the exact type Andrew explicitly rejects. The plan must either: (a) add a tutor-side poll for student arrival state (separate from the `bothConnectedAt`/admitted poll), or (b) use truthful-but-less-specific copy such as "Waiting for student..." that doesn't assert the student is present when we don't know. The distinction between "tutor is waiting" and "student has arrived" is evidence-level: the latter requires the student client to have registered its presence.

> **SHOULD-FIX S6:** `admitStudentAction` should use `updateMany` with a null-check guard for idempotency:
> ```typescript
> await db.whiteboardSession.updateMany({
>   where: { id: whiteboardSessionId, bothConnectedAt: null },
>   data: { bothConnectedAt: new Date() },
> });
> ```
> This matches the existing `bothConnectedAt` write pattern in `/w/[joinToken]/page.tsx` (lines 93-99) which already uses `updateMany` with a null guard. An unconditional `update` on double-click would move the timer anchor forward.

> **SHOULD-FIX S7:** The student polling loop has no exit condition if the student closes the tab before being admitted. On re-open, the student correctly resumes polling. But the plan should document: what happens to the already-running polling interval if the student component unmounts (tab close)? The `setInterval` / `clearInterval` cleanup must be explicit in the student component to avoid memory leaks. The plan describes the polling behavior but doesn't address the cleanup contract.

> **NOTE N3:** The plan proposes logging `[wt] wbsid=... action=student_admitted tutor=<adminId>` but the code sample in Step 4 uses `[nsi]` prefix:
> ```typescript
> console.log(`[nsi] wbsid=${whiteboardSessionId} action=student_admitted`);
> ```
> This is inconsistent with the `wt` prefix registry entry the plan itself proposes. The executor will implement one and the plan specifies the other.

---

## Axis 4 — Cross-Platform Parity

**Scope:** iOS Safari, Android Chrome, desktop Chrome, Firefox, macOS Safari.

### Assessment (updated for revised 1b frame-counter approach)

**1b platform matrix (revised):**

| Platform | Frame counter mechanism | Agent-runnable test? | Hardware smoke needed? |
|---|---|---|---|
| Desktop Chrome | AudioWorklet (primary) or ScriptProcessorNode (fallback) | ✅ Fake graph injection | No |
| iOS Safari | ScriptProcessorNode (AudioWorklet fallback if init fails) | ✅ Fake graph injection | ✅ Background suspend + phone call |
| macOS Safari | AudioWorklet primary (Safari 14.5+) | ✅ Fake graph injection | Optional |
| Firefox | ScriptProcessorNode primary (AudioWorklet available but audio-thread IPC) | ✅ Fake graph injection | No |
| Android Chrome | AudioWorklet primary | ✅ Fake graph injection | No |

**iOS Safari notes for revised approach:**

The revised approach does NOT require `AudioContext.currentTime` to advance during iOS suspension. Instead, it requires that when iOS suspends the AudioContext, BOTH the frame counter AND the MediaRecorder encoder freeze — which is structurally guaranteed because they share the same signal path.

The key iOS hardware tests (from revised 1b acceptance criteria):
1. Background suspend: verify `event=audiocontext-state-change state=suspended` in console, and replay aligns after return
2. Phone call: verify watchdog fires OR session recovers
3. Timeslice: verify iOS-conditional no-timeslice path produces a playable mp4

**`audio/mp4` heuristic and macOS Safari:** `chooseMimeType()` may return `audio/mp4` on macOS Safari as well. If so, macOS Safari would also get the no-timeslice path, which is conservative but safe (stop-only checkpoints are less resilient but always correct). Clarify with Andrew whether a UA check (`iPhone|iPad|iPod` in userAgent) should gate the no-timeslice path more precisely.

**1c platform concerns (unchanged):**

The `GET /api/whiteboard/[sessionId]/admission-status` polling endpoint. On iOS Safari, `setInterval`-based polling can be throttled when the tab backgrounds. This is not data loss but may extend admission latency.

### Findings

> **SHOULD-FIX S8 (revised):** The 1b iOS hardware smoke must include: (a) background Safari for 3 minutes during a session, (b) verify `event=audiocontext-state-change state=suspended` in console, (c) verify replay aligns within 250ms after return, (d) phone call interruption → watchdog surfaces or session recovers. Also: verify timeslice iOS-conditional smoke (item 3 in revised 1b acceptance). These replace the original S8 (which targeted the old `AudioContext.currentTime` approach).

---

## Axis 5 — Observability

**Scope:** per-session ID logging, state transition logging, debuggability from prod logs.

### Assessment

The existing observability infrastructure (`wbsid`, `rid`, `obx`, `nsi`, etc.) is not degraded by Phase 1. The plan proposes a new `wt` prefix for the waiting room lifecycle, which is correct and follows the convention.

**Gaps:**

1. The `wt` prefix is mentioned in the plan but **not registered** in AGENTS.md's "Per-session ID logging is mandatory" section. The convention says to register every new prefix. Missing this means a fresh agent or future executor won't know `wt=` exists.

2. The `admitStudentAction` code sample uses `[nsi]` instead of `[wt]` (see N3 above). This means the actual admission event would not appear under the `wt=` prefix in logs, making the prefix registration useless.

3. **AudioContext state transitions are not logged.** If the AudioContext is suspended mid-session (an iOS-relevant event), there is currently no log line. If B1 turns out to be a real iOS problem, diagnosing it from prod logs would require guessing at suspension timing. The `onstatechange` handler proposed in S2 would close this gap.

4. **Student arrival in waiting room is not logged to Vercel/server.** The plan correctly proposes `[wt] wbsid=... action=student_arrived` but this is a CLIENT-SIDE log (the student's browser). It will not appear in Vercel function logs unless the student client POSTs it to a server endpoint or the server logs it when the student page loads. The student page (`/w/[joinToken]/page.tsx`) does run server-side — a `console.log` there would appear in Vercel logs. But in 1c's design, the student's page load NO LONGER stamps `bothConnectedAt` (that's the whole fix). If the server doesn't log student arrival, there's no server-side record of when a student was in the waiting room.

### Findings

> **SHOULD-FIX S9:** Log student arrival at the server level in the student's page route (`/w/[joinToken]/page.tsx`). After the current `bothConnectedAt` stamp is removed (per 1c Step 1), add a server-side log: `console.log(\`[wt] wbsid=${tokenRow.whiteboardSessionId} action=student_arrived\`)`. This creates a Vercel-searchable record of waiting room arrivals without requiring a DB column.

> **NOTE N4:** The `wt` prefix must be added to the AGENTS.md registry. Not blocking execution, but violates the mandatory convention.

> **NOTE N5:** The `admitStudentAction` log line uses `[nsi]` prefix (wrong). Should be `[wt]`. The executor should correct the code sample in the plan or the plan is the wrong source of truth.

---

## Honesty + Transparency Axis

*(Not one of the 5 reliability axes in `reliability-bar.mdc` but added per the task spec and founding principle.)*

**Scope:** does Phase 1 risk showing a tutor or parent something unverified, false, or misleading?

### Assessment

**Replay accuracy:** If B1 is real (AudioContext suspends on iOS and the fix doesn't work), replays will still drift on iOS. The replay UI shows no indication of known drift or clock uncertainty. A tutor or parent reviewing a replay that is 3 seconds out of sync has no way to know the audio/visual alignment is off. This is an accuracy claim made implicitly (replay is presented as "accurate") that may be false on the target platform. Not an immediate honesty violation but a latent one if 1b ships without iOS verification.

**"Student is waiting" copy:** Addressed in B3. Showing unconditional "Student is waiting" copy when the student may not have arrived is a factual claim without evidence — directly contradicts the founding principle.

**Session timer anchor:** The 1c fix moves `bothConnectedAt` from link-open to admit time. This is MORE honest than the current behavior (which charges the timer from the moment the student clicks the link, even if the tutor takes 5 minutes to engage). The 1c change aligns the timer with the actual billable session start. **This is the correct direction and the plan is right.**

**`bothConnectedAtIso` prop dead code:** `WhiteboardWorkspaceClient` receives `bothConnectedAtIso` as a prop but immediately voids it (`void bothConnectedAtIso`). After 1c, this prop will be updated to the admit time. But since the component doesn't use it, the prop has no effect. The session timer is driven by the `GET /timer-anchor` poll. This is fine (timer is still accurate) but the dead prop is misleading to future maintainers.

### Findings

> *(B3 from Axis 3 covers the primary honesty finding.)*

> **NOTE N6:** The in-session review after End (`SessionReviewMode`) shows the final board state via `WorkspacePreviousSessionPreview`. If events.json has been uploaded but audio segments are still draining from the outbox when the review mode renders, the notes generation may succeed before all audio is registered. This could result in AI notes that transcribe incomplete audio (the last segment is in IDB but not yet in a `SessionRecording` DB row). This is a pre-existing issue (not introduced by Phase 1), but 1d's validation should confirm that the notes generation trigger fires AFTER `finalizeOutboxAfterEnd` completes, not concurrently.

---

## 1a Smokebook Stub — Review

The stub is structurally correct (follows SMOKEBOOK-TEMPLATE.md shape). Findings:

> **NOTE N7:** The "Tip commit" field is a literal placeholder `[run git log -1 --format=%H to fill]` and the Preview URL is a placeholder. These must be filled before any smoke run. This is expected for a stub but should be explicitly marked as "executor fills before running."

> **NOTE N8:** Smoke item 8 ("session timer — starts on student join, survives student disconnect") will FAIL after 1c is implemented (because 1c changes timer semantics to admit-time). The smoke item language says "Timer shows 'Waiting for student' until the student opens the link" — this is the PRE-1c behavior. After 1c, the timer should show "Waiting for student" until ADMIT, not until link-open. If 1a smoke is run before 1c, item 8 tests the old (incorrect) behavior and will pass. If 1a smoke is run after 1c, item 8's **Expect** is wrong. The plan must update smoke item 8 for the post-1c world.

---

## Summary (updated 2026-06-13 re-scope)

| Classification | Count | Status |
|---|---|---|
| **BLOCKER** | **3** | B1 SUPERSEDED by revised approach; B2 + B3 remain open for 1c |
| **SHOULD-FIX** | **9 original + 1 new** | S2-NEW (codec priming) added for revised 1b |
| **NOTE** | **8 original + 4 new** | N2-NEW through N4-NEW added for revised 1b |

**B1 status:** SUPERSEDED. The frame-counting node approach structurally eliminates the iOS AudioContext suspension risk that B1 identified. The clock cannot advance without frames, and frames cannot flow without the graph running — by construction. No Andrew decision required on B1.

**B2 and B3 remain BLOCKERS for 1c** (no change — still require plan-completion work before 1c can execute).

---

## BLOCKER list

**B1 — AudioContext.currentTime iOS suspension claim (SUPERSEDED)**

> *Original: The plan's core assertion for 1b — `AudioContext.currentTime` tracks the hardware audio timeline on iOS even when backgrounded — was unverified and contradicted by known iOS behavior.*

**Resolution (2026-06-13):** Superseded by the revised 1b approach (frame-counting node). The frame counter freezes simultaneously with the encoder when iOS suspends the AudioContext — the structural identity `frames_counted = samples_encoded` eliminates the drift risk by construction. No hardware claim required; no `onstatechange` compensation needed (though the `onstatechange` observability hook IS included in the revised design). B1 is closed.

---

**B2 — Waiting mode End/Cancel button has no implementation path (Axis 3) — STILL OPEN**

The plan analyzes "End from waiting mode" as a valid flow but `handleEndSession` is defined inside `WhiteboardWorkspaceClient` at L2884, and the workspace client is explicitly NOT mounted when `ShellMode === "waiting"`. Without a cancel path, if the tutor abandons the waiting room, the `WhiteboardSession` row remains with `endedAt = null` indefinitely. This must be resolved before 1c can execute. Required: a `cancelWaitingSessionAction` server action callable directly from `WhiteboardSessionShell`'s waiting-mode render (ownership-asserted, sets `endedAt`, clears the join token).

---

**B3 — "Student is waiting" copy shown without evidence of student presence (STILL OPEN)**

The plan's waiting mode shell shows "Student is waiting to be admitted" unconditionally when `bothConnectedAt === null`. This is false when no student has opened the link. Per the founding transparency principle: no claim without evidence. Required: either (a) tutor-side polling for student arrival separate from admitted status, or (b) truthful copy ("Waiting for your student…" → "Your student has arrived" only after a `studentArrivedAt` signal). Folded into 1c scope.

---

## Verdict (updated 2026-06-13)

**1b: CLEAN TO EXECUTE** — B1 superseded; the frame-counting node approach is sound, the agent-runnable test strategy is specified with independent oracles, and the iOS hardware smoke items are clearly separated. The executor can proceed.

**1c: STILL BLOCKED** — B2 (End/Cancel button) and B3 (honest waiting copy) must be folded into the 1c plan before execution. Neither requires Andrew's decision — both are clear plan-completeness gaps.

---

## Orchestrator synthesis (updated 2026-06-13)

The re-scope conversation produced the "do it right" decision: frame-counting node instead of `AudioContext.currentTime`. This closes B1 cleanly and is strictly better because the structural alignment guarantee requires no platform-specific assumptions.

**Open decisions still needing Andrew (now only for 1b detail, not 1b gate):**
1. AudioWorklet vs ScriptProcessorNode as primary (complexity vs simplicity)
2. `_graphOverride` test injection pattern vs module-level mock
3. Codec priming: implement zero-at-first-ondataavailable, or accept ≤47ms per boundary
4. Watchdog warning UI surface in the workspace

**Execution order (unchanged):** 1b executes (agent-runnable) → Andrew 2-device smoke (1a baseline + iOS background/timeslice items from 1b) → 1c executes with B2+B3 folded in → 1c hardware smoke.
