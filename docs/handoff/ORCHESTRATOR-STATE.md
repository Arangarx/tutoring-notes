# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** Single source of current orchestrator state for tutoring-notes. A **brand-new orchestrator chat** reads this + its reading list + `git log` — **no catch-up from Andrew** on what's done, where we are, what's next, or how we work.
>
> **Operating contract** ([`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)): state durability is a **primary reliability obligation**. Sessions can be lost at any moment; keep this file continuously current. Treat "I'll update state later" as a silent failure.

---

## HEAD

| Field | Value |
|---|---|
| **Last action completed** | **Fragile-fix train milestone (2026-07-05):** WS-X BUG-3 fix [`ef5fb1a`](https://github.com/Arangarx/tutoring-notes/commit/ef5fb1a) — fingerprint-guard on `applyRemoteToCanvas` on-target condition; Sonnet 5-axis **CLEAN**. In-person audio fix [`3bf3a7e`](https://github.com/Arangarx/tutoring-notes/commit/3bf3a7e) (FSM `inPersonMode` step-3b + pill; `wb-in-person-unmasked` Playwright project; 5-axis SHIP-WITH-FIXES → folded). State refresh committed [`606bb31`](https://github.com/Arangarx/tutoring-notes/commit/606bb31). **Both wave-5 fragile fixes done + reviewed.** |
| **Next action(s)** | Awaiting Andrew's next-tranche steer among: **WS-P deliverable 2** (version poll + defer-during-live-session — WS-P-A/B acks given; fragile-adjacent WWC `useEffect`); **WS-G-A** "preparing seamless replay…" poll UX; **jest-isolation pass** (attended-preferred; `--workers=1` green today); **PART-2 relay/identity serial burndown** (attended + Docker — incl. WS-X + in-person + `wb-in-person-unmasked` relay proofs). |
| **Open Andrew-confirms** | Known-issues in-app page [`89d8d02`](https://github.com/Arangarx/tutoring-notes/commit/89d8d02) — **tone/copy sign-off** + **3 content calls** (WS-I/WS-N inclusion, WS-G concat-lag omission, WS-O minor-ness framing). Prior standing: map/reduce wording sign-off; SMOKE-PRIV-2; VERIFY-ACCT-1. |
| **In-flight subagents** | None. |
| **Uncommitted / unmerged** | Branch **`wb-wave5-polish`** @ [`606bb31`](https://github.com/Arangarx/tutoring-notes/commit/606bb31) (worktree **`tutoring-notes-polishwt`**). Two fragile fixes + full wave-5 train committed + pushed; **NOT merged** to `v1-redesign`/`master` (Andrew hard stop). **Relay red/green Playwright proofs** for in-person + WS-X fixes are **authored but OWED** — run `npm run test:wb-sync` at attended merge boundary (Docker unavailable in this worktree). |

**Autonomy posture (2026-07-05):** **LIMITED** — proceed unattended only on safe non-fragile work (jest-isolation, state/docs, pure-jest batches). **Park** anything fragile/gated for Andrew.

**Worktree discipline:** execute on **`tutoring-notes-polishwt`** / **`wb-wave5-polish`**. Default checkout `tutoring-notes` is on `v1-redesign` — do not use it for wave-5 work.

**Wave-5 queue (authoritative backlog):** [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md). **Andrew's smoke results:** [`go-to-sarah-master-cut-smokebook.md`](go-to-sarah-master-cut-smokebook.md) (do not edit).

---

## Project arc + North Star

Pre-public pilot with one tutor (Sarah). North Star from [`AGENTS.md`](../../AGENTS.md): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."* Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).

**Strategic posture:** Experience-driven wedge — WB + reliability = ground floor (GATE); the win = accreting honest tutor-first continuity. [`experience-driven_wedge_ae2776e1.plan.md`](../../../../.cursor/plans/experience-driven_wedge_ae2776e1.plan.md).

**Active execution:** **go-to-Sarah master-cut** on `wb-wave5-polish` — durability pillars WS-A..D landed; P1/P2 fix trains largely complete; fragile-fix train done; parked at **merge gate** for Andrew hardware re-smoke + relay proofs. **Ship-to-Sarah gate** governs cut to `v1-redesign → master` (see below).

---

## Branch layering

```
master  ←  v1-redesign  (integration base; Wave 4 merged; held for Sarah gate)
              ↑
              └── wb-wave5-polish @ 606bb31  (active; worktree tutoring-notes-polishwt)
                    ├── wb-av-reachability-detection-fix @ a962171  (isolated; PARKED)
                    └── wb-wave5-ws-x-wip @ 5d80ea8  (WIP seam preserved; superseded by ef5fb1a on polish)
```

| Branch | Role | Tip |
|---|---|---|
| **`v1-redesign`** | Integration base; not yet merged to `master` | [`bf1a2c3`](https://github.com/Arangarx/tutoring-notes/commit/bf1a2c3) |
| **`wb-wave5-polish`** | **Active** — Wave 5 + master-cut plan + Part-2 test buildout | [`606bb31`](https://github.com/Arangarx/tutoring-notes/commit/606bb31) |
| **`wb-av-reachability-detection-fix`** | SMOKE-BLOCK-1 reachability; Andrew parked 2026-07-03 | [`a962171`](https://github.com/Arangarx/tutoring-notes/commit/a962171) |

**Merge discipline:** single `merge --no-ff` to `v1-redesign` only after comprehensive both-theme master-cut smoke PASS. No interim merge. Ledger: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md).

---

## Wave-5 status (reconciled with execution queue)

### Landed on branch (do not re-do)

| Area | Status | Tip / note |
|---|---|---|
| **Durability pillars** | ✅ WS-A (VAD + per-speaker + outbox mid-session register `234c6d7`), WS-B (~1s persist), WS-C (end→review), WS-D (resume-from-backend) | Overnight wave; relay @ `c2ca8f5` workers=4 honest |
| **P1 fix train** | ✅ WS-I, WS-N/N4, WS-L, WS-G (`d20ea9a`), WS-K (`859f695`), WS-W (`610ee90`), WS-P 1/3/4 (`b386ef6`) | Each fragile item 5-axis reviewed |
| **P2 UX train** | ✅ WS-F, WS-H, WS-J (`1d23fc6`), WS-M, WS-Q copy, WS-R, WS-U-COPY (`dfe1bf4`), WS-U-FRAGILE 2.4+2.5 (`65f6a93`) | P2 train **COMPLETE** |
| **Fragile-fix train** | ✅ In-person audio `3bf3a7e`; WS-X BUG-3 `ef5fb1a` | See § Fragile-fix outcomes |
| **Known-issues page** | ✅ In-app `/admin/settings/known-issues` | `89d8d02`; FOR ANDREW: copy/tone |
| **PART-2 pure-jest tranche** | ✅ P1-J1..J8, P2-J2/J3/J4, RW-B1/B3/B4 | `jest --workers=1` green (283 suites / 3062); parallel-DB flake debt |
| **Blob-gate harness** | ✅ Phase 1+2 (`a1cc2bd`→`eb3fb5d`); build-green `2278013` | 5-axis SHIP-WITH-FIXES; SF applied |
| **Master-cut smokebook** | ✅ Authored; CUT-3 filled | PARKED at merge gate |

### Open / next tranche

| Item | Priority | Notes |
|---|---|---|
| **WS-P deliverable 2** | P1 | Version poll + capture-defer registry; WS-P-A tutor-only defer + WS-P-B WWC read-only `useEffect` **acknowledged** — implementation queued |
| **WS-G-A** | P1 polish | "Preparing seamless replay…" poll when concat async; default was ship core + defer UX |
| **WS-A F-1** | Pre-merge SHOULD-FIX | Outbox register-failure attempt cap (~10 lines); own 5-axis before merge |
| **WS-N5** | P1 follow-up | Resume FSM armed stroke window |
| **WS-U-FRAGILE 1.2** | PARKED | Dead Start / SMOKE-BLOCK-1 reachability — hardest; peer-mesh surface |
| **WS-U-FRAGILE 1.3 copy** | PARKED | In-person waiting copy mooted by in-person fix (no longer sits in `awaiting_first_participant`) |
| **PART-2 relay/identity** | In flight | P1-WB-1..10, P1-ID-*, RW-B2, P2/P3 batches — **serial**, attended + Docker |
| **Jest isolation** | Infra | `--workers=1` gate until dedicated pass; do not rush unattended |
| **PART 3 slim smokebook** | After PART-2 | Human-only surfaces |

**Standing rules:** new teeth specs → enroll in `wb-regression.testMatch` + `@wb-*` tag + `--list` verify. Merge-gate jest → `--workers=1` until isolation pass lands.

---

## Fragile-fix train outcomes (durable)

### In-person audio — BACKLOG SMOKE-BLOCK-5 resolved

- **Product call (Andrew):** treat IN_PERSON like solo — start tutor mic on Start, no remote peer required.
- **Implementation [`9740b1b`](https://github.com/Arangarx/tutoring-notes/commit/9740b1b) + fold [`3bf3a7e`](https://github.com/Arangarx/tutoring-notes/commit/3bf3a7e):** additive `LifecycleInputs.inPersonMode?` + step-3b in `lifecycle-machine.ts` (after `!syncEnabled`, before `!networkOk`); `derivePresentation` guard; two WWC call-site lines. **No engine rewrite.**
- **Teeth:** 4 jest units (authoritative); Playwright `wb-in-person-audio-start.spec.ts` in **`wb-in-person-unmasked`** project (port 3101, no solo env flag) — **not** `wb-regression` (solo flag masks → synthetic green).
- **5-axis:** SHIP-WITH-FIXES; SHOULD-FIXes folded (`clock_start` log `mode=`, spec enrollment fix).
- **Owed:** relay run for `wb-in-person-unmasked` at attended merge boundary.

### WS-X BUG-3 — PDF stroke leak resolved

- **Root cause:** stale scene merged via `applyRemoteToCanvas` during post-page-switch fingerprint window; v3 broadcast tombstone rebroadcast class (filter-isDeleted on broadcast was **rejected** — breaks erasure propagation).
- **Fix [`ef5fb1a`](https://github.com/Arangarx/tutoring-notes/commit/ef5fb1a):** additive guard — `onTargetReadTime` also requires `!pageSceneSetFingerprintRef.current.has(targetId)` → falls back to clean `pageDataRef[targetId]` during window. Prerequisite infra from WIP branch (`pageSceneSetFingerprintRef`, stale-onChange rejection). **No v3 broadcast filter change.**
- **Teeth:** `wb-e2-apply-remote-pdf-stroke-leak.spec.ts` + `__WBX_*` seams (prod-inert double-gate).
- **5-axis:** **CLEAN** — no over-suppression; tombstone/erase path unchanged.
- **Owed:** relay red/green at attended `test:wb-sync`.

**Serialize rule preserved:** in-person, WS-X, and WS-P deliverable-2 all touch WWC — never two code-writers at once.

---

## Settled Andrew decisions (2026-07-05)

Resolved FOR-ANDREW batch — treat as facts, not open questions:

| Topic | Resolution |
|---|---|
| **IN_PERSON audio** | Start recording on Start without remote peer (`inPersonMode` boolean; LIVE→IN_PERSON mid-session toggle N/A — mode fixed at creation) |
| **WS-K/G tuning** | No pre-flush; 5-chunk/2min debounce; full reduce; libopus re-encode; cap 400; duration free-ride |
| **WS-G-A** | **POLL** — "preparing seamless replay…" when concat ready (follow-up, not blocking core) |
| **WS-N4** | Defaults ratified; NO concurrent-tab End-block |
| **WS-J** | Nearest/5 + `America/Denver`; IN_PERSON wall-elapsed incl. pauses; ≥1-increment min; prod migration apply = merge HARD STOP |
| **WS-P-A/B** | Tutor-only defer; read-only-of-FSM `useEffect` in WWC approved → deliverable 2 unblocked |
| **WS-X** | Fix (a) fingerprint-guard approved (filter-isDeleted reversal accepted) — **shipped `ef5fb1a`** |
| **Known-issues** | IN-APP (Help/Settings); internal WS-* appendix excluded |
| **`.env` → preview-dev** | Informational; prod verified clean for WS-K/G/J migrations |

---

## Merge-gate items owed (before master)

1. **`npm run test:wb-sync`** once on integrated tip — branch cumulatively touches whiteboard/apply-adjacent surfaces; incl. WS-X + in-person + `wb-in-person-unmasked` proofs.
2. **`npx next build`** — build-surface touched (`next.config.ts` WS-P).
3. **WS-M** — two-device real-hardware A/V smoke (jsdom cannot verify tutor hears student).
4. **WS-A F-1** — outbox register attempt cap (~10 lines) + own 5-axis (SHOULD-FIX deferred from `234c6d7` review).
5. **Migrations** — WS-K/G/J additive nullable authored; applied on preview-dev only; **prod apply = Andrew greenlight** at cut.
6. **Andrew hardware re-smoke** — master-cut smokebook [`go-to-sarah-master-cut-smokebook.md`](go-to-sarah-master-cut-smokebook.md).

**HARD STOPS:** merge to master; Neon/prod migrations; account reset; force-push.

**Harness note:** Playwright workers 14→4 recommended (contention resolved at w=4 on `c2ca8f5`); not yet applied to config.

---

## Ship-to-Sarah gate (governing)

Andrew wants Sarah on `v1-redesign` once waiting room → WB → end is stable for tutor **and** student — backend pipeline included. Capture: [`sarah-pilot-feedback-2026-06-16-orchestrator-report.md`](sarah-pilot-feedback-2026-06-16-orchestrator-report.md).

**Confirmed gate items:** per-chunk notes only (no legacy monolithic); End/Continue never silently deletes recording; single-segment seek at every review entry; consent UI honesty (`CONSENT-HONESTY-SARAH-MERGE-BLOCKER`). Deferral ledger: [`pre-master-smoke-deferral-ledger-2026-06-16.md`](pre-master-smoke-deferral-ledger-2026-06-16.md).

Sarah remains on production `master` until gate passes.

---

## Parked / deferred (not blocking next tranche)

| Item | Notes |
|---|---|
| **E3 reconnect pill** | PARKED — conflicts with Andrew 2026-07-03 park of `a962171`; BUG-8/BUG-9 fragile A/V; needs hardware |
| **Reachability branch** | `wb-av-reachability-detection-fix` @ `a962171` — revisit only if base at risk |
| **WS-U-FRAGILE 1.2** | SMOKE-BLOCK-1 dead Start — peer-mesh/presence |
| **Post-Sarah** | SMOKE-NOTES-2 live notes display; SMOKE-UX-3 ±10s scrub; perspeaker-C runtime wiring; eval harness |
| **SEC** | `tutor-asset/route.ts` any-origin blob URL — pre-existing; backlog |

---

## How we work (pointers)

- **Orchestration:** [`AGENTS.md`](../../AGENTS.md) § Model usage protocol; dispatch boundary [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc)
- **Conductor tier:** Opus for fragile durability design + judgment; Composer 2.5 executes; Sonnet 5-axis on fragile diffs. **Fragile-serial** in one worktree.
- **Merging:** smokeable branch → Andrew smoke → `merge --no-ff`; WB sync at merge boundary; build-surface → `npx next build`
- **Smokebooks:** [`SMOKEBOOK-TEMPLATE.md`](SMOKEBOOK-TEMPLATE.md); preview URL via Vercel MCP (never guessed)
- **Process:** preview links in pairs (Vercel `branchAlias` + `preview.usemynk.com` when repointed); behavior tests to spec not code; swap chats ~60–70% context

---

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. **This file** — HEAD first
3. [`wb-wave5-execution-queue.md`](wb-wave5-execution-queue.md) — wave-5 backlog
4. [`go-to-sarah-master-cut-plan.md`](go-to-sarah-master-cut-plan.md) — executor spec
5. [`part2-test-buildout-plan.md`](part2-test-buildout-plan.md) — Part-2 test batches
6. [`docs/LIVE-AV.md`](../LIVE-AV.md) — before A/V / per-speaker
7. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — before FSM/outbox/end-session
8. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
9. [`docs/BACKLOG.md`](../BACKLOG.md)
10. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)

---

## History / audit trail

Updated in place; `git log -p docs/handoff/ORCHESTRATOR-STATE.md`. Heavy-restructure template: [`orchestrator-state-template.md`](orchestrator-state-template.md). Commit truth: `git log --oneline -30 wb-wave5-polish`.
