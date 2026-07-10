# Pre-master smoke deferral ledger — 2026-06-16

> **Durable artifact.** Andrew @-references this doc to ensure nothing originally planned as pre-master smoke silently drops when items are re-timed post-`v1-redesign → master` cut.

---

## Purpose + decision

**2026-06-16:** Andrew relaxed the strict *"smoke everything before master"* rule. Some items that were originally scoped as pre-master comprehensive smoke may now be smoked **post-master** (after the `v1-redesign → master` cut / after shipping the redesigned line to Sarah). Originally-pre-master commitments are **preserved here as tracked items** — only the timing changes.

**Orchestrator guardrail (unchanged):** Anything that is **data loss**, a **security/privacy hole**, or would force Sarah to run a **backup recorder** (north-star violation per [`AGENTS.md`](../../AGENTS.md)) **stays PRE-MASTER** and was **NOT** deferred to post-master.

**How to use:** Before master cut, every row in **KEEP PRE-MASTER** must PASS (or be explicitly escalated). Rows in **DEFER-SAFE** are tracked post-master follow-ups — not silent drops. Rows in **ALREADY-DEFERRED** were explicitly re-timed before this ledger; status lives in backlog/orchestrator state.

**Row counts:** KEEP PRE-MASTER **33** · DEFER-SAFE **11** · ALREADY-DEFERRED **5** (updated 2026-06-16 — P1-14 moved DEFER-SAFE → KEEP).

**Post-master priority order:** **MAP-ACC** (map/reduce notes **quality**) is **#1** — start immediately at the master cut. Ship with "notes work, may need editing"; tune the pipeline against Sarah's real-session examples (can't calibrate quality without live feedback).

---

## Cross-links

| Doc | Relevance |
|---|---|
| [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) | Ship-to-Sarah gate row (L20); comprehensive pre-master smoke (L67, L151–152); env scoping confirm **(g)** (L16); P1/P2 thread state |
| [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) | **Gate A** — blocks master cut (V1); Gate A2/A3/A5/A6 items; Gate B1–B4 = post-V1 |
| [`BACKLOG.md`](../BACKLOG.md) | SSG-1/2/3, F1, Gate A6/A6-1, A1–A6, U4/U5, TM-09, MAP-ACC, LONG-5 |
| [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md) | Sarah prod bugs → SSG gate elevation |
| [`phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md`](phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md) | P1 in-frame review smoke items |
| [`phase-1-wb-floor-1b-smokebook-2026-06-13.md`](phase-1-wb-floor-1b-smokebook-2026-06-13.md) | P1-1b desktop audio-clock smoke |
| [`2fa-remember-device-smokebook-2026-06-13.md`](2fa-remember-device-smokebook-2026-06-13.md) | CUT-6 re-smoke; deferred items B, D |
| [`phase-2-student-on-new-shell-plan-2026-06-16.md`](phase-2-student-on-new-shell-plan-2026-06-16.md) | P2 §6–7 smoke matrix + 5-axis BLOCKERs |

---

## RESOLVED borderlines (Andrew 2026-06-16)

Both items were OPEN borderlines at ledger creation (`b7b2071`). **Resolved — no longer awaiting input.**

> **Post-creation ledger adjustments (3):** (1) initial inventory; (2) borderlines MAP-ACC + A1-latency (changelog); **(3) P1-14** reclassified DEFER-SAFE → KEEP PRE-MASTER (Andrew 2026-06-16 — show-Sarah centering; see changelog).

### (a) MAP-ACC — notes **quality** → **DEFER post-master (#1 priority)**

| Aspect | Detail |
|---|---|
| **Decision** | **DEFER-SAFE** — quality bar moves post-master; pipeline correctness stays pre-master (**SSG-1**) |
| **Priority** | **#1 post-master follow-up — start immediately at master cut** |
| **Rationale** | Can't tune map/reduce quality without real-session examples from Sarah; ship "notes work, may need editing" and iterate live |

### (b) A1 — freedraw ~250ms stroke latency → **DEFER (watch)**

| Aspect | Detail |
|---|---|
| **Decision** | **DEFER-SAFE** — not a master-cut blocker; **WATCH** |
| **Rationale** | Andrew 2026-06-16: "doesn't feel like an issue right now, we'll see what happens" |
| **Revisit if** | Live-tutoring ink lag is reported in pilot |
| **Unchanged** | A1 visual redesign + theme parity; `@layer` cleanup (`A1-layer`, `A1-sub`) — classifications unchanged |

---

## KEEP PRE-MASTER

> Must PASS (or explicit escalation) before `v1-redesign → master` cut.

| ID | Item | Source doc + section | Current status | Rationale for classification |
|---|---|---|---|---|
| CUT-1 | Comprehensive both-theme smoke (full app / MASTER-CUT style) | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L67, L151–152 | Pending — not yet run on merged tip | Andrew pre-master discipline: every in-scope surface in light **and** dark before master cut |
| CUT-2 | `npx next build` exit 0 | [`AGENTS.md`](../../AGENTS.md) Merging convention | Required at cut | Build-surface changes invisible to jest alone; merge gate |
| CUT-3 | `npm run test:wb-sync` green | [`AGENTS.md`](../../AGENTS.md); [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L21, L366; P2 plan §7 | Pending — orchestrator owes pre-merge run | Whiteboard sync changes must pass hermetic relay; real-browser coverage |
| CUT-4 | Claim Sarah's pilot family before `NOTES_AUTH_WALL` | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L280 | Pending — cutover prerequisite | No grace period; auth wall would lock Sarah out |
| CUT-5 | Env scoping at master cut | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L16 **(g)** | Open Andrew-confirm | Production env vars / secrets scoping before Sarah on master |
| CUT-6 | 2FA re-smoke on merged `v1-redesign` tip | [`2fa-remember-device-smokebook-2026-06-13.md`](2fa-remember-device-smokebook-2026-06-13.md) L340–341 | Pending — tests 1–2 after merge | Skip must survive merge; auth regression = security hole |
| A2 | Waiting room flow | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L272–273; [`BACKLOG.md`](../BACKLOG.md) L173 | Unvalidated — Gate A2 open | Ship-to-Sarah gate includes waiting room → WB stable both sides |
| A3 | In-context end-session | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L274–279 | Partial — E1 merged; full gate open | Session shell end flow; data-loss risk if broken |
| A5 | Live bidirectional WB sync completeness | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L287–302; [`BACKLOG.md`](../BACKLOG.md) L177 | Unvalidated — Gate A5 open | Two-way sync unvalidated; Sarah can't use backup board |
| A5-sub | Student follow-tutor viewport | [`BACKLOG.md`](../BACKLOG.md) L128 | Unvalidated | Student must see what tutor sees — live tutoring core |
| A6 | Replay fidelity single-segment | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L303–311; [`BACKLOG.md`](../BACKLOG.md) L178 | In progress — P1 seek fixes on `phase1/wb-review-correct` | Sarah's actual case is single-segment; seek must work every entry point |
| A6-sub | Legacy `WhiteboardReplay` unreachable for Sarah / route to in-frame | [`BACKLOG.md`](../BACKLOG.md) SSG-3; [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md) Bug 3 | In progress — P1 in-frame surface | Sarah landed on unfixed legacy replay; must not happen post-cut |
| SSG-1 | Per-chunk auto-notes only, no monolithic button, ~50-min segment transcribes | [`BACKLOG.md`](../BACKLOG.md) L42 | Elevated 2026-06-16 — backend pass needed | Sarah clicked legacy monolithic button; pipeline must work |
| SSG-2 | End/Continue never silently deletes | [`BACKLOG.md`](../BACKLOG.md) L43; F1 L510 | Elevated 2026-06-16 — `endStaleWhiteboardSession` gap | Data loss — recording discarded without explicit Discard |
| SSG-3s | Single-segment seek every entry point | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L20 item 3 | In progress — P1 smoke items 2, 4, 7 | Sarah seek bug; every review path must work |
| SSG-d | Waiting room → WB → end session stable both sides + backend pipeline | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L20; capture §2 gate d | Unvalidated — Ship-to-Sarah gate | UI + per-segment flush + per-chunk transcription producing notes |
| F1 | Explicit Stop/Discard throwaway sessions | [`BACKLOG.md`](../BACKLOG.md) L510 | Elevated 2026-06-16 | Pairs with SSG-2; no silent delete |
| P1-1b | Desktop audio-clock smoke | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L15; branch `phase1/wb-reliability-floor` @ `d63ac22` | Built — awaits Andrew DESKTOP smoke | Replay clock correctness; A6 root cause fix |
| P1-1c | Waiting-mode End/Cancel + truthful copy B2/B3 | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L15 | Blocked on B2/B3 — folds into 1c | Truthful student-waiting copy; End/Cancel path |
| P1-1 | Hero landing — full-viewport notes primary | [`phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md`](phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md) §1 | Reset — 8th smoke pending | Core in-frame review entry |
| P1-2 | Enter replay — animated transition + live chrome | smokebook §2 | Reset — 8th smoke pending | Replay entry + play-from-start |
| P1-4 | Scrub drag mid-session — audio seek | smokebook §4 | Reset — 8th smoke pending | PRIMARY seek fix; Sarah bug class |
| P1-6 | Prominent↔docked edit survival | smokebook §6 | PASS (prior smoke) | Single notes instance — data integrity |
| P1-7 | Hide replay + replay return — persist-once | smokebook §7 | Reset — 8th smoke pending | Seek position preservation |
| P1-9 | Empty session — no recording CTA | smokebook §9 | FAIL — needs fix | Empty-state correctness |
| P1-10 | No-audio session — synthetic clock | smokebook §10 | PASS (prior smoke) | Stroke-only replay must not crash |
| P1-12 | Both themes — prominent + docked + replay | smokebook §12 | Reset — 8th smoke pending | Theme follow WB toggle in replay |
| P1-13 | Ended `/workspace` revisit — notes-hero idempotent | smokebook §13 | FAIL — session idempotency | Must not bounce to old preview / wrong session |
| P1-14 | Window resize — replay recenter | smokebook §14 | FIXED @ [`b7b8d3e`](https://github.com/Arangarx/tutoring-notes/commit/b7b8d3e)/[`596d920`](https://github.com/Arangarx/tutoring-notes/commit/596d920) — awaits Andrew re-smoke | Elevated Andrew 2026-06-16 (show-Sarah centering); was DEFER-SAFE; Excalidraw updates `appState.width` before ResizeObserver → play-loop overwrote centering snapshot → rightward drift; fix: freeze pre-resize snapshot + `computeResizeScroll` |
| P2-auto | `test:wb-sync` flag-ON | [`phase-2-student-on-new-shell-plan-2026-06-16.md`](phase-2-student-on-new-shell-plan-2026-06-16.md) §6–7 | Planned — READY TO EXECUTE on greenlight | 5-axis B1 BLOCKER — sync with student new shell |
| P2-0..15 | Two-device matrix (student new shell) | P2 plan §6–7 | Planned — awaits P1 + Andrew two-device | Gate A5 validation on unified shell |
| P2-B1..B4 | 5-axis BLOCKER acceptance items | P2 plan + [`phase-2-student-on-new-shell-5axis-2026-06-16.md`](phase-2-student-on-new-shell-5axis-2026-06-16.md) | Folded into plan @ `80ac571` | E2E bridge, initialData ref, WbAVCluster audit, recording disclosure |
| TM-09 | Tutor-mobile expectations copy + host gate | [`BACKLOG.md`](../BACKLOG.md) L158 | Backlog — pre-master if mobile tutor path | Sarah may tutor from phone; expectations must be truthful |

---

## DEFER-SAFE (post-master)

> Tracked post-`v1-redesign → master` cut. Not silent drops.

| ID | Item | Source doc + section | Current status | Rationale for classification |
|---|---|---|---|---|
| MAP-ACC | Notes **quality** (not pipeline existence) | [`BACKLOG.md`](../BACKLOG.md) L831 | **#1 post-master — start at cut** | Andrew 2026-06-16: defer quality bar; SSG-1 covers pipeline; tune with Sarah's real sessions |
| A1-latency | Freedraw ~250ms stroke latency | [`BACKLOG.md`](../BACKLOG.md) L171, L159 | **WATCH** — defer, not blocker | Andrew 2026-06-16: not felt as issue; revisit if live-tutoring ink lag reported |
| A1-layer | `@layer base` CSS cleanup | [`BACKLOG.md`](../BACKLOG.md) L172 | Backlog — systemic cascade fix | Visual/readability debt; not data-loss / not live-session blocker |
| A1-sub | DRY audit (component duplication) | [`BACKLOG.md`](../BACKLOG.md) L172 | Backlog | Mechanical consolidation; no pilot reliability impact |
| A3a | PDF page-tab indicator | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L280–282 — **MERGED** `c05d939` | Shipped — post-master smoke OK | Polish; PDF tabs identifiable |
| A3b | SR-04a video-tile sizing | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L283–286 — **MERGED** `c05d939` | Shipped — post-master smoke OK | A/V chrome polish |
| U4/U5 | Toolbar reorder + shape dropdowns | [`BACKLOG.md`](../BACKLOG.md) L154–155 | Backlog | UX polish; not reliability gate |
| P1-5 | Docked notes while replay playing | smokebook §5 | FAIL — defer UX interpretation | Andrew clarified: audio pauses when replay hidden; docked-while-visible = polish |
| LONG-5 | 60–90 min transcribe re-baseline | [`BACKLOG.md`](../BACKLOG.md) L307–313 — downgraded | Backlog | SSG-1 covers ~50 min; extreme length = post-cut |
| 2FA-B | Reset-password browser save / generate-offer | [`2fa-remember-device-smokebook-2026-06-13.md`](2fa-remember-device-smokebook-2026-06-13.md) §B; **BL-RESET-GENERATE** | Backlogged @ `adfaefa` | Chrome heuristic investigation; auth works without generate dropdown |
| 2FA-D | Expired token UI on reset-password | 2FA smokebook §D | Backlog | Edge-case UX; invalid-link hardening shipped |

---

## ALREADY-DEFERRED

> Explicitly re-timed before this ledger. Status tracked in backlog / orchestrator state.

| ID | Item | Source doc + section | Current status | Rationale for classification |
|---|---|---|---|---|
| A6-1 / SSG-3m | Multi-segment replay scrubber | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L20 — Andrew 2026-06-16 | **DEFERRED** → backlog SSG-3 | Andrew explicit: Sarah's case is single-segment; multi-seg = backlog only |
| P1-1b-iOS | iOS clock tighten pass | [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) L15 | **DEFERRED-SAFE** — hardware pending | Pilot tutor records desktop; iOS = tighten when hardware arrives |
| P1-11 | Multi-segment chip + D1–D3 standalone parity | smokebook §11, L247–249 | SKIP / deferred regression-check | In-frame multi-seg chip; standalone scrubber parity out of P1 scope |
| 2FA-* | Other 2FA smokebook items already backlogged | Various — see [`BACKLOG.md`](../BACKLOG.md) | Backlog | Prior thread closures; not master-cut blockers |
| Gate B1–B4 | Approval, consent, security tier B, scheduling | [`RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) L317–328 | **Gate B** = post-V1 | `CONSENT_ENFORCEMENT` flip = Gate B not Gate A; B2 dormant |

---

## Changelog

| Date | Change |
|---|---|
| 2026-06-16 | Initial ledger — Andrew relaxed strict pre-master rule; full inventory classified KEEP / DEFER-SAFE / ALREADY-DEFERRED |
| 2026-06-16 | Borderlines resolved: MAP-ACC → DEFER-SAFE **#1 post-master** (start at cut); A1 freedraw latency → DEFER-SAFE **WATCH** (moved from KEEP PRE-MASTER) |
| 2026-06-16 | **Third post-creation adjustment:** P1-14 (replay canvas resize recenter) elevated DEFER-SAFE → KEEP PRE-MASTER — Andrew 2026-06-16: centering correctness is show-Sarah requirement. FIXED @ `b7b8d3e`/`596d920` (root cause: Excalidraw updates `appState.width` before ResizeObserver fires, replay play-loop overwrote centering snapshot with already-resized width → scene drifted right; fix freezes pre-resize snapshot + continuous re-center via `computeResizeScroll`). Awaits Andrew re-smoke (resize → stays centered, no rightward drift). Counts: KEEP +1 (33), DEFER-SAFE −1 (11). |
