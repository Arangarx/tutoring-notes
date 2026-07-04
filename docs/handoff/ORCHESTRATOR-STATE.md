# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

> **Operating contract (`.cursor/rules/orchestrator-discipline.mdc`, explicit @ [`7341ff9`](https://github.com/Arangarx/tutoring-notes/commit/7341ff9)):** State durability is a **primary reliability obligation**, not a nicety. Andrew offloads project memory to the orchestrator on purpose — at any moment a session can be lost and a fresh orchestrator must resume with **minimal re-guidance** (ideally just "continue"). Keep this file continuously current; treat "I'll update state later" as a silent failure.

---

## ⏩ HEAD — 2026-07-04: **EXECUTING go-to-Sarah master-cut plan (overnight autonomous run)** @ [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md)

> **FRESH EXECUTION CHAT — start here.** Work in worktree **`tutoring-notes-polishwt`** (a subagent got lost on this once — do NOT use the default `tutoring-notes` checkout, which is on `v1-redesign`), branch **`wb-wave5-polish`**. Reading list: THIS head → [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md) (the executor spec) → [`go-to-sarah-plan-5axis-review.md`](go-to-sarah-plan-5axis-review.md) (BLOCKERs/SHOULD-FIXes, all folded into the plan) → `AGENTS.md` + [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc). **Conductor tier:** Opus conducts durability pillars WS-A/B/C/D (fragile surfaces); Composer 2.5 subagents write code/tests; Sonnet 5-axis review of fragile diffs. Execution is **fragile-serial** in the one shared worktree (no parallel code-writers → clobber risk); WS-E disjoint bugs run serially too for overnight reliability.

### 🔴 LIVE EXECUTION LOG (overnight 2026-07-04) — resume from the first ⬜

Final 5-axis sanity pass: **no new fragile-surface BLOCKER**; plan execution-ready. Two refinements folded into dispatch prompts (WS-A pin `VAD_MIN_SEGMENT_SECONDS`; Wave 0 dup-orderIndex pre-check).

| Step | Status | Commit / note |
|---|---|---|
| Wave 0 — migration + OutboxRow TS fields | ✅ | [`34d2a34`](https://github.com/Arangarx/tutoring-notes/commit/34d2a34) — `WhiteboardEventBatch` + `SessionRecording` orderIndex `@@unique` + `lastPersistedBatchSeq/ToIndex` cols; OutboxRow `recordingTimeOffsetMs?`/`speakerId?` (no IDB bump). Additive-only (68 ins/0 del); local dup-check zero; validate + test:wb-jest 774 green. **NOTE for cut:** local test DB has no `_prisma_migrations` history (P3005) → migration applied via `db execute`; folder well-formed for Neon `migrate deploy` at cut, but re-run dup-orderIndex check on prod before applying. |
| WS-A — audio durability (VAD + register + per-speaker) | ✅ code+unit | P1 [`23c11a5`](https://github.com/Arangarx/tutoring-notes/commit/23c11a5) (VAD in meter RAF; timer surgery: hard-stop KEPT / chime re-anchored to session time / 50-min deleted; atomic-orderIndex register; onSegmentUploaded hook) + P2 [`05d2a65`](https://github.com/Arangarx/tutoring-notes/commit/05d2a65) (per-speaker lanes consent-gated on policy==full + claimed LearnerProfile; C-core folded; A4 merge). Mixdown/consent/gain UNTOUCHED. Replay-mix exclusion RED-BEFORE proven (unit). jest 777. |
| WS-B — WB ~1s persist sidecar | ✅ code+unit | [`578f350`](https://github.com/Arangarx/tutoring-notes/commit/578f350) — `runServerPersist` sidecar (mutex `persistInProgressRef`, 409-safe cursor, retry×3, boardDocumentJson every batch, ≥3-fail tutor warning); checkpoint route batch upsert (BLOCKER-2); erasure walk + db-state test route; no 1s Blob. Section A/`runCheckpoint`/apply paths UNTOUCHED. Policy unit 10/10 + route 5/5; jest 790. |
| Sonnet 5-axis review of WS-A+WS-B fragile diff | ✅ | No blocking BLOCKERs; 9 invariants hold, REPLAY-MIX clean. 4 SHOULD-FIX folded @ [`9ceeee7`](https://github.com/Arangarx/tutoring-notes/commit/9ceeee7): SF-1 `SessionRecording @@unique([wbsid,blobUrl])` + idempotent register P2002; SF-2 atomic checkpoint cursor `GREATEST`; SF-3 VAD delta clamp (iOS backgrounding); SF-4 relaxed CI asserts. jest 794. |
| GATE PREREQ FIX — Playwright webServer `prisma db push` | ✅ | [`b8b4bdd`](https://github.com/Arangarx/tutoring-notes/commit/b8b4bdd) — `playwright.config.ts` webServer: `--accept-data-loss` on db push + `PLAYWRIGHT_TEST=1` + `PLAYWRIGHT_TEST_SECRET`. Relay green again: baseline `wb-session-lifecycle` 44 pass/1 skip/1 pre-existing flake. **WS-B `wb-live-persist-tab-kill` PASS in real browser** ✅ (WS-B teeth now proven, not just unit). jest 794. |
| E2 dup-stroke PDF | ✅ code; ⚠️ real-browser BLOCKED | [`34f650a`](https://github.com/Arangarx/tutoring-notes/commit/34f650a) — bump `tutorSwitchTokenRef`+`pageSwitchProgrammaticRef` at `commitPdfBatch` entry, release in `.finally()`. jest 794. Teeth spec authored + harness now runs it, but **pdfjs-dist won't load in headless Playwright** (`Object.defineProperty called on non-object`) — SAME pre-existing gap as `inv-8` quarantine (`docs/BACKLOG.md`); dup-stroke oracle never executes. Attempting a headless-pdfjs fix (unlocks E2 teeth **and** inv-8); if genuinely hard → PARK real-browser proof as [human-only] PDF-render smoke w/ stated reason. |
| E3 reconnect pill (fold a962171 + BUG-8) | 🅿️ **PARKED for Andrew** | **Orchestrator decision (2026-07-04 overnight):** NOT executed. (1) Conflicts w/ Andrew's explicit 2026-07-03 park of `a962171` ("revisit only if base at risk"; base is safe) + BUG-8/BUG-9 "deferred hardening — plan + hardware/Sarah validation required". Plan inclusion ≠ ratified intent (`AGENTS.md` lesson). (2) BUG-8 is a **behavioral** change to `peer-mesh.ts`/`useLiveAV.ts` (most fragile surface; the exact surface the consolidated re-smoke FAILED on — already cost a recovery cycle). (3) Core acceptance = WebRTC media-transport recovery = genuinely **[human-only]** (real Safari/iOS); a jsdom/DOM "test" would be **theater** (blind to media transport) → would violate the zero-mechanical-bugs bar by faking coverage. Folding `a962171` alone just re-exposes the honest-but-failing pill (why Andrew parked it). **Needs Andrew + hardware in the loop.** Did NOT touch the A/V surface. Continuing with WS-C/D/E (additive + relay-testable). |
| WS-C finalize-from-backend + straight-to-overlay | ✅ code+teeth | [`dadc01e`](https://github.com/Arangarx/tutoring-notes/commit/dadc01e) — C1 `finalizeWhiteboardSessionFromBackend` (assembly-only → delegates to `endWhiteboardSession`, internals UNTOUCHED; new `assemble-persisted-state.ts`); C2/C3 wire roster/gate/in-live End to C1, `LEGACY_INTENT_ENDREVIEW_AUTO_END=false`. Real-browser teeth GREEN (`--workers=1`): roster + gate specs — no `intent=endreview`, no waiting-room flash, review<5s, endedAt+recordings+strokes preserved. **Items 5 (flash) + 7 (orphan) proven fixed.** jest 794. `[fzb]` registered. NOTE: WS-C spec uses `seed-recording` test helper for the finalize-preserves-recording assertion (A2's real-record path is proven separately in WS-A spec). |
| WS-D resume-from-backend | ✅ code+teeth | [`fc147ff`](https://github.com/Arangarx/tutoring-notes/commit/fc147ff) — server hydrate on ACTIVE open via `assembleInitialPersistedState` → `initialPersistedState` prop → `useWhiteboardRecorder.hydrateFromServer()` (seeds log/cursors, paints multi-page `boardDocument` via existing `applyBoardDocumentV1ToExcalidraw`); IDB banner suppressed when server batches exist (ACTIVE-w/o-batches + student join UNCHANGED); clock continuity via `createSessionMsClock(initialAccruedMs)`. New `[wbr]` prefix registered. Real-browser teeth `wb-resume-from-backend.spec.ts` GREEN (42s). jest 796. Section A diff/apply + student join NOT behaviorally changed. |
| Sonnet 5-axis review of WS-C+WS-D fragile diff | ✅ done — **1 BLOCKER + 2 SHOULD-FIX** | **BLOCKER (WS-D `fc147ff`):** Section F in `useWhiteboardRecorder.ts` unconditionally suppresses the IDB recovery prompt whenever server batches exist — **even if IDB has MORE events than the server batches cover** (strokes written to IDB while the DB batch write was in-flight at tab-kill are permanently lost). Direct reliability-bar regression. **Fix:** run `findCheckpoint` in parallel with the hydrate decision; only suppress IDB when `serverState.lastPersistedToIndex >= idbCheckpoint.events.length - 1`; else preserve prompt or merge server+IDB. **SHOULD-FIX 1:** no gap/overlap detection in `mergeEventBatchesFromDb`. **SHOULD-FIX 2:** live-sync-connect vs `hydrateFromServer` race has no ordering guarantee. **Clean:** ownership, consent, erasure, C1 delegation contract, test-route double-gating, clock seeding math, fragile-surface non-modification. **→ dispatching WS-D BLOCKER+SHOULD-FIX serially once E1 frees the relay (no concurrent code-writers — git-race lesson).** |
| WS-E E1 shimmer | ✅ code+teeth | [`e178fc4`](https://github.com/Arangarx/tutoring-notes/commit/e178fc4) — wrapper `::after` overlay (z-index 10) over VISIBLE fields, higher-contrast gradient, `prefers-reduced-motion` static, copy split ("Waiting for transcript…"/"Writing notes…"). Real-pipeline Playwright asserts `background-position` MOVES over ~800ms (not the forbidden `animationName` anti-pattern) — 2/2 PASS. jest 796. New `src/styles/tutor-notes-shimmer.css`. |
| ⚠️ **GATE BLOCKER — `npx next build` exit 1** | ⬜ IN PROGRESS (∥) | Branch-level ESLint: `@typescript-eslint/no-explicit-any` "rule not found" in `useAudioRecorder.dom.test.tsx` + `segment-policy.test.ts` (WS-A-touched). Compile OK; lint step fails. Blocks integrated gate (needs exit 0). Fixing in parallel w/ WS-D BLOCKER (disjoint files+resources). |
| WS-D BLOCKER + 2 SHOULD-FIX (from 5-axis) | ⬜ IN PROGRESS (∥) | IDB-suppression tab-kill loss fix (coverage compare before suppress) + merge gap-detect + hydrate/live-sync ordering. Relay teeth. |
| WS-E E4/E5/E6 bugs | ⬜ | serial after WS-D fix (E4/E5 share WhiteboardWorkspaceClient; E6 = A/V surface) |
| Integrated gate (test:wb-sync + next build) | ⬜ | final tip |
| Both-theme master-cut smokebook | ⬜ | PARK at merge gate for Andrew hardware smoke |
| **⚠️ GATE PREREQ** — Playwright test webServer `prisma db push` wants `--accept-data-loss` → blocks ALL wb relay/teeth specs (WS-A/B/C/D + E2/E4 authored-not-run). Resolve before/at integrated gate. | ⬜ | shared blocker |
| **⚠️ git-safety note** — WS-B subagent `git restore`d an uncommitted STATE edit (clobbered, reconstructed). COMMIT state edits immediately, never leave uncommitted across a dispatch. | — | lesson |

**HARD STOPS (park for Andrew):** merge to v1-redesign/master; Neon/prod migrations; account reset; force-push. Build up to these, write smokebook, STOP.

**Rebuild after the fix-batch re-smoke FAIL (4 pass, 2 regressions, 2 mis-scopes).** New discipline (per Andrew + `AGENTS.md` lesson): smoke finding = note + the test it lived under; verify ambiguous notes; **Playwright-to-spec for every touched surface, real-browser-verified, tests written to SPEC not to code.** Progress:

| Step | Surface | Result | Commit |
|---|---|---|---|
| 1 STABILIZE | In-session top-bar **restored** to pre-`f412767` size; in-session End relabeled back to **"End session"** + honest confirm ("You'll go to review to save your notes."). Kept the 4 good items. Playwright 4/4 to spec. | ✅ landed | [`acb4f87`](https://github.com/Arangarx/tutoring-notes/commit/acb4f87) |
| 2 LEARNER TOP-BAR | Correct target: **learner/student logged-in** shell header (`StudentPageShell`) reduced ~68→57px (matches marketing chrome band); learner sign-out already present + verified. Playwright 2/2 to spec. | ✅ landed | [`620890e`](https://github.com/Arangarx/tutoring-notes/commit/620890e) |
| 3 NOTES SHIMMER | Correct behavior: **fields stay visible**; shimmer overlay @ 50% + dimmed placeholders for empty fields while generating; shimmer removed when done. (Reverts the `f412767` regression that hid the form.) Playwright 2/2 to spec via seeded note status. | ✅ landed | [`22ebf3e`](https://github.com/Arangarx/tutoring-notes/commit/22ebf3e) |
| 4 REPLAY AUTO-PLAY | **Real fix** for WebM duration-scan race — `audioDurationSettled` gates `seek(0,{play:true})` until duration resolved. **Real-WebM Playwright ran the actual regression path** (`durationSeconds=null`, ffmpeg unavailable) and asserted `currentTime`<2s, not-at-end, advancing on 1st + re-open. | ✅ landed | [`f311431`](https://github.com/Arangarx/tutoring-notes/commit/f311431) |
| 5a END-AND-REVIEW | **SSG-2 core** — roster rows get Resume / **End and review** (`/workspace?intent=endreview` → `autoConsent` bypasses gate → `initialIntent` fires existing `handleEndSession` once on mount → review, recording saved) / **Cancel and delete** (→ `deleteWhiteboardSessionAndDataAction`). **Real-recording anti-orphan Playwright 5/5.** Also fixed a latent bug: `deleteWhiteboardSessionAndDataAction` silently failed on sessions with a `SessionConsentSnapshot` (`onDelete: Restrict` FK) — now deletes that row first. Additive; no engine rewrite. | ✅ landed | [`ed5e05d`](https://github.com/Arangarx/tutoring-notes/commit/ed5e05d) |
| 5b GATE | `WorkspaceResumeGate` gets the same three actions; silent `endStaleWhiteboardSession` button removed (now called from **no production site**; dead-code removal deferred). End-and-review routes via `router.push(?intent=endreview)` → `useEffect([autoConsent])` mounts workspace → same `handleEndSession` once. | ✅ landed | [`57ebf46`](https://github.com/Arangarx/tutoring-notes/commit/57ebf46) |
| 5b test-harden | Gate anti-orphan test now proves **`recordings=1`** — a real Vercel-Blob-backed outbox row present at gate-entry is drained + registered by `handleEndSession`. The `recordings=0` was a **Playwright IDB-across-hard-nav artifact** (Chromium per-context IDB partitioning + 30s timeslice), NOT a product bug (production End-and-review is a soft nav; outbox never lost). No production code changed. | ✅ landed | [`37189fe`](https://github.com/Arangarx/tutoring-notes/commit/37189fe) |

**Part 3 spine (2026-07-02):** hardware smoke **PASS for exercised surfaces** — clock↔stroke alignment, disconnect→freeze→resume, no wall-clock inflation, end-finalize, tutor-mic regression. **Does NOT cover** VAD chunking, live WB event persistence, per-speaker C runtime, or finalize-from-persisted — those surfaces were not exercised (and are **UNBUILT**). **Full findings triage → [`BACKLOG.md`](../BACKLOG.md) § "Part 3 hardware-smoke findings".**

**Consolidated re-smoke (2026-07-03):** overall **FAIL** on live A/V — student reconnect did not recover media transport (tested on `wb-av-reachability-detection-fix` Preview 2). Andrew's results committed [`8e0df0d`](https://github.com/Arangarx/tutoring-notes/commit/8e0df0d) → [`presarah-batch-resmoke-smokebook-2026-07-03.md`](presarah-batch-resmoke-smokebook-2026-07-03.md). **Security PASS** — students/share read-only as intended. **Root cause (investigated):** **pre-existing latent media-transport-recovery gap on BOTH branches** — `onPeerLeave` does track-only cleanup; implicit-add race prevents full `rejoin-detected` peer-connection reset, so media transport isn't rebuilt on reconnect. Reachability branch did NOT introduce it — only exposed it by reporting connection state honestly. [`ed83d47`](https://github.com/Arangarx/tutoring-notes/commit/ed83d47) exonerated. **New deferred hardening:** **BUG-8** (reconnect media-transport recovery) + **BUG-9** (camera hotswap) — fragile surface (`peer-mesh.ts` / `useLiveAV.ts`); plan + hardware/Sarah validation required.

**Decisions locked:** (1) **Notes UI** — live session has NO notes UI; reduce at End only; Sarah ships notes-at-end + post-End skeleton (`SMOKE-NOTES-1`); `SMOKE-NOTES-2` DEFERRED post-Sarah. (2) **Start-on-A/V-reachability gate STAYS** — override = `SMOKE-POST-3` only. (3) **`wb-av-reachability-detection-fix` @ [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) PARKED — unmerged** (Andrew 2026-07-03). Revisit only if base shown at risk. Base `wb-wave5-polish` is **SAFE** (regression visible on parked branch's honest detection; underlying gap predates both).

**Fix batch landed since last head update:**

| Id | Summary | Commit |
|---|---|---|
| SMOKE-UX-1 | Replay auto-play from position 0 (WebM `currentTime` duration-scan race fixed) | [`3bc7a8e`](https://github.com/Arangarx/tutoring-notes/commit/3bc7a8e) |
| SMOKE-NOTES-1 | Notes shimmer either/or (skeleton only while generating; form when done+content) | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| A5 end-copy | **"Finish & save"** + confirm popover ("Finish this session?" / "Saves your recording and generates notes." / "Keep going"); copy/label only — no FSM change | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| SMOKE-BUG-6-affordance | `EndedUnsavedSessionsList` accent **"Review"** button → in-shell `/workspace` | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| top-bar-size | `.mynk-wb-topbar` capped 44px (CSS-only) | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| tutor-post-end-nav | Legacy `router.replace` fallback → `/workspace` review URL | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| SMOKE-UX-2 | Replay play/pause glyph centered (CSS-only) | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| empty-notes-guard | Save disabled when all fields empty | [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) |
| *(prior batch)* | BLOCK-2..4, BUG-1, PRESARAH-1/2, UX-4, BUG-6 group | through [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0) |
| SMOKE-BLOCK-1 | Reachability detection fix — **PARKED** on isolated branch | [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) |

| Field | Value |
|---|---|
| **Last action completed** | **Go-to-Sarah master-cut plan FINALIZED** @ [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md) (built on 8 read-only durability-stack investigations). **5-axis adversarial review complete** @ [`go-to-sarah-plan-5axis-review.md`](go-to-sarah-plan-5axis-review.md) — **5 BLOCKERs + 9 SHOULD-FIXes** all folded into the plan (atomic `orderIndex` txn + `@@unique`; WS-B `409` upsert/cursor-hold + mutex; `onSegmentUploaded` outbox hook; C1 calls `endWhiteboardSession` not a copy; etc.). **Andrew corrections folded 2026-07-04:** (1) **replay-mix INVARIANT** — mixdown/consent gates untouched, consented learner audio still reaches replay, VAD changes segment *timing* not *content*, per-speaker lanes are transcription-only/excluded from replay; (2) **chime PRESERVED** — re-anchored to session elapsed time as a tutor billing/time-awareness warning (NOT Whisper-size), only the 50-min segment rollover is removed; (3) sequencing diagram gantt→flowchart fix. Prior: corrected rebuild COMPLETE @ tip [`37189fe`](https://github.com/Arangarx/tutoring-notes/commit/37189fe). |
| **Next action(s)** | **EXECUTE the plan** (fresh Opus chat). **Execution order:** **Wave 0** Prisma migration (`WhiteboardEventBatch` + `SessionRecording @@unique([whiteboardSessionId, orderIndex])`, no IDB `DB_VERSION` bump; apply on preview first) → **WS-A** live audio durability (fragile-serial) → **WS-B** ~1s WB event-batch persist (fragile-serial) → **E2/E3** bugs (fragile-serial) → **WS-C** server finalize + straight-to-overlay (after A2+B2) → **WS-D** resume from backend → **WS-E** parallel-safe bugs (E1/E4/E5/E6, file-disjoint) → **integrated gate** (`npm run test:wb-sync` relay ~38min + `npx next build` exit 0 on final tip). **Then cut (needs Andrew smoke + greenlight):** `merge --no-ff` to `v1-redesign` → **comprehensive both-theme MASTER-CUT smoke** (CUT-1..6) → apply Neon migrations → `merge --no-ff` to **master** → account reset preserving Andrew + Sarah. Map/reduce wording ([`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd)) ships **as-is** (Andrew). |
| **Open Andrew-confirms** | **Sizing of "Sarah tomorrow"** pending plan + 5-axis review (endpoint = **master**; comprehensive both-theme smoke is the **single final gate**). **Attribution (2026-07-04):** **LearnerProfile-only** — no anonymous speakers (login required); "quick-create learner mid-session" is **privacy-gated future work**. **Needs decision:** map/reduce prompt **WORDING** ([`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd)). **Resolved (2026-07-03):** reachability branch **PARKED** @ [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171); rebuild corrected-targets + Playwright-to-spec discipline confirmed; End-and-review three-action model + auto-end mechanism approved; learner top-bar size fix (consolidation deferred); **Andrew re-baselined (2026-07-03):** durable live persistence (VAD + live WB persist + finalize-from-backend) **IS** pre-Sarah/pre-master blocker; live-notes **DISPLAY** stays deferred. **Deferred:** BUG-8/BUG-9 A/V hardening (fragile; hardware validation). **Standing:** erasure UX defaults; **WB-LABEL-PARENT-SIGNIN**; **Sarah primary device** ([`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)); **iOS student WB/A/V** ([`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION**). |
| **In-flight subagents** | **None** — plan authoring + 5-axis review both COMPLETE and folded. Ready for a fresh execution chat. Latest handoff: [`part3-overnight-2026-07-02-orchestrator-report.md`](part3-overnight-2026-07-02-orchestrator-report.md). |
| **Uncommitted / unmerged** | **PENDING COMMIT (swap-prep, 2026-07-04):** 4 docs uncommitted in `tutoring-notes-polishwt` — this **`ORCHESTRATOR-STATE.md`** refresh, **`go-to-sarah-master-cut-plan.md`** (untracked), **`go-to-sarah-plan-5axis-review.md`** (untracked), and **`wave5-rebuild-resmoke-smokebook-2026-07-03.md`** (Andrew's inline smoke notes — commit promptly, clobber risk). Commit these before/at the chat swap. **`wb-wave5-polish` @ [`affc1e1`](https://github.com/Arangarx/tutoring-notes/commit/affc1e1)** — worktree `tutoring-notes-polishwt`; polish batch pushed, **NOT merged** (awaiting live-durability pillar + comprehensive both-theme master-cut smoke → merge-boundary `test:wb-sync` → merge to v1-redesign). **`wb-av-reachability-detection-fix` @ [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171)** — **PARKED**, **NOT merged**. **`v1-redesign` @ [`bf1a2c3`](https://github.com/Arangarx/tutoring-notes/commit/bf1a2c3)** — integration base; NOT merged to master. **`wb-wave5-perspeaker-c-core` @ [`b6b7181`](https://github.com/Arangarx/tutoring-notes/commit/b6b7181)** — NOT wired, NOT merged. **Merge-boundary:** `test:wb-sync` once on final tip before v1-redesign merge. |

**Strategic posture (unchanged):** Experience-driven wedge — WB + reliability = **ground floor (GATE)**; the win = accreting honest tutor-first continuity. [`experience-driven_wedge_ae2776e1.plan.md`](../../../../.cursor/plans/experience-driven_wedge_ae2776e1.plan.md). **Ship-to-Sarah gate** governs cut to `v1-redesign → master` — see § Ship-to-Sarah gate below.

**Process directives (standing):** preview links in **pairs** (Vercel MCP `branchAlias` + `https://preview.usemynk.com` when repointed); agent-runnable validation harnesses over manual smoke where possible; Opus-default for reliability effort, Composer 2.5 only for zero-doubt mechanical tasks.

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Target program (not yet shipped end-to-end):** Complete the **live-session arc** (auth join → waiting room → live A/V whiteboard → end → per-speaker capture → transcription → review) as one reliable unit. **Shipped today on `wb-wave5-polish`:** p3-clock, per-speaker A+B **schema**, model abstraction, 50-min time-based segments with transcribe-on-arrival + map per completed segment + reduce at End, End-and-review three-action UX ([`ed5e05d`](https://github.com/Arangarx/tutoring-notes/commit/ed5e05d)/[`57ebf46`](https://github.com/Arangarx/tutoring-notes/commit/57ebf46)), pre-Sarah polish batch. **Unbuilt (pre-merge blockers):** VAD chunking, per-speaker C runtime, live WB event persistence, finalize-from-persisted, gapless continuous replay. **Single merge** to `v1-redesign` only after durability pillar + comprehensive both-theme master-cut smoke.

---

## Branch layering

```
master  ←  v1-redesign  (integration base @ bf1a2c3; Wave 4 merged; held for Sarah gate + master cut)
              ↑
              └── wb-wave5-polish @ 189fdb0  (ALL remaining work; worktree tutoring-notes-polishwt; NO interim merge)
                    ├── wb-av-reachability-detection-fix @ a962171  (isolated; merges after re-smoke)
                    └── wb-wave5-perspeaker-c-core @ b6b7181  (isolated C-core; merges when C wired)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; Wave 4 student responsive parity merged @ [`a166f6c`](https://github.com/Arangarx/tutoring-notes/commit/a166f6c); doc commits through [`bf1a2c3`](https://github.com/Arangarx/tutoring-notes/commit/bf1a2c3) | Not yet merged to `master` — held for Gate A + Ship-to-Sarah + comprehensive re-smoke |
| **`wb-wave5-polish`** | **Active execution branch** — Wave 5 + Part 3 spine (**partial**) + pre-Sarah smoke fixes; worktree `tutoring-notes-polishwt` | [`37189fe`](https://github.com/Arangarx/tutoring-notes/commit/37189fe) |
| **`wb-av-reachability-detection-fix`** | SMOKE-BLOCK-1 reachability detection (Fix A + B1); off wb-wave5-polish | [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) |
| **`wb-wave5-perspeaker-c-core`** | Pure `perspeaker-identity.ts` C-core; NOT wired to runtime | [`b6b7181`](https://github.com/Arangarx/tutoring-notes/commit/b6b7181) |

**Merge discipline (Andrew reaffirmed 2026-07-01; re-baselined 2026-07-03):** All remaining work stays on `wb-wave5-polish`. **Single `merge --no-ff` to `v1-redesign`** only after **live-durability pillar** landed + **comprehensive both-theme master-cut smoke**. No interim merge.

Decisions ledger: [`docs/handoff/v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

---

## Current Wave focus

**Active plan:** [`whiteboard_reliability_remaining_b082882.plan.md`](../../../../.cursor/plans/whiteboard_reliability_remaining_b082882.plan.md) — supersedes archived [`whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md`](../../../../.cursor/plans/archive/whiteboard_reliability_floor_9ba650d1.SUPERSEDED.plan.md).

**State-of-play (2026-07-02 evening):**

```mermaid
flowchart TD
  P3SMOKE["🟡 Part 3 hardware smoke — PASS (clock/disconnect/replay/notes-at-end only)"]
  FIXBATCH["✅ Pre-Sarah smoke-fix batch — all landed"]
  RESMOKE["⬜ Polish-pass re-smoke (in front of durability)"]
  DURABILITY["⬜ Live-durability pillar (VAD + live WB persist + finalize-from-backend)"]
  REACH["⬜ Reachability branch re-smoke + merge"]
  GATE["FINAL gate: comprehensive both-theme master-cut smoke"]
  MERGE["single merge --no-ff → v1-redesign"]
  P3SMOKE --> FIXBATCH --> RESMOKE --> DURABILITY --> REACH --> GATE --> MERGE
```

| Phase | Status | Notes |
|---|---|---|
| **Consent/erasure** | ✅ Done | 9 BLOCKERs + CF-1..CF-4 + Workstreams B/C/D; identity-e2e 16/16 |
| **Part 3 spine** | 🟡 **PARTIAL** — subset landed + hardware-smoked | **Landed:** `p3-clock`, per-speaker A+B **schema**, model abstraction, video-seam docs. **UNBUILT (pre-merge blockers):** VAD chunking, per-speaker C runtime, live WB persistence, finalize-from-persisted, gapless continuous replay |
| **Pre-Sarah smoke fixes** | ✅ Landed on branch | Full queue cleared — awaiting consolidated re-smoke |
| **Reachability fix** | ✅ Built, ⬜ re-smoke | Isolated branch; merge after clean mobile pass |
| **perspeaker C runtime** | ⬜ **UNBUILT** (pre-merge blocker) | `useRemoteMicRecorders` exists but **NOT mounted**; C-core @ `b6b7181` unwired |
| **Final gate** | ⬜ Pending | Live-durability pillar + comprehensive both-theme master-cut smoke → single merge |

---

## Classified smoke-finding queue (2026-07-03)

Full triage: [`BACKLOG.md`](../BACKLOG.md) § "Part 3 hardware-smoke findings".

| Class | Items | Action |
|---|---|---|
| **✅ CLEARED (landed)** | SMOKE-BLOCK-2..4, SMOKE-BUG-1, PRESARAH-1/2, SMOKE-UX-4, SMOKE-BUG-6 (group @ [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0) + Review affordance @ [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767)); SMOKE-UX-1 @ [`3bc7a8e`](https://github.com/Arangarx/tutoring-notes/commit/3bc7a8e); SMOKE-NOTES-1, A5 end-copy, top-bar-size, tutor-post-end-nav, SMOKE-UX-2, empty-notes-guard @ [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767) | On `wb-wave5-polish` @ [`f412767`](https://github.com/Arangarx/tutoring-notes/commit/f412767); awaiting Andrew re-smoke of fix batch |
| **PARKED** | SMOKE-BLOCK-1 reachability detection | `wb-av-reachability-detection-fix` @ [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) — unmerged; revisit only if base at risk |
| **NEEDS DECISION (Andrew)** | map/reduce prompt WORDING | Sign-off before tuning |
| **FRAGILE (plan + hardware; do NOT auto-fix)** | `SMOKE-BUG-2` stale "Call reconnecting…" pill; `SMOKE-BUG-3` student text across tutor page-switch (WB sync, L); `SMOKE-BUG-4` pencil stuck roughness (S–M); `SMOKE-BUG-5` replay missing active board (M–L); `SMOKE-BUG-7` student re-picks mic each session (S–M); **`BUG-8`** reconnect media-transport recovery (`onPeerLeave` track-only cleanup + implicit-add race blocks `rejoin-detected` reset); **`BUG-9`** camera hotswap mid-session | `peer-mesh.ts` / `useLiveAV.ts` — needs plan + hardware/Sarah validation |
| **DEFERRED post-Sarah** | `SMOKE-UX-3` replay ±10s scrub; `SMOKE-NOTES-2` live/progressive notes (= `p3-incremental-map`); `SMOKE-POST-1..3` (incl. text chat); perspeaker-C runtime build | Design-unblocked; C-core ready |

---

## Session-experience build status

| Layer | Status |
|---|---|
| **Schema (BUILT)** | `TranscriptChunk`, `TranscriptChunkExtraction`, `SessionRecording.streamId` — chunked audio + per-chunk transcription + map-extraction + video-ready `streamId` |
| **Part 3 spine (PARTIAL)** | **Landed:** `p3-clock` [`1572983`](https://github.com/Arangarx/tutoring-notes/commit/1572983); per-speaker A+B **schema** [`e92c9ac`](https://github.com/Arangarx/tutoring-notes/commit/e92c9ac)/[`8638c86`](https://github.com/Arangarx/tutoring-notes/commit/8638c86)/[`1df3258`](https://github.com/Arangarx/tutoring-notes/commit/1df3258); model abstraction [`f4cd9cb`](https://github.com/Arangarx/tutoring-notes/commit/f4cd9cb)/[`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd); video-seam docs [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c). Hardware smoke PASS for clock/disconnect/replay-alignment/notes-at-end only — **does NOT cover** VAD/live-persistence (UNBUILT). |
| **Partial pipeline (SHIPPED)** | 50-min time-based segments (`SEGMENT_MAX_SECONDS`); per-segment transcribe-on-arrival + incremental map; reduce at End; `SkeletonNotes` shimmer wired (`SMOKE-NOTES-1`); finalize is **client-only** (IndexedDB outbox + in-memory log; `endStaleWhiteboardSession` stamps `endedAt` only) |
| **perspeaker C runtime (UNBUILT)** | `useRemoteMicRecorders` exists but **NOT mounted** in workspace; C-core deterministic module @ `b6b7181` unwired; only **tutor:mic mixdown** transcribed today |
| **Live-durability pillar (UNBUILT — pre-merge blocker)** | VAD chunking; live WB event persistence (in-memory `logRef` + 30s IDB checkpoint; server checkpoint API unwired; canonical `events.json` at End only); finalize-from-persisted (no server-side assemble) |
| **Deferred post-master** | consent-recording gates, incremental-map **live notes display** (`SMOKE-NOTES-2` / `p3-incremental-map`), eval harness + flywheel |
| **Spike (unmerged, flag OFF)** | [`spike/live-transcription` @ `7671a25`](https://github.com/Arangarx/tutoring-notes/tree/spike/live-transcription) — not Sarah-path |

**Standing erasure coverage gaps** ([`BACKLOG.md`](../BACKLOG.md)): (a) **ERASURE-ORPHAN-AUDIO-BLOBS**; (b) **ERASURE-CLIENT-STORE-UNREACHABLE** (IDB/sessionStorage drafts).

---

## Recently completed (landed)

- **SMOKE-BUG-6 @ [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0)** — ended-but-unsaved sessions (`endedAt != null`, `noteId` null) surface as **"Ended — needs review"** on student-detail (last 30 days, cap 20); row → in-shell `/workspace` review; `EndedUnsavedSessionsList.dom.test.tsx` (3 tests). Andrew: treat as bug.
- **SMOKE-UX-4 @ [`37cff6b`](https://github.com/Arangarx/tutoring-notes/commit/37cff6b)** — wordmark nav standardized: non-live shells → canonical `/` role-redirect; WB review + read-only replay → `/`; live-session WB wordmark stays inert (`BL-WB-WORDMARK-NAV` guarded-leave still deferred).
- **Part 3 overnight run @ [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c)** — **subset** landed: p3-clock, per-speaker A+B schema, p3-model-abstraction, p3-video-seam (docs only); jest 2742, build exit 0, `test:wb-sync` 107 pass/2 skip/1 known flake. **NOT landed:** p3-vad-chunking, per-speaker C runtime, live WB persistence, finalize-from-persisted. Smokebook [`part3-notes-reliability-spine-smokebook.md`](part3-notes-reliability-spine-smokebook.md) + report [`part3-overnight-2026-07-02-orchestrator-report.md`](part3-overnight-2026-07-02-orchestrator-report.md). Hardware smoke PASS covered clock/disconnect/replay-alignment/notes-at-end only.
- **Checkpoint fully green @ [`5dd1793`](https://github.com/Arangarx/tutoring-notes/commit/5dd1793)** — wb-sync seed-gap fix (consent harness); identity-e2e 16/16.
- **Consent/erasure arc** — CF-1 [`183f09b`](https://github.com/Arangarx/tutoring-notes/commit/183f09b), CF-3 [`7a9514f`](https://github.com/Arangarx/tutoring-notes/commit/7a9514f), CF-2.1 [`b7c88ac`](https://github.com/Arangarx/tutoring-notes/commit/b7c88ac), erasure Steps 1–6, Workstream C e2e (consent `faebbfc` + erasure `cf20015` + routing `5402e04`).
- **Pre-merge smoke (2026-07-01)** — NOT PASS @ `8e38935`; six merge-blockers MB-1..MB-6 triaged [`consent-honesty-smoke-findings-2026-07-01.md`](consent-honesty-smoke-findings-2026-07-01.md); safe-then-merge + reversible tombstone (Option A) ratified.
- **PERSPEAKER-C-TRANSCRIPTION-TRIGGER** resolved 2026-07-02 — worker-driven option (a); identity keyed on `identityKey` not `peerId`; **schema** supports both-streams co-equal (no prefer-one hierarchy); **runtime + VAD UNBUILT** — only tutor:mic mixdown transcribed today.

---

## Latest committed state (`wb-wave5-polish` @ `189fdb0`)

| Commit | Summary |
|---|---|
| [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0) | **Branch tip** — SMOKE-BUG-6 "Ended — needs review" group |
| [`37cff6b`](https://github.com/Arangarx/tutoring-notes/commit/37cff6b) | SMOKE-UX-4 wordmark nav standardized |
| [`09fd07b`](https://github.com/Arangarx/tutoring-notes/commit/09fd07b) | ORCHESTRATOR-STATE heavy restructure |
| [`db63552`](https://github.com/Arangarx/tutoring-notes/commit/db63552) | Pre-Sarah smoke-fix batch complete (prior tip) |
| [`f0a14d8`](https://github.com/Arangarx/tutoring-notes/commit/f0a14d8) | SMOKE-UX-2 replay Play/Pause footer stack |
| [`6a8b6dc`](https://github.com/Arangarx/tutoring-notes/commit/6a8b6dc) | PRESARAH-1 always-on recording |
| [`d299a6c`](https://github.com/Arangarx/tutoring-notes/commit/d299a6c) | p3-video-seam docs-only |
| [`1572983`](https://github.com/Arangarx/tutoring-notes/commit/1572983) | p3-clock monotonic pause-aware session clock |

`test:wb-jest` **772** green; full `npx jest` **2741** pass (238 suites; known pre-existing shared-DB FK-race / upload-outbox noise only); `next build` exit 0. Full history: `git log --oneline -25 wb-wave5-polish`.

**Smokebooks (recent):** [`part3-notes-reliability-spine-smokebook.md`](part3-notes-reliability-spine-smokebook.md), [`wb-wave5-consent-perms-2026-06-30.md`](wb-wave5-consent-perms-2026-06-30.md), [`wb-wave5-liveboard-chrome-smokebook-2026-06-29.md`](wb-wave5-liveboard-chrome-smokebook-2026-06-29.md).

---

## Queued dispatches (in order)

> **⚠️ Doc-internal sequencing contradiction (flagged 2026-07-04):** this queue historically listed `p3-vad-chunking` **after** the v1-redesign merge (old item 8), while [`part3-execution-bootstrapper.md`](part3-execution-bootstrapper.md) + [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) require durable live persistence **before** Sarah/master. **Andrew re-baselined (2026-07-03):** VAD + live WB persist + finalize-from-backend **IS** a pre-Sarah/pre-master blocker; live-notes **display** stays deferred. Queue below reflects re-baseline.

1. **5-axis adversarial pass** on [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md).
2. **Live-durability pillar** — VAD chunking + live WB event persistence + finalize-from-persisted (+ wire per-speaker C runtime).
3. **Resolve-all A/V bugs** — BUG-8/BUG-9 et al. (fragile surfaces; plan + hardware validation).
4. **Polish-pass re-smoke** (if still pending) — pre-Sarah fix batch on `wb-wave5-polish` preview; **in front of** durability, not the final gate.
5. **Reachability branch** — mobile re-smoke Fix A (+ B1 when Safari available) → `merge --no-ff wb-av-reachability-detection-fix → wb-wave5-polish` (if still warranted).
6. **Map/reduce wording** — Andrew sign-off on [`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd).
7. **`test:wb-sync`** — once on final integrated tip (~38 min, Docker) before merge.
8. **`p-final-gate`** — **comprehensive both-theme master-cut smoke** (FINAL gate).
9. **`merge --no-ff` `wb-wave5-polish` → `v1-redesign`** — after step 8 PASS only.
10. **`p-test-account-reset`** — at master cut, preserve Andrew + Sarah admin accounts.
11. **Post-master deferred** — `p3-consent-recording` → `p3-incremental-map` (live display) → `p3-replay-scrub`; eval harness + flywheel.

---

## Ship-to-Sarah gate (CONFIRMED by Andrew 2026-06-16 — still governing)

Andrew wants Sarah on the `v1-redesign` line once **waiting room → WB → end session is stable for tutor AND student — backend data pipeline INCLUDED**. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** (1) notes — legacy monolithic generate path gone; per-chunk auto-notes only; (2) End/Continue on student-detail open-sessions never silently deletes recording; (3) single-segment seek works at every review entry point. Multi-segment seek → backlog SSG-3 only. **(4) Consent UI honesty — `CONSENT-HONESTY-SARAH-MERGE-BLOCKER` (Andrew 2026-06-30):** hide dead `allowWhiteboardRecording` toggle; rewrite `allowLiveSession` copy to honestly cover live A/V **and** whiteboard capture (see **LIVE-SESSION-CONSENT-COPY**); sweep consent UI for shown-but-unenforced toggles. Fuller guided-setup (**CONSENT-UX-REDESIGN**) = fast-follow, **not** a blocker.

**Pre-master smoke deferral ledger:** [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

---

## Open decisions — Andrew confirms

### Live gate (Part 3)

| # | Question | Status |
|---|---|---|
| **Part 3 design pass** | Overall Part 3 architecture/sequencing | **✅ APPROVED (2026-06-30)** |
| **Notes quality vs merge scope** | First-pass map/reduce quality pre-merge? | **✅ RESOLVED (2026-07-01)** — quality is pre-merge bar; eval harness + flywheel post-master |
| **PERSPEAKER-C trigger** | Worker-driven vs client-driven transcription enqueue | **✅ RESOLVED (2026-07-02)** — option (a) worker-driven |
| **SMOKE-BUG-6** | Ended-without-Save excluded from open-list | **✅ RESOLVED (2026-07-02)** — bug; "Ended — needs review" group @ [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0) |
| **SMOKE-UX-3** | Replay ±10s scrub buttons | **DEFERRED post-Sarah** (Andrew 2026-07-02) |
| **SMOKE-UX-4** | Wordmark navigation per-role | **✅ SHIPPED @ [`37cff6b`](https://github.com/Arangarx/tutoring-notes/commit/37cff6b)** — non-live → `/`; review/replay → `/`; live WB inert |
| **Map/reduce wording** | Prompt text in [`cefc5cd`](https://github.com/Arangarx/tutoring-notes/commit/cefc5cd) | **⬜ PROPOSED** — Andrew sign-off |

Ratified **inputs**: t=0 = FSM `recording` entry / `MediaRecorder.start()` + WB↔audio hardware sync oracle; 3+-peer per-speaker ≤3–4 cap NO mixdown fallback; first-pass notes quality pre-merge; eval harness + flywheel post-master only; session-scoped consent override won't build for Sarah (`WB-SESSION-CONSENT-OVERRIDE`).

### Standing (from prior threads)

| Item | Notes |
|---|---|
| **WB-ADULT-JOIN-ENABLEMENT B1** | Thread B product confirm |
| **WB-LABEL-PARENT-SIGNIN** | New term confirm |
| **Sarah primary device** | Assumed Windows desktop Chromium |
| **iOS student WB/A/V** | Zero coverage — [`BACKLOG.md`](../BACKLOG.md) **WB-STUDENT-MOBILE-VALIDATION** |
| **B2 consent Step 6** | Parent per-tutor consent management UI — deferred past V1 |

---

## Recent architectural decisions (2026-06-30 – 2026-07-02)

| Decision | Status |
|---|---|
| **CC-1 + CC-2 API** | ✅ [`35147ef`](https://github.com/Arangarx/tutoring-notes/commit/35147ef)→[`5d6d196`](https://github.com/Arangarx/tutoring-notes/commit/5d6d196). B2 create-time live-reject removed. |
| **Block B EXECUTED** | ✅ 7 commits `d180ef1`→`bded52e`, 13 suites/146 tests |
| **5-axis adversarial review (consent-honesty)** | ✅ 8 BLOCKER / 6 HIGH / 6 MEDIUM / 5 LOW — [`consent-blocker-5axis-review-2026-06-30.md`](consent-blocker-5axis-review-2026-06-30.md) |
| **Consent enforcement unconditional** | ✅ `CONSENT_ENFORCEMENT` deleted; always-on |
| **Per-speaker tap-before-mix** | 🟡 **Design ratified** — transcription lanes only; mixdown = sole replay source; merge by `recordingTimeOffsetMs`; **runtime UNBUILT** (only tutor:mic mixdown today) |
| **Reverses prior rollback [`89e0fe1`](https://github.com/Arangarx/tutoring-notes/commit/89e0fe1)** | ✅ With sync-metadata contract — LIVE-AV.md invariant #6 |
| **No interim merge** | ✅ Single merge at Sarah gate |
| **t=0 clock anchor** | ✅ FSM `recording` / `MediaRecorder.start()`; disconnect pause/freeze in `p3-clock` |
| **CLIENT-AUDIO-CONSENT-GATE (Block B)** | ✅ Client consent projection gates capture/upload/IDB/transcription — [`wb-block-b-consent-gate-plan.md`](wb-block-b-consent-gate-plan.md) |
| **7a fail-closed-universal** | ✅ No snapshot/record → no audio capture/upload/transcribe |
| **CC-1 ConsentRecord-exists gate** | ✅ Session gate = ConsentRecord exists for (learner,tutor) |
| **CC-2 mandatory consent choice** | ✅ Save OR explicit decline on claim setup |
| **Self-learner parental-consent exemption** | ✅ All-true snapshot via `isSelfLearner` |
| **Data erasure path** | ✅ Option A + headless-preserve — [`learner-erasure-plan.md`](learner-erasure-plan.md) |
| **Part 3 C1–C5** | 🟡 PARTIAL — transcription-only replay guard + per-speaker **schema** landed; **VAD chunking, per-speaker C runtime, ffmpeg gapless continuous replay UNBUILT**; video designed-for (docs) |
| **Disconnect/pause** | ✅ Audio pauses + clock freezes on disconnect; WB continues at frozen timestamp; ~8s debounce trigger |
| **WB-CONSENT-UNCONDITIONAL** | ✅ WB recording unconditional for Sarah; `allowWhiteboardRecording` hidden; fields retained |
| **LIVE-SESSION-CONSENT-COPY** | ✅ Copy must state live A/V + WB recording; literal string Andrew-gated |
| **CONSENT-DEFAULTS-OPT-IN** | ✅ Defaults OFF / affirmative opt-in |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** | ✅ Minimal honesty fix ships with merge |
| **Start-on-A/V-reachability gate** | ✅ **STAYS** (Andrew 2026-07-02) — override only `SMOKE-POST-3` |
| **Notes-at-end only for Sarah** | ✅ Live notes deferred (`SMOKE-NOTES-2`); SkeletonNotes wired post-End |
| **PERSPEAKER identity on identityKey** | ✅ NOT peerId — device-switch continuity; cap on identityKeys ≤3 |
| **Both-streams co-equal** | 🟡 **SCHEMA ONLY** — `TranscriptChunk`/`SessionRecording` `streamId`+`speakerId` support per-speaker lanes; **runtime + VAD UNBUILT**; only tutor:mic mixdown transcribed today |

Full locked decisions: active plan § "Resolved (Andrew)".

---

## Hard-won lessons (durable)

### New (2026-06-30)

**lesson-codified-hack — tutor/student waiting-room mic delta mis-scoped twice:** First codified a chip-hack; then flattened tutor's full `MicControls` dropdown to match student's stripped control. **Tell:** student/tutor asymmetry. Echoes "branch decisions ≠ ratified intent" + "confirm material UX deltas explicitly."

**lesson-deferred-relay — relay specs authored with suite run DEFERRED had harness bugs jest couldn't catch:** Both phantom-stroke spec (wrong URL/auth + naive absence oracle) and consent-denial spec (`consentRecord.create()` unique-constraint) failed only at integration relay. **NEW RULE:** new wb-regression specs should get **≥1 targeted relay run** before declaring done, even when full suite run is deferred.

**data-reset-at-master-cut:** At `v1-redesign → master` cut, reset test data but **preserve Andrew + Sarah admin accounts**; re-confirm with Sarah then. Concrete todo: `p-test-account-reset`.

**no-interim-merge:** Ratified — single `merge --no-ff` at final Sarah gate only.

### Still load-bearing (do not forget)

**Plans ≠ ratified intent (2026-06-17):** Material product/UX decisions must be surfaced to Andrew explicitly — silence is not consent. (Also in [`AGENTS.md`](../../AGENTS.md).)

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
| **Experience-driven wedge Phases 2–4** | Continuity engine, note quality, instrumentation |
| **WB-COMPONENTS-PASS** | Full shadcn migration — incremental on touched surfaces only |
| **VIDEO recording capture** | Design seam in Part 3; build post-Sarah |
| **WB-MENU-CLICK-THROUGH** | Desktop popover click-through |
| **iOS per-speaker MediaRecorder** | Documented untested for Sarah merge |
| **`docs/phase3-consent-model` @ `4f9dbcd`** | Awaits union-merge to `v1-redesign` |
| **A6-1 multi-segment replay** | Deferred until gapless continuous replay lands (UNBUILT) |

---

## Housekeeping (pending — do not act until merge confirmed)

- **Throwaway untracked copies** in main `tutoring-notes` (v1-redesign) working tree: `docs/handoff/{consent-honesty-premerge-smoke-index, wb-block-b-consent-gate-smokebook-2026-06-30, cc1-cc2-consent-gate-smokebook, erasure-smokebook}.md` — delete before merge. Tracked authoritative copies on `wb-wave5-polish`.
- **Worktree cleanup** after integration merged: `tutoring-notes-polishwt`, `fixwt`, `liveboardwt` (+ consent/phantom satellite worktrees). See `git worktree list`.
- **Pre-existing tsc errors** in `src/__tests__/dom/WhiteboardWorkspaceEnd.dom.test.tsx` — small cleanup sometime.

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
| Map/reduce notes accuracy | **✅ RESOLVED (2026-07-01)** — first-pass quality is Part 3 pre-merge bar; eval harness + flywheel deferred post-master |
| Two-way calendar sync | Unresolved — [`scheduling-requirements-2026-06-11.md`](scheduling-requirements-2026-06-11.md) |
| SMOKE-BUG-6 / UX-4 | **✅ RESOLVED** — shipped @ [`189fdb0`](https://github.com/Arangarx/tutoring-notes/commit/189fdb0) / [`37cff6b`](https://github.com/Arangarx/tutoring-notes/commit/37cff6b) |
| SMOKE-UX-3 | **DEFERRED post-Sarah** (Andrew 2026-07-02) |

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Template: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).

Deep history: `git log --oneline wb-wave5-polish`, `git log --oneline v1-redesign`.
