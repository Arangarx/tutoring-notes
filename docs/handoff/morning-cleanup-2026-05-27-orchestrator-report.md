# Morning cleanup 2026-05-27 — orchestrator report

> **For the orchestrator picking up after this session.** Follow-up to the overnight doc-cleanup pass and reliability redesign pass (both uncommitted at dispatch). Captures sub-task outcomes, files touched, and Andrew-confirms items.

**Session scope.** Andrew's morning review of prior cleanup + redesign + Q1 schema follow-up. Docs-only surgical edits + content migrations + workspace-plan triage. No code changes. No commits (Andrew reviews + commits).

**Date:** 2026-05-27 (morning). **Tier:** Composer 2.5 (mechanical-with-judgment).

**Prior pass:** [`docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md`](doc-cleanup-2026-05-27-orchestrator-report.md)

---

## Context

Andrew reviewed the uncommitted working tree from:

1. **Overnight doc-cleanup** (`docs/INDEX.md`, SUPERSEDED headers, `AGENTS.md` Key docs) — see prior orchestrator report.
2. **Reliability redesign pass** (`docs/RELIABILITY-REDESIGN-2026-05-27.md` + companion handoff) — Surface 7 schema needed Q1 refinement (frozen-at-close billing columns).
3. **Explore audit recommendations** — DESIGN-TOKENS-PLAN as active spoke (not orphan), GTM-READINESS migrate-then-supersede, per-page bootstrapper shipped, `docs/eval/` delete, workspace `.cursor/plans/` triage.

---

## Sub-task outcomes

| Sub-task | Outcome | Notes |
|---|---|---|
| **1a** INDEX spoke + triage | **DONE** | `DESIGN-TOKENS-PLAN` added to Brand + UX; removed from Andrew-confirms |
| **1b** focus-ring fix | **DONE** | `--focus-ring` → `var(--border-strong)` per UX-AND-A11Y-SPEC § 5.1; no other `var(--accent)` focus-ring lines found |
| **1c** Tailwind open Q removed | **DONE** | Open Q #2 removed; renumbered remaining questions |
| **1d** lint spec mirror | **DONE** | Verbatim ESLint block + CI grep note added under UX-AND-A11Y-SPEC § 13.1 |
| **1e** per-org BACKLOG | **DONE** | Bullet under Decisions deferred |
| **1f** deferred migrations | **DONE (note only)** | Phase 0 DoD, 0a–0e sequence, legacy alias table, default light/dark — deferred until Phase 0 begins; see Andrew-confirms |
| **2a** verdict framing → RELEASE-ROADMAP | **DONE** | 3-stage paragraph in Purpose section (framing only, not stale GTM table) |
| **2b** pilot checklist → DEPLOY | **DONE** | 7-item list verbatim + env-only reset caveat in Password reset |
| **2c** README BACKLOG | **DONE** | Operational follow-ups |
| **2d** §1 hosting stale callout | **DONE** | Via GTM SUPERSEDED header (not inline §1 edit) |
| **2e** GTM SUPERSEDED | **DONE** | 3-line blockquote at top |
| **3a** per-page bootstrapper SUPERSEDED | **DONE** | Forward-link: `docs/WHITEBOARD-STATUS.md` § Per-page view state SHIPPED |
| **3b** student-side BACKLOG | **DONE** | Whiteboard table row (Phase 5 task 8 follow-up) |
| **4** delete docs/eval/ | **DONE** | 2 files deleted; dir empty; no unexpected files |
| **5** workspace plans triage | **DONE** | All 3 SUPERSEDED (stale YAML / completed todos / consolidated roadmap) |
| **6** Q1 schema patch | **DONE** | Surface 7 schema + immutability invariant in RELIABILITY-REDESIGN |
| **7** INDEX final review | **DONE** | Stale archive + triage updated per above |
| **8** this handoff | **DONE** | |

---

## Files touched (this pass only)

| File | Δ (approx) | Action |
|---|---|---|
| `docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md` | +~120 | **Created** |
| `docs/INDEX.md` | +8 / −6 | Modified (spoke, stale archive, triage) |
| `docs/DESIGN-TOKENS-PLAN.md` | +3 / −6 | focus-ring, open Q, renumber |
| `docs/UX-AND-A11Y-SPEC.md` | +29 | lint spec mirror § 13.1 |
| `docs/GTM-READINESS.md` | +2 | SUPERSEDED header |
| `docs/RELEASE-ROADMAP.md` | +3 / −1 | 3-stage framing + last-updated |
| `docs/DEPLOY.md` | +14 | pilot checklist + env-only caveat |
| `docs/BACKLOG.md` | +4 / −1 | per-org, README, student PVS, eval line removed |
| `docs/handoff/per-page-view-state-bootstrapper.md` | +2 | SUPERSEDED header |
| `docs/RELIABILITY-REDESIGN-2026-05-27.md` | +~22 | Surface 7 schema + invariant (file may be untracked from prior pass) |
| `.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md` | +2 | SUPERSEDED |
| `.cursor/plans/whiteboard_backlog_execution.plan.md` | +2 | SUPERSEDED |
| `.cursor/plans/whiteboard_improvement_execution.plan.md` | +2 | SUPERSEDED |
| `docs/eval/README.md` | −4 | **Deleted** |
| `docs/eval/sarah-b3b4-evaluation-transcripts.md` | −20 lines in git stat (file ~21 lines header + long transcript) | **Deleted** |

**Not touched:** production code, tests, `prisma/`, prior-pass files outside scope (e.g. `AGENTS.md`, other bootstrappers) except as already in working tree.

---

## Andrew-confirms list

| Item | Why flagged | Suggested action |
|---|---|---|
| **`billed*` vs `reported*` column naming** | Andrew may prefer `reportedStartLocal` etc. for pre-billing semantics | Confirm before Wave 2.5 schema migration ships |
| **Default light vs dark (DESIGN-TOKENS open Q #1)** | Still open; deferred from INDEX triage to Phase 0 kickoff | Decide when starting Phase 0; do not migrate to STATUS doc yet |
| **Phase 0 playbook mechanics** | DoD, 0a–0e, legacy alias table intentionally NOT migrated | Create `docs/DESIGN-TOKENS-STATUS.md` when Phase 0 execution begins |
| **`docs/WHITEBOARD-ROADMAP-NEXT.md`** | Still in INDEX Andrew-confirms (unchanged this pass) | Add SUPERSEDED header when Andrew confirms — same as prior overnight report |
| **Workspace plan YAML parsing** | SUPERSEDED headers placed above `---` front matter on 3 in-workspace plans | Verify Cursor Build still reads them after commit (same risk as overnight user-level plans) |

**Resolved this pass (no longer Andrew-confirms):** DESIGN-TOKENS-PLAN (spoke), GTM-READINESS (superseded), per-page bootstrapper (superseded), docs/eval (deleted).

---

## Deferred-until-Phase-0 (1f — do not migrate now)

Per Andrew's direction, these stay in `docs/DESIGN-TOKENS-PLAN.md` until Phase 0 work starts:

- Phase 0 definition of done (5 criteria)
- Phase 0a–0e migration sequence
- Legacy alias table (`--bg`, `--panel`, `--color-*`)
- Default light vs dark decision (open Q #1)

At Phase 0 kickoff: create `docs/DESIGN-TOKENS-STATUS.md` per existing per-feature STATUS pattern and migrate the above.

---

## Open questions for Andrew

1. **`billed*` vs `reported*` naming** on `WhiteboardSession` frozen columns (see RELIABILITY-REDESIGN Surface 7).
2. **`docs/WHITEBOARD-ROADMAP-NEXT.md`** — supersede now or keep as working doc?
3. **Cursor Build** — confirm the three workspace `.cursor/plans/*.plan.md` files still parse after SUPERSEDED headers above YAML.

---

## Workspace plans triage detail (sub-task 5)

| File | Verdict | Rationale |
|---|---|---|
| `.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md` | **SUPERSEDED** | W-item checklist; lockstep points to superseded WHITEBOARD-ROADMAP-NEXT; live queue is BACKLOG + WHITEBOARD-STATUS |
| `.cursor/plans/whiteboard_backlog_execution.plan.md` | **SUPERSEDED** | YAML still lists PDF workbook as pending; PDF shipped `9ff5b11`; waves pre-RELEASE-ROADMAP |
| `.cursor/plans/whiteboard_improvement_execution.plan.md` | **SUPERSEDED** | All todos `completed`; manual smoke deferred to BACKLOG / smoke-log |

No ambiguous plans flagged — all three clearly stale.

---

## Cross-links

- Prior cleanup: [`doc-cleanup-2026-05-27-orchestrator-report.md`](doc-cleanup-2026-05-27-orchestrator-report.md)
- Reliability redesign doc: [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md)
- Entry point: [`docs/INDEX.md`](../INDEX.md)
