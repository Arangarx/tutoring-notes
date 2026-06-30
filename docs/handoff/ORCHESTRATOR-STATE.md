# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-06-30 consent-batch + Part 3 design-pass gate on `wb-wave5-polish`

> **Active branch:** [`wb-wave5-polish`](https://github.com/Arangarx/tutoring-notes/tree/wb-wave5-polish) — code @ [`045a7b4`](https://github.com/Arangarx/tutoring-notes/commit/045a7b4). **Worktree:** `tutoring-notes-polishwt` (default `tutoring-notes` checkout is on `v1-redesign` — NOT current). **All remaining Sarah-gate work lands here; single `merge --no-ff` to `v1-redesign` at final gate only (no interim merge, Andrew confirmed).** Integration base remains **`v1-redesign` @ [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc)**.

| Field | Value |
|---|---|
| **Last action completed** | **2026-06-30 DESIGN PASS (consent batch) — Andrew ratified consent/privacy decisions (see Recent architectural decisions table).** — — — **2026-06-30 p1c CSS co-location EXECUTED + pushed @ `045a7b4`** (Composer; 3 component-specific groups relocated into co-located sibling `.css`, shared primitives single-sourced, monolith −121L, jest 755/755 + tsc clean, appearance checkpoint-smoke-gated — detail in In-flight row). **ALL Part 1/2 EXECUTION on `wb-wave5-polish` now complete** (coordinators A/V done + recording deferred; WbTopBar de-dup; CSS co-loc; reconnect + legacy-tests slivers); only the Part 1+2 checkpoint gates + the Andrew-gated design pass remain. — — — **2026-06-30 p2a FOLD + p1c CSS verdict (this turn):** Andrew chose to **FOLD both p2a items into the consent/recording DESIGN PASS** — `p2a` allowWhiteboardRecording verify returned verdict **(d) NOT ENFORCED** (flag is real in schema + `SessionConsentSnapshot` + parent UI but gates nothing: stroke capture runs on `recordingActive`, `events.json` always uploads, tutor/share/parent replay never check it; audio path DOES enforce `allowAudioRecording` server-side). Unresolved **D-1 vs D-2** fork (D-1 = upload always + gate parent/share replay access; D-2/BLOCKER = gate the `events.json` upload) — decide in design pass. `p2a` in-person consent projection = **UNBUILT, explicitly deferred** ("Plan #2"); `sessionMode=IN_PERSON` today only flips waiting-room Start gate; student consent has NO effect on tutor capture with no remote peer; wiring touches recording-start gate + `lifecycle-machine` FSM + `onWorkspaceAudioRecorded` (the deferred Part 3 recording surface). Both folded → owned by the Part 3 + consent design pass; neither executed on branch. p1c CSS investigation = verdict **(b)**: chrome = single 3090-line global-BEM monolith `whiteboard-chrome.css`; the 4 de-duped components lean on SHARED primitives (`mynk-wb-tb-btn`, `mynk-wb-topbar__desktop-only`, `mynk-wb-timer`) → per-component co-location HIGH-risk + against repo convention (chrome has no co-location precedent; only new-prefix subsystems do). Only 3 isolated groups cleanly movable (`mynk-wb-status-pill*` `:2716-2733`, `mynk-wb-toolbar-toggle*` block+keyframes `:1685-1742`, `mynk-wb-tb-btn--exit` `:2961-2971`). **p1c decision pending with Andrew** (minimal single-partial split vs section-comments-only vs skip). — — — **PRIOR — WbTopBar incremental de-dup COMPLETE (p1b-wbtopbar, Andrew chose "incremental additive" approach — NOT a single-component render rewrite).** Pushed `8c2c444..3bca314`: new shared chrome components `WbExitButton`, `WbStudentConnectionStatus`, `WbUndoRedoButtons`, `WbToolbarToggle` (reused across tutor + student-narrow + student-non-narrow render sites; all testids/classes/handlers preserved), plus `deriveWbCapabilities(role)` wired to replace 5 inline `role===` checks (canEndSession/canShareLink/canInsertAssets/showFollowControls/showLeaveInsteadOfEnd — verified 1:1 with old conditions; function is pure role-derived). Mic recorder-vs-live split + theme-state sources intentionally left (justified divergence). Gates: `test:wb-jest` 755/755, `tsc` clean, av-mount + End dom suites pass. **`StudentLiveWorkspaceClient.dom.test.tsx` fails 3/3 — VERIFIED PRE-EXISTING via A/B at `8c9f68b`** (unmocked IndexedDB in audio-draft recovery effect; logged BACKLOG `WB-TESTENV-IDB-STUDENT-SUITE`; not in `test:wb-jest` selector). **Remaining Part 1/2 residuals:** `p1c` CSS co-location, `p2a` in-person consent projection, `p2a` allowWhiteboardRecording verify. Chrome change's real gate = browser smoke at Part 1+2 checkpoint. — — — **PRIOR: `useLiveAvCoordinator` extraction COMPLETE (p1b, Opus, stabilize-in-place → pure-move; Andrew scope: A/V coord now, recording coord DEFERRED to Part 3 design pass).** Landed + pushed: `e24c76a` stabilize whole-`liveAv` deps via `liveAvRef`; `3464baf` create `src/hooks/useLiveAvCoordinator.ts` + reconnect trio (student/tutor sync-reconnect + tutor roster-rejoin) + per-session latch; `12c0d54` student bootstrap + device-list refresh + camera auto-request; `7d3612d` lifecycle-participant 8s debounce + `bothPartiesInRoom` gate (setters + reactive primitives threaded; `reachablePeerIdsKey` memo kept in component, FSM reads `lifecycleParticipants` state). **Scope call (Opus):** mount-diagnostic logging effects + mic/cam UI callbacks + overlay-meter memo INTENTIONALLY RETAINED in component (diagnostic glue next to `logMountPhase`; JSX-consumed handlers; `handleAcquireMic` crosses into recording `workspaceAudio`). Coordinator owns A/V *behavior* (acquisition + connection reconcile + FSM-input production); component keeps A/V *logging + UI glue*. No distinct `late-track-sync` effect in component (lives in `useLiveAV`/peer-mesh). Gates per commit: dom av-mount 17/17, `test:wb-jest` 755/755, `tsc` clean. **Sonnet adversarial review of full extraction diff (`8b77506..7d3612d`) = CLEAN** (effect-ordering preserved; debounce-cadence equivalent; reconnect `liveAv`→`liveAvRef` stabilization noted as *strictly more reliable* — eliminates a per-render listener re-subscription race). p1b-avcoord DONE. **Earlier this session:** p1a/p1d residual slivers closed @ `8b77506` (student sync-reconnect dom test, `WB-AV-GAP-3`, dead regex removed). **Prior — Consent/permission hardening DONE:** tutor consent modal removed; `CONSENT_ENFORCEMENT` deleted; `sessionPhase=ACTIVE` server guards; `allowLiveSession=false` blocks learner join; `allowNoteSending` ungated + UI hidden (`WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME`). **Plan input decisions resolved 2026-06-30:** per-speaker ≤3–4 cap no mixdown fallback; **t=0 = FSM recording entry (RATIFIED INPUT)** + WB↔audio hardware sync oracle; eval harness post-Sarah; session-scoped consent override → BACKLOG won't-build. **Andrew ratified Part 3 design-pass gate:** no p3-* execution until design session with Andrew approves overall Part 3 architecture/sequencing. |
| **Next action(s)** | **(1) Part 1 residuals** on `wb-wave5-polish`: `useLiveAvCoordinator` + `useRecordingCoordinator` extraction, unified `WbTopBar`, CSS monolith split (touched surfaces), `p1a-reconnect-finish` (VERIFY-FIRST — likely done), `p1d-legacy-tests` (VERIFY-FIRST — likely script cleanup). **(2) Part 2 residuals:** in-person consent projection (`p2a-inperson-consent`), `allowWhiteboardRecording` verify (`p2a-wb-recording-verify`). **(3) Part 1+2 checkpoint (NO merge):** `test:wb-sync` + surrogates + `npx next build` + hardware A/V smoke. **(4) Part 3 DESIGN PASS with Andrew (MANDATORY GATE — no p3-* before this).** **(5) Part 3 spine (only after design pass):** `p3-clock` FIRST (t=0 ratified input) → `p3-perspeaker-capture` → … → `p3-replay-scrub` → `p3-video-seam` (design-only). **(6) FINAL Sarah gate:** full-experience hardware smoke both themes → single `merge --no-ff` to `v1-redesign`. |
| **Open Andrew-confirms** | **Consent design pass (partial — Block A ratified):** in-person consent projection scope (**Block B**) + Part 3 architecture/sequencing sign-off (**Block C**) still pending in the design pass. **Part 3 design pass (LIVE GATE):** overall Part 3 architecture/sequencing must be reviewed and approved by Andrew in a design session before any p3-* execution. Ratified inputs (t=0, peer cap, eval timing, tap-before-mix) are NOT a substitute for this gate. **Standing:** **WB-LABEL-PARENT-SIGNIN** new term; **Sarah primary device** (assumed Windows desktop Chromium — verify on next call, [`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)); **Ship-to-Sarah gate** (notes path, end/continue save discipline, single-segment seek); **iOS student WB/A/V** zero real-device coverage ([`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION**). |
| **In-flight subagents** | **None** — design-pass hook-point map COMPLETE (explore/Composer). Key facts for the pass: (A) `allowWhiteboardRecording` gates NOTHING in code — D-1 replay-gate is design-only (`b2-consent-smokebook`), never implemented; both D-1 and D-2 are net-new. **Tutor's own in-frame replay DEPENDS on events.json** (`SessionReviewMode.tsx:111-112` `canReplay = audio OR eventCount>0`) → a clean D-2 upload-block would also kill the TUTOR's WB replay unless we split paths → real fork = "may the tutor retain a non-consenting minor's WB record for their own use?" (audio answer today = no, not persisted at all). D-1 gate points = events proxy routes (`events/route.ts`, `public-events/route.ts`) + page loaders before mounting `WhiteboardReplay*`. (B) workspace `page.tsx` loads NO consent snapshot (confirmed); `sessionMode` only flips waiting-room Start, FSM unaware; capture IS phase-gated via `phaseActive` on FSM input (`:2238`). **Per-peer moderation gain path actually WORKS (`:2385-2398`) but the UI toggle is just not wired** (`handleToggleParticipantMod` never passed to `AVControls`) — relevant to in-person/per-peer. (C) `useRemoteMicRecorders.ts` dormant (not called); single mixdown is live replay source; outbox/DB multi-stream-CAPABLE but enqueue/draft are tutor-mic-only; FSM input `audioClockMs:0` hardcoded, WB events use parallel `useAudioMsClock` (`:377-394`, `:2438`); `SEGMENT_MAX_SECONDS=50*60`. **DESIGN-PASS THREAD OPEN (fresh Opus orchestrator)** — awaiting Andrew on D-1 vs D-2, in-person projection scope, Part 3 architecture/sequencing; `useRecordingCoordinator` extraction folded here. — ✅ **`npx next build` gate PASS @ `aa7e910`** (exit 0, full route table 41/41, no TS/ESLint errors, `✓ Compiled successfully` — pre-existing warnings only; validates the p1c CSS build-surface change). ⏸️ **Full `test:wb-sync` relay DEFERRED to final Sarah merge boundary** (this session's work — A/V coordinator refactor, WbTopBar de-dup, p1c CSS — did NOT touch the `src/lib/whiteboard/` apply-path, so per the merge-cadence refinement the ~38-min relay runs at the merge, not now). ⬜ **Hardware A/V smoke (both themes) still owed** before/at the Sarah gate. p1c CSS co-location **COMPLETE @ `045a7b4`** (pushed `8ad6a5c..045a7b4`): 3 component-specific groups relocated into co-located sibling `.css` (`mynk-wb-status-pill*`→`WbStudentConnectionStatus.css`; `mynk-wb-toolbar-toggle*` block+keyframes+responsive→`WbToolbarToggle.css`; `mynk-wb-tb-btn--exit`→`WbExitButton.css`); MOVE-not-copy (grep-proof zero monolith duplication); shared primitives (`mynk-wb-tb-btn*`, `mynk-wb-topbar__desktop-only`, `mynk-wb-timer`) stay single-sourced; `WbUndoRedoButtons` has no own CSS (shared-only). Monolith **−121L (3090→2969)**; jest 755/755, tsc clean; **appearance checkpoint-smoke-gated** (jsdom blind). BACKLOG: new "CSS / chrome monolith decomposition" heading, IN-PROGRESS. |
| **Uncommitted / unmerged** | **`wb-wave5-polish` @ `045a7b4`** — code pushed through `045a7b4`; this `ORCHESTRATOR-STATE.md` head update committed separately (docs). **Not merged** to `v1-redesign` (single `merge --no-ff` at final Sarah gate only). **`v1-redesign` @ `7397abc`** unchanged. |

**Strategic posture (unchanged):** Experience-driven wedge — WB + reliability = **ground floor (GATE)**; the win = accreting honest tutor-first continuity. [`experience-driven_wedge_ae2776e1.plan.md`](../../../../.cursor/plans/experience-driven_wedge_ae2776e1.plan.md). **Ship-to-Sarah gate** still governs cut to `v1-redesign → master` — see condensed block below.

**Process directives (standing):** preview links in **pairs** (Vercel MCP `branchAlias` + `https://preview.usemynk.com` when repointed); agent-runnable validation harnesses over manual smoke where possible; Opus-default for this reliability effort, Composer 2.5 only for zero-doubt mechanical tasks per active plan.

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Current program:** Complete the **live-session arc** (auth join → waiting room → live A/V whiteboard → end → per-speaker capture → transcription → review) as one reliable unit on `wb-wave5-polish`, then **single merge** to `v1-redesign` (the Sarah merge).

---

## Branch layering

```
master  ←  v1-redesign  (integration base @ 7397abc; Wave 4 merged; held for Sarah gate + master cut)
              ↑
              └── wb-wave5-polish @ 8c9f68b  (ALL remaining work; worktree tutoring-notes-polishwt; NO interim merge)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; Wave 4 student responsive parity merged @ [`a166f6c`](https://github.com/Arangarx/tutoring-notes/commit/a166f6c); subsequent doc commits through [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc) | Not yet merged to `master` — held for Gate A + Ship-to-Sarah + comprehensive re-smoke |
| **`wb-wave5-polish`** | **Active execution branch** — Wave 5 chrome/polish + reliability floor (Parts 1–3 of active plan); worktree `tutoring-notes-polishwt` | [`8c9f68b`](https://github.com/Arangarx/tutoring-notes/commit/8c9f68b) |

**Merge discipline (ratified):** All remaining work stays on `wb-wave5-polish`. **Single `merge --no-ff` to `v1-redesign`** at the final Sarah gate only. No interim merge.

Decisions ledger: [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

---

## Current Wave focus

**Active plan:** [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md) — supersedes archived [`whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md).

**Done on branch (Parts 0, 1A mostly, 2A, 2B mostly):** guardrails, A/V bug fixes (enumerate-mutex, audio-reneg), waiting-room overlay, auth-join, lifecycle/consent unconditional enforcement, phantom-stroke fix, per-speaker investigation.

**Remaining (execution order):**

```mermaid
flowchart TD
  P1R["Part 1 residuals: coordinators + WbTopBar + CSS + reconnect"] --> P2R["Part 2 residuals: in-person consent + allowWbRecording verify"]
  P2R --> CP["Checkpoint NO merge: wb-sync + build + hardware A/V"]
  CP --> P3D["Part 3 DESIGN PASS with Andrew (GATE)"]
  P3D --> P3["Part 3 spine: clock → per-speaker → VAD → map → finalize → replay"]
  P3 --> GATE["FINAL Sarah gate: both themes hardware smoke"]
  GATE --> MERGE["single merge --no-ff → v1-redesign"]
```

| Phase | Key todos | Notes |
|---|---|---|
| **Part 1 residuals** | `p1b-av-coordinator`, `p1b-recording-coordinator`, `p1b-chrome-wbtopbar`, `p1c-css-monolith-split`, `p1a-reconnect-finish`, `p1d-legacy-tests` | Behavior-preserving extractions; Playwright on every fix |
| **Part 2 residuals** | `p2a-inperson-consent`, `p2a-wb-recording-verify` | Waiting room = single consent surface |
| **Checkpoint** | `p1-checkpoint` | **NO merge** — quality gate before Part 3 design pass |
| **Part 3 design pass** | *(Andrew session — not a todo)* | **MANDATORY GATE** — no p3-* execution before Andrew approves overall Part 3 architecture/sequencing. Ratified inputs: t=0, peer cap ≤3–4, eval post-Sarah, tap-before-mix. |
| **Part 3 spine** | `p3-clock` → `p3-perspeaker-capture` → `p3-vad-chunking` → `p3-consent-recording` → `p3-incremental-map` → `p3-model-abstraction` → `p3-finalize` → `p3-replay-scrub` → `p3-video-seam` | Bulk of remaining work; **only after design pass**; tap-before-mix architecture; 6 BLOCKERs in plan adversarial review |
| **Final gate** | `p-final-gate`, `p-test-account-reset` | Both themes; then merge; then test data reset at master cut |

---

## Latest committed state (`wb-wave5-polish` @ `8c9f68b`)

| Commit | Summary |
|---|---|
| [`8c9f68b`](https://github.com/Arangarx/tutoring-notes/commit/8c9f68b) | **Branch tip** — chore(repo): untrack accidentally-committed props-flyout debug screenshot |
| [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882) | fix(tests): upsert ConsentRecord in allowLiveSession denial test (relay harness fix) |
| [`c70e191`](https://github.com/Arangarx/tutoring-notes/commit/c70e191) | Quarantine 2nd-session AV-tile presence test as pre-existing flake |
| [`f0a2b72`](https://github.com/Arangarx/tutoring-notes/commit/f0a2b72) | Phantom-stroke: extend degenerate filter to live-sync broadcast path |
| [`29d9fe9`](https://github.com/Arangarx/tutoring-notes/commit/29d9fe9) | Merge phantom fix (adapter + action-sheet backdrop) |
| [`5acfb10`](https://github.com/Arangarx/tutoring-notes/commit/5acfb10) | Unconditional consent — remove `CONSENT_ENFORCEMENT` flag |
| [`2faecd8`](https://github.com/Arangarx/tutoring-notes/commit/2faecd8) | Remove per-session tutor attestation modal |
| [`63719b4`](https://github.com/Arangarx/tutoring-notes/commit/63719b4) | `allowNoteSending` gate on auto notes trigger |
| [`ab60bf5`](https://github.com/Arangarx/tutoring-notes/commit/ab60bf5) | `sessionPhase=ACTIVE` server guards |
| [`274f21a`](https://github.com/Arangarx/tutoring-notes/commit/274f21a) | `allowLiveSession=false` blocks learner join |
| [`c8265b1`](https://github.com/Arangarx/tutoring-notes/commit/c8265b1) | Phantom-stroke: drop degenerate line/arrow in `toCanonical` |
| [`3429b94`](https://github.com/Arangarx/tutoring-notes/commit/3429b94) | Merge liveboard-chrome student parity + tutor mic-meter fix |
| [`652ab46`](https://github.com/Arangarx/tutoring-notes/commit/652ab46) | Merge waiting-polish quick-wins + join-timer fixes |

Full history: `git log --oneline -25 wb-wave5-polish`.

**Smokebooks (recent):** [`wb-wave5-consent-perms-2026-06-30.md`](wb-wave5-consent-perms-2026-06-30.md), [`wb-wave5-liveboard-chrome-smokebook-2026-06-29.md`](wb-wave5-liveboard-chrome-smokebook-2026-06-29.md), [`wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md`](wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md).

---

## Queued dispatches (in order)

1. **Part 1 residuals** — coordinator extractions, unified `WbTopBar`, CSS co-location, `p1a-reconnect-finish` (VERIFY-FIRST), `p1d-legacy-tests` (VERIFY-FIRST).
2. **Part 2 residuals** — in-person consent projection, `allowWhiteboardRecording` e2e verify.
3. **`p1-checkpoint`** — full `test:wb-sync` + regression + build + hardware A/V (NO merge).
4. **Part 3 DESIGN PASS with Andrew** — mandatory gate; no p3-* execution before Andrew approves overall Part 3 architecture/sequencing.
5. **Part 3 spine** — per-speaker capture through replay-scrub (only after design pass); video seam design-only.
6. **`p-final-gate`** — both themes hardware smoke → **`merge --no-ff` `wb-wave5-polish` → `v1-redesign`**.
7. **`p-test-account-reset`** — at master cut, preserve Andrew + Sarah admin accounts.

---

## Ship-to-Sarah gate (CONFIRMED by Andrew 2026-06-16 — still governing)

Andrew wants Sarah on the `v1-redesign` line once **waiting room → WB → end session is stable for tutor AND student — backend data pipeline INCLUDED**. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** (1) notes — legacy monolithic generate path gone; per-chunk auto-notes only; (2) End/Continue on student-detail open-sessions never silently deletes recording; (3) single-segment seek works at every review entry point. Multi-segment seek → backlog SSG-3 only. **(4) Consent UI honesty — `CONSENT-HONESTY-SARAH-MERGE-BLOCKER` (NEW, Andrew 2026-06-30):** minimal honesty fix ships **with** the Sarah merge — hide dead `allowWhiteboardRecording` toggle; rewrite `allowLiveSession` copy to honestly cover live A/V **and** whiteboard capture (see **LIVE-SESSION-CONSENT-COPY**); sweep consent UI for any other shown-but-unenforced toggles. Fuller guided-setup / affordance pass (**CONSENT-UX-REDESIGN**) is fast-follow, **not** a blocker. Rationale: Sarah merge = first no-going-back moment with real families; we do not ship dishonest consent UI. Cross-ref: [`BACKLOG.md`](../BACKLOG.md) **CONSENT-HONESTY-SARAH-MERGE-BLOCKER**.

**Pre-master smoke deferral ledger:** [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

---

## Open decisions — Andrew confirms

### Live gate (Part 3)

| # | Question | Status |
|---|---|---|
| **Part 3 design pass** | Overall Part 3 architecture/sequencing — review and approve in design session with Andrew before any p3-* execution | **OPEN — mandatory gate** |

Ratified **inputs** (not substitutes for the design pass): t=0 = FSM `recording` entry / `MediaRecorder.start()` + WB↔audio hardware sync oracle; 3+-peer per-speaker ≤3–4 cap NO mixdown fallback; minimal eval harness post-Sarah only; session-scoped consent override won't build for Sarah (`WB-SESSION-CONSENT-OVERRIDE`).

### Standing (from prior threads)

| Item | Notes |
|---|---|
| **WB-ADULT-JOIN-ENABLEMENT B1** | Thread B product confirm |
| **WB-LABEL-PARENT-SIGNIN** | New term confirm |
| **Sarah primary device** | Assumed Windows desktop Chromium |
| **iOS student WB/A/V** | Zero coverage — [`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION** |
| **B2 consent Step 6** | Parent per-tutor consent management UI — deferred past V1 |

---

## Recent architectural decisions (2026-06-30)

| Decision | Status |
|---|---|
| **Consent enforcement unconditional** | ✅ `CONSENT_ENFORCEMENT` deleted; always-on |
| **Per-speaker tap-before-mix** | ✅ Design-around ratified — transcription lanes only; mixdown = sole replay source; merge by `recordingTimeOffsetMs` never `createdAt` |
| **Reverses prior rollback [`89e0fe1`](https://github.com/Arangarx/tutoring-notes/commit/89e0fe1)** | ✅ With sync-metadata contract — document in LIVE-AV.md invariant #6 during `p3-perspeaker-capture` |
| **No interim merge** | ✅ All work on `wb-wave5-polish`; single merge at Sarah gate |
| **t=0 clock anchor** | ✅ **RATIFIED INPUT (2026-06-30)** — FSM `recording` / `MediaRecorder.start()`; WB↔audio hardware sync oracle in `p3-clock`. Part 3 **execution** still gated on design pass. |
| **WB-MENU-CLICK-THROUGH** | Deferred post-Sarah → [`BACKLOG.md`](../BACKLOG.md) |
| **Test data reset at master cut** | Preserve Andrew + Sarah admin; reset disposable learners (`p-test-account-reset`) |
| **WB-CONSENT-UNCONDITIONAL** | ✅ **RATIFIED (2026-06-30)** — whiteboard recording is **unconditional** for Sarah merge (not separately gated). `allowWhiteboardRecording` toggle **hidden** from consent UI (mirrors `WB-NOTES-EMAIL-SUBSCRIPTION-REFRAME`); Prisma + `SessionConsentSnapshot` fields **retained** (no migration). WB capture covered by `allowLiveSession` consent + privacy policy/ToS. Re-introducing real enforcement later is additive (D-1 access-gate, already mapped) pending legal consult. Resolves D-1 vs D-2 fork for Sarah: unconditional capture, honest copy = legal cover. |
| **LIVE-SESSION-CONSENT-COPY** | ✅ **RATIFIED (2026-06-30)** — `allowLiveSession` toggle copy MUST honestly state BOTH (a) student seen/heard live AND (b) whiteboard is recorded. Clear+honest copy = "fairly covered" pending counsel; anti-dark-pattern guarantee. Literal final copy string drafted for Andrew approval — never auto-shipped. |
| **CONSENT-DEFAULTS-OPT-IN** | ✅ **RATIFIED (2026-06-30)** — consent toggle defaults stay **OFF** / affirmative opt-in. Child-related consent must be affirmative (GDPR pre-ticked invalid; COPPA affirmative parental consent — confirm specifics with counsel). Opt-out defaults violate founding no-dark-patterns principle. Andrew "default-on?" question = **NO**. |
| **CONSENT-PRESENTATION-NO-TRICKS** | ✅ **RATIFIED direction (2026-06-30)** — fix low activation via **presentation**, not defaults: OFF-but-recommended toggles feel unfinished/attention state; value-first microcopy; guided-setup + completion indicator; distinguish required-for-feature (live session) from recommended (audio→notes). Must not go even one step toward anything construable as a "trick." Execution = fast-follow **CONSENT-UX-REDESIGN**, not Sarah blocker. |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** | ✅ **RATIFIED (2026-06-30)** — consent UI honesty is a **Sarah-merge blocker** (not fast-follow). **Minimal honesty fix** ships with merge: hide dead `allowWhiteboardRecording` toggle; rewrite `allowLiveSession` copy; sweep for other shown-but-unenforced toggles. **CONSENT-UX-REDESIGN** (full presentation pass) = fast-follow only. |
| **CONSENT-LEGAL-CONSULT** | Backlog — when affordable: validate with counsel (a) live-session consent + privacy policy sufficiency for minor WB capture, (b) whether minor WB needs own affirmative gate, (c) child-consent opt-in requirements. [`BACKLOG.md`](../BACKLOG.md). |
| **WB-SELECTIVE-REDACTION** | Backlog — **FUTURE, explicitly NOT pilot**: possible redaction of personal artifacts (homework PDFs/images) from WB capture while keeping strokes; content-classification + legal problem. Pilot = all-or-nothing unconditional WB. [`BACKLOG.md`](../BACKLOG.md). |

Full locked decisions: active plan § "Resolved (Andrew)".

---

## Hard-won lessons (durable)

### New (2026-06-30)

**lesson-codified-hack — tutor/student waiting-room mic delta mis-scoped twice:** First codified a chip-hack; then flattened tutor's full `MicControls` dropdown to match student's stripped control. **Tell:** student/tutor asymmetry. Echoes "branch decisions ≠ ratified intent" + "confirm material UX deltas explicitly."

**lesson-deferred-relay — relay specs authored with suite run DEFERRED had harness bugs jest couldn't catch:** Both phantom-stroke spec (wrong URL/auth + naive absence oracle) and consent-denial spec (`consentRecord.create()` unique-constraint) failed only at integration relay. **NEW RULE:** new wb-regression specs should get **≥1 targeted relay run** before declaring done, even when full suite run is deferred.

**data-reset-at-master-cut:** At `v1-redesign → master` cut, reset test data but **preserve Andrew + Sarah admin accounts**; re-confirm with Sarah then. Concrete todo: `p-test-account-reset`.

**no-interim-merge:** Ratified — single `merge --no-ff` at final Sarah gate only.

### Still load-bearing (do not forget)

**Plans ≠ ratified intent (2026-06-17):** Material product/UX decisions must be surfaced to Andrew explicitly — silence is not consent.

**Missed prompt ≠ consent (2026-06-17):** Re-surface material decisions; never infer from inaction.

**Subagent git safety (2026-06-10):** Never `git restore`/`reset --hard` to unblock checkout when uncommitted user work exists.

**Whiteboard chrome — extend don't rewrite (2026-06-09):** ADDITIVE ONLY on `WhiteboardWorkspaceClient.tsx` engine paths.

**Layout/coordinates — jsdom blind spot (2026-05-30):** Prove geometry on real browser; requirement-not-code tests.

**Flag-gated feature + test-injected flag = synthetic green (2026-06-17):** Green on flagged test path ≠ production default wired.

**Tombstone resurrection (2026-06-18):** Reconcile baseline must use `getSceneElementsIncludingDeleted()`.

**MediaStream id blocks video remount (2026-06-18):** Fresh `MediaStream` on reconnect.

**Mobile backgrounding ≠ full mesh rebuild (2026-06-18):** Deliberate leave vs transient suspend.

**Doc-heavy merges → add/add conflicts (2026-06-18):** Union-merge; preserve Andrew's smoke notes.

**RSC cookie-write no-op (2026-06-14):** Never write cookies from RSC render.

**CSS `@layer` cascade (2026-06-12):** Legacy unlayered base CSS beats Tailwind utilities.

**Secret egress (2026-05-31):** No plaintext secrets to third-party URLs (2FA QR lesson).

---

## Pilot context (Sarah)

Latest capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md). Call prep: [`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md).

Sarah remains on production `master` ("old & busted") until Ship-to-Sarah gate passes on merged `v1-redesign` line.

---

## Parked threads (after Sarah merge)

| Thread | Notes |
|---|---|
| **Experience-driven wedge Phases 2–4** | Continuity engine, note quality, instrumentation — post this merge |
| **WB-COMPONENTS-PASS** | Full shadcn migration — incremental on touched surfaces only for now |
| **VIDEO recording capture** | Design seam in Part 3; build post-Sarah |
| **WB-MENU-CLICK-THROUGH** | Desktop popover click-through |
| **iOS per-speaker MediaRecorder** | Documented untested for Sarah merge |
| **`docs/phase3-consent-model` @ `4f9dbcd`** | Awaits union-merge to `v1-redesign` (conflict risk on handoff docs) |
| **A6-1 multi-segment replay** | Obviated by continuous-stream finalization in Part 3; legacy path neutralized not deleted |

---

## Housekeeping (pending — do not act until merge confirmed)

Worktree cleanup after integration merged: `tutoring-notes-polishwt`, `fixwt`, `liveboardwt` (+ consent/phantom satellite worktrees). See `git worktree list`.

---

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol"
- **Dispatch boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff`; WB sync → `npm run test:wb-sync` at merge boundary; build-surface → `npx next build`
- **Smokebooks:** [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guessed)
- **Commits on Windows/PowerShell:** `.git/COMMIT_MSG_DRAFT.txt` + `git commit -F`

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file) — **HEAD first**
3. **Active plan:** [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md)
4. [`docs/LIVE-AV.md`](../LIVE-AV.md) — before any A/V or per-speaker work
5. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before FSM/outbox/end-session
6. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
7. [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md)
8. [`docs/BACKLOG.md`](../BACKLOG.md)
9. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
10. [`docs/SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)
11. [`docs/PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md)

Archived superseded plan (audit only): [`whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md).

---

## Open questions still in flight

| Question | Status |
|---|---|
| **Part 3 design pass** | **OPEN — mandatory gate before p3-* execution** |
| Map/reduce notes accuracy | Poor today — model abstraction + post-Sarah eval |
| Two-way calendar sync | Unresolved — [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) |

Resolved 2026-06-30 (ratified inputs, not design-pass substitute): t=0 anchor; 3+-peer cap ≤3–4 no mixdown fallback; session-scoped consent override won't build; minimal eval post-Sarah only.

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).

Deep history: `git log --oneline wb-wave5-polish`, `git log --oneline v1-redesign`.

---

## Overall result

*(Orchestrator checkpoint — 2026-06-30 reconcile: Part 3 design-pass-gated; body↔HEAD consistent; tip 8c9f68b.)*
