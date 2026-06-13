# Phase 1 / 1b Diff Review — Adversarial (2026-06-13)

> **Branch:** `phase1/wb-reliability-floor`  
> **Commits reviewed:** `b23597a`, `324f910`, `1cff33d`  
> **Diff command:** `git diff v1-redesign...HEAD -- src/ jest.config.ts`  
> **Reviewer posture:** Independent adversarial. No cheerleading.  
> **Reliability standard:** `../../agenticPipeline/.cursor/rules/reliability-bar.mdc`  
> **Plan reviewed:** [`docs/handoff/phase-1-wb-floor-plan-2026-06-13.md`](phase-1-wb-floor-plan-2026-06-13.md)  
> **Prior 5-axis review:** [`docs/handoff/phase-1-wb-floor-5axis-2026-06-13.md`](phase-1-wb-floor-5axis-2026-06-13.md)

---

## Executive summary

The diff ships a broken audio clock on every platform. The frame-counting node is wired correctly
into the graph. The gate (pause/resume) is wired correctly. The rollover invariant is correct.
**But the codec-priming baseline mechanism — `noteFirstChunkForAudioClock()` — makes `getAudioMs()`
return wrong values on all production paths**, because it assumes `ondataavailable` fires within the
first few frames of recording. In production, with `DRAFT_TIMESLICE_MS = 30_000`, the first
`ondataavailable` fires after **30 seconds**. On iOS (no-timeslice path), it fires at `stop()` only.
The tests call `FakeMediaRecorder.lastInstance().feedData()` immediately after start — this is a
test-only shortcut that masks the 30-second latency and makes all three timing tests pass on a
broken clock. The tests are theater for this specific correctness issue.

---

## Axis 1 — Data Durability

### Assessment

The outbox/atomic-end pipeline is unchanged. The new fields (`getAudioMs`, `onWatchdogAlert`,
`_graphOverride`) are additive. Rollover path (`rolloverSegmentGapless`) adds
`commitSessionAudioMsAtRollover()` before the new recorder starts, which correctly snapshots the
clock across the segment boundary. The clock bug (see Axis 2) affects event timestamps but not
audio data durability.

The `recordingStallWarning` state IS rendered in JSX
(`{recordingStallWarning && (` confirmed in the diff). Watchdog-to-banner wiring is complete.

Empty-rollover path now calls `onWatchdogAlertRef.current?.("empty-rollover")` in addition to the
existing `console.warn`. ✓

### Findings

> **NOTE N1:** `commitSessionAudioMsAtRollover()` correctly saves `readAudioClockMs()` before
> resetting the baseline. If the clock is wrong (B-CLOCK-2), the snapshot is also wrong, but the
> rollover logic itself does not introduce an independent data-loss risk.

---

## Axis 2 — Clock + Ordering Correctness

**This axis has three BLOCKERs.**

### B-CLOCK-1 — iOS no-timeslice: `getAudioMs()` returns 0 for the entire session

**Severity: BLOCKER**

On iOS, `startRecorderWithDraftPolicy` calls `recorder.start()` without a timeslice (correctly, to
avoid fragmented MP4). `ondataavailable` fires only when `recorder.stop()` is called.

`wireRecorderOnDataAvailable()` calls `noteFirstChunkForAudioClock()` on each `ondataavailable`
event. `noteFirstChunkForAudioClock()` sets `segmentPrimingBaselineRef.current = rawFrameClockMs()`
on first call. Until that first call, `segmentPrimingBaselineRef.current === null`.

`readAudioClockMs()`:
```typescript
if (baseline === null) {
  return Math.floor(sessionAudioMsRef.current);  // ← returns 0 for segment 1
}
return Math.floor(sessionAudioMsRef.current + raw - baseline);
```

On iOS no-timeslice:
- During recording (0 → 30min): `baseline === null` → `getAudioMs()` = 0.
- At `stop()`: `ondataavailable` fires with the complete blob. `noteFirstChunkForAudioClock()` sets
  `baseline = rawFrameClockMs()` = total session frames (e.g. 30min of frames).
- After stop: `readAudioClockMs()` = `0 + totalFrameMs - totalFrameMs` = 0. Still 0.

**All whiteboard events for the entire iOS session are stamped t=0.** Replay shows every stroke at
the beginning of the audio. This is a **regression vs the `performance.now()` approach** which was
accurate on iOS (ticking since recording start).

---

### B-CLOCK-2 — Non-iOS workspace: clock off by ~30s per segment (compounding)

**Severity: BLOCKER**

On non-iOS, `startRecorderWithDraftPolicy` calls `recorder.start(30_000)` (30-second timeslice).
The first `ondataavailable` fires after approximately **30 seconds**. At that moment:

- `rawFrameClockMs()` ≈ 30,000 ms (30 seconds of counted frames)
- `noteFirstChunkForAudioClock()` sets `baseline = 30,000`

From that point forward: `readAudioClockMs() = 0 + rawFrameMs - 30,000`.

**At 30s mark:** clock reads `0`. All events from second 0 to second 30 had `getAudioMs() = 0`
(baseline was null); they all pile at t=0.

**At 60s mark:** clock reads `30,000` ms. But this event occurred at 60 seconds — should read 60,000.
The clock is **30 seconds behind actual elapsed time**.

**At rollover (480s / 8 min):** `commitSessionAudioMsAtRollover()` saves `readAudioClockMs()` =
`0 + 480,000 - 30,000` = **450,000ms** (should be 480,000). `sessionAudioMsRef.current = 450,000`.

**Segment 2, first 30s after rollover:** baseline null → `getAudioMs()` = 450,000 (frozen).
Events right after rollover all get t=450,000ms while correct t is 480,000ms+.

**Segment 2, after 30s:** first ondataavailable of segment 2. `rawFrameClockMs()` ≈
480,000 + 30,000 = 510,000. Baseline = 510,000. `readAudioClockMs()` = 450,000 + 510,001 - 510,000 = 450,001ms (should be 510,001ms).

The systematic undercount compounds: **~30s undercount per segment**. Over 6 segments (50-minute
session): ~180s total drift. This is **720× the 250ms budget**. Replay is completely wrong.

**This is also a regression vs `performance.now()`**, which accumulated correctly from recording
start with no baseline offset.

---

### B-TEST-1 — Tests are theater: the `feedData()` oracle shortcut masks both clock bugs

**Severity: BLOCKER (oracle integrity)**

In `startRecordingWithFakeGraph()`:

```typescript
await act(async () => {
  await view.result.current.handleStartRecording();  // recorder.start() called
});
FakeMediaRecorder.lastInstance().feedData();  // ← immediately fires ondataavailable
```

`FakeMediaRecorder.start()` does NOT auto-fire timeslice events. `feedData()` is called manually,
immediately after `handleStartRecording()`, when `fakeGraph._ms = 0` (no advance yet).

Result: `noteFirstChunkForAudioClock()` is called with `rawFrameClockMs() = 0`.
`segmentPrimingBaselineRef.current = 0`. From this point: `readAudioClockMs() = 0 + ms - 0 = ms`.
Clock works correctly in the test.

**Production reality:**
- Non-iOS: first `ondataavailable` fires after 30s → baseline = 30,000ms → clock off by 30s.
- iOS: first `ondataavailable` fires at stop → baseline = totalFrameMs → clock = 0.

**The tests pass by accident.** They simulate an immediate chunk that production never delivers.
The three timing tests (`follows frame clock`, `pause/resume`, `rollover`) all use this shortcut.

**A test that WOULD fail on a wall-clock regression?** Only if `fakeGraph.advance(N)` and
`jest.advanceTimersByTime(N)` are advanced by DIFFERENT amounts AND the clock follows `_ms`, not
wall time. The first test does this: `fakeGraph.advance(10_000)` + `jest.advanceTimersByTime(11_500)`,
expects `10,000`. **This oracle IS independent for the wall-clock vs frame-clock distinction.** ✓

**But it does NOT test the baseline latency problem.** The test cannot fail on B-CLOCK-1 or
B-CLOCK-2 because it always seeds `feedData()` at `_ms = 0`.

**A test that would prove the clock correct in production:** call
`jest.advanceTimersByTime(30_000)` WITHOUT calling `feedData()`, assert `getAudioMs() > 28_000`
(should be counting from second 0 via frame clock). Current tests cannot distinguish this
scenario. If you ran the existing tests with `recordingDraft: true` and removed the `feedData()`
call, they would fail — because `getAudioMs()` would return 0 for all 10 seconds. That failure
is the correct failure mode. It is currently masked.

---

### Frame-counter gating analysis (correctness confirmed for pause/resume/rollover)

The pause/resume gate ordering is asymmetric but acceptable:

- **Pause:** `frameClockSetActive(false)` then `mediaRecorder.pause()`. Correct direction —
  gate fires slightly before encoder pause. For AudioWorklet (async postMessage), up to ~23ms
  of slight overcount. Acknowledged.
- **Resume:** `mediaRecorder.resume()` then `frameClockSetActive(true)`. Encoder starts
  before gate opens. For AudioWorklet: up to ~23ms of frames encoded but not counted per
  resume. For ScriptProcessor: ~5.8ms gap. These are the documented tolerances from the
  5-axis review. Not new. Within budget for <10 pause-resume cycles.
- **Rollover:** `frameClockSetActive` NOT called during `rolloverSegmentGapless()`. Frame
  counter runs uninterrupted. ✓ The plan's CRITICAL executor note is honored.

---

## Axis 3 — Race Conditions on User Input

### Assessment

1b adds no new user-facing action path. The `_graphOverride` test injection is clean
(not visible in production). No new race conditions introduced.

The `gainNode.disconnect(recordingDest)` call on line 162 of `mic-recorder-audio.ts` deserves
attention:

```typescript
// ← gainNode was NEVER connected to recordingDest in the new code (that line was removed)
gainNode.disconnect(recordingDest);   // line 162 — called before any connection exists
```

The original `gainNode.connect(recordingDest)` line was removed from the new code but the
`gainNode.disconnect(recordingDest)` line was not. This is dead code — the disconnect has
nothing to disconnect.

**Firefox (spec-compliant):** `AudioNode.disconnect(destination)` MUST throw `InvalidAccessError`
when the destination is not connected. This would be caught by the outer try-catch of
`createMicAudioGraph`, which would return `null`. Frame clock silently disabled in Firefox.
The 3× occurrence of `ScriptProcessorNode init failed` in the current test run of
`mic-recorder-audio.test.ts` confirms jsdom is lenient (silently ignores). **Chrome is also
lenient.** But Firefox conformance is a risk.

**`mic-recorder-audio.test.ts` is failing** in the full test run — this is a **new failure
introduced by 1b** that is NOT documented as pre-existing in the plan. The plan cites only
`sync-client.test.ts > broadcastSignal` as pre-existing. `mic-recorder-audio.test.ts` should
have been passing on `v1-redesign`; 1b's changes to `mic-recorder-audio.ts` have broken it.
This must be investigated.

### Findings

> **SHOULD-FIX S-DISCONNECT:** Remove `gainNode.disconnect(recordingDest)` on line 162 of
> `mic-recorder-audio.ts`. It is dead code (no prior connection exists in the new code path).
> In Firefox it may throw `InvalidAccessError`, propagating to the outer catch and silently
> returning null from `createMicAudioGraph`. At minimum, wrap in a try-catch to be defensive.

> **BLOCKER B-MICTEST: `mic-recorder-audio.test.ts` is FAILING in the full test run.** This file
> was not listed as a pre-existing failure in the plan (`sync-client.test.ts` is the documented
> pre-existing failure). 1b modified `mic-recorder-audio.ts` substantially. The executor must
> reproduce the failure, diagnose whether it's new (caused by 1b) or pre-existing (unrelated),
> and either fix it or document it in the plan with evidence (`git stash` + re-run to confirm).
> Until confirmed, this counts as a blocker.

---

## Axis 4 — Cross-Platform Parity

### Assessment

The `audio/mp4` iOS detection heuristic was correctly implemented:

```typescript
const mime = recorder.mimeType || chooseMimeType() || "";
const mightBeIOS = mime.startsWith("audio/mp4");
```

The `ios-timeslice.test.ts` confirms `audio/mp4` triggers `recorder.start()` with no timeslice. ✓

**macOS Safari risk:** `chooseMimeType()` may return `audio/mp4` on macOS Safari. The no-timeslice
path would fire there too. Stop-only checkpoints are safe but lose crash-recovery granularity.
The test does NOT verify that `audio/webm` keeps the timeslice. Minor.

**AudioWorklet CSP risk:** The worklet is loaded via a `blob:` URL (`URL.createObjectURL(blob)`).
Some strict CSPs block `blob:` in `script-src` even for in-page blob origins. If blocked:
`addModule()` throws → fallback to ScriptProcessor → works. Not a blocker, but the plan's claim
that "blob: URLs do not require CSP changes" may be environment-dependent. Verify in smoke.

### Findings

> **NOTE N-CSP:** The plan's claim that blob: AudioWorklet addModule requires no CSP change is
> browser/configuration-dependent. Strict `script-src 'self'` without `blob:` blocks it in
> some configurations. Smoke should explicitly check for CSP errors in console after graph init.

---

## Axis 5 — Observability

### Assessment

`[mic-recorder-audio] avx=... event=audiocontext-state-change state=X` is correctly added. ✓
`[mic-recorder-audio] avx=... frame-counter=audioworklet|script-processor` logged on init. ✓
`[useAudioRecorder] rid=... event=watchdog-stall frameMs=... chunks=...` logged on stall. ✓

Watchdog detection latency: **30–60 seconds** (first interval initializes, second detects). For an
iOS phone call interrupt, the tutor won't see the banner for up to 60 seconds. Acceptable at
pilot stage but worth noting in the smoke runbook.

Watchdog correctly covers the iOS 0-byte wedge: when AudioContext freezes, frame clock freezes AND
chunk count doesn't grow. Both stuck → stall fires. ✓

Watchdog does NOT fire false positive during a quiet healthy recording (no WB events, no draws):
frame clock still advances (audio frames counted), so `currentFrameMs !== lastFrameMs`. ✓

---

## Pre-existing `SharePage` test failures — unrelated to 1b

The 4 `SharePage.whiteboard.dom.test.tsx` failures are confirmed unrelated to 1b:

- SharePage is a viewer component; it imports neither `useAudioRecorder` nor `mic-recorder-audio`.
- The 1b diff touches `mic-recorder-audio.ts`, `useAudioRecorder.ts`, `WhiteboardWorkspaceClient.tsx`,
  and new test files — none of which are on the SharePage dependency chain.
- These failures appear in the full suite alongside `identity-2fa-management.test.ts`, both of
  which were failing on `v1-redesign` (pre-existing, not 1b regressions).

**Status: pre-existing, unrelated.** ✓

**However:** `mic-recorder-audio.test.ts` failures are NOT confirmed pre-existing (see B-MICTEST above).

---

## Honesty / Transparency Axis

### Assessment

**Stall warning:** `recordingStallWarning` state is wired to a banner in JSX
(`{recordingStallWarning && (`). When watchdog fires, the tutor sees a visible warning. ✓

**Replay accuracy:** If B-CLOCK-1 or B-CLOCK-2 ship, replays will be desynced on ALL platforms
(0 for iOS, off by 30s for desktop). The replay UI shows no indication of clock uncertainty.
A tutor reviewing a replay with 30-second or total-session drift has no way to know. The app
makes an implicit "accurate replay" claim that will be false. This is the core honesty risk.

**Codec-priming baseline approach is architecturally wrong for the timeslice context:** the plan
describes "zero at first `ondataavailable` to skip priming frames" (~47ms). But with a 30s
timeslice, `ondataavailable` fires 30 seconds into recording, not 47ms. The baseline absorbs
30,000ms of frames, not 47ms. The correct fix is to capture the baseline at
`frameClockSetActive(true)` call time (recording start), OR to simply remove the baseline
mechanism and accept ≤47ms per rollover boundary (within budget for <6 segments, as the plan
itself notes).

---

## Watchdog specific analysis

### False positive risk

Scenario: healthy iOS session, no-timeslice path. `chunksRef.current.length` stays 0 the entire
session (no timeslice events). Watchdog checks both frame clock AND chunk count.

- At 30s (first check): initializes. `chunkCount = 0`, `frameMs = X`.
- At 60s (second check): `chunkCount = 0 === 0` (stuck — expected on iOS). `frameMs = X + 30s_frames`.
  Frame clock advanced → no stall. **No false positive.** ✓

### False negative risk (iOS 0-byte wedge)

- AudioContext frozen (iOS background). Frame clock stalls (no new samples). `chunksRef.length`
  also stalls (no new data). Both stuck at 30s check → stall fires within 30–60s. **Correctly
  detected.** ✓

### Watchdog only fires when `recordingDraft` is set

`runWatchdogCheck()` is only called from the `startDraftCheckpointScheduling()` interval.
That function returns early if `!recordingDraft`. The workspace always passes `recordingDraft`. ✓
The recorder-tab consumer (no `recordingDraft`) gets no watchdog — that's correct (it's not
the 50-min session use case).

---

## Summary table

| ID | Axis | Classification | Description |
|---|---|---|---|
| B-CLOCK-1 | Clock | **BLOCKER** | iOS no-timeslice: `getAudioMs()` = 0 for entire session — all WB events stamped t=0, replay broken |
| B-CLOCK-2 | Clock | **BLOCKER** | Non-iOS 30s timeslice: clock off by ~30s per segment, compounds to ~180s over 50min — far exceeds 250ms budget |
| B-TEST-1 | Oracle | **BLOCKER** | Timing tests call `feedData()` at `_ms=0`, masking 30s baseline drift; suite is green but cannot detect production clock errors |
| B-MICTEST | Race/Regression | **BLOCKER** | `mic-recorder-audio.test.ts` failing in full suite; not in pre-existing failures list; 1b changed this file — must verify root cause |
| S-DISCONNECT | Race | **SHOULD-FIX** | `gainNode.disconnect(recordingDest)` at line 162 of `mic-recorder-audio.ts` is called before any connection exists; dead code; throws `InvalidAccessError` in Firefox-strict, silently ignored in Chrome/jsdom |
| S-RESUME-ORDER | Clock | **SHOULD-FIX** | `frameClockSetActive(true)` called after `mediaRecorder.resume()` — up to ~23ms of encoded frames not counted per resume on AudioWorklet path (acknowledged ~5.8ms for ScriptProcessor only in 5-axis review) |
| N-CSP | Platform | **NOTE** | `blob:` AudioWorklet may be blocked by strict `script-src` CSPs; verify in smoke |
| N-WATCHDOG-60S | Observability | **NOTE** | Watchdog detection latency 30–60s; document in smoke runbook |
| N-MACOSSAFARI | Platform | **NOTE** | `audio/mp4` heuristic may trigger on macOS Safari (no-timeslice when timeslice would be safe) |

---

## Root cause analysis: why the clock design is broken

The plan's codec-priming section says: *"zero the frame counter at first `ondataavailable` per
segment, which skips priming frames that will also be skipped by the decoder."*

The intent was to skip ~2112 priming samples (~47ms at 44100Hz) that the encoder inserts at the
start of each AAC segment. The mechanism assumed `ondataavailable` fires within that ~47ms window.
It does not — it fires at `DRAFT_TIMESLICE_MS = 30,000ms` (30 seconds) on non-iOS, and at `stop()`
only on iOS.

The fix is to capture the baseline at **recording start**, not at first `ondataavailable`:

```typescript
// In startMediaRecorder(), immediately after frameClockSetActive(true):
graphRef.current?.frameClockSetActive?.(true);
segmentPrimingBaselineRef.current = rawFrameClockMs();  // ← capture now, not at first chunk
```

And similarly in `rolloverSegmentGapless()`, after `commitSessionAudioMsAtRollover()`:
```typescript
// After newRecorder.start() / startRecorderWithDraftPolicy(), immediately capture:
segmentPrimingBaselineRef.current = rawFrameClockMs();  // ← zero the codec-priming frames now
```

This approach accepts ≤47ms of priming at each segment boundary — which the plan itself acknowledges
is within the 250ms budget for <6 segments. The `noteFirstChunkForAudioClock()` mechanism
(and by extension, `ondataavailable`-driven baseline capture) should be removed entirely.

---

## Counts

| Classification | Count |
|---|---|
| **BLOCKER** | **4** |
| **SHOULD-FIX** | **2** |
| **NOTE** | **3** |

---

## BLOCKER list (verbatim)

**B-CLOCK-1 — iOS no-timeslice clock = 0**
On iOS (no-timeslice path), `ondataavailable` fires only at `stop()`. `segmentPrimingBaselineRef`
stays null throughout the session. `getAudioMs()` returns 0 for all whiteboard events. All
events stamped t=0. Replay shows every stroke piled at the beginning of audio. Regression vs
performance.now().

**B-CLOCK-2 — Non-iOS 30s timeslice systematic 30s drift**
First `ondataavailable` fires at ~30s. Baseline = 30,000ms of frames. `readAudioClockMs()` reads
`currentFrameMs - 30,000`. Events in first 30s: t=0. Events after 30s: off by -30s. At rollover:
snapshot captures undercount, carries forward to next segment. 6-segment session → ~180s total
drift. 720× the 250ms budget. Fix: capture baseline at `frameClockSetActive(true)` time.

**B-TEST-1 — Timer tests are theater**
`startRecordingWithFakeGraph()` calls `feedData()` when `fakeGraph._ms = 0`. This sets
`baseline = 0`, making `readAudioClockMs() = ms - 0 = ms` (correct in test, wrong in
production). No test exercises the case where `ondataavailable` fires 30 seconds after recording
start. The green suite does not prove the clock is accurate on any real platform. Fix: add a
test that advances `jest.advanceTimersByTime(30_000)` without `feedData()`, then asserts
`getAudioMs() > 28_000` (it would return 0 currently).

**B-MICTEST — `mic-recorder-audio.test.ts` new failure**
Full suite run confirms `mic-recorder-audio.test.ts` is FAIL. This file is not in the documented
pre-existing failures list (only `sync-client.test.ts > broadcastSignal` is). 1b modified
`mic-recorder-audio.ts` substantially. Must verify if this is 1b-caused (BLOCKER) or pre-existing
(document and exclude). Cannot ship to smoke with an undocumented failing test in a file this
diff modified.

---

## Are the timing tests a real oracle?

**No — with a critical caveat.**

For the specific question "does `getAudioMs()` follow the frame clock rather than wall clock":
**YES, real oracle.** `fakeGraph.advance(10_000)` + `jest.advanceTimersByTime(11_500)` with
`expect(getAudioMs()).toBe(10_000)` is genuinely independent. It would fail if the code fell back
to `performance.now()`. ✓

For the specific question "is the clock accurate relative to the audio file in production on
iOS or desktop workspace": **NO, theater.** The `feedData()` at `_ms=0` trick hides the 30s
baseline drift. Tests pass on a broken clock. No existing test would fail if the clock read
0 for the first 30 seconds of every session, or 0 for the entire session on iOS.

---

## Verdict

**BLOCKED**

The frame-counting node design is sound. The gating, passthrough, and rollover invariants are
correct. The watchdog and iOS-conditional no-timeslice are properly implemented. The tests
correctly prove the frame-clock-vs-wall-clock distinction.

But the codec-priming baseline mechanism (`noteFirstChunkForAudioClock()`) makes the clock wrong
on every production path: 30s systematic drift on desktop, total failure (t=0) on iOS. This is a
regression versus the `performance.now()` approach it replaces. The tests cannot detect this
because they short-circuit the baseline mechanism by calling `feedData()` immediately. The fix
is straightforward (capture baseline at `frameClockSetActive(true)` time), but it requires
writing new tests that correctly simulate the 30s timeslice latency.

**Fix, add test coverage for the corrected baseline, resolve `mic-recorder-audio.test.ts`,
then re-smoke.**
