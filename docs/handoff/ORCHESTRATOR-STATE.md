# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-06-30 overnight integration complete → `wb-wave5-polish` (code @ [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882))

> **Active branch:** [`wb-wave5-polish`](https://github.com/Arangarx/tutoring-notes/tree/wb-wave5-polish) — last **code** integration @ [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882); branch tip may include subsequent docs-only commits (`git log -1 wb-wave5-polish`). **All remaining Sarah-gate work lands here; single `merge --no-ff` to `v1-redesign` at final gate only (no interim merge, Andrew confirmed).** Integration base remains **`v1-redesign` @ [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc)** (Wave 4 merged; Wave 5 polish + reliability floor in flight on feature branch).

| Field | Value |
|---|---|
| **Last action completed (2026-06-30 ~03:35)** | **Overnight consent/permission no-gap hardening + phantom-stroke fix integrated @ `b082882`.** Consent: tutor attestation modal removed (legal copy untouched); `CONSENT_ENFORCEMENT` flag deleted (enforcement unconditional); `allowLiveSession=false` blocks session create + join; `sessionPhase===ACTIVE` server guards (active-ping, checkpoint, chunk-transcription, audio-segment); `allowNoteSending` gates auto notes trigger. Phantom-stroke: degenerate single-vertex line/arrow dropped at canonical boundary (`excalidraw-adapter.ts` `isDegenerateLinearElement`, freedraw-dot guarded) **and** live-sync broadcast path (`emitDocument` in `useTutorLiveDocumentWire.ts`); action-sheet backdrop pointerdown/up guarded; desktop popover menu-click-through → BACKLOG `WB-MENU-CLICK-THROUGH`. **Gate:** full relay suite green @ `b082882`; only hard failures during gating were deferred-relay harness bugs (phantom spec: wrong URL/auth + naive absence oracle → sentinel pattern + 120s timeout; consent-denial spec: `consentRecord.create()` unique-constraint → `upsert`); 2nd-session AV-tile presence test = PRE-EXISTING flake → quarantined `test.fixme` + `PLAYWRIGHT-GAP`; two infra flakes (invariant-7 Vercel Blob token, left-rail bridge-wait) pass on retry. **Per-speaker investigation DONE** (`p3-perspeaker-investigate`): prior per-stream rollback [`89e0fe1`](https://github.com/Arangarx/tutoring-notes/commit/89e0fe1) root-caused (REPLAY UX — multiple `SessionRecording` rows, replay picked `audioRecordings[0]` by `createdAt`); design-around = **tap-before-mix** (per-speaker transcription lanes + mixdown sole replay source + sync-metadata contract: tag segments `streamId+speakerId+recordingTimeOffsetMs`, merge by offset never `createdAt`). **Plan deepdive DONE:** new self-contained plan [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md) (5-axis review folded, 6 BLOCKERs into per-item acceptance); old plan archived to [`archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md). Orchestrator corrected one overreach: t=0 clock anchor = **RECOMMENDED default** (FSM recording-state entry), **NOT ratified** → Open for Andrew #3. |
| **Next action(s)** | **(0) Andrew:** review new plan CHANGE OUTLINE (delivered in chat) **before Part 3 execution begins.** **(1) Part 1 residuals** on `wb-wave5-polish`: `useLiveAvCoordinator` + `useRecordingCoordinator` extraction, unified `WbTopBar`, CSS monolith split (touched surfaces), reconnect symmetry finish (`p1a-reconnect-finish`), `p1d-legacy-tests` cleanup. **(2) Part 2 residuals:** in-person consent projection (`p2a-inperson-consent`), `allowWhiteboardRecording` verify (`p2a-wb-recording-verify`). **(3) Part 1+2 checkpoint (NO merge):** `test:wb-sync` + surrogates + `npx next build` + hardware A/V smoke. **(4) Part 3 spine** (after checkpoint): `p3-clock` **FIRST** [pending Andrew t=0 confirm] → `p3-perspeaker-capture` → `p3-vad-chunking` + `p3-consent-recording` → `p3-incremental-map` → `p3-model-abstraction` → `p3-finalize` → `p3-replay-scrub` → `p3-video-seam` (design-only). **(5) FINAL Sarah gate:** full-experience hardware smoke both themes → single `merge --no-ff` to `v1-redesign`. Sequencing detail: active plan todos in [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md). |
| **Open Andrew-confirms** | **From new plan "Open for Andrew":** (1) session-scoped consent override in waiting room? (2) 3+-peer per-speaker policy (per-speaker up to N vs mixdown fallback)? (3) **t=0 clock anchor** — recommended = FSM `recording` entry / `MediaRecorder.start()`; **NOT ratified**; gates `p3-clock`. (4) minimal eval harness now vs post-Sarah? **Standing:** Thread B **WB-ADULT-JOIN-ENABLEMENT** B1 product confirm; **WB-LABEL-PARENT-SIGNIN** new term; **Sarah primary device** (assumed Windows desktop Chromium — verify on next call, [`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)); **Ship-to-Sarah gate** (notes path, end/continue save discipline, single-segment seek); **iOS student WB/A/V** zero real-device coverage ([`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION**). |
| **In-flight subagents** | **None.** |
| **Uncommitted / unmerged** | **`wb-wave5-polish` pushed** (code @ `b082882`; orchestrator-state refresh committed atop — see `git log -1 wb-wave5-polish`) — **not merged** to `v1-redesign` (by design; no interim merge). **`v1-redesign` @ `7397abc`** — integration base, unchanged by overnight work. **Pending housekeeping (do not act until integration confirmed+merged):** worktree cleanup for `tutoring-notes-polishwt`, `fixwt`, `liveboardwt` (+ related consent/phantom worktrees). **At master cut:** test-account data reset — preserve Andrew + Sarah admin accounts (`p-test-account-reset` in plan). |

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
              └── wb-wave5-polish @ b082882  (ALL remaining work; NO interim merge)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; Wave 4 student responsive parity merged @ [`a166f6c`](https://github.com/Arangarx/tutoring-notes/commit/a166f6c); subsequent doc commits through [`7397abc`](https://github.com/Arangarx/tutoring-notes/commit/7397abc) | Not yet merged to `master` — held for Gate A + Ship-to-Sarah + comprehensive re-smoke |
| **`wb-wave5-polish`** | **Active execution branch** — Wave 5 chrome/polish + reliability floor (Parts 1–3 of active plan) | [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882) |

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
  CP --> P3["Part 3 spine: clock → per-speaker → VAD → map → finalize → replay"]
  P3 --> GATE["FINAL Sarah gate: both themes hardware smoke"]
  GATE --> MERGE["single merge --no-ff → v1-redesign"]
```

| Phase | Key todos | Notes |
|---|---|---|
| **Part 1 residuals** | `p1b-av-coordinator`, `p1b-recording-coordinator`, `p1b-chrome-wbtopbar`, `p1c-css-monolith-split`, `p1a-reconnect-finish`, `p1d-legacy-tests` | Behavior-preserving extractions; Playwright on every fix |
| **Part 2 residuals** | `p2a-inperson-consent`, `p2a-wb-recording-verify` | Waiting room = single consent surface |
| **Checkpoint** | `p1-checkpoint` | **NO merge** — quality gate before Part 3 |
| **Part 3 spine** | `p3-clock` → `p3-perspeaker-capture` → `p3-vad-chunking` → `p3-consent-recording` → `p3-incremental-map` → `p3-model-abstraction` → `p3-finalize` → `p3-replay-scrub` → `p3-video-seam` | Bulk of remaining work; tap-before-mix architecture; 6 BLOCKERs in plan adversarial review |
| **Final gate** | `p-final-gate`, `p-test-account-reset` | Both themes; then merge; then test data reset at master cut |

---

## Latest committed state (`wb-wave5-polish` @ `b082882`)

| Commit | Summary |
|---|---|
| [`b082882`](https://github.com/Arangarx/tutoring-notes/commit/b082882) | **Branch tip** — fix(tests): upsert ConsentRecord in allowLiveSession denial test (relay harness fix) |
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

1. **Andrew review** — new plan CHANGE OUTLINE before Part 3.
2. **Part 1 residuals** — coordinator extractions, unified `WbTopBar`, CSS co-location, reconnect finish, legacy test cleanup.
3. **Part 2 residuals** — in-person consent projection, `allowWhiteboardRecording` e2e verify.
4. **`p1-checkpoint`** — full `test:wb-sync` + regression + build + hardware A/V (NO merge).
5. **`p3-clock`** — after Andrew confirms t=0 anchor (Open #3).
6. **Part 3 spine** — per-speaker capture through replay-scrub; video seam design-only.
7. **`p-final-gate`** — both themes hardware smoke → **`merge --no-ff` `wb-wave5-polish` → `v1-redesign`**.
8. **`p-test-account-reset`** — at master cut, preserve Andrew + Sarah admin accounts.

---

## Ship-to-Sarah gate (CONFIRMED by Andrew 2026-06-16 — still governing)

Andrew wants Sarah on the `v1-redesign` line once **waiting room → WB → end session is stable for tutor AND student — backend data pipeline INCLUDED**. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** (1) notes — legacy monolithic generate path gone; per-chunk auto-notes only; (2) End/Continue on student-detail open-sessions never silently deletes recording; (3) single-segment seek works at every review entry point. Multi-segment seek → backlog SSG-3 only.

**Pre-master smoke deferral ledger:** [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

---

## Open decisions — Andrew confirms

### From active plan (JIT — answer before relevant todo)

| # | Question | Gates |
|---|---|---|
| 1 | Session-scoped consent override in waiting room? | `p2a-inperson-consent` |
| 2 | 3+-peer per-speaker policy (N-cap vs mixdown fallback)? | `p3-perspeaker-capture` |
| 3 | **t=0 clock anchor** — recommended = FSM `recording` / `MediaRecorder.start()`; **NOT ratified** | `p3-clock` |
| 4 | Minimal eval harness now vs strictly post-Sarah? | `p3-model-abstraction` |

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
| **t=0 clock anchor** | ⚠️ Recommended default only — **await Andrew #3** |
| **WB-MENU-CLICK-THROUGH** | Deferred post-Sarah → [`BACKLOG.md`](../BACKLOG.md) |
| **Test data reset at master cut** | Preserve Andrew + Sarah admin; reset disposable learners (`p-test-account-reset`) |

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
| t=0 clock anchor | **Open for Andrew #3** — recommended FSM recording entry |
| 3+-peer per-speaker cap | **Open for Andrew #2** — pilot is 1:1 |
| Session-scoped consent override | **Open for Andrew #1** |
| Minimal eval harness timing | **Open for Andrew #4** |
| Map/reduce notes accuracy | Poor today — model abstraction + post-Sarah eval |
| Two-way calendar sync | Unresolved — [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) |

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).

Deep history: `git log --oneline wb-wave5-polish`, `git log --oneline v1-redesign`.

---

## Overall result

*(Orchestrator checkpoint — 2026-06-30 heavy restructure after overnight consent+phantom integration + new remaining-work plan.)*
