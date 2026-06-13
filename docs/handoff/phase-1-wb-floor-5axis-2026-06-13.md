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

### Assessment

This is the central axis for 1b. The plan's diagnosis of the problem is correct: `performance.now()` does not track the MediaRecorder's audio timeline on iOS when the tab is backgrounded. The proposed fix — using `AudioContext.currentTime` — is a reasonable approach in theory. The implementation design (inject mock clock for tests, accumulate across pauses) is technically sound.

However, the plan makes a **critical unverified assumption** as its primary justification:

> *"On iOS, it [AudioContext.currentTime] matches the physical hardware audio timeline — it does NOT slow down when the tab is backgrounded, because the audio subsystem is still running."*

This claim is the load-bearing hypothesis of the entire 1b fix. It is not backed by any code, test, hardware observation, or cited reference in the plan. Examining the codebase confirms there is no existing test or empirical data for this claim.

**What is actually known about iOS AudioContext backgrounding:**

The iOS Safari Web Audio specification behavior is that AudioContext instances are **suspended by the OS when the tab is backgrounded**, even if they have active audio sources. `AudioContext.currentTime` freezes when the context is suspended — it does not advance during the suspension period. When the tab returns to foreground and the context resumes (via `audioContext.resume()`), `currentTime` picks up from where it stopped, not from the real wall-clock position.

The question is: does an active `MediaRecorder` running from the `AudioContext`'s `recordingStream` (as wired in this codebase) prevent iOS from suspending the AudioContext? The answer depends on iOS version, Safari version, and whether the OS classifies the audio session as a "background capture" session. This is platform behavior that varies by OS version and has been the subject of multiple WebKit bug reports.

The existing code in `createMicAudioGraph` calls `await audioContext.resume()` on creation, which handles the initial autoplay-policy suspension. It does **not** handle mid-session suspension events — there is no `audioContext.onstatechange` listener anywhere in the codebase.

**If the plan's iOS assumption is wrong:** after a backgrounding event, `AudioContext.currentTime` would be behind the MediaRecorder's actual captured audio by the suspension duration. The fix would behave identically to `performance.now()` in the failure mode it claims to solve. The `< 250ms over 50 min` target would be unmet in exactly the iOS scenario it targets.

**The test does not cover this:**

The proposed test `audio-clock-alignment.test.ts` injects a mock `AudioClockSource` and advances it independently of `jest.fakeTimers`. This proves the accumulation math is correct — it follows the mock clock rather than wall time. It does NOT prove that `AudioContext.currentTime` advances at the hardware audio rate on real iOS hardware. The oracle is independent from `performance.now()`, but it is not an oracle for the hardware claim.

The `replay-drift-50min.test.ts` simulates the scenario by making the mock audio clock advance at 1× while `performance.now()` advances at 0.3× (the comment says simulating "iOS background period"). But on real iOS, the problem would be `AudioContext.currentTime` advancing at 0× (suspended) while audio recording continues — a scenario the test cannot exercise because `AudioContext` is mocked out entirely.

**Accumulation across rollovers:**

The plan correctly designs `audioContextAccruedMsRef` to accumulate cumulative recording-active time rather than resetting on rollover. However, the plan is not explicit about this distinction. In the existing `rolloverSegmentGapless()`, `elapsedRef.current = 0` resets the DISPLAY timer at line 715. A careless executor might also reset `audioContextAccruedMsRef` here, thinking it mirrors `elapsedRef`. The plan should explicitly state: "**do not reset `audioContextAccruedMsRef` on rollover** — only the display timer (`elapsedRef`) resets."

**`performance.now()` / AudioContext clock boundary:**

The plan says "if `graphRef.current` is null (mic not yet acquired), fall back to `performance.now()` deltas." This creates a potential mixed-timeline issue: some events are stamped using `performance.now()`-derived `t` values, and subsequent events use AudioContext-derived `t` values. The two clocks do not share an epoch and may diverge. If the mic acquisition happens mid-session (which the FSM allows via solo mode), events before and after acquisition use different clocks. The plan doesn't address how the boundary is handled to maintain monotonicity.

Looking at the current code: `useAudioMsClock` only receives `recordingActive` — it accumulates time only while recording is active. The new implementation should behave the same way: `t` should be 0 (or near 0) for events stamped before the first recording interval, because the accumulator hasn't yet started. This is probably what the plan intends, but the language "fall back to `performance.now()` deltas" suggests the pre-mic period would still accumulate time. The plan needs to clarify whether the fallback path accumulates `t` during the pre-mic period.

### Findings

> **BLOCKER B1:** The plan's assertion that `AudioContext.currentTime` is immune to iOS background throttling is unverified and may be false. The AudioContext is known to be suspended by iOS when tabs are backgrounded. If suspended, `currentTime` freezes exactly as `performance.now()` throttles — the fix may not fix the targeted failure mode. The 1b acceptance criteria do not include an iOS-specific backgrounding smoke test (the 30-min manual replay is not required to include iOS backgrounding during the session). **Before authorizing 1b execution, Andrew must either: (a) provide hardware evidence that an active MediaRecorder prevents AudioContext suspension on iOS Safari, (b) explicitly accept the risk and add an iOS backgrounding step to the 1b smoke acceptance, or (c) choose an alternative approach (e.g., `onstatechange` gap tracking + clock correction).** Without this resolution, 1b ships claiming to fix iOS drift when it may not.

> **SHOULD-FIX S2:** Add an `audioContext.onstatechange` handler in `createMicAudioGraph` that logs `[mic-recorder-audio] audioContext state changed: running | suspended | closed` and, if possible, accumulates the suspended period so `getAudioContextElapsedMs` can correct for it. Even if the plan's iOS hypothesis is correct, this is essential observability — prod debugging of "replay drift" reports is currently impossible without knowing whether the AudioContext was suspended.

> **SHOULD-FIX S3:** The plan must explicitly state: **do not reset `audioContextAccruedMsRef` on rollover.** The sentence "On auto-rollover we PRE-WARM a second MediaRecorder" in `useAudioRecorder.ts` already notes the complexity of rollover. An executor who also resets the new accumulator would silently make `t` non-monotonic (resetting to 0 mid-session), breaking replay ordering.

> **SHOULD-FIX S4:** Clarify the `performance.now()` fallback boundary. The safest implementation is: the fallback accumulator only starts when `recordingActive` transitions from false → true (same gate as `audioContextAccruedMsRef`). Events before recording starts have `t = 0`. The plan's current language "fall back if `graphRef.current` is null" implies continuous accumulation from hook mount, which would stamp pre-recording events with non-zero `t` values that can't align to the audio timeline.

> **SHOULD-FIX S5:** The 50-minute drift test (`replay-drift-50min.test.ts`) is presented as proving "< 250ms over 50 min." It does not. It proves the accumulation math is correct under the mock clock assumptions. The only empirical proof of the < 250ms threshold on real hardware is a real 50-minute smoke session on iOS with backgrounding events, which the plan defers. Rename the test to `replay-drift-50min-mock.test.ts` or add a comment that this tests accumulation math only, and explicitly add iOS backgrounding to the 1b hardware smoke acceptance criteria.

> **NOTE N2:** The `getAudioContextElapsedMs` implementation anchors to `ctxCreatedAt = audioContext.currentTime` captured at graph creation. Since a freshly created AudioContext always starts `currentTime` at 0.0, `ctxCreatedAt` will always be 0 (or very near it if `resume()` takes perceptible time). The subtraction `(audioContext.currentTime - ctxCreatedAt) * 1000` simplifies to `audioContext.currentTime * 1000`. This is fine functionally but the `ctxCreatedAt` variable is misleading — consider naming it `ctxCresumedAt` and capturing it AFTER `await audioContext.resume()` to anchor to the first running moment.

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

### Assessment

The plan acknowledges iOS as the primary drift concern for 1b. The `performance.now()` throttling problem was documented for iOS specifically. The plan's fix (AudioContext clock) would be most valuable on iOS if the hypothesis holds.

**1b platform matrix as the plan leaves it:**

| Platform | 1b fix tested? |
|---|---|
| Desktop Chrome | ✅ Agent-runnable test + smoke |
| iOS Safari | ⚠️ Only the mock-clock unit test (does NOT test real `AudioContext.currentTime` behavior) |
| Android Chrome | ❌ Not mentioned |
| Firefox | ❌ Not mentioned |
| Safari macOS | ❌ Not mentioned |

iOS Safari is the most important platform (Sarah's stated fallback, and the platform where the drift is worst). The plan defers hardware verification to the manual smoke, but the smoke item (smoke item 7) does not require: "background the iOS tab for 5 minutes mid-session, return, verify replay stays in sync." Without this specific step, the iOS acceptance is based on hoping the `AudioContext` assumption is correct.

**1c platform concerns:**

The `GET /api/whiteboard/[sessionId]/admission-status` polling endpoint is new. On iOS Safari, `setInterval`-based polling can be throttled or frozen when a background tab is targeted. If the student tabs away from the waiting room while polling, the poll can freeze. When they return, the poll resumes. This is not a data loss issue (the session is still waiting) but the student may experience a longer-than-3s admission latency after returning to the tab.

### Findings

> **SHOULD-FIX S8:** The 1b acceptance criteria require "Manual replay smoke: 30-min session, replay stays visually in-sync." This smoke must be explicitly required to include: (a) being run on an iOS device (iPhone or iPad), and (b) deliberately backgrounding the iOS tab for at least 2 minutes during the session to exercise the exact failure mode the fix targets. Without this specific iOS background step in the smoke checklist, the acceptance bar for 1b is incomplete. Add a dedicated smoke item: "**iOS background drift test:** On iOS Safari, record a 10-minute session. At the 4-minute mark, background the Safari app for 3 minutes. Return to foreground. End session. In replay, verify that the strokes at the 4-minute mark align with the audio within the < 250ms tolerance (subjective check — stroke appears on replay visually simultaneous with the corresponding spoken word)."

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

## Summary

| Classification | Count |
|---|---|
| **BLOCKER** | **3** |
| **SHOULD-FIX** | **9** |
| **NOTE** | **8** |

---

## BLOCKER list (verbatim)

**B1 — AudioContext.currentTime iOS suspension claim is unverified and may be false (Axis 2 / Axis 4)**

The plan's core assertion for 1b — that `AudioContext.currentTime` tracks the hardware audio timeline on iOS even when the tab is backgrounded — is stated as fact but is unverified in the codebase, unverified by any cited reference, and contradicted by the known iOS behavior of suspending AudioContext instances for backgrounded tabs. The `createMicAudioGraph` function has no `onstatechange` handler and no mid-session suspension detection. If the AudioContext is suspended during iOS backgrounding, `currentTime` freezes exactly as `performance.now()` throttles, making 1b a null fix for the stated problem on the stated platform. The acceptance criteria for 1b do not include an iOS backgrounding smoke step. Before authorizing 1b execution, Andrew must: (a) provide hardware evidence that active MediaRecorder prevents AudioContext suspension on iOS Safari, (b) explicitly accept the risk and add a mandatory iOS backgrounding step to the 1b smoke, or (c) choose an alternative clock approach (e.g., track AudioContext suspension periods via `onstatechange` and compensate).

---

**B2 — Waiting mode End/Cancel button has no implementation path (Axis 3)**

The plan analyzes "End from waiting mode" as a valid flow ("End from waiting mode works cleanly with no audio, no error") but `handleEndSession` is defined inside `WhiteboardWorkspaceClient` at L2884, and the workspace client is explicitly NOT mounted when `ShellMode === "waiting"`. The shell's waiting mode render has only an Admit button — no End or Cancel button. Without a cancel path, if the tutor abandons the waiting room (closes the browser, navigates away, or decides not to proceed), the `WhiteboardSession` row remains with `endedAt = null` indefinitely, the join token stays active, and the session appears live in all lists and reports. This must be resolved before 1c can execute. The simplest fix is a new `cancelWaitingSessionAction` server action callable directly from `WhiteboardSessionShell`'s waiting-mode render, which calls `endWhiteboardSession` with empty segments.

---

**B3 — "Student is waiting" copy is shown without evidence of student presence (Honesty/Transparency axis, Axis 3)**

The plan's waiting mode shell render shows "Student is waiting to be admitted" unconditionally when `bothConnectedAt === null`. This copy is false when no student has opened the join link. The shell enters waiting mode on page load if `bothConnectedAt === null` — the tutor sees "Student is waiting" from the moment they load the workspace URL, regardless of whether any student has opened the link. Per the founding principle: "not one single claim in the praise/encouragement system is made unless backed by specific provable data." This extends to operational UI copy: showing the tutor that a student is waiting when we have no evidence of student presence is a factual misrepresentation. The plan must either: (a) add tutor-side polling for student arrival (separate from admitted status — the student registers arrival without triggering admit), or (b) use truthful copy that doesn't claim student presence: "Waiting for your student..." changes to "Your student has arrived" only after the student has registered arrival. Option (b) requires a lightweight `studentArrivedAt` signal (does NOT need a DB column — a server log or an API call from the student page is sufficient to inform the tutor's poll).

---

## Verdict

**BLOCKED-NEEDS-ANDREW**

The plan is **CLEAN-FOR-1b CODE AUTHORING ONLY** with Andrew's explicit acceptance of B1's iOS risk and a commitment to add iOS backgrounding to the 1b smoke. The plan is **BLOCKED for 1c execution** until B2 (End button mechanics) and B3 (honest waiting copy) are resolved.

The three BLOCKERs do not require abandoning the plan's approach — they require Andrew to make two deliberate choices (iOS clock risk on B1; waiting-copy semantics on B3) and to add one architectural clarification to the spec (End/Cancel button on B2). None of the BLOCKERs invalidate the core insights of the plan: the `bothConnectedAt` timer fix is correct, the AudioContext approach for drift is worth pursuing, and the FSM/waiting-room sequencing analysis is sound. The plan is close — these are resolvable in < half a day of Andrew's attention before handing to an executor.

---

## Orchestrator synthesis + recommended resolutions (Opus, 2026-06-13 ~03:40)

I (orchestrator) reviewed both the plan and this adversarial pass. Per Andrew's standing "execute-if-clean" delegation, the independent verdict is **not clean**, so **no code was executed tonight.** Below are my recommended resolutions so Andrew's morning is a fast approve/adjust rather than open-ended design. **B2 and B3 are clear plan-completeness fixes (no judgment needed — I recommend just folding them in). B1 is the one genuine judgment call.**

- **B1 (iOS AudioContext suspension) — RECOMMEND: proceed with the AudioContext clock + mitigation, fold iOS smoke into acceptance (downgrades B1 to an accepted-with-mitigation item).** Reasoning: even if iOS suspends `AudioContext` on background, that is arguably the *correct* behavior for our alignment goal — when the audio recording pauses, we *want* the event clock to pause in lockstep so audio and WB events stay on the same timeline (the perf.now bug is precisely that it keeps ticking while audio is frozen, causing drift). The risk isn't "freeze" — it's an *unlogged, unhandled* freeze. **Mitigation to fold into 1b scope:** add an `AudioContext.onstatechange` handler that logs suspend/resume gaps (`rid=`/`avx=` line) so any divergence is visible, and design the clock to be monotonic across suspend. Then Andrew's iOS-background smoke step *validates* rather than *gates*. Net: 1b becomes authorable without an unverified premise, because the fix is strictly >= perf.now under either AudioContext behavior. **Andrew decision needed:** approve this approach, OR insist on hardware confirmation first.
- **B2 (no End/Cancel path in waiting mode) — RECOMMEND: fold a `cancelWaitingSessionAction` into 1c scope** (lightweight server action, ownership-asserted, sets `endedAt`/cleans the session; surfaced as a Cancel control in the waiting shell). No judgment needed — it's an obvious gap in the plan; just add it. Prevents orphaned `endedAt = null` sessions.
- **B3 (false "student is waiting" copy) — RECOMMEND: fold the truthful-copy + arrival-signal fix into 1c scope** (reviewer's option (b): "Waiting for your student…" → "Your student has arrived" only on a real `studentArrivedAt` signal). This is directly mandated by the founding transparency principle, so it's not optional — just build it that way. No judgment needed.

**Net execution decision:** PAUSED pending Andrew's single B1 call. Once B1 is approved (with the onstatechange mitigation), **1b is clean to author tonight-equivalent**; **1c proceeds after the 1a baseline 2-device smoke** (still Andrew-gated hardware) with B2+B3 folded in. Recommended order unchanged: Andrew approves B1 → execute 1b (agent-runnable) → Andrew 2-device baseline smoke (covers 1a + the 1b iOS-background step) → execute 1c with B2/B3 folded → smoke 1c.
