# BATCH G extraction — Phase 2/3 student shell + waiting room

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources (7 docs):** `phase-2-student-on-new-shell-plan-2026-06-16.md`, `phase-2-student-on-new-shell-5axis-2026-06-16.md`, `phase-2-student-new-shell-smokebook-2026-06-16.md`, `phase-3-waiting-room-plan-2026-06-16.md`, `phase-3-waiting-room-5axis-2026-06-16.md`, `p2b-smoke-fixes.md`, `part2-test-buildout-plan.md`

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **P3 destructive Neon test-account migration** | Consent / data | **P2** | Plan §6 + 5axis §6.4 backup gate: `scripts/forward-migrate-p3-test-accounts.ts` **not in repo**; dry-run + Andrew row-by-row sign-off still required. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **In-person waiting-room consent projection (Plan #2)** | Waiting room / consent | **P2** | `WaitingRoomOverlay.tsx` L14–16: *"Consent projection onto tutor capture is explicitly Plan #2 and NOT implemented here."* P3 plan §Step 5 in-person mode expects tutor-side toggle projection. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Unclaimed-student workspace entry — actionable redirect** | Auth / tutor UX | **P2** | 5axis P3-M-F: replace bare `notFound()` when `!learnerProfileId`. Tip: `workspace/page.tsx` still `notFound()` on missing session (L76, L109) — no `?error=requires_claim` redirect. | `phase-3-waiting-room-5axis-2026-06-16.md` |
| **PDF import cross-page stroke bleed (regression)** | Whiteboard sync | **P1** | P2 smokebook item 4 FAIL: Board 2 strokes appeared on Board 3 after PDF import — *"solved TWICE"* per Andrew. Not named in Phase 2 backlog section; product-trust P0/P1. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Student Exit → rejoin presence desync** | Presence / A/V | **P1** | Smokebook 1b-exit Notes: after student rejoins, tutor still shows disconnected / "waiting for video." | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Student undo/redo non-functional** | Whiteboard chrome | **P1** | Smokebook 1b Notes: *"Student undo/redo not doing anything"*; 1c also notes tutor undo broken while presence wrong. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Student bidirectional video (student sees no tiles)** | Live A/V | **P1** | Smokebook items 0, 7, 8 FAIL: video only on tutor side; tiles flash/disappear. Overlaps hardware PLAYWRIGHT-GAPs but smoke-specific cluster. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Student dark-theme canvas background stuck white** | Theme / Excalidraw | **P2** | Smokebook item 12 FAIL: stroke theme switches but canvas `viewBackgroundColor` stays white on return to dark. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Student mobile tool/chrome parity** | Student chrome | **P2** | Smokebook items 1b, 2, 11: mobile missing tools, top bar clipped, item 11 SKIP — *"mobile should rearrange like tutor."* Partial overlap `WB-STUDENT-TOPBAR-CONTRACTION` but smoke-specific mobile tool gap. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Graph embed — student expression entry (product)** | Whiteboard pedagogy | **P3** | Smokebook item 5 Notes: whether students should enter expressions on tutor-inserted graphs. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **allowEducationalUse toggle + enforcement** | Consent | **P3** | P3 plan P3-h DEFER; BACKLOG **BL-B**. Schema may exist; no P3 UI. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Mid-session learner swap UI** | Session lifecycle | **P3** | P3 plan out-of-scope P4+; design in session-lifecycle doc. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Waiting room 10-minute learner timeout** | Waiting room | **P3** | P3 plan §out of scope P3.1 optional defer. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Parent mid-session consent poll / banner** | Consent | **P3** | P3 plan design §5 Q-CGC-5 defer. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Authenticated `/join` full learner route (Phase 4)** | Access control | **P3** | P3 Q9 defer authed join polling; `/join` landing + `/join/[sessionId]` exist but parent-as-child picker absent. | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Part-2 SERIAL relay batches P1-WB-1…P1-WB-10** | Test coverage | **P1** | `part2-test-buildout-plan.md` execution status: pure-jest tranche DONE @ 2026-07-05; **NEXT** = serial `wb-regression` groups. Spec files exist (`wb-session-lifecycle.spec.ts`, `wb-in-person-audio-start.spec.ts`, etc.) but plan marks merge-boundary `test:wb-sync` not yet closed on this plan's ledger. **P1-WB-10** = RED-ONLY until Andrew authorizes IN_PERSON FSM product call. | `part2-test-buildout-plan.md` |
| **Part-2 identity-e2e P1-ID-1…4 + P2-ID-\*** | Test coverage | **P2** | Same plan NEXT block. `impersonation-round-trip.spec.ts` exists (RW-B2) — verify enrolled/green vs still pending on plan. | `part2-test-buildout-plan.md` |
| **Part-2 remaining P2/P3 batches** | Test coverage | **P2** | P2-J5 outbox drain UI; P2-WB-2 review thumbnail; P3-J1…J5 marketing/polish — listed, not in DONE ledger. P2-J6/WS-P deliverable 2 **shipped in code** (see Shipped). | `part2-test-buildout-plan.md` |
| **JEST-ISOLATION pass (parallel flake)** | Test infra | **P2** | Part-2 KNOWN CONDITION: `--workers=1` green; parallel races on shared `tutoring_notes_test`. Same class as BACKLOG JEST-ISOLATION. | `part2-test-buildout-plan.md` |
| **Real email provider (P2b TODO)** | Identity | **P3** | `account-holder-email.ts` L8–10: `stubSendAccountHolderEmail` still stub; improved multi-line log shipped (round-3 A). | `p2b-smoke-fixes.md` |

---

## Already-in-backlog list

Cross-check `docs/BACKLOG.md` — these OPEN items from BATCH G sources are **already tracked** (do not duplicate):

| BACKLOG ID / section | Overlaps BATCH G item |
|---------------------|----------------------|
| **## Phase 2 student shell — smoke triage** | `WB-SCREEN-WAKE-LOCK`, `WB-THUMBNAIL-GRAPH-PLACEHOLDER`, `WB-OLD-PHONE-PERF`, `WB-DEVICE-PICKER-DUPES`, `WB-STUDENT-VIEW-LOCK-WHEN-SYNCED` |
| **## P2 student shell — post-hard-switch follow-ups** | `WB / site composition + de-duplication audit`, `Consent consolidation (P3 design)`, `WB-D6` student asset inserts; `WB-LEGACY-STUDENT-CLIENT-DELETE` ✅ DONE |
| **WB-PARENT-JOIN-AS-CHILD** | Parent join-as-child learner picker; interim `ParentJoinGapCallout` shipped |
| **BL-LEARNER-JOIN-LINK** | Learner-side session join link (tutor waiting room has copy button — `WaitingRoomOverlay` `data-testid="wb-waiting-copy-student-link"` — but learner dashboard/waiting still no link per backlog) |
| **WB-LASER-ICON-CONTRAST** | P2 smoke D2 laser color asymmetry / tutor not seeing student laser |
| **WB-STUDENT-BOARD-TABS** | Student page strip incomplete (smoke 1c question on highlighting read-only tab) |
| **WB-STUDENT-TOPBAR-CONTRACTION** / **WB-WAVE5-CHROME-POLISH** | Student top-bar compaction, coral Exit, follow-toggle sizing (smoke 1b, 6, 11) |
| **WB-STUDENT-CONSOLE-NOISE** | Student console spam (smoke 0) |
| **WB-AV-GAP-1 / WB-AV-GAP-2 / PLAYWRIGHT-GAP §** | Hardware ICE flap, 2nd-session camera race, Brio silent-first-acquire |
| **SMOKE-AUDIO-1** | Hotload / device picker audio not hooking (smoke 8b) |
| **AV-REFRESH-LOSS** | Student hard refresh loses A/V (smoke 9) |
| **TEST-REAL-INTEGRATION-SUPERSEDES-SMOKE** | Strategic real-browser harness (P2 plan §B human-only aligns) |
| **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** | Consent/erasure Playwright debt |
| **CONSENT-HONESTY-SARAH-MERGE-BLOCKER** | Hide dead toggles + honest copy (supersedes P3 plan `allowWhiteboardRecording` gate BLOCKER-D2 — ratified **WB-CONSENT-UNCONDITIONAL**) |
| **BL-B — Educational-use consent toggle** | P3-h defer |
| **Waiting room (green room)** row in WB queue | High-level "designed NOT built" row — **stale**: overlay + `sessionPhase` shipped; update backlog row on docs pass |
| **SMOKE-POST-2 — in-app text chat** | Sarah waiting-room + live chat request |

**Not in BACKLOG (net-new CARRY above):** PDF cross-bleed regression; student rejoin presence desync; student undo/redo; dark-theme canvas bg; in-person consent projection Plan #2; P3 Neon migration script; workspace unclaimed redirect; part-2 SERIAL ledger closure (process, not product).

---

## Shipped / obsolete list

| Item | Evidence | Source doc |
|------|----------|------------|
| **P2 scope correction — full tutor parity minus D1–D5** | Unified `WhiteboardWorkspaceClient` with `role="student"`; `StudentLiveWorkspaceClient.tsx` / `StudentWhiteboardClient.tsx` **absent**; `/w/[joinToken]` → redirect bridge to `/join/[sessionId]`. | `phase-2-student-on-new-shell-plan-2026-06-16.md`, tip `src/app/w/[joinToken]/page.tsx` |
| **P2 feature flags obsolete** | No `NEXT_PUBLIC_WB_STUDENT_NEW_SHELL` / `NEXT_PUBLIC_WB_WAITING_ROOM` in `src/` or `playwright.config.ts`; always-on unified path. | `phase-2-student-on-new-shell-plan-2026-06-16.md`, `phase-3-waiting-room-plan-2026-06-16.md` |
| **P2 blockers B1–B4 + 5axis fold-ins** | `student-whiteboard-canvas-mount` + E2E bridge in unified client; `useExcalidrawLoadingGuard.ts` + `student-excalidraw-loading-guard.dom.test.tsx`; recording disclosure in chrome; `WbAVCluster` without recording provider (`av-mount.dom.test.tsx`). | `phase-2-student-on-new-shell-5axis-2026-06-16.md` |
| **`wjg` join-gate logging** | `WhiteboardWorkspaceClient.tsx` ~L778 student `wjgLog(...)` including `session_ended`. | `phase-2-student-on-new-shell-plan-2026-06-16.md` §5 |
| **Waiting room overlay (Andrew 2026-06-17 overlay model)** | `WaitingRoomOverlay.tsx` — overlay on mounted board, `wtr` logs, in-place dismiss; not separate `WaitingRoomWorkspace` page swap. | `phase-3-waiting-room-plan-2026-06-16.md`, tip |
| **`sessionPhase` PENDING → ACTIVE lifecycle** | Prisma `SessionPhase @default(PENDING)`; `createWhiteboardSession` creates pending rows; `startWhiteboardSession` admit; `join-timer` + `active-ping` phase-aware (`active-ping/route.ts` L108 guard). | `phase-3-waiting-room-plan-2026-06-16.md` |
| **P3 5axis BLOCKERs 1–5 (folded into implementation)** | Backfill uses enum defaults not NULL; `consent-scope.ts` header: `CONSENT_ENFORCEMENT` removed; pending create always pending (no flag split — intentional always-on); checkpoint phase gate (`checkpoint/route.ts` L87); pending cancel via `deleteWhiteboardSessionAndDataAction` (`WhiteboardWorkspaceClient.tsx` `handleCancelPendingSession`). | `phase-3-waiting-room-5axis-2026-06-16.md` |
| **Retire tutor consent click** | `StartWhiteboardSession.tsx` L67–78: modal removed; create → waiting overlay → Start. | `phase-3-waiting-room-plan-2026-06-16.md` P3-g |
| **Parent consent POST** | `ParentConsentEditor.tsx` `handleSave` → `saveParentConsentAction` (server action, not visual-only). | `phase-3-waiting-room-plan-2026-06-16.md` Step 10 |
| **`SessionParticipant` model** | Created in `createWhiteboardSession` transaction (`actions.ts` L243–252). | `phase-3-waiting-room-plan-2026-06-16.md` |
| **Interim parent-join honesty** | `ParentJoinGapCallout.tsx` on dashboard + child detail; BACKLOG **WB-PARENT-JOIN-AS-CHILD** tracks full picker. | (cross-ref BACKLOG) |
| **P2b identity smoke fixes (rounds 1–4)** | `@` strip + `username@familyid`; `/join` placeholder; redirect-origin patterns; PIN `maxLength`/`autoComplete`/`data-lpignore`; weak-PIN `pin-strength.ts`; claim auto-copy (`ClaimInviteSection.tsx`); password-strength copy; claim uses `getAccountHolderSessionFromHeaders`; forgot-password stub multi-line log. | `p2b-smoke-fixes.md` |
| **Part-2 pure-jest/DOM tranche** | P1-J1…J8, P2-J2/J3/J4, RW-B1/B3/B4, stale-test fix `1001016` — per plan execution status. | `part2-test-buildout-plan.md` |
| **RW-B2 impersonation E2E** | `tests/integration/identity/impersonation-round-trip.spec.ts` exists. | `part2-test-buildout-plan.md` |
| **P2 smokebook automated gates** | Items 1e disclosure, 3 page isolation, 13 session ended, 14 tutor regression PASS on 2026-06-17 hardware run. | `phase-2-student-new-shell-smokebook-2026-06-16.md` |
| **Plans as execution specs** | P2/P3 plan step tables, file touch maps, Q1–Q12 defaults — superseded by tip code; retain only CARRY + audit trail. | all plan docs |
| **`docs/WHITEBOARD-P2-STATUS.md` / `WHITEBOARD-P3-STATUS.md`** | Never created per plan Step 8/9 — optional handoff artifacts; status lives in `WHITEBOARD-STATUS.md` + BACKLOG. | P2/P3 plans |

---

## Per-doc archive note table

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `phase-2-student-on-new-shell-plan-2026-06-16.md` | **Yes** | Scope correction (D1–D6) → `AGENTS.md` / hard-won lessons already echoed; interim separate-page debt → BACKLOG composition audit; step-by-step executor map **obsolete** post-unification |
| `phase-2-student-on-new-shell-5axis-2026-06-16.md` | **Yes** | Blocker rationale (stable `initialData`, wb-sync flag, WbAVCluster, disclosure) — **folded and shipped**; keep as adversarial audit trail only |
| `phase-2-student-new-shell-smokebook-2026-06-16.md` | **Yes** | Andrew hardware FAIL/PARTIAL notes → CARRY rows + BACKLOG triage above; overall FAIL — historical gate before unify/wave5; do not re-smoke per `smoke-when-done` |
| `phase-3-waiting-room-plan-2026-06-16.md` | **Yes** | Pillar sequencing + consent/timer semantics → `RECORDER-LIFECYCLE.md` / `session-lifecycle-consent-design`; OPEN: §6 migration, in-person projection, deferred P4 items → CARRY/BACKLOG |
| `phase-3-waiting-room-5axis-2026-06-16.md` | **Yes** | BLOCKER fold-in record — implementation matches most fixes; remaining gaps (unclaimed redirect, migration dry-run) → CARRY |
| `p2b-smoke-fixes.md` | **Yes** | Round-by-round identity UX fixes **shipped**; only net OPEN = real email provider TODO; IAC ledger pointer → `identity-phase2-auth-session-design-2026-06-01.md` (keep that doc) |
| `part2-test-buildout-plan.md` | **Partial** | Execution ledger through pure-jest DONE is valuable until SERIAL phase closed; keep until P1-WB/P1-ID NEXT block verified green on tip, then archive with pointer in `TESTING-COVERAGE.md` |

---

## Classification notes

1. **Student shell architecture:** Plans describe separate `StudentLiveWorkspaceClient` + flag gate. Tip code unified into `WhiteboardWorkspaceClient` + `WhiteboardSessionShell role="student"` — treat plan architecture diagrams as **obsolete**; smokebook + triage remain valid symptom catalog.

2. **Waiting room:** Substantially **shipped** as `WaitingRoomOverlay` + `sessionPhase` FSM, not the plan's separate `WaitingRoomWorkspace` / `StudentWaitingRoomWorkspace` files. BACKLOG row "Waiting room — designed NOT built" is **stale**.

3. **BLOCKER-D2 (`allowWhiteboardRecording` on events upload):** P3 plan + v1-redesign STATUS flagged this; tip ratified **WB-CONSENT-UNCONDITIONAL** (Sarah merge) — do **not** re-open as P3 CARRY unless legal consult reverses.

4. **P2 smokebook vs later waves:** Many FAILs (A/V, chrome, laser) were re-hit in wb-unify/wave5 smokes — prefer BACKLOG + later smokebooks for current priority; keep PDF bleed + rejoin desync + undo as **high-signal P2-native** CARRY.

5. **Part-2 vs BATCH C:** SERIAL Playwright debt overlaps `EXTRACT-C.md` WS-V / test-infra rows — single owner: close on merge-boundary `test:wb-sync`, don't duplicate BACKLOG rows.
