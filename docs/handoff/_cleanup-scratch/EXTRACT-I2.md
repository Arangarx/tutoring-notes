# EXTRACT-I2 — Orchestrator reports + pilot feedback (Batch I2)

**Generated:** 2026-07-09  
**Worktree:** `chore/doc-cleanup-master` @ `tutoring-notes-merge-audio`  
**Sources (8):** `reliability-and-prompt-v7-2026-05-20-orchestrator-report.md`, `reliability-redesign-2026-05-27-orchestrator-report.md`, `morning-cleanup-2026-05-27-orchestrator-report.md`, `doc-cleanup-2026-05-27-orchestrator-report.md`, `v1-design-session-2026-05-19-pm-orchestrator-report.md`, `sarah-pilot-feedback-2026-05-26-orchestrator-report.md`, `sarah-pilot-feedback-2026-06-06-orchestrator-report.md`, `sarah-pilot-feedback-2026-06-16-orchestrator-report.md`

**Method:** Read each source fully. Classify durable items as **CARRY** (open, not adequately captured elsewhere), **Already-captured** (`docs/BACKLOG.md` or `docs/SARAH-CALL-PREP.md`), or **Shipped/obsolete** (verify `src/` or superseded docs where noted). Selective on CARRY — most retrospective content is historical.

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **Andrew confirms ship-to-Sarah gate checklist (§2)** — proposed gates a–d (End never silent-deletes, replay scrubber, monolithic notes path retired, waiting-room→WB→end stable both sides) still **PENDING** confirmation | Pilot cut / release | **P0** | `sarah-pilot-feedback-2026-06-16` §2: *"PROPOSED — pending Andrew's confirmation"*; BACKLOG hooks SSG-1/2/3 exist but gate ratification itself is not a backlog row | `sarah-pilot-feedback-2026-06-16-orchestrator-report.md` |
| **Formalize IA decisions in `UX-AND-A11Y-SPEC.md` §15** — Sarah 2026-05-26 locked scheduling=no + session-centric model + default landing = next-actions, but §15 rows 2–5 and 8 remain formally open; **`docs/UX-DESIGNS-PHASE-1.md` / `PHASE-2.md` never written** | v1 IA / design specs | **P1** | `v1-design-session-2026-05-19-pm` deferred Phase 1+2 specs; `sarah-pilot-feedback-2026-05-26` §3 decisions table; `UX-AND-A11Y-SPEC.md` §15 rows 2–5 still list defaults, not locked values | `v1-design-session-2026-05-19-pm-orchestrator-report.md`, `sarah-pilot-feedback-2026-05-26-orchestrator-report.md` |
| **AI prompt + UI: Sarah "homework → plan" (v8)** — remove or collapse homework section; plan = forward-looking + any assignments | Notes / AI prompt | **P2** | Sarah verbatim in `sarah-pilot-feedback-2026-05-26` §2.6; `reliability-redesign-2026-05-27` deferred v8 dispatch; **`src/lib/ai.ts` still emits `homework` field; `NewNoteForm.tsx` still renders Homework label** — not a named BACKLOG row | `sarah-pilot-feedback-2026-05-26-orchestrator-report.md`, `reliability-redesign-2026-05-27-orchestrator-report.md` |
| **Session log: store `ratePerHour` / auto-calc `billedAmount`?** — ask Sarah (design defers fields until in-app billing) | Session log / billing | **P2** | `reliability-redesign-2026-05-27` Open Q #1; `RELIABILITY-REDESIGN-2026-05-27.md` Surface 7; `v1-component-redesign-design-2026-05-31.md` ratifies immutability but leaves rate/amount deferred — **not in `SARAH-CALL-PREP.md` open list** | `reliability-redesign-2026-05-27-orchestrator-report.md` |
| **`billed*` vs `reported*` column naming** on frozen session-log columns — Andrew confirm before Wave 2.5 migration | Schema / billing | **P2** | `morning-cleanup-2026-05-27` Andrew-confirms; `RELIABILITY-REDESIGN-2026-05-27.md` Surface 7 — **no BACKLOG row** | `morning-cleanup-2026-05-27-orchestrator-report.md` |
| **Historical `SessionNote.startTime`/`endTime` timezone backfill** — backfill (lossy) vs accept UTC for old notes only | Data migration | **P2** | `reliability-redesign-2026-05-27` Open Q #5 recommends accept-and-move-forward; **not explicitly captured in BACKLOG** (only generic timezone follow-up on shipped session time logging) | `reliability-redesign-2026-05-27-orchestrator-report.md` |
| **B11 — release camera/mic tracks on session end** (Sarah blocked re-entering Discord) | Live A/V lifecycle | **P1** | `sarah-pilot-feedback-2026-05-26` §2.1 B11 CRITICAL; `RELIABILITY-REDESIGN-2026-05-27.md` Surface 2 — **no dedicated BACKLOG row found** (only mentioned in redesign docs) | `sarah-pilot-feedback-2026-05-26-orchestrator-report.md`, `reliability-redesign-2026-05-27-orchestrator-report.md` |
| **B6 — audio recovery after external app steals mic** (Discord); pre-check `ondevicechange` feasibility | Live A/V / recording | **P2** | `reliability-redesign-2026-05-27` Open Q #3; `sarah-pilot-feedback-2026-05-26` §2.1 B6 — **no dedicated BACKLOG row** (adjacent W1 `ondevicechange` policy) | `sarah-pilot-feedback-2026-05-26-orchestrator-report.md`, `reliability-redesign-2026-05-27-orchestrator-report.md` |
| **Homework image import workflow** — camera roll vs email vs scanner routes UX | Whiteboard assets | **P3** | `sarah-pilot-feedback-2026-05-26` §6 open ambiguity — **not in SARAH-CALL-PREP or BACKLOG** | `sarah-pilot-feedback-2026-05-26-orchestrator-report.md` |
| **Default light vs dark theme** — DESIGN-TOKENS Phase 0 kickoff decision | Brand / tokens | **P3** | `morning-cleanup-2026-05-27` deferred-until-Phase-0; `DESIGN-TOKENS-PLAN.md` open Q #1 | `morning-cleanup-2026-05-27-orchestrator-report.md` |
| **`docs/WHITEBOARD-ROADMAP-NEXT.md` supersede?** — doc housekeeping | Docs | **P3** | `doc-cleanup-2026-05-27` + `morning-cleanup-2026-05-27` Andrew-confirms; BACKLOG still references it as roadmap pointer (line ~550) | `doc-cleanup-2026-05-27-orchestrator-report.md`, `morning-cleanup-2026-05-27-orchestrator-report.md` |

**Note — belongs in `SARAH-CALL-PREP.md` (not BACKLOG):** Add **session-log billing rate** question (row above) alongside existing Wyzant/UVU forms artifact ask; optional add **homework import workflow** + **graph workflow verify** (Desmos/JSXGraph end-to-end — BACKLOG says aligned but Sarah never re-confirmed post-JSXGraph swap).

---

## Already-captured list

### In `docs/BACKLOG.md`

| Item | Backlog anchor / tag |
|------|----------------------|
| Reliability #6 note-save vs transcribe race | ✅ SHIPPED — `249327a`; merge-into-empty in `NewNoteForm.tsx` |
| AI prompt v7 partial (reaction-aware Assessment) | Partial — `PROMPT_VERSION = "2026-05-20-v7"` in `src/lib/ai.ts`; BACKLOG v7 entry — still open: (a) input reframe, (c) speaker hint, fixture suite |
| Literal-vs-interpretive Assessment decision rule | BACKLOG Pilot feedback — gated on Sarah/parent feedback or fixture suite |
| Whisper transcription accuracy + descriptive-prompt lesson | BACKLOG Whisper entry + v7 lesson |
| Reliability audit #1+#2 (IDB durability), #7 (hot-swap mic), #13+#14 (`rid=` + lifecycle log) | `## Recorder & Notes — reliability gaps audit` — still OPEN |
| Sarah 2026-05-26 sync priorities B1–B4 | Gate A5 live bidirectional sync; whiteboard queue |
| Toolbar reorder U4, shape dropdowns U5/U6, mobile palette I7 | Whiteboard queue + `@wb-chrome` framing |
| Laser pointer B8+B9 (offset + invisible to student) | Gate A5 / ST-05 rows |
| Student mobile viewport I5, waiting room U1 | Gate A2 waiting room; student-mobile-first chrome |
| Student accounts + consent §2.5 | Gate B2 parent privacy consent; identity epic |
| Session log + reporting (log-the-time) | Wave 2.5 design in `RELIABILITY-REDESIGN-2026-05-27.md`; billing lib partial in `src/lib/billing/`; timer-gap open Q in BACKLOG line ~941 |
| Solo / in-person mode | `SessionMode` enum + `IN_PERSON` in `prisma/schema.prisma`; lifecycle `soloEnabled` |
| Sarah 2026-06-06 B1 Ctrl+Z, B2 clipboard, U5/U6 pen panel, F1 discard | `pilot-2026-06-06` rows in `## Pilot feedback — action items` |
| Sarah 2026-06-16 prod bugs → ship blockers | **SSG-1**, **SSG-2**, **SSG-3** |
| Graph insert (Desmos→JSXGraph) | BACKLOG graphing tool swap section; Sarah Q1 noted aligned |
| Recording auto-pause banner on student disconnect | ✅ SHIPPED lifecycle FSM — **but** BACKLOG Apr-20 note (line ~710) flags possible gap: FSM/banner vs recorder still running when alone — verify before closing |
| PostHog / AI edit signal | Deferred — legal umbrella gate (out of pilot-feedback scope) |
| Wyzant + UVU export formatters | Stubs until artifacts; org-aware rounding BACKLOG row |

### In `docs/SARAH-CALL-PREP.md`

| Item | SARAH-CALL-PREP section |
|------|-------------------------|
| Q4 pain point worked around | Next call §1 — still never asked |
| Sarah-drives-tutor-side methodology | Next call §2 — partially addressed by 2026-06-06 desktop tutor session |
| Wyzant + UVU form artifacts | Next call §3 |
| Sarah primary device verify (Windows desktop?) | Next call §0 — added 2026-06-18 |
| Scheduling = NO, anchor = session, log-the-time, wedge, solo mode, brand reveal | § Answers landed 2026-05-26 |
| 2026-06-06 session capture pointer | § Answers landed 2026-06-06 |
| Toolbar / shape dropdown / palette dismiss feasibility | § Answers landed 2026-06-07 (engineering, not re-litigate) |

---

## Shipped / obsolete list

| Item | Status | Evidence |
|------|--------|----------|
| Note save vs transcribe race (#6) | **SHIPPED** | `NewNoteForm.populate` merge-into-empty; `AiAssistPanel.checkOverwriteAndPrepare`; tests in `src/__tests__/dom/` |
| AI prompt v7 reaction-aware Assessment (core) | **SHIPPED** | `src/lib/ai.ts` `PROMPT_VERSION = "2026-05-20-v7"` |
| Whisper biasing descriptive sentence | **REVERTED / lesson captured** | Revert `59577fe`; lesson in reliability-v7 report + BACKLOG |
| CTA contrast Option A (dark on coral) | **SHIPPED** | `v1-design-session-2026-05-19-pm`; `docs/BRAND.md`, `UX-AND-A11Y-SPEC.md` §15 row 1 |
| Parent share view formal spec in Phase 1 | **DECIDED** | `UX-AND-A11Y-SPEC.md` §15 row 6 resolved |
| Sarah scheduling in v1 | **LOCKED NO** | `sarah-pilot-feedback-2026-05-26` Q2; product positioning captured |
| Sarah top-2 actions (#1 start session, #2 end + recap) | **CONFIRMED** | `v1-design-session-2026-05-19-pm`; SARAH-CALL-PREP answers |
| Solo / in-person tutor mode production enable | **SHIPPED (schema + lifecycle)** | `prisma/schema.prisma` `SessionMode` / `IN_PERSON`; `lifecycle-machine.ts` |
| Real-time sync + drawing pad (2026-06-06) | **VALIDATED** | `sarah-pilot-feedback-2026-06-06` — no new backlog for core loop |
| Doc cleanup 2026-05-27 pass | **DONE** | `docs/INDEX.md` created; SUPERSEDED headers; `AGENTS.md` Key docs updated |
| Morning cleanup sub-tasks 1a–8 | **DONE** | `morning-cleanup-2026-05-27` outcome table |
| GTM-READINESS superseded | **DONE** | SUPERSEDED header per morning-cleanup 2e |
| `docs/eval/` delete | **DONE** | morning-cleanup 4 |
| Per-page view state bootstrapper | **SHIPPED / SUPERSEDED** | morning-cleanup 3a → `WHITEBOARD-STATUS.md` |
| Workspace `.cursor/plans/*` triage | **DONE** | All three SUPERSEDED |
| Reliability redesign sequencing doc | **COMPLETE design pass** | `docs/RELIABILITY-REDESIGN-2026-05-27.md` — execution largely absorbed into v1-redesign / Gate A–B waves |
| Long-form transcribe Tier 1 implementation | **SHIPPED** (smoke deferral obsolete) | `PHASE-6-TIER-1-STATUS.md`; reliability-v7 report smoke-only deferral superseded |
| B1–B4 sync sweep dispatch prompts | **Historical executor briefings** | Absorbed into Gate A5 / wb-wave work — not standalone open actions |
| Strategic reframe (wedge = live WB + recording) | **CAPTURED** | RELEASE-ROADMAP / BACKLOG positioning; not an open build item |
| Brand reveal cold-pronunciation test | **GREEN LIGHT** | SARAH-CALL-PREP §4 defer UI-surface check until post-refresh |
| 2026-06-06 layout/clutter/share-label items U1–U4 | **IN FLIGHT v1 redesign** | Explicitly "ALREADY COVERED" in 2026-06-06 report |
| Explore subagent public-surfaces audit (v1-design-session) | **Obsolete in-flight** | Session paused; v1 redesign superseded bootstrapper deliverable |

---

## Per-doc archive note table

| Source doc | Archive verdict | Note |
|------------|-----------------|------|
| `reliability-and-prompt-v7-2026-05-20-orchestrator-report.md` | **Archive after extract** | Session-complete retrospective. Durable content = BACKLOG (#6 ✅, v7 partial, Whisper lesson, reliability #1/#2/#7/#13/#14). Starter bootstrapper superseded by `ORCHESTRATOR-STATE.md` + inline dispatch. |
| `reliability-redesign-2026-05-27-orchestrator-report.md` | **Archive after extract** | Companion to `docs/RELIABILITY-REDESIGN-2026-05-27.md` (keep design doc). Dispatch A/B briefings historical. Open Andrew-confirms → CARRY table + design doc Surface 7. |
| `morning-cleanup-2026-05-27-orchestrator-report.md` | **Archive after extract** | Mechanical follow-up to overnight cleanup; outcomes landed in canonical docs. Remaining Andrew-confirms → CARRY (naming, theme, WHITEBOARD-ROADMAP-NEXT). |
| `doc-cleanup-2026-05-27-orchestrator-report.md` | **Archive after extract** | Inventory/classification artifact for INDEX creation. Andrew-confirms largely resolved in morning pass; WHITEBOARD-ROADMAP-NEXT still open. |
| `v1-design-session-2026-05-19-pm-orchestrator-report.md` | **Archive after extract** | IA deferral context valuable but superseded by Sarah 2026-05-26 answers. Unresolved: formal §15 updates + UX-DESIGNS-PHASE specs → CARRY. |
| `sarah-pilot-feedback-2026-05-26-orchestrator-report.md` | **Keep indexed; do not delete** | Canonical verbatim pilot capture (also cited from `SARAH-CALL-PREP.md`, `v1-redesign-STATUS.md`, BACKLOG). Archive only the *orchestrator-report framing* if splitting; content is primary-source Sarah quotes. |
| `sarah-pilot-feedback-2026-06-06-orchestrator-report.md` | **Archive after extract** | Post-session triage complete; new items in BACKLOG; validations need no carry. |
| `sarah-pilot-feedback-2026-06-16-orchestrator-report.md` | **Archive after extract** | Prod bug investigation + SSG hooks landed in BACKLOG. Only durable process item = Andrew gate confirmation (CARRY P0). |

---

## Extraction summary

- **CARRY:** 11 items (selective) — mostly **unratified decisions**, **BACKLOG gaps** (B11, B6, homework→plan), and **IA spec debt**.
- **Already-captured:** Majority of Sarah May/June feedback, reliability sprint items, SSG ship blockers, and v7/Whisper follow-ups live in BACKLOG; standing Sarah questions in SARAH-CALL-PREP.
- **Shipped/obsolete:** Reliability #6, v7 core, brand/CTA decisions, scheduling lock, solo mode schema, doc-cleanup deliverables, 2026-06-06 core-loop validation.
- **Protected doc:** `SARAH-CALL-PREP.md` remains the living pilot-feedback home; consider adding **billing rate** + **homework import workflow** questions on next edit (not done in this extract pass).
