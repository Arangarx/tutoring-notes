# EXTRACT-I — Smoke / master-cut / findings / DRAFT roadmap / usersmoke

**Batch:** I (doc-cleanup extraction)  
**Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
**Extracted:** 2026-07-09  
**Sources read:** 16 handoff docs + cross-check `docs/BACKLOG.md` + spot-verify `src/`  
**Freshness rule:** `usersmoke-2026-07-08-problem-quicklist.md` + `usersmoke-2026-07-09-recheck-quicklist.md` win when they conflict with June smokebooks.

---

## CARRY table (open → carry forward)

Items still open for product/engineering work. **Excluded** if Andrew re-smoked PASS on 2026-07-09 evening (Section B of recheck) unless recheck explicitly leaves them open (Section C).

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **SMOKE-AUDIO-1** — first-acquire mic dead (Brio); meter silent; student can't hear until switch-and-back | Live A/V + recording | **P0** | Daughter session 2026-07-09; RC in BACKLOG | usersmoke recheck §C; durability usersmoke; BACKLOG |
| **SMOKE-NOTES-1** — post-End notes shimmer: form must stay visible with per-field shimmer; no hide-the-form regression | Notes / review UX | **P0** | FAIL presarah A2, fix-batch #2, rebuild #2, master-cut #16; Andrew: "how is this so hard?" | presarah / wave5-fixbatch / wave5-rebuild / go-to-sarah smokebook |
| **SMOKE-UX-1** — replay opens at scrubber end / seeks to 0; burst audio at end | Replay | **P0** | FAIL all 2026-07-03 resmokes + master-cut #9; blocks replay-mix verify | presarah A8; wave5-fixbatch #1; wave5-rebuild #1; usersmoke quicklist |
| **WS-B tab-kill resume audio** — resume after tab-kill: replay + notes only cover post-resume segment; pre-kill audio lost | Durability (WS-B/A) | **P0** | FAIL master-cut #11: "transcribed notes only had resumed audio" | go-to-sarah-master-cut-smokebook |
| **SMOKE-END-WINDDOWN** — Finalizing still live A/V + draw; student ejects only after `endedAt` poll | Session lifecycle | **P1** | Andrew decided disarm + immediate student signal 2026-07-09; not shipped | usersmoke recheck §C; BACKLOG |
| **BUG-8 / BUG-9** — A/V reconnect + camera hotswap media transport not rebuilt | Live A/V | **P1** | FAIL presarah Part B; PARKED unmerged reachability branch | presarah B1; BACKLOG |
| **SMOKE-BLOCK-1** — reachability under-reports connected peer (Start dead / student "Connecting…") | Live A/V / waiting room | **P1** | Intermittent; Fix A didn't repro but B1 regression worse on reconnect | presarah B1; BACKLOG |
| **WB-SHARE-REPLAY-VIEWPORT-PHONE** — parent share replay on phone: blank blue canvas, must scroll; tabs switch but not centered | Share / replay mobile | **P1** | Andrew recheck 2026-07-09; tutor phone replay OK → share path broken | usersmoke recheck §C; BACKLOG |
| **SEC-POLICY-TRUTH (retention lifecycle)** — interim copy fixed; no enforcing cron / no account-closed state modeled | Legal / compliance | **P1** | Recheck PASS on interim honesty; build scope still open | usersmoke quicklist; durability usersmoke §24 |
| **CUT-1** — comprehensive both-theme pre-master smoke (full MASTER-CUT style) | Release gate | **P1** | Deferral ledger KEEP; go-to-sarah smokebook mostly unchecked §25–38 | deferral-ledger; go-to-sarah-master-cut-smokebook |
| **CUT-5** — production env scoping confirm before master cut | Ops | **P1** | Open Andrew-confirm | deferral-ledger; go-to-sarah smokebook §5 |
| **CUT-6** — 2FA re-smoke on merged integration tip | Auth | **P1** | Not run in master-cut smokebook | deferral-ledger; go-to-sarah smokebook §36 |
| **CUT-4** — claim Sarah pilot family before `NOTES_AUTH_WALL` | Pilot ops | **P1** | SKIP master-cut (Sarah camping); still pre-cut prerequisite | go-to-sarah smokebook §4; deferral-ledger |
| **SMOKE-PERF-1** — "Finalizing" fixed overhead (~5–10s); de-await snapshot on blocking path | End-session perf | **P2** | Andrew tolerates; pairs with END-WINDDOWN | usersmoke recheck §C; BACKLOG; durability §14 |
| **Replay pause→hide→reopen** — should resume scrub position / paused state, not restart at 0 | Replay UX | **P2** | PARTIAL wave5-rebuild #1; still in quicklist §queued | wave5-rebuild; usersmoke quicklist |
| **Multi-part recording warning banner** — remove stale banner on replays | Replay chrome | **P2** | Queued usersmoke | usersmoke quicklist |
| **Replay "audio loading" CLS** — layout jump below scrubber | Replay chrome | **P2** | Queued usersmoke | usersmoke quicklist |
| **Replay theme click → unexpected nav** — intermittent nav to student detail | Replay chrome | **P2** | Queued usersmoke | usersmoke quicklist |
| **Replay disabled top-bar buttons** — dim like sidebar disabled controls | Replay chrome | **P2** | Queued usersmoke | usersmoke quicklist |
| **Replay board tabs missing PDF/document icons** (live tabs have them) | Replay chrome | **P2** | Queued usersmoke | usersmoke quicklist |
| **Start/end session "flash reload" feel** | Nav / perceived perf | **P2** | Queued usersmoke | usersmoke quicklist |
| **Double scrollbars on admin pages** — single architectural root | Admin layout | **P2** | Queued usersmoke | usersmoke quicklist |
| **Known issues & roadmap** — promote to top-level sidebar link (not buried in Settings) | Nav / IA | **P2** | Queued usersmoke | usersmoke quicklist |
| **Unclaimed student: claim link buried** — top-level affordance | Admin / claim | **P2** | Queued usersmoke; overlaps ADMIN-STUDENT-DETAIL | usersmoke quicklist |
| **Parent dashboard Manage button alignment** | Parent UX | **P2** | Queued usersmoke | usersmoke quicklist |
| **Known-issues section headers too muted** | Known-issues page | **P2** | Intake 2026-07-09; recheck "looks better" — optional polish | usersmoke quicklist intake |
| **Live board overflow: Sign out row dimmed/clipped** | Student chrome | **P2** | Intake 2026-07-09 | usersmoke quicklist intake |
| **Live board ⋯ More: PDF affordance hard to discover** | Whiteboard chrome | **P2** | Intake 2026-07-09 | usersmoke quicklist intake |
| **Live board top-bar compaction too aggressive** — controls hide in ⋯ too early | Whiteboard chrome | **P2** | Intake pre-release | usersmoke quicklist intake |
| **Password fields: show/hide toggle** (phone priority) | Auth UX | **P2** | Intake pre-release | usersmoke quicklist intake |
| **ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER** — phone student detail tabs hard to see (preview badge + small labels) | Admin mobile | **P2** | Recheck §C | usersmoke recheck; BACKLOG |
| **WB-REVIEW-THUMBNAIL-PDF** — review hero shows placeholder not PDF page | Review / PDF | **P2** | Recheck §C known gap | usersmoke recheck; BACKLOG |
| **WB-REVIEW-DELETE-COPY** — "Delete session data" not "Cancel and delete…" on review | Copy | **P2** | Recheck §C | usersmoke recheck; BACKLOG |
| **WB-FINISH-REVIEW-COPY-CONTEXT** — "Finish review" odd when opened from notes link | Copy / IA | **P2** | Recheck §C | usersmoke recheck; BACKLOG |
| **WB-TUTOR-REPLAY-PHONE-LAYOUT** — notes eat half screen on tutor phone replay | Replay mobile | **P2** | Slate for design | usersmoke recheck; BACKLOG |
| **WS-X PDF stray pen mark** (intermittent cross-board bleed) | Whiteboard / PDF | **P2** | PARKED `wb-wave5-ws-x-wip`; E2/E4 fixes partial; DRAFT still lists | known-issues-DRAFT; durability §11–12 |
| **WS-U-FRAGILE 2.4** — LIVE badge hardcoded during waiting/pause | Whiteboard chrome | **P2** | DRAFT known-issues; `sync-pill-presentation` exists but badge wiring open | known-issues-DRAFT |
| **WS-U-FRAGILE 2.5** — sync status pill low visibility | Whiteboard chrome | **P2** | DRAFT known-issues | known-issues-DRAFT |
| **WS-U-FRAGILE 1.3** — in-person session shows remote-waiting copy | Waiting room copy | **P2** | DRAFT known-issues; overlaps SMOKE-BUG-10 | known-issues-DRAFT; BACKLOG |
| **WS-U 1.4 / WS-S** — empty review screen looks broken (no audio/notes) | Review empty state | **P2** | DRAFT known-issues; P1-9 FAIL in deferral ledger | known-issues-DRAFT; deferral-ledger |
| **SMOKE-BUG-10** — "Waiting for student" banner in IN_PERSON mode | Waiting room | **P2** | BACKLOG; overlaps WS-U-FRAGILE 1.3 | BACKLOG |
| **PRESARAH-2** — open-sessions block wall-of-text; End not self-evident destructive | Student detail roster | **P2** | FAIL presarah A5; SSG-2 UX largely fixed but copy IA open | presarah; wave5-rebuild #5 PARTIAL |
| **Time-alert UX** — no visible "alert clock"; volume label inconsistent; tutor defaults surface | Settings / billing awareness | **P2** | PARTIAL master-cut #7; Andrew wants settings + copy | go-to-sarah smokebook §7 |
| **WS-Q tutor settings** — defaults for alerts, rounding, drawing prefs | Settings | **P2** | DRAFT roadmap deferred | known-issues-DRAFT |
| **WS-P deliv 2** — auto-update poll + defer during live session | Deploy / UX | **P2** | PARKED | known-issues-DRAFT |
| **WS-J richer per-session billing display** | Billing | **P2** | DRAFT roadmap; billing label pass on recheck | known-issues-DRAFT; durability §21 |
| **Claim interstitial** — verify claim-email host vs preview before AuthGate fix | Claim / identity | **P2** | Recheck §C: verify host first | usersmoke recheck §C |
| **ADMIN-PARENT-BLOCK-LIVE** — parent block on student detail after claim (ajax refresh) | Admin | **P3** | Future | usersmoke recheck §C |
| **WB-PARENT-JOIN-AS-CHILD** — parent can't join as child without learner login | Identity / join | **P3** | Post-Sarah; interim callout shipped | usersmoke recheck; BACKLOG |
| **WB-REPLAY-UNVISITED-BOARDS** — boards never visited missing from replay tab strip | Replay | **P3** | OK post-Sarah per Andrew | usersmoke recheck §C |
| **WB-LASER-ICON-CONTRAST / laser color asymmetry** (tutor blue / student red) | Whiteboard / A5 | **P3** | Re-confirmed 2026-07-08 smoke | usersmoke quicklist backlog; smoke-round-1 L1 |
| **SMOKE-UX-3** — replay ±10s skip buttons | Replay | **P3** | Deferred post-Sarah | BACKLOG |
| **Rethink claim-screen layout** (scrolling, clunky) | Claim UX | **P3** | Backlog post-Sarah | usersmoke quicklist |
| **Self-service account deletion** (parents/students) | Identity | **P3** | Backlog | usersmoke quicklist |
| **Device-picker cleanup** — de-dupe mics/cams; phone front/back only | A/V | **P3** | Sarah ask; backlog | usersmoke quicklist |
| **Replay speaker indication** (who is talking) | Replay | **P3** | With video-record work | usersmoke quicklist |
| **SMOKE-AUDIO-2** — phantom tutor self-unmute (watch) | A/V | **P3** | Unconfirmed | usersmoke quicklist |
| **SMOKE-AUDIO-3** — wrong mic after cancel → rejoin | A/V | **P3** | Cancel path fixed 2026-07-09; mic wrong-device watch | usersmoke quicklist; recheck §B pass cancel |
| **Shimmer flashes real content briefly** | Notes shimmer | **P2** | Folded into SMOKE-NOTES-1 dispatch | usersmoke quicklist |
| **Site-wide test P1 gaps** — Blob token in Playwright gate, recording E2E, replay scrub gate, billing activeMs E2E, etc. (15 items) | Test infrastructure | **P2** | ~20 specs self-skip without `BLOB_READ_WRITE_TOKEN` | site-wide-coverage-audit §4 |
| **iOS matrix S1–S14** — all rows untested on real hardware | iOS / Wave 1 | **P1** | Matrix template empty; S3/S4/S7 dispositive on Sarah iPhone | PHASE-2-IOS-SMOKE-MATRIX |
| **F-1 outbox register retry cap** (SHOULD-FIX) | Recorder reliability | **P2** | Pre-merge optional in master-cut smokebook | go-to-sarah-master-cut-smokebook |
| **Preview email loopback** — signup on preview lands on production; email flows untestable on preview | Env / process | **P3** | "Set in stone" Andrew; W3 INFO | smoke-round-1 W3; MASTER-CUT §8 |

---

## Already in BACKLOG

These open items are **already captured** in `docs/BACKLOG.md` (or deferral-ledger cross-linked there). No duplicate CARRY needed — track via BACKLOG IDs.

| BACKLOG / ledger ID | Brief | Source docs |
|---------------------|-------|-------------|
| **SMOKE-NOTES-1** | Post-End shimmer (REOPEN) | presarah, wave5-* |
| **SMOKE-UX-1** | Replay end-parked scrubber (REOPEN) | presarah, wave5-fixbatch |
| **SMOKE-UX-2** | Play/Pause overlap — **RESOLVED** | presarah (historical FAIL) |
| **SMOKE-UX-4** | Wordmark nav — **RESOLVED** | presarah |
| **PRESARAH-1** | Always-on recording — **RESOLVED** | presarah A7 |
| **PRESARAH-2** | Open-sessions copy | presarah A5 |
| **SMOKE-BLOCK-2** | Note → in-shell replay — **RESOLVED** (recheck PASS) | presarah A3 |
| **SMOKE-BLOCK-3** | Review back-nav — **RESOLVED** | presarah A4 |
| **SMOKE-BLOCK-4** | Learner sign-out — PARTIAL | presarah A6 |
| **SMOKE-BUG-1** | Student 405 active-ping — **RESOLVED** | presarah A1 |
| **SMOKE-BUG-6** | Ended-needs-review + Review button — **RESOLVED** | presarah, wave5-fixbatch |
| **SMOKE-BLOCK-1 / BUG-8 / BUG-9** | A/V reachability + reconnect | presarah B1 |
| **SSG-2 / Student-detail End-and-review** | Three-action roster + gate | wave5-rebuild, deferral-ledger |
| **SMOKE-AUDIO-1** | First-acquire mic silent | usersmoke recheck |
| **SMOKE-END-WINDDOWN** | Finalizing wind-down | usersmoke recheck |
| **SMOKE-PERF-1** | Finalizing slowness | durability §14 |
| **WB-SHARE-REPLAY-VIEWPORT-PHONE** | Share replay phone viewport | usersmoke recheck |
| **WB-TUTOR-REPLAY-PHONE-LAYOUT** | Tutor phone replay layout | usersmoke recheck |
| **WB-REVIEW-THUMBNAIL-PDF** | PDF hero thumbnail placeholder | usersmoke recheck |
| **WB-REVIEW-DELETE-COPY** | Review delete label | usersmoke recheck |
| **WB-FINISH-REVIEW-COPY-CONTEXT** | Finish review from notes context | usersmoke recheck |
| **WB-PARENT-JOIN-AS-CHILD** | Parent join-as-child picker | usersmoke recheck |
| **ADMIN-STUDENT-DETAIL-MOBILE-DISCOVER** | Phone student detail tabs | usersmoke recheck |
| **SMOKE-BUG-10** | In-person waiting banner | BACKLOG |
| **WB-LASER-ICON-CONTRAST** | Laser color asymmetry | smoke-round-1 L1; usersmoke |
| **MAP-ACC** | Notes quality tuning — **#1 post-master** per deferral ledger | deferral-ledger; usersmoke (prompt fix landed — recheck PASS) |
| **SSG-3 / A6-1** | Multi-segment replay — **DEFERRED** post-Sarah | deferral-ledger ALREADY-DEFERRED |
| **Gate B1–B4** | Waitlist, consent enforcement flip, etc. — post-V1 | deferral-ledger |
| **A1-latency, A1-layer, A1-sub** | Freedraw latency watch; CSS cleanup; DRY | deferral-ledger DEFER-SAFE |
| **2FA-B, 2FA-D** | Reset-password browser UX | deferral-ledger DEFER-SAFE |
| **LONG-5** | 60–90 min transcribe re-baseline | deferral-ledger |
| **U4/U5** | Toolbar reorder polish | deferral-ledger |
| **P1-5** | Docked notes while replay — defer UX | deferral-ledger |
| **TM-09** | Tutor-mobile expectations copy | deferral-ledger KEEP |

---

## Shipped / obsolete

Safe to treat as **historical** for open-work tracking. Unique product intent preserved in BACKLOG, deferral-ledger, or `known-issues-DRAFT` shipped sections.

| Item | Disposition | Evidence |
|------|-------------|----------|
| **Slice-3 B4 save-model** (no auto SessionNote; Save → READY) | **Shipped / smoke PASS** | SMOKE-RUNBOOK-2026-06-07 Target A |
| **Auth role-refresh / cost panel gating** | **Shipped / smoke PASS** | SMOKE-RUNBOOK-2026-06-07 Target B |
| **Parent-create-learner happy path (steps 1–7)** | **Shipped** | parent-create-learner smokebook; smoke-round-1 P-PASS |
| **Weak PIN `123456` + username `no spaces` rejection** | **Shipped** | `parent-create-learner.test.ts`; smoke-round-1 P1/P2 obsolete | 
| **feat/wb-end-session-review E1** (went to old replay) | **Superseded** — in-shell review shipped later | smoke-round-1 E1; wave5-rebuild #6 PASS |
| **feat/wb-replay-a6-slice graph in replay** | **Shipped** (scope) | smoke-round-1 R-PASS |
| **feat/wb-laser-sync** tutor→student laser (partial) | **Superseded** by Gate A5 / ongoing polish | smoke-round-1 L*; laser in BACKLOG |
| **feat/signup-waitlist W1/TFA1 redirect loop** | **Shipped** (Gate B1 merged) | smoke-round-1 W1/TFA1; historical branch smoke |
| **feat/security-tier-b S2** (GET upload 405) | **Expected behavior** | smoke-round-1 S2 |
| **feat/b2-consent C-D2, D-5** | **Confirmed design** | smoke-round-1 |
| **feat/b2-consent C1 ConsentError → 500** | **Likely shipped** — friendly consent on create path verified durability §4 PASS | smoke-round-1 C1; `createWhiteboardSession` tests |
| **feat/b2-consent C2 parent consent management UI** | **Partially shipped** — parent consent routes exist; enforcement flag dormant | smoke-round-1 C2 |
| **Component-dry-mechanical master-cut §1** | **Shipped / PASS** | MASTER-CUT-SMOKE §1 |
| **Replay scrub lands on drop (WS-L)** | **Shipped** per DRAFT recently-improved | known-issues-DRAFT appendix |
| **Gate/roster End saves full recording (WS-N4)** | **Shipped** | known-issues-DRAFT |
| **Waiting-room cancel/leave (WS-F)** | **Shipped** | known-issues-DRAFT |
| **Student self mic boost (WS-M) code** | **Shipped** — hardware verify note stale post-wave5 | known-issues-DRAFT |
| **ChunkLoadError reload + version footer (WS-P)** | **Shipped** | known-issues-DRAFT |
| **Tab-kill audio durability (WS-N)** | **Shipped** (with WS-B resume caveat in CARRY) | known-issues-DRAFT |
| **Billable rounding + settings UI (WS-J)** | **Shipped** | known-issues-DRAFT; recheck billing PASS |
| **Roughness hidden for pencil (WS-R)** | **Shipped / by design** | known-issues-DRAFT; usersmoke resolved-as-designed |
| **Board-tab overflow scroll (WS-O)** | **Shipped** | known-issues-DRAFT |
| **Friendlier copy batch (WS-U-COPY)** | **Shipped** | known-issues-DRAFT |
| **Dark-mode billing select, phone landscape ⋮, touch hints, stroke bleed P0 blank board, share auth wall** | **Shipped / merged 2026-07-09** | usersmoke quicklist ✅ |
| **Cancel strands student / stale copy-link / erasure gate / view whiteboard new replay / claim setup later / Finish review / privacy interim / notes prompt / wordmark marketing** | **Shipped — recheck PASS 2026-07-09** | usersmoke recheck §B |
| **PDF bleed E4 (`29b01d7`)** | **Shipped** — recheck stroke bleed after PDF PASS | usersmoke recheck §A |
| **Learner logged-in top bar ~57px** | **Shipped** | wave5-rebuild #3 PASS |
| **In-session End session + honest confirm** | **Shipped** | wave5-rebuild #4 PASS |
| **WS-C straight-to-review (paths A–C)** | **Shipped** (data load quality separate) | go-to-sarah smokebook #13 PASS |
| **WS-D server hydrate happy path** | **Shipped** per Andrew | go-to-sarah smokebook #14 |
| **WS-E2 PDF dup-stroke** | **Shipped** | go-to-sarah smokebook #17; durability §12 |
| **WS-E4 replay active board tab** | **Shipped** | go-to-sarah smokebook #18 |
| **WS-E6 student mic persistence** | **Mostly shipped** PARTIAL refresh quirk | go-to-sarah smokebook #20 |
| **5-axis BLOCKER-1..5 + SF-1..9** | **Integrated into plan / executed** — not open product bugs | go-to-sarah-plan-5axis-review; plan header |
| **go-to-sarah plan "live durability NOT built" baseline** | **Obsolete** — WS-A–D landed on polish tip | plan honest re-baseline superseded by master-cut smoke scope |
| **Deferral P1-14 resize recenter** | **Fixed** `b7b8d3e` — awaits optional re-smoke | deferral-ledger |
| **Deferral P1-6, P1-10** | **PASS** prior smoke | deferral-ledger |
| **Replay active board tab gate red** | **Test oracle fixed** — product OK on hardware | usersmoke quicklist decision 9 |
| **TESTING-COVERAGE.md** | **Superseded** by site-wide-coverage-audit for PART 2 planning | site-wide-coverage-audit §5.4 |

---

## Per-doc archive notes

| Doc | Safe to archive? | Unique info + where preserved |
|-----|------------------|-------------------------------|
| `known-issues-and-roadmap-DRAFT.md` | **Yes** (after pilot-facing copy decision) | Sarah-facing bullets → ship to in-app known-issues page or email; open engineering rows → CARRY + BACKLOG (`WS-X`, `WS-U-FRAGILE`, `WS-Q/P/J`); shipped appendix → git commits table only |
| `site-wide-coverage-audit.md` | **Yes** (inventory snapshot) | P1–P3 test-gap list → CARRY table + future `docs/TESTING-COVERAGE.md` refresh; harness facts → `playwright.config.ts` comments / BACKLOG test-debt rows |
| `MASTER-CUT-SMOKE-2026-06-11.md` | **Yes** | Andrew's inline notes preserved in `smoke-round-1-findings-2026-06-11.md`; branch tips obsolete |
| `smoke-round-1-findings-2026-06-11.md` | **Yes** | Structured findings → BACKLOG (B1/consent/laser/replay) + CARRY for still-open design (X2 v1-design-application meta) |
| `SMOKE-RUNBOOK-2026-06-07.md` | **Yes** | Both targets PASS; no open items |
| `parent-create-learner-smokebook-2026-06-11.md` | **Yes** | Deferred TODOs 1–4 → BACKLOG claim/B2 threads; validation → `parent-create-learner.test.ts` |
| `pre-master-smoke-deferral-ledger-2026-06-16.md` | **Partial archive** | KEEP PRE-MASTER/CUT rows still gate master cut → ORCHESTRATOR-STATE + RELEASE-ROADMAP; DEFER-SAFE/ALREADY-DEFERRED → BACKLOG; ledger is policy artifact — retain until master cut completes |
| `presarah-batch-resmoke-smokebook-2026-07-03.md` | **Yes** | FAIL items → BACKLOG + CARRY; PASS items → Shipped table above |
| `wave5-fixbatch-resmoke-smokebook-2026-07-03.md` | **Yes** | Superseded by wave5-rebuild + later merges; regressions tracked as SMOKE-NOTES-1 / SMOKE-UX-1 REOPEN |
| `wave5-rebuild-resmoke-smokebook-2026-07-03.md` | **Yes** | SSG-2 three-action UX → shipped; open replay/shimmer → CARRY; item 6 gate bypass = Andrew ambivalent (plan Q9) |
| `usersmoke-2026-07-08-problem-quicklist.md` | **No** (until master cut) | **Living triage index** — refresh after each smoke; decisions block → ORCHESTRATOR-STATE |
| `usersmoke-2026-07-09-recheck-quicklist.md` | **No** (until master cut) | **Authoritative "what's left for Andrew's eyes"** — Section C = CARRY source |
| `v1-redesign-durability-wave-usersmoke-2026-07-08.md` | **Yes** (after items triaged) | Full annotated runbook; findings extracted to quicklist + BACKLOG |
| `go-to-sarah-master-cut-plan.md` | **No** | Active architecture reference for WS-A–E; sequencing + risk register still cited |
| `go-to-sarah-master-cut-smokebook.md` | **No** (until master smoke complete) | Hardware FAIL/PARTIAL/SKIP rows → CARRY; CUT gate checklist |
| `go-to-sarah-plan-5axis-review.md` | **Yes** | Findings folded into plan 2026-07-04; no unique open items |
| `docs/PHASE-2-IOS-SMOKE-MATRIX.md` | **NO — keep as living doc** | Canonical iOS hardware matrix; all S1–S14 rows **unfilled** → CARRY P1; update §9 limitations after smoke; do not archive until Wave 1 iOS gate run |

---

## Cross-check notes (2026-07-09 session)

1. **Recheck §B integrity items passed** — do not re-CARRY cancel/erasure/claim/share-wall/view-whiteboard/finish-review/privacy/notes-quality/wordmark as open product bugs.
2. **Recheck §A still unverified by Andrew:** blank Board-3 bleed spot-check; share wall logged-out/entitled (code merged `561d7a9`).
3. **Master-cut hardware smoke (go-to-sarah smokebook)** predates latest `v1-redesign` merges — treat FAILs there as **hysteresis risk** until re-run on current tip; highest severity overlaps CARRY P0 rows (shimmer, replay seek, tab-kill audio).
4. **`src/` spot-checks:** `Set up later` in `CredentialSetupForm.tsx`; `Finish review` in `ReviewWbTopBar.tsx`; `/?view=home` in `marketing-routes.ts`; weak PIN/username validators in `parent-create-learner.test.ts` — align with Shipped/obsolete table.
5. **iOS matrix:** zero rows filled — remains the largest **unsmoked** surface area for Sarah iPhone path (S3/S4/S7 dispositive).
