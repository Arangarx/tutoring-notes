# EXTRACT-J2 — single-fix plans + research docs (2026-07-09)

Batch scope: 17 `~/.cursor/plans/*.plan.md` tutoring fixes + 3 research docs (`tutoring-notes-merge-audio` worktree). Evidence = grep `src/` + `docs/BACKLOG.md` + `docs/RELEASE-ROADMAP.md` on `tutoring-notes` tip.

**Classification key:** **SHIPPED** = plan intent landed in code; **IN-BACKLOG** = open item already named in BACKLOG (or RELEASE-ROADMAP with same intent); **OPEN→CARRY** = residual/deferred not yet captured (or only in program banner without row).

---

## CARRY table

| Item | Area | Priority | Evidence | Source |
|------|------|----------|----------|--------|
| **SMOKE-AUDIO-1** — first-acquire Brio mic silent until switch-and-back | Live A/V / recorder | **P0** | `docs/BACKLOG.md` L161 — pre-Sarah; RC = bare `deviceId:{exact}` first acquire vs enumerate-entry on switch; hardware PLAYWRIGHT-GAP. Attempts #3–#4 plans marked done but row still **OPEN** with fix spec (unify acquire + silent RMS oracle). | `evening_smoke_triage_*.plan.md`, `audio-1_opus_escalate_*.plan.md` |
| **SMOKE-BLOCK-5** — solo/in-person sessions: no strokes → no replay | Recorder FSM | **P0** | `BACKLOG.md` L127 — FSM stays `armed/awaiting_first_participant`; `wbCaptureActive` false. `NEXT_PUBLIC_WB_RECORD_SOLO_UNTIL_STUDENT` still gates in `lifecycle-machine.ts` + `WhiteboardWorkspaceClient.tsx` (~L1840). | `solo_recording_always-on_*.plan.md` |
| **SMOKE-BUG-10** — "Waiting for student" banner in in-person | WB chrome / FSM | **P1** | `BACKLOG.md` L133 — same root as BLOCK-5; banner not mode-aware. | `solo_recording_always-on_*.plan.md` |
| **WS-I / tutor mute in recording** — mute must silence replay mixdown (incl. pre-start) | Live A/V / recorder | **P1** | `BACKLOG.md` L173 **WS-I-PRESTART-MUTE** — no `localRecordingMuteGain` in `mic-recorder-audio.ts` (grep empty). Plan WS-I not landed. | `tutor_mute_honored_in_recording_8d0e254b.plan.md` |
| **WS-G** — server-side `tutor:mic:concat` replay master | Replay / finalize | **P1** | No `concat-replay-audio.ts`, `tutor:mic:concat`, or `pickReplaySegments` in `src/`. Multi-segment boundary hitch + drift chip still expected. | `seamless_replay_concat_eaea8414.plan.md` |
| **WS-L / A6-1** — multi-segment scrubber seek-to-0 + proportional scrub | Replay | **P1** | `BACKLOG.md` L82 **SMOKE-UX-1** REOPEN (auto-play jumps to end); L333 **SSG-3** multi-segment scrubber. Partial: `replay-audio-timeline.ts` `measuredTotalMs` + tests exist; concat end-state not shipped. | `scrubber_multi-segment_seek_fix_663915e7.plan.md` |
| **WS-K** — incremental reduce during session; End ≤2–3s notes ready | Notes pipeline | **P1** | No `enqueueIncrementalNotesReduce` / `lastReducedExtractionCount` in `src/`. `BACKLOG.md` L61: reduce **end-only**; live-display deferred — plan's **compute-live reduce** invariant **not** captured as its own row. | `live_reduce_notes_ready_at_end_ded9005b.plan.md` |
| **SMOKE-END-WINDDOWN** — disarm board + immediate student wind-down on End confirm | Session lifecycle | **P1** | `BACKLOG.md` L162 — Andrew decided 2026-07-09; not built. | (adjacent to evening smoke / durability wave; not in J2 plans) |
| **PRESARAH-1** — always-on recording; remove recording-intent toggles | Recorder paradigm | **P1** | `BACKLOG.md` L32 — locked decision; `userWantsRecording` + `StudentRecordingDefaultToggle` still in tree. Distinct from solo-FSM fix. | (cross-ref solo plan) |
| **Session-log + Wyzant/UVU export surface** (date-range search, consolidated export) | Admin / institutional | **P1** | Market review OQ2/OQ6 + K5; `BACKLOG.md` has **billing freeze** (WS-J shipped) + timer gap note L931 but **no** dedicated session-log/export row. Sarah Q2 compliance artifact. | `market-analysis-strategic-review-2026-06-12.md` |
| **Continuity engine V1** — carryover loops, "would you agree?", evidence atoms | Product / moat | **P2** | `BACKLOG.md` program banner L16 — "**most of this is not yet a backlog row**; brainstorm doc is its spec." No `sr-notes-in-session` implementation rows. | `continuity-wedge-brainstorm-2026-06-12.md` |
| **Notes quality / moat elevation** — pull forward vs Gate A only | AI notes | **P2** | `BACKLOG.md` L63 SMOKE-NOTES-3, L163 NOTES-QUALITY-HOLD; market review H2. Acknowledged poor map/reduce accuracy. | `market-analysis-strategic-review-2026-06-12.md` |
| **Public wedge messaging** — "structured memory" not "whiteboard+" | Positioning | **P2** | `RELEASE-ROADMAP.md` Experience-Driven Wedge overlay references brainstorm; no marketing copy task. Market review H1 OQ. | `market-analysis-strategic-review-2026-06-12.md` |
| **BYU institutional pitch track** separate from Sarah solo story | GTM | **P2** | Market review OQ3/T3 — org MVP Wave 5 planned; no dedicated institutional pitch backlog row. | `market-analysis-strategic-review-2026-06-12.md` |
| **SMOKE-BUG-11** — tutor mic picker not initialized from `tn-mic-device-id` | Device picker | **P2** | `BACKLOG.md` L134 — picker UI vs recorder capture split. Mic group key exists (`storage.ts`) but plan's full hardening ≠ done. | `mic_persistence_hardening_67d9cd4b.plan.md` |
| **Admin notes UX pass — Phase 0 visual regression matrix** | Test infra | **P2** | Plan Phase 0 (axe, 4-viewport `toHaveScreenshot` baselines) — no enrollment as described; static visual project exists for auth/marketing only per workspace rules. | `admin_notes_history_view_4a88827e.plan.md` |
| **Admin notes UX — deferred F2–F8** (outbox search, students list pagination, dashboard "today", status badges, mobile audit, start-session affordance) | Admin UX | **P2–P3** | Plan audit table F2–F8 marked defer; not individually in BACKLOG. | `admin_notes_history_view_4a88827e.plan.md` |
| **Parent "seen by tutor" badge on notes** | Admin UX | **P3** | Plan Phase 5 deferred; `BACKLOG.md` L819 suggests future `NoteView`-derived badge — low priority. | `admin_notes_history_view_4a88827e.plan.md` |
| **Recorder test refactor Phases 4–6** (MicControls shell split, audio-rollover Playwright, final Opus pass) | Tech debt / tests | **P3** | `MicControls.tsx` + `PendingSegmentList.tsx` exist; plan `stop3`+ pending. `recorder-test-refactor_00e7871e.plan.md` snapshot: Phases 1–3 done. | `recorder-test-refactor_00e7871e.plan.md` |
| **ROAD-TO-GA Gate 1** — LLC, business bank, sales tax | Business ops | **P3** | `ROAD-TO-GA.md` Gate 1 rows `not-started`; not in BACKLOG product table. | `ROAD-TO-GA.md` |
| **ROAD-TO-GA Gate 2 cash** — scoped legal counsel consult | Legal | **P3** | `ROAD-TO-GA.md` L88; deferrable for invite-only beta. Umbrella COPPA branch in-progress elsewhere. | `ROAD-TO-GA.md` |
| **ROAD-TO-GA cheap-but-do-early** — monitoring/alerting, DR runbook drill, email deliverability | Ops | **P3** | `ROAD-TO-GA.md` L115–117 `not-started` / runbook gap; partial overlap `CostEvent` in BACKLOG cost observability. | `ROAD-TO-GA.md` |
| **Engagement/dopamine surfaces** (mascot, charts, streaks) | Product | **P3** | Explicitly deferred in `BACKLOG.md` banner L20; brainstorm V2/V3 — design-compatible only. | `continuity-wedge-brainstorm-2026-06-12.md` |
| **First-party product analytics** (learner-type-keyed, zero minor egress) | Instrumentation | **P3** | `BACKLOG.md` L342+ near-immediate post-master; aligns Wedge Phase 4. Brainstorm mandates before go-live. | `continuity-wedge-brainstorm-2026-06-12.md` |

---

## Already-captured list

Items from J2 plans or research that **do not** need a new backlog row (named + open, or shipped and cross-linked).

| Item | Status | Where captured |
|------|--------|----------------|
| AI notes from pasted text (`aiGenerated`, `AiAssistPanel`, `generateSessionNote`) | **SHIPPED** | `src/lib/ai.ts`, `AiAssistPanel.tsx`, tests |
| Audio session capture (Blob, Whisper, `SessionRecording`, upload/record tabs) | **SHIPPED** | `transcribe.ts`, `AudioRecordInput.tsx`, `audio-upload.spec.ts` |
| Multi-recording per note (schema `orderIndex`, segments UI) | **SHIPPED** | Migration `20260418000000_multi_recording` |
| Admin notes history + search + admin audio proxy | **SHIPPED** | `src/app/admin/students/[id]/notes/page.tsx`, `NotesSearchBar.tsx` |
| Session note `startTime`/`endTime` auto-fill | **SHIPPED** | `actions.ts`, notes page display |
| Share page NoteView + SeenTracker + `/s/[token]/all` | **SHIPPED** | `SeenTracker.tsx`, `all/page.tsx`; follow-ups L754–761 |
| Billable time rounding WS-J (freeze at close, settings, display) | **SHIPPED** | `src/lib/billing/`, `/admin/settings/billing`, `endWhiteboardSession` tests |
| Waiting-room exit affordance (Cancel / Leave) | **SHIPPED** | `WaitingRoomOverlay.tsx`, `wb-session-lifecycle.spec.ts`, `wb-cancel-pending-session.spec.ts` |
| Evening smoke triage — icons PASS; attempt #3 silent-recovery package | **SHIPPED** (code) / **hardware still fails** | Plan todos completed; superseded by **SMOKE-AUDIO-1** row |
| Experience-Driven Wedge program mapping | **IN-BACKLOG** (banner) | `BACKLOG.md` L10–22, `RELEASE-ROADMAP.md` overlay |
| Founding principle — honesty, no dark patterns | **IN-BACKLOG** (banner) | `BACKLOG.md` L12; brainstorm FOUNDING PRINCIPLE |
| Bank-now data-model constraints (portable record, engagement-ready events) | **IN-BACKLOG** (banner) | `BACKLOG.md` L22 |
| PIPELINE-1 agentic pipeline before release | **IN-BACKLOG** | `BACKLOG.md` L146 |
| Replay REAL-FAILs: SMOKE-UX-1, SSG-3, PDF thumbnail placeholder | **IN-BACKLOG** | `BACKLOG.md` L82, L97, L333 |
| Post-Sarah replay/share phone viewport issues | **IN-BACKLOG** | `BACKLOG.md` L97–104 |
| BUG-8/BUG-9 reconnect / camera hotswap | **IN-BACKLOG** | `BACKLOG.md` L75–76 |
| Pen-test before scale | **IN-BACKLOG** | `BACKLOG.md` L1133; `ROAD-TO-GA.md` Gate 3 |
| Coexist with Wyzant (complement not enemy) | **Captured** | `RELEASE-ROADMAP.md` / market review K2 — strategy, not a ticket |
| Scheduling deferred post-V1 | **Captured** | `RELEASE-ROADMAP.md` Gate B; market OQ5 |

---

## Shipped / obsolete list

| Plan file | Verdict | Notes |
|-----------|---------|-------|
| `ai-notes-from-text_cdf842d7.plan.md` | **SHIPPED / archive** | All todos `completed`. |
| `audio_session_capture_72c46b5d.plan.md` | **SHIPPED / archive** | Code + tests present; live-smoke todo was manual. |
| `admin_notes_history_view_4a88827e.plan.md` | **Mostly SHIPPED / archive** | Phases 1–5 core landed. Residual: Phase 0 test matrix + F2–F8 deferrals → CARRY table only. |
| `billable_time_rounding_8ddd36ee.plan.md` | **SHIPPED / archive** | WS-J: `rounding.ts`, `freeze-at-close.ts`, billing settings, jest coverage. |
| `waiting-room_exit_affordance_0e0372c5.plan.md` | **SHIPPED / archive** | Overlay cancel/leave + Playwright teeth. |
| `evening_smoke_triage_8584a975.plan.md` | **Obsolete / archive** | Superseded by `audio-1_opus_escalate_1765eb9a` (attempt #4). Keep smoke table in ORCHESTRATOR-STATE only. |
| `evening_smoke_triage_b93d0fc4.plan.md` | **Duplicate obsolete** | Same content, pending todos — discard in favor of `8584a975` completed copy. |
| `audio-1_opus_escalate_1765eb9a.plan.md` | **Obsolete as plan / archive** | Todos completed; **SMOKE-AUDIO-1** still open — do not treat as done for Sarah gate. |
| `audio-1_opus_escalate_6882e392.plan.md` | **Duplicate obsolete** | Pending duplicate of above. |
| `solo_recording_always-on_5ba5984e.plan.md` | **OPEN — not obsolete** | Empty todos; content = spec for unshipped fix → CARRY. |
| `solo_recording_always-on_f2f0970e.plan.md` | **OPEN — not obsolete** | Actionable todo list for same unshipped fix. |
| `tutor_mute_honored_in_recording_8d0e254b.plan.md` | **OPEN — not obsolete** | WS-I not merged. |
| `mic_persistence_hardening_67d9cd4b.plan.md` | **Partial / archive spec** | GroupId + relaxed retry landed; picker bridge + SMOKE-AUDIO-1 supersede "done". |
| `seamless_replay_concat_eaea8414.plan.md` | **OPEN — not obsolete** | WS-G not started in code. |
| `scrubber_multi-segment_seek_fix_663915e7.plan.md` | **Partial / keep until WS-G** | Unit fixes landed; hardware regressions remain in BACKLOG. |
| `live_reduce_notes_ready_at_end_ded9005b.plan.md` | **OPEN — not obsolete** | WS-K; hard invariant not in BACKLOG as dedicated row. |
| `recorder-test-refactor_00e7871e.plan.md` | **Partial / archive** | Phases 1–3 shipped on branch per plan snapshot; 4–6 optional debt. |

---

## Per-file archive note

### Plans (`~/.cursor/plans/`)

| File | Archive note |
|------|----------------|
| `admin_notes_history_view_4a88827e.plan.md` | **Archive** after extracting Phase 0 + F2–F8 deferrals to BACKLOG if desired. Canonical shipped UX: notes history, multi-seg, NoteView, session times. |
| `ai-notes-from-text_cdf842d7.plan.md` | **Safe delete / archive.** Foundation shipped Apr 2026. |
| `audio_session_capture_72c46b5d.plan.md` | **Safe delete / archive.** Whisper+Blob path is production spine. |
| `billable_time_rounding_8ddd36ee.plan.md` | **Safe delete / archive.** WS-J shipped; session-log *export* is separate market item. |
| `tutor_mute_honored_in_recording_8d0e254b.plan.md` | **Keep until WS-I merges** — link to `WS-I-PRESTART-MUTE` + full mute-in-recording spec. |
| `mic_persistence_hardening_67d9cd4b.plan.md` | **Archive** — superseded by SMOKE-AUDIO-1 + SMOKE-BUG-11 for remaining work. |
| `seamless_replay_concat_eaea8414.plan.md` | **Keep until WS-G ships** — finalize concat is fragile-surface spec. |
| `scrubber_multi-segment_seek_fix_663915e7.plan.md` | **Keep until SSG-3/SMOKE-UX-1 green** — note dependency on WS-G for clean end-state. |
| `solo_recording_always-on_5ba5984e.plan.md` | **Keep** — duplicate stub; merge with `f2f0970e` mentally. |
| `solo_recording_always-on_f2f0970e.plan.md` | **Keep until SMOKE-BLOCK-5 resolved** — FSM + harness-alignment spec. |
| `audio-1_opus_escalate_1765eb9a.plan.md` | **Archive** — escalation record; active work = BACKLOG SMOKE-AUDIO-1. |
| `audio-1_opus_escalate_6882e392.plan.md` | **Delete duplicate.** |
| `evening_smoke_triage_8584a975.plan.md` | **Archive** — smoke snapshot 2026-07-09 evening. |
| `evening_smoke_triage_b93d0fc4.plan.md` | **Delete duplicate.** |
| `waiting-room_exit_affordance_0e0372c5.plan.md` | **Safe delete / archive.** WS-F shipped. |
| `live_reduce_notes_ready_at_end_ded9005b.plan.md` | **Keep until WS-K** — add BACKLOG row for ≤2–3s End invariant + incremental reduce. |
| `recorder-test-refactor_00e7871e.plan.md` | **Archive** — historical refactor; Phases 4–6 only if resuming `refactor/recorder-test-modular`. |

### Research (`tutoring-notes-merge-audio/docs/`)

| File | Archive note |
|------|----------------|
| `research/market-analysis-strategic-review-2026-06-12.md` | **Keep as strategy reference.** Fold OQ2/OQ6 (session-log priority) + H2 (notes quality timing) into BACKLOG if not already actionable. K1–K5 validated in RELEASE-ROADMAP overlay. |
| `research/continuity-wedge-brainstorm-2026-06-12.md` | **Keep as Phase 2 spec** until carryover / "would you agree?" rows exist. FOUNDING PRINCIPLE already in BACKLOG banner. Do not archive until Phase 2 broken into tickets. |
| `ROAD-TO-GA.md` | **Keep live** — refresh Status columns vs `v1-redesign-STATUS.md`. Gate 1–3 business rows are Andrew-owned; link from BACKLOG only where product-touching (identity, pen-test). |

---

## Suggested BACKLOG adds (from this extract only)

Not written to BACKLOG in this batch — for orchestrator follow-up:

1. **WS-K** — incremental reduce + End ≤2–3s finalize fast-path (split from SMOKE-NOTES-2 live-*display* deferral).
2. **SESSION-LOG-EXPORT** — Wyzant 25-word + UVU pay-period aggregate + date-range search (market K5/OQ6).
3. **CONTINUITY-V1-CARRYOVER** — first spine slice from brainstorm (open loops + pre-session brief).

---

*Generated: 2026-07-09 doc-cleanup BATCH J2. No git commit.*
