# Phase 2 — Student on New Shell: 5-Axis Adversarial Reliability Review

> **Reviewer:** Independent adversarial pass (Sonnet 4.6)
> **Date:** 2026-06-16
> **Branch:** `phase1/wb-review-correct`
> **Plan reviewed:** [`docs/handoff/phase-2-student-on-new-shell-plan-2026-06-16.md`](phase-2-student-on-new-shell-plan-2026-06-16.md)
> **Grounded against:** `src/app/w/[joinToken]/StudentWhiteboardClient.tsx`, `page.tsx`, `WhiteboardSessionShell.tsx`, `LiveBoardChrome.tsx`, `wb-role.tsx`, `useStudentWhiteboardCanvas.ts`, `sync-client.ts`, `tests/integration/whiteboard-live-sync-regression.spec.ts`, reliability-bar.mdc, AGENTS.md
> **Verdict:** **NOT READY TO EXECUTE** — 4 BLOCKERs must be folded in and 4 MAJORs addressed before the plan is safe to hand to an executor.

---

## Executive summary

The plan's architectural skeleton is sound: new `StudentLiveWorkspaceClient`, discriminated-union shell extension, flag gate, legacy fallback, `initialData` safeguard. The "extend don't rewrite" constraint is correctly scoped. The concurrency and sync-isolation arguments hold because `useStudentWhiteboardCanvas` is reused without modification.

However, four concrete risks are **unaddressed at the plan level** and would silently pass all gating criteria without detecting the failure:

1. The `test:wb-sync` hermetic regression net never exercises the new code path (flag not set, testid contract not specified) — P2 merges with green integration tests that prove nothing about the new path.
2. The `initialData` stable-ref requirement is mentioned as a parenthetical but has no implementation constraint or acceptance test — an executor creating it inline silently wipes live student strokes on every render cycle.
3. `WbAVCluster` reuse in the student shell has no explicit verification that it doesn't transitively require the tutor's recording-FSM context provider — if it does, student join crashes at runtime.
4. The recording disclosure notice present in the legacy client (static "This session is being recorded by your tutor") has no equivalent in the new chrome spec — students on the new shell get zero disclosure until P3.

None of these require architectural rework. Each requires a specific addition to the plan's acceptance criteria or task steps.

---

## Findings by axis

---

### Axis 1 — Data loss / durability

#### [BLOCKER] A1-B1 — `initialData` stable-ref underspecified; inline object literal silently wipes live strokes

**Risk.** Plan §5 says: *"Use stable ref for `initialData` (replay lesson: unstable ref re-applies scene)."* The parenthetical correctly cites the replay bug. But the plan gives the executor zero implementation constraint or testable acceptance criterion. An executor who writes:

```tsx
<ExcalidrawDynamic
  initialData={{ elements: [], appState: { isLoading: false, ... } }}
```

passes a new object on every render. Excalidraw's `initialData` prop is applied on **mount** in v0.17+ (stable Ref is the caller's responsibility). In practice, if the executor creates the object inline, Excalidraw ignores it after mount and the behavior is fine — BUT if the component remounts (React StrictMode in dev, or any parent state change that forces a remount), the empty `initialData` is re-applied, wiping the live scene. This is exactly the failure mode that bit the replay-in-frame work. The replay bug was in production, not dev.

**Fix required in plan:** Add to Step 5 acceptance criteria: "The `initialData` object MUST be a module-level constant or created with `useMemo(() => ({ elements: [], appState: { ... } }), [])` (empty deps). A DOM unit test MUST assert that the same object reference is passed across two re-renders of `StudentLiveWorkspaceClient` when its external props change."

**File:line context:** Plan §5 mechanism #1; replay precedent at `docs/handoff/phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md`.

---

#### [MINOR] A1-M1 — Single-slot v3 buffer window is wider on new shell

The `useStudentWhiteboardCanvas` hook (`src/hooks/useStudentWhiteboardCanvas.ts` L519-524) buffers at most **one** pending v3 packet when `excalidrawAPI` is not yet ready:

```ts
if (!apiNow) {
  const prevB = pendingV3Ref.current;
  if (prevB && !shouldAcceptTutorRev(r, prevB.rev)) { return; }
  pendingV3Ref.current = { rev: r, details };
  return;
}
```

If the tutor broadcasts twice before the student's Excalidraw API is ready, only the latest rev survives. This is existing behavior. However, the new shell adds chrome composition overhead (`WbRoleProvider`, `LiveBoardChrome`, slot rendering), so the API-ready window is potentially wider. Combined with the `initialData` fix (A1-B1), the watchdog timer (§5 mechanism #2) mitigates the stuck-loading scenario but does not close the single-slot buffer window during normal (non-stuck) load. No data loss in production; only affects the board-paint latency on join.

**Disposition:** No plan change required; document in MINOR list of the STATUS doc.

---

#### [MINOR] A1-M2 — Student strokes broadcast as v2, tutor expects v3

At `src/hooks/useStudentWhiteboardCanvas.ts` L715-728, the student's `onCanvasChange` broadcasts via `sync.broadcastScene(elements, getPageBroadcastExtras())`. The log label is `action=broadcast-v2`. Meanwhile the tutor's inbound handler is designed to receive v3 (document-full) and currently logs `action=v2-drop warn reason=inbound-v2-retired` for v2 messages from the student direction. This asymmetry is pre-existing and intentional (tutor authoritative; student strokes propagate back via the merge chain), but the new client must not silently change this broadcast format. The plan says "Reuse without modification" — verify this is preserved exactly in the copy-adapt in Step 2.

---

### Axis 2 — Concurrency / sync correctness

#### [BLOCKER] A2-B2 — `test:wb-sync` hermetic relay NEVER exercises new path

**Risk.** The integration test at `tests/integration/whiteboard-live-sync-regression.spec.ts` L79-84 opens the student at `/w/[joinToken]#k=...` and waits for:

```ts
await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible(...)
await waitForWbE2eBridge(studentPage, "student");
```

These two assertions depend on:
1. `data-testid="student-whiteboard-canvas-mount"` present in the rendered HTML.
2. `registerWbE2eSceneBridge("student", api)` called at Excalidraw mount (legacy `StudentWhiteboardClient.tsx` L951).

Unless `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` is set in the Playwright environment, the flag gate in `page.tsx` always routes to the legacy `StudentWhiteboardClient`. The plan marks `test:wb-sync` as "mandatory before merge" (§7), but if the flag is not set in `playwright.config.ts` / `.env.test`, `test:wb-sync` passes green while exercising **only the legacy code path**. The new `StudentLiveWorkspaceClient` sync path is never covered by the hermetic relay.

**Compounding risk:** Even if the executor adds `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` to the test env, `StudentLiveWorkspaceClient` must explicitly:
- Export `data-testid="student-whiteboard-canvas-mount"` on the canvas wrapper.
- Call `registerWbE2eSceneBridge("student", api)` at `excalidrawAPI` ready.
- Call `registerWbE2eSceneMutationHook("student", ...)` when `NEXT_PUBLIC_WB_E2E_SCENE_HOOK === "1"`.

The plan mentions reusing these only implicitly in the "extract from legacy" guidance (Step 2 table). They are not listed as acceptance criteria in Step 7.

**Fix required in plan:** Add to Step 7:
- Set `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` in the Playwright environment block (or add an explicit second test run with the flag on).
- Add `StudentLiveWorkspaceClient` acceptance criteria: `data-testid="student-whiteboard-canvas-mount"` present; `registerWbE2eSceneBridge("student", ...)` called; `registerWbE2eSceneMutationHook("student", ...)` called when E2E hook flag set.
- A `test:wb-sync` green run with the flag on is the minimum viable gate; green with flag off only proves legacy.

---

#### [MINOR] A2-M3 — v3 apply chain uses `v3ApplyChainRef.current` (module-level Promise chain); two mounts would share state

`useStudentWhiteboardCanvas` creates `v3ApplyChainRef` as a ref initialized to `Promise.resolve()`. Because the ref is created fresh on each hook call, two simultaneous mounts of `StudentLiveWorkspaceClient` in the same React tree (e.g., during StrictMode double-invoke in dev) would each have their own chain. This is fine. However, if `StudentLiveWorkspaceClient` were accidentally mounted twice by a shell bug (e.g., the student branch in `WhiteboardSessionShell` doesn't skip rendering the default `WorkspaceResumeGate`), both instances would share the same `syncClient` (created from the same `encryptionKey`), causing double-apply. The plan correctly says "Skip `WorkspaceResumeGate` (IndexedDB resume is tutor-only)" but this must be enforced by the shell branch — a DOM test on Step 3 should assert `WorkspaceResumeGate` is NOT rendered in the student tree.

---

#### [MINOR] A2-M4 — `relayShowsCollaborator` dropped silently

The legacy client tracks `relayShowsCollaborator` (set via `client.onRemoteScene` callback, `StudentWhiteboardClient.tsx` L227) to display tutor-presence text ("Others in this room"). The plan's new chrome uses `WbStatusPill` tokens for connection state but doesn't specify what drives the "tutor is in the room" signal. If `relayShowsCollaborator` is not ported (or equivalent), the student has no indication when the tutor joins after they do. Affects "waiting" UX but not reliability.

---

### Axis 3 — Failure recovery / resilience

#### [BLOCKER] A3-B3 — `WbAVCluster` recording-context dependency unverified; crash risk on student join

**Risk.** The plan reuses `WbAVCluster` in `StudentLiveWorkspaceClient` (plan §3 "Canvas overlay" slot). `WbAVCluster` lives in the tutor's chrome and was written in the context of `WhiteboardWorkspaceClient`, which mounts the recording FSM and associated context providers. If `WbAVCluster` (or any component it transitively renders) calls `useContext(RecordingContext)` and throws when the context is absent — which is a common pattern in this codebase (`useWbRole`, `useWbCapabilities` both throw on missing context) — student join throws a React error boundary crash.

The plan's Step 4 says "Gate `WbAVCluster` local tile on capability; request cam early enough for self-view" but has no acceptance criterion of the form: "Verify `WbAVCluster` renders without recording-FSM context provider." Step 2 says "Do not import recording hooks, `WorkspaceResumeGate`..." — but this constraint applies to `StudentLiveWorkspaceClient`, not to what `WbAVCluster` itself imports transitively.

**Fix required in plan:** Add a pre-flight task to Step 4: "Audit `WbAVCluster`'s transitive imports for any recording-context hook or `useContext` that throws on missing context. If found: (a) extract a `WbAVClusterStudent` variant that accepts the `localTile` prop directly without recording context, OR (b) make `WbAVCluster` accept an optional recording-context override. DOM test must verify `WbAVCluster` renders without error when mounted inside `WbRoleProvider role="student"` with no recording provider."

---

#### [MAJOR] A3-M5 — Device hotload missing from smoke checklist

**Risk.** AGENTS.md documents "device hotload (plugging in a mic/cam mid-session without refresh — Andrew's explicit hard requirement)" as a hard requirement. The plan's smoke outline (§7) item 9 covers "Tutor hears student; student hears tutor" — general A/V connectivity. It does not include a dedicated device-hotload item on the student path. The new `StudentLiveWorkspaceClient` reuses `useLiveAV` (unchanged), which should handle `devicechange` events, but this is assumed not tested on the student path.

**Fix required in plan:** Add smoke item 9b: "Student plugs in second webcam or headset mid-session (device hotload): `useLiveAV` detects new device, video device picker reflects it, existing call remains active, no refresh needed. Mark: tested vs assumed." The existing `VideoControls` is omitted in P2 per Q3 default, but the underlying `useLiveAV.videoDevices` enumeration must still update.

---

#### [MINOR] A3-M6 — Dual-banner scenario unaddressed (board-wait 8s + watchdog 5s overlap)

The plan ports the `student-board-sync-wait-banner` (fires at 8s if `tutorStreamReady` is false) and adds the `useExcalidrawLoadingGuard` watchdog (fires at ~5s if `appState.isLoading`). Both can trigger on a cold join: the watchdog fires at 5s showing "Board is taking too long to load — Reload"; then 3s later the board-wait banner fires with "The board is still empty after several seconds — Reload." The student sees two overlapping reload CTAs with different explanatory text. No interaction between them is specified. Recommend: if `stuckLoading` is true, suppress the board-wait banner (they share root cause) and vice-versa.

---

#### [MINOR] A3-M7 — Step 1+2 before Step 3 ordering dependency implicit

The plan says "prefer landing Steps 1+2 together" and Step 3 is separate. In the intermediate state where Steps 1+2 are committed but Step 3 (shell extension) is not, the `StudentWhiteboardSessionShell` calls into `WhiteboardSessionShell` with `role="student"` which the shell doesn't yet accept — TypeScript error. The executor could accidentally deploy Vercel preview with `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` in this state. The plan should explicitly state: "Flag MUST remain unset (legacy path only) until Steps 1+2+3 are all in the same commit or Steps 1+3 land together."

---

### Axis 4 — Observability

#### [MINOR] A4-M8 — `wjg` logging gap: key-read and sync-connect happen in `StudentLiveWorkspaceClient`; shell-level props not logged

The plan's §5 `wjg` log sequence is:
```
[wjg] ... action=mount role=student
[wjg] ... action=key_ok|key_missing
[wjg] ... action=sync_connect|sync_disconnect
[wjg] ... action=excalidraw_api_ready
[wjg] ... action=loading_cleared source=...
[wjg] ... action=loading_stuck ageMs=5000
```

`action=mount` fires in `StudentLiveWorkspaceClient` at component mount. `action=key_ok|key_missing` fires after `readKeyFromHash()`. The `wjg=<joinToken:8>` identifier is the path join token — this is the most useful correlation key. However, there's no log event for the server page having already stamped `bothConnectedAt` (which fires at SSR time, before the client mounts). A student who refreshes after `bothConnectedAt` is already set gets the same sequence of logs as a first-time joiner, which is fine. No gap.

One genuine gap: there is no `wjg` log for `action=session_ended` (when the `join-timer` poll returns `live: false`). This means a prod debug session where the student sees the "session ended" card has no wjg log entry explaining why. Add: `[wjg] ... action=session_ended reason=<mapped_reason>` when `joinUnavailableReason` is set.

---

#### [MINOR] A4-M9 — `wjg` not registered in AGENTS.md logging registry in Step 7 (only Step 5)

Plan §5 correctly says "Register `wjg` in `AGENTS.md` logging registry in implementation commit." But the Step-by-step breakdown assigns this to Step 5 (the loading guard step). If Step 2 (`StudentLiveWorkspaceClient`) lands first and emits `action=mount` / `action=key_ok`, those log lines precede the AGENTS.md update. The registry should be updated in the same commit as the first `[wjg]` line is introduced (Step 2), not deferred to Step 5. Minor coordination issue.

---

### Axis 5 — Security / consent / ownership

#### [BLOCKER] A5-B4 — Recording disclosure notice absent from new chrome spec

**Risk.** The legacy `StudentWhiteboardClient.tsx` L613-618 shows a static disclosure in the header card:

```tsx
<p className="muted" ...>
  This session is being recorded by your tutor. What you draw is
  visible live.{" "}
```

This is not a consent gate — it's a static notice that informs the student their work is being recorded. P2's chrome spec (§3 top bar slot: "Tutor name, WbThemeToggle, connection pills, session timer, Leave") has no equivalent. P3 defers "Consent toggle wiring / educational-use enforcement UI" — but the disclosure notice is not a toggle. It is a one-line static statement that tells the student what is happening.

Removing it in P2 means students who join via the new shell get zero recording notice until P3 ships. This surfaces as a functional gap in the two-device smoke (smoke item 2: "Student sees `mynk-wb-chrome`") but the smoke checklist has no item verifying the disclosure notice is present. If P3 is delayed (which is common), this gap persists in production.

**Fix required in plan:** Add a chrome slot requirement: top bar or a persistent banner MUST include static disclosure text equivalent to the legacy notice when `wantsRecording` context is true (which it always is for the tutor). Add smoke item 2a: "Recording disclosure visible on student chrome."

---

#### [MINOR] A5-M10 — `role="student"` capability isolation: student-branch in shell must not reach `WorkspaceResumeGate`

The plan correctly says "Skip `WorkspaceResumeGate` (IndexedDB resume is tutor-only)." But there is a more subtle risk: `WorkspaceResumeGate` reads `adminUserId` to query IndexedDB for a draft recording checkpoint. The student shell discriminated union deliberately omits `adminUserId`. If the executor accidentally routes the student branch through `WorkspaceResumeGate` (e.g., a conditional `if role !== "student"` is missing), `WorkspaceResumeGate` calls with `undefined` adminUserId and may throw or silently skip. The Step 3 DOM test "Add student branch smoke (live only)" should explicitly assert `WorkspaceResumeGate` is NOT rendered.

---

#### [MINOR] A5-M11 — Anonymous join and share-access-scope: token-validated by server page; new shell doesn't change this

The `page.tsx` server component validates the join token (L76-81), stamps `bothConnectedAt`, and 404s on revoked/expired/ended sessions. The new shell doesn't change the server component — correct. The `share-access-scope.ts` (`sal` prefix) is for authenticated share-link access (`/s/*`) and is irrelevant to `/w/[joinToken]`. No gap here; noting for completeness.

---

#### [MINOR] A5-M12 — `defaultShowLocalVideo` flip: tutor side unaffected; guard against future `deriveWbCapabilities` callers

`wb-role.tsx` L52: `defaultShowLocalVideo: false` for student today. The plan flips this to `true`. The change only affects `deriveWbCapabilities("student")` — the tutor path always calls `deriveWbCapabilities("tutor")` (line 29), which already returns `defaultShowLocalVideo: true`. No tutor regression.

One future risk: if a future feature adds a third role (e.g., `"observer"`) and inherits from the student defaults, it would unexpectedly get self-view on. Not a P2 concern; document in STATUS doc.

---

### "Extend don't rewrite" challenge on `WhiteboardSessionShell`

**Assessment: Mostly achievable, one TypeScript surface change is a breaking type.**

The current `WhiteboardSessionShellProps` (`WhiteboardSessionShell.tsx` L36-50) is a flat type with no `role` field. The plan adds a discriminated union with `role?: "tutor"` (optional) and `role: "student"` (required for student branch). Making the discriminant optional for `"tutor"` breaks TypeScript inference for the union — TypeScript needs the discriminant to be required and literal on both branches for the union to narrow correctly.

**Concrete issue:** With `role?: "tutor"`, when the caller does NOT pass `role`, TypeScript sees `role: undefined` which doesn't narrow to either union member. The plan would need `role: "tutor"` (required) on the tutor branch, which requires updating the existing tutor workspace page call site. This is a small coordinated change but it IS a breaking type change on the shell's existing consumer.

**Fix required in plan:** Step 3 must add: "Update the tutor workspace admin page to pass `role="tutor"` explicitly to `WhiteboardSessionShell`. This is a one-line change at the call site; include in Step 3 acceptance: TypeScript compiles with strict discriminated union and no `as` casts."

---

### Smoke outline gap analysis (§7 two-device items)

| Item | Gap |
|---|---|
| Item 0 (Loading scene repro) | Adequately spec'd. |
| Item 1 (Flag off legacy) | Add: "Verify `data-testid="student-whiteboard-canvas-mount"` is absent on new-shell mount path when flag off" — so we know legacy testid is stable. |
| Item 2 (Flag on chrome) | **Add 2a**: Recording disclosure visible. |
| Item 3 (Mutual draw) | Adequately spec'd. |
| Item 4 (Page isolation) | Adequately spec'd. |
| Item 5 (PDF / image) | Adequately spec'd. |
| Item 6 (Graph embed) | Adequately spec'd. |
| Item 7 (Follow toggle) | Adequately spec'd. |
| Item 8 (Self-view) | **Add**: "Verify self-view tile visible on mobile portrait viewport (≤428px width); tile must not be silently dropped by chrome collapse." |
| Item 9 (A/V) | **Add 9b**: Device hotload (see A3-M5). |
| Item 11 (Loading guard) | Adequately spec'd. |
| Item 12 (Mobile) | Adequately spec'd. |
| Item 13 (Theme) | Adequately spec'd. |
| — | **Missing**: "Tutor-path regression: tutor-side smoke items 1–6 pass unchanged after P2 branch is merged — no regression on recording FSM, page switch, self-view (tutor already ON)." This is the "extend don't rewrite" proof-of-non-regression. |

---

## Consolidated finding table

| # | Axis | Severity | Title |
|---|---|---|---|
| A1-B1 | Data durability | **BLOCKER** | `initialData` stable-ref underspecified — silent stroke wipe on remount |
| A2-B2 | Concurrency / sync | **BLOCKER** | `test:wb-sync` never covers new path (flag not set in test env; testid/bridge not contracted) |
| A3-B3 | Failure recovery | **BLOCKER** | `WbAVCluster` recording-context dependency unverified — crash risk on student join |
| A5-B4 | Security / consent | **BLOCKER** | Recording disclosure notice absent from new chrome spec |
| A3-M5 | Failure recovery | **MAJOR** | Device hotload missing from student smoke checklist (Andrew hard requirement) |
| A3-M6 | Failure recovery | **MAJOR** | Dual-banner scenario (watchdog 5s + board-wait 8s) unaddressed |
| A3-M7 | Failure recovery | **MAJOR** | Step ordering dependency implicit — intermediate flag-on state breaks TypeScript |
| A2-M3 | Concurrency | **MAJOR** | `WorkspaceResumeGate` skip not in Step 3 DOM test acceptance criteria |
| A1-M1 | Data durability | MINOR | Single-slot v3 buffer window wider on new shell (pre-existing, mitigated by watchdog) |
| A1-M2 | Data durability | MINOR | Student broadcasts v2; confirm format preserved in copy-adapt (Step 2) |
| A2-M4 | Concurrency | MINOR | `relayShowsCollaborator` / tutor-presence indicator not ported |
| A4-M8 | Observability | MINOR | `wjg` missing `action=session_ended` log entry |
| A4-M9 | Observability | MINOR | `wjg` AGENTS.md registry update deferred to Step 5; should land with first `[wjg]` line |
| A5-M10 | Security | MINOR | Student branch skip of `WorkspaceResumeGate` not in DOM test spec |
| A5-M11 | Security | MINOR | Anonymous join / share-access-scope unaffected (noted, no action needed) |
| A5-M12 | Security | MINOR | `defaultShowLocalVideo` flip: tutor unaffected; document in STATUS doc |
| — | Extend-don't-rewrite | **MAJOR** | Discriminated union TypeScript breaking change — tutor page call site update required |
| — | Smoke outline | **MAJOR** | Tutor-side regression smoke missing from outline; no "non-regression proof" item |

---

## BLOCKERS — must fold into P2 acceptance before executor receives plan

### BLOCKER 1 — `initialData` stable-ref (Axis 1 / Data durability)

**Where to add:** Plan §5 Mechanism #1 + Step 5 Exit criteria.

**Required addition:**
> "The `initialData` object MUST be a module-level constant (`const STUDENT_INITIAL_DATA = { elements: [], appState: { isLoading: false, ... } } as const`) or `useMemo(() => ({...}), [])` with empty deps array. NEVER create it inline. Acceptance test: `StudentLiveWorkspaceClient.dom.test.tsx` renders the component twice with changed external props; asserts `ExcalidrawDynamic` received the same `initialData` object reference both times (`Object.is(a, b) === true`)."

---

### BLOCKER 2 — `test:wb-sync` flag coverage (Axis 2 / Concurrency)

**Where to add:** Plan §7 Automated (merge gate).

**Required addition:**
> "The `test:wb-sync` gate MUST be run with `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL=1` set in the Playwright environment. Acceptance: a `playwright.config.ts` environment block or `.env.test.local` sets the flag; the `openTutorAndStudent` helper navigates to `/w/[joinToken]` and finds `data-testid='student-whiteboard-canvas-mount'` from the NEW client. `StudentLiveWorkspaceClient` MUST call `registerWbE2eSceneBridge('student', api)` at Excalidraw mount and `registerWbE2eSceneMutationHook('student', ...)` when `NEXT_PUBLIC_WB_E2E_SCENE_HOOK === '1'`; these are listed as explicit acceptance criteria in Step 7, not just implicitly inherited from the copy-adapt."

---

### BLOCKER 3 — `WbAVCluster` recording-context audit (Axis 3 / Resilience)

**Where to add:** Plan §4 Step 4, before the Exit criteria.

**Required addition:**
> "Pre-flight before Step 4: Read `WbAVCluster`'s source and every hook it calls. If ANY `useContext` call throws on missing context (pattern: `if (!ctx) throw new Error(...)`), document whether that context is recording-FSM-owned. If yes: extract a `WbAVClusterStudent` variant that accepts `localTile` directly without the recording context dependency, OR add a `?? null` guard to the recording context read in `WbAVCluster` so it is tolerant of absent recording provider. DOM test MUST render `WbAVCluster` (or `WbAVClusterStudent`) inside `<WbRoleProvider role='student'>` with no recording provider parent and assert no React error boundary is triggered."

---

### BLOCKER 4 — Recording disclosure notice (Axis 5 / Security / consent)

**Where to add:** Plan §3 Shell contract — top bar slot; §7 smoke item 2.

**Required addition:**
> "The new chrome top bar or a persistent chrome-level banner MUST include recording disclosure text equivalent to the legacy notice at `StudentWhiteboardClient.tsx` L613: 'This session is being recorded by your tutor.' This is a static notice, not a consent toggle. It MAY be styled using the `WbStatusPill` or a dedicated notice token — but it MUST be visible on both mobile and desktop layouts. Smoke item 2a: 'Recording disclosure visible on new student chrome — student can read tutor-recording notice without scrolling.'"

---

## MAJOR findings — must be addressed before merge, may be resolved during execution

| # | Title | Required fix |
|---|---|---|
| M-A | Device hotload smoke | Add smoke item 9b: "Student plugs in additional camera/mic mid-session; useLiveAV detects device; no refresh required." Mark tested vs assumed. |
| M-B | Dual-banner interaction | Specify: if `stuckLoading === true`, suppress `boardWaitElapsed` banner (they share root cause). Add to Step 5 acceptance: only one reload CTA visible at a time. |
| M-C | Step ordering dependency | Add explicit note: "Flag MUST remain unset until Steps 1+2+3 land in the same commit (or Steps 1+3 land together). Never enable flag on Vercel Preview between Step 2 and Step 3." |
| M-D | TypeScript union discriminant | Step 3 must include: "Update tutor workspace admin page call site to pass `role='tutor'` explicitly. TypeScript must compile without `as` casts. No `role?: 'tutor'` optional discriminant — use required on both union branches." |
| M-E | `WorkspaceResumeGate` skip DOM test | Step 3 DOM test must assert `data-testid='workspace-resume-gate'` (or whatever testid the gate uses) is NOT present in the student shell render tree. |
| M-F | Tutor regression smoke | Add smoke item 15: "Tutor-path regression: with flag off and on, verify tutor chrome (recording FSM, page switch, self-view, End Session) is unchanged — P2 branch has not regressed the live tutor path." |
| M-G | STATUS doc | Create `docs/WHITEBOARD-P2-STATUS.md` per reliability-bar.mdc: guardrails, adversarial review verbatim, phase status table, demo gate checklists. The plan document is not sufficient — the STATUS doc survives session truncation and is the per-session handoff. |

---

## Verdict

**NOT READY TO EXECUTE.**

The plan needs a targeted revision pass to fold in the 4 BLOCKERs above. Each is a 1–4 line addition to the plan's existing acceptance criteria or task steps — none require architectural changes. The overall architecture (new `StudentLiveWorkspaceClient`, discriminated-union shell, flag gate, legacy fallback, `initialData` safeguard, reused sync hooks) is sound and correctly scoped.

**After the revision pass:**

Run order: fix plan → executor executes Steps 0–3 → validate B2 (`test:wb-sync` flag env configured) and B3 (WbAVCluster audit) before committing Step 4 → Steps 4–5 → Step 7 with both flag-off and flag-on `test:wb-sync` runs → Step 8 smokebook → Step 9 only after Andrew two-device PASS.

**Top 3 risks:**

1. **`test:wb-sync` coverage gap (BLOCKER 2)** — the most dangerous because it is invisible. P2 merges with green tests; Sarah hits the new student join on real hardware; it fails. The hermetic relay is the safety net that exists specifically to catch this class of bug. Don't merge without flag-on integration test coverage.

2. **`initialData` stable-ref (BLOCKER 1)** — silent data-loss in a hard-to-reproduce scenario (component remount). The precedent (replay-in-frame bug) shows this exact failure went to production. The fix is trivial (module const); not specifying it is the risk.

3. **`WbAVCluster` recording context (BLOCKER 3)** — if `WbAVCluster` throws on missing recording context, student join crashes on every visit to the new shell (100% failure rate). The probability depends on implementation; the audit cost is 10 minutes; the crash cost is a broken P2 rollout.

---

*Review authored 2026-06-16. Grounded against code at HEAD of `phase1/wb-review-correct`.*
