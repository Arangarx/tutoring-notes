# BATCH H extraction — notes/AI/Part 3 spine + FUTURE-PHASE bootstrappers

> **Worktree:** `tutoring-notes-merge-audio` · branch `chore/doc-cleanup-master`  
> **Generated:** 2026-07-09  
> **Sources:** 10 handoff docs (Part 3 spine + recording slice 3 + session-experience arc + 5 FUTURE-PHASE bootstrappers + scheduling requirements).

---

## CARRY table

| Item | Area | Priority | Evidence | Source doc |
|------|------|----------|----------|------------|
| **AI edit signal capture — Phase 1** (`AiNoteEditSignal` + per-field AI-draft columns + `npe` logging) | Phase 11 / self-improving notes | **P3** | **Unbuilt:** `rg AiNoteEditSignal\|aiTopics\|npe` → no schema model, no `src/` hits; `AGENTS.md` has no `npe` prefix. Bootstrapper is full spec. | `ai-edit-signal-phase-1-bootstrapper.md` → archived spec: `docs/archive/handoff/ai-edit-signal-phase-1-bootstrapper.md` |
| **PostHog analytics Tier 0+1** (SDK, admin-scoped events, replay + masking audit) | Phase 11 / instrumentation | **P2** | **Unbuilt:** `rg posthog PostHog src/` → zero hits. BACKLOG reframes as post-master **first-party** instrumentation (minor-data / no 3rd-party egress) — bootstrapper PostHog-cloud spec may be **superseded**; keep archived spec for event-taxonomy reference only. | `posthog-analytics-tier-0-1-bootstrapper.md` → `docs/archive/handoff/posthog-analytics-tier-0-1-bootstrapper.md` |
| **Scheduling — backend wiring + calendar sync** (native-first; Apple + Google first-class; OAuth bundle) | Scheduling / Gate B | **P2** | **Visual-only shipped:** `src/lib/schedule/mock-data.ts` ("Visual-only placeholder… no DB wiring"), `SchedulePageClient.tsx`, `CalendarIntegrationsPanel.tsx`. No calendar API routes / OAuth / DB models. BACKLOG § Scheduling points here. | `scheduling-requirements-2026-06-11.md` (+ BACKLOG § Scheduling) |
| **S5 — scheduled topic + notes visible in live session** ("Today's plan" panel) | Scheduling → live WB | **P2** | Requirements doc wiring-phase note; **not** a separate BACKLOG row. Depends on scheduler → session linkage. | `scheduling-requirements-2026-06-11.md` § S5 |
| **S3 — Agenda as default scheduler view** (+ possible tutor login landing) | Scheduling UX | **P3** | Wiring-phase design note only; mock uses Month/Agenda tabs but no real data. | `scheduling-requirements-2026-06-11.md` § S3 |
| **S4 — Month view density for full-time tutors** | Scheduling UX | **P3** | Wiring-phase design note; visual prototype only. | `scheduling-requirements-2026-06-11.md` § S4 |
| **Two-way calendar sync** (Google watch / Apple CalDAV + conflict policy) | Scheduling | **P3** | Explicitly **unresolved** in requirements doc Q1; BACKLOG open-questions table. | `scheduling-requirements-2026-06-11.md` |
| **p3-vad-chunking — per-speaker VAD silence chunking** (replace 50-min time rollover on per-speaker lanes) | Part 3 / recorder | **P2** | Bootstrapper lists as Part 3 sequence item **unbuilt** at tip `d299a6c`; `segment-policy.ts` VAD exists for tutor/mixdown path but per-speaker lane chunking not called out as done. Blocked-on-C gate **cleared** (`useRemoteMicRecorders` wired @ `WhiteboardWorkspaceClient.tsx:2844+`). | `part3-execution-bootstrapper.md`, `part3-overnight-2026-07-02-orchestrator-report.md` |
| **p3-consent-recording — per-speaker consent gates** (extends Block B to per-speaker recorders) | Part 3 / consent | **P1** | Bootstrapper scope; overlaps **CLIENT-AUDIO-CONSENT-GATE** (BACKLOG P1 Sarah blocker — shallow client enforcement). Per-speaker `shouldCapture(streamId)` exists (`lifecycle-machine.ts`) but consent projection to lanes not complete per backlog. | `part3-execution-bootstrapper.md` |
| **p3-incremental-map — live/progressive notes during session** | Part 3 / notes UX | **P2** | Deferred post-Sarah in BACKLOG **SMOKE-NOTES-2**; sequenced behind per-speaker spine. Map runs silently mid-session; reduce end-only today. | `part3-execution-bootstrapper.md`, `part3-notes-reliability-spine-smokebook.md` item 2 |
| **SMOKE-NOTES-1 — wire shimmer skeleton into post-End loading state** | Notes UX | **P1** | **REOPEN** in BACKLOG @ `3cffbb7` — form must stay visible with per-field shimmer, not hide-form. Smokebook item 2/4: Andrew saw only "Generating notes…". `TutorNotesSection.tsx` has shimmer CSS but prior `SkeletonNotes` dead-code claim corrected to inline shimmer pattern. | `part3-notes-reliability-spine-smokebook.md`, BACKLOG |
| **SMOKE-NOTES-3 — notes fabricate on non-teaching talk** | Notes quality | **P2** | BACKLOG item from smokebook item 6 PARTIAL notes; map/reduce accuracy + abstain path. Prompt wording @ `cefc5cd` **PASS** for teaching test but refinement flagged. | `part3-notes-reliability-spine-smokebook.md` item 6 |
| **Map/reduce accuracy + abstain-on-low-content + eval harness** | Notes quality | **P1** | BACKLOG "Recording re-architecture — Phase 1 follow-ups" — pre-merge quality bar + **post-master** eval harness/flywheel (#1 post-master). Part 3 shipped `ai-models.ts` + stronger prompts; harness **not** built. | `part3-execution-bootstrapper.md`, `part3-overnight-2026-07-02-orchestrator-report.md`, BACKLOG |
| **ERASURE-ORPHAN-AUDIO-BLOBS** | Erasure | **P2** | Listed in Part 3 bootstrapper standing gaps; BACKLOG row exists. | `part3-execution-bootstrapper.md` |
| **Slice-3 S3 — notes reduce job-in-flight lock** (orphan DRAFT `SessionNote` race) | Notes pipeline | **P2** | BACKLOG § Slice-3 notes-bridge deferred finding; migration-bearing. | `recording-slice3-autonotes-bootstrapper.md` → BACKLOG |
| **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** — Workstream C e2e still manual | Test debt | **P2** | Session-experience bootstrapper mandated incremental Playwright for consent/erasure; BACKLOG process item from 2026-07-01 smoke skip. | `session-experience-arc-continuation-bootstrapper.md` |
| **Part 3 — student Sign out in top-bar ⋯ (touch layouts)** | Chrome / learner UX | **P2** | Smokebook item 1 side note; tracked in `ORCHESTRATOR-STATE.md` § Part 3 relocate (not duplicated as BACKLOG ID). | `part3-notes-reliability-spine-smokebook.md` |
| **Formal eval harness + flywheel iteration loop** | Notes / Phase 11 | **P2** | Explicitly deferred post-master in Part 3 ratified inputs + overnight report; BACKLOG post-master #1 follow-up. | `part3-execution-bootstrapper.md`, `part3-overnight-2026-07-02-orchestrator-report.md` |

**Not CARRY (shipped since source docs — see Shipped list):** `p3-clock`, `p3-perspeaker A+B`, **`p3-perspeaker C`** (worker-driven `enqueueChunkTranscriptionAction` on `transcriptionOnly` upload @ `upload-outbox-instance.ts:142+`; `useRemoteMicRecorders` @ `WhiteboardWorkspaceClient.tsx:2844`), `p3-model-abstraction`, `p3-video-seam` (docs), recording P1 slice 3 autonotes pipeline, session-experience erasure Block B + CF-1–CF-4, `CostEvent` + `/admin/cost`, `blob-cleanup.mjs` + `branch-sweep.mjs`.

---

## Already-in-backlog list

These OPEN items from BATCH H sources are **already tracked** in `docs/BACKLOG.md` (do not duplicate):

| BACKLOG ID / section | Overlaps BATCH H source |
|---------------------|-------------------------|
| **SMOKE-NOTES-1** | Part 3 smokebook skeleton/shimmer gap |
| **SMOKE-NOTES-2** | `p3-incremental-map` / live notes during session |
| **SMOKE-NOTES-3** | Notes fabrication on non-teaching talk |
| **WB-NOTES-SKELETON** | Historical dead-code investigation → superseded by SMOKE-NOTES-1 corrected spec |
| **Recording re-architecture — map/reduce accuracy workstream** | Part 3 notes-quality pre-merge bar + post-master eval harness |
| **CLIENT-AUDIO-CONSENT-GATE** | `p3-consent-recording` + Block B shallow enforcement |
| **ERASURE-ORPHAN-AUDIO-BLOBS** | Part 3 bootstrapper standing gap |
| **ERASURE-CLIENT-STORE-UNREACHABLE** | Part 3 bootstrapper standing gap |
| **ERASURE-INFLIGHT-CHECKPOINT**, **ERASURE-ADMIN-METADATA** | Session-experience arc deferred erasure items |
| **SMOKE-BUG-2** | Stale "Call Reconnecting" pill (smokebook item 4) |
| **SMOKE-BUG-3** | Student text cross-page sync bug (smokebook item 1) |
| **SMOKE-BUG-5** | Replay board-tab context (smokebook item 1) |
| **SMOKE-BUG-7** | Student mic re-pick every session (smokebook item 1) |
| **SMOKE-UX-3** | Replay ±10s buttons (smokebook item 1) |
| **CH-SMOKE-REPLAY-PLAYPAUSE-OVERLAP** | Play/Pause overlaps Board tab (smokebook item 1 cleanup) |
| **SMOKE-POST-1** | Ghost overlay / other person's viewport (smokebook item 6) |
| **SMOKE-BLOCK-3** | Tutor nav after saving notes — **RESOLVED** `22e20e0` |
| **SMOKE-BUG-1** | Student `POST /login 405` — **RESOLVED** `36d4bf3` |
| **SMOKE-UX-4** | Wordmarks don't navigate — **RESOLVED** `37cff6b` |
| **§ Scheduling + external calendar integration** | Full `scheduling-requirements-2026-06-11.md` capture + open questions |
| **§ Cost observability — V1-gating** | Cost-event **durability hardening** follow-ons (bootstrapper explicitly out-of-scope) |
| **§ Full product usage instrumentation — NEAR-IMMEDIATE POST-MASTER** | Supersedes raw PostHog bootstrapper intent (first-party reframe) |
| **Slice-3 S3, N1–N3** | Recording slice 3 adversarial review follow-ups |
| **CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE** | Session-experience Workstream C |
| **Phase 11 blocked until umbrella legal paragraphs** | AI-edit-signal + PostHog bootstrappers hard prerequisite |

**Net-new CARRY candidates (add or ensure BACKLOG pointer to archived bootstrapper):**

- **AI edit signal Phase 1** — no dedicated BACKLOG row today (only generic Phase 11 blocked note)
- **Scheduling S3 / S4 / S5 wiring notes** — requirements doc only; main Scheduling section covers umbrella, not these sub-items
- **p3-vad-chunking (per-speaker)** — not named in BACKLOG (only generic Part 3 spine cross-refs)
- **Part 3 student Sign out ⋯ relocation** — `ORCHESTRATOR-STATE` only

---

## Shipped / obsolete list

| Item | Evidence | Source doc |
|------|----------|------------|
| **p3-clock** — monotonic pause-aware session clock | `src/lib/recording/session-clock.ts`, `session-clock.test.ts`; threaded in `WhiteboardWorkspaceClient.tsx` (`clock_start`/`clock_paused`/`clock_resumed` logs) | `part3-execution-bootstrapper.md`, `part3-overnight-2026-07-02-orchestrator-report.md`, smokebook items 3–5 PASS |
| **p3-perspeaker A** — `TranscriptChunk.streamId` / `speakerId` schema + pass-through | Migration `20260702120000_transcript_chunk_speaker_labels`; enqueue/worker/store tests | Overnight report @ `e92c9ac` |
| **p3-perspeaker B** — `transcriptionOnly` outbox rows excluded from replay assembly | `upload-outbox-instance.ts` `assembleEndSessionSegments` filter; LIVE-AV invariant #6a | Overnight report @ `8638c86` |
| **p3-perspeaker C** — live per-speaker recorder + worker-driven transcription enqueue | `useRemoteMicRecorders` wired (`WhiteboardWorkspaceClient.tsx:2844`); `upload-outbox-instance.ts:142+` enqueues on `transcriptionOnly` upload. **Supersedes** overnight deferral + smokebook "not wired" note. | `part3-overnight-2026-07-02-orchestrator-report.md` (historical deferral), `part3-notes-reliability-spine-smokebook.md` |
| **p3-model-abstraction** — env-swappable models + stronger map/reduce prompts | `src/lib/ai-models.ts`, `ai-models.test.ts`, commits `f4cd9cb`/`cefc5cd` | Overnight report |
| **p3-video-seam** — post-Sarah video design docs only | `d299a6c`; RECORDER-LIFECYCLE comments | Overnight report, smokebook item scope note |
| **Disconnect freeze trigger** — 8s `REACHABLE_LOSS_DEBOUNCE_MS` (not 6s peer-eviction guess) | Andrew-confirmed in smokebook; `deriveWbCaptureActive` | `part3-execution-bootstrapper.md` OPEN confirm (obsolete), smokebook item 4 PASS |
| **Recording P1 slice 3 — autonotes map-reduce + end-session sweep + post-session UX** | `notes-worker.ts`, `extract-chunk.ts`, `TutorNotesSection.tsx`, `notes-actions.ts`, `triggerNotesGenerationAction`; manual transcribe removed; "Regenerate notes" escape hatch remains | `recording-slice3-autonotes-bootstrapper.md`, BACKLOG "Slice 3 ships" |
| **Session-experience arc — erasure Steps 0–6 + CF-1–CF-4** | Commits `d3458f9`…`b7c88ac` listed in continuation bootstrapper | `session-experience-arc-continuation-bootstrapper.md` |
| **Block B client audio consent projection (base)** | `deriveAudioCapturePolicy`, commits `d180ef1`→`bded52e` — **extend** to per-speaker = still OPEN | `part3-execution-bootstrapper.md` |
| **Cost-event logging skeleton (+ dashboard beyond bootstrapper)** | `prisma/schema.prisma` `model CostEvent`; `src/lib/observability/cost-events.ts` + tests; `/admin/cost` + `cost-queries.ts` | `cost-event-logging-skeleton-bootstrapper.md` |
| **Housekeeping utilities — blob cleanup + branch sweep** | `scripts/blob-cleanup.mjs`, `scripts/branch-sweep.mjs`, READMEs, `src/__tests__/scripts/blob-cleanup.test.ts`; `blb`/`brs` in `AGENTS.md` | `housekeeping-utilities-bootstrapper.md` |
| **Scheduling Group F — visual-only scheduler surface** | `src/lib/schedule/mock-data.ts`, `src/components/admin/schedule/*` (connect-calendar affordance, sync badges, integrations panel) | `scheduling-requirements-2026-06-11.md` § Tonight's build scope |
| **Part 3 hardware smokebook overall PASS** | Andrew checked overall PASS @ tip `d299a6c` (items 1,3–8); item 2 SKIP/N/A (no live skeleton) | `part3-notes-reliability-spine-smokebook.md` |
| **PERSPEAKER-C-TRANSCRIPTION-TRIGGER design fork** | Resolved by shipping worker-driven path (option **a** recommended in report) | `part3-overnight-2026-07-02-orchestrator-report.md` |
| **p3-replay-scrub / continuous replay (partial — WS-G lineage)** | `WhiteboardReplay.tsx` continuous timeline; `useReplayTimelineController.ts` scrub; WS-G concat in codebase. Formal Part 3 `p3-replay-scrub` Playwright guard from bootstrapper may still differ — treat spine item as **largely absorbed** by wave5 replay work. | `part3-execution-bootstrapper.md` |
| **p3-finalize / ffmpeg mixdown (partial)** | `finalizeOutboxAfterEnd`, `finalize-whiteboard-session-client.ts`, concat-audio path. Bootstrapper's full gapless multi-stream merge may overlap WS-G — not a greenfield gap. | `part3-execution-bootstrapper.md` |
| **Executor bootstrappers as live prompts** | `part3-execution-bootstrapper.md`, `session-experience-arc-continuation-bootstrapper.md`, `recording-slice3-autonotes-bootstrapper.md` — superseded by shipped work + `ORCHESTRATOR-STATE.md` | All three |
| **Untracked smokebook copies on main checkout** | Housekeeping note in session-experience bootstrapper — process cleanup only | `session-experience-arc-continuation-bootstrapper.md` |

---

## Per-doc archive note table

| Doc | Safe to archive? | Unique info that must survive + where |
|-----|------------------|--------------------------------------|
| `part3-execution-bootstrapper.md` | **Yes** | Part 3 task sequence + fragile-surface guardrails → `docs/RECORDER-LIFECYCLE.md` / `docs/LIVE-AV.md`; **OPEN** items → CARRY table + BACKLOG (`p3-vad`, consent extension); proposed `p3-clock` design **obsolete** (shipped). Ratified inputs (t=0, tap-before-mix, notes-quality bar) → keep in plan or BACKLOG notes-quality entry. |
| `part3-notes-reliability-spine-smokebook.md` | **Yes** | Andrew hardware PASS/FAIL + side notes → mapped to BACKLOG smoke IDs (table above); automated coverage citations → Playwright spec mapping in test-selection docs. **Historical** at `d299a6c` — per-speaker "not wired" superseded by later C wire-up. |
| `part3-overnight-2026-07-02-orchestrator-report.md` | **Yes** | Commit ledger + gate results → git history; **PERSPEAKER-C deferral obsolete**; decisions log (wall-clock `audioStartedAtMs`, sync offset capture) → `RECORDER-LIFECYCLE.md` or inline code comments; next-orchestrator checklist → `ORCHESTRATOR-STATE.md`. |
| `recording-slice3-autonotes-bootstrapper.md` | **Yes** | Slice 3 **shipped** — acceptance checklist historical; deferred S3/N1–N3 → BACKLOG § Slice-3 notes-bridge; design binding (Q5 5-min timeout, map-reduce) → `recording-rearchitecture-design-2026-06-05.md`. |
| `session-experience-arc-continuation-bootstrapper.md` | **Yes** | Erasure/CF done-commit list → git; testing contract → `playwright-on-fix.mdc` + AGENTS; Workstream C gap → BACKLOG `CH-SMOKE-PLAYWRIGHT-GAP-CONSENT-ERASURE`; merge-gate prose → AGENTS merging convention. |
| `ai-edit-signal-phase-1-bootstrapper.md` | **Yes** (FUTURE) | **Full build spec** — add BACKLOG row pointing to `docs/archive/handoff/ai-edit-signal-phase-1-bootstrapper.md`; Phase 2/3 gates (50+/100+ signals) in bootstrapper only until Phase 11 resumes. |
| `posthog-analytics-tier-0-1-bootstrapper.md` | **Yes** (FUTURE) | Event taxonomy + masking audit procedure useful reference; **product direction superseded** by BACKLOG § Full product usage instrumentation (first-party). Archive with caveat. |
| `cost-event-logging-skeleton-bootstrapper.md` | **Yes** | **Fully shipped** (exceeded scope with `/admin/cost`). Durability hardening → BACKLOG § Cost observability. No unique OPEN work. |
| `housekeeping-utilities-bootstrapper.md` | **Yes** | **Fully shipped.** Dual-DB blob safety rules → `scripts/blob-cleanup.README.md` + `LOCAL-DEV.md`. Operational runbooks stay with scripts. |
| `scheduling-requirements-2026-06-11.md` | **Partial** | **Keep canonical** until wiring-phase design pass — BACKLOG § Scheduling already points here. Archive only after requirements folded into a ratified build spec; until then move to `docs/archive/handoff/` **with BACKLOG pointer retained**. S3/S4/S5 wiring notes → CARRY if not promoted to BACKLOG. |

---

## Classification notes

1. **Code evolved past July 2026 smokebook tip:** `p3-perspeaker C` and worker-driven transcription enqueue are **shipped** in this worktree — do not re-open from overnight report or smokebook "deferred" language.

2. **FUTURE-PHASE bootstrapper verification (grep `src/`):**

   | Bootstrapper | Built? | Verdict |
   |-------------|--------|---------|
   | `ai-edit-signal-phase-1` | No (`AiNoteEditSignal`, `aiTopics`, `npe` absent) | **OPEN → CARRY** P3 |
   | `posthog-analytics-tier-0-1` | No (zero `posthog` in `src/`) | **OPEN → CARRY** P2 (reframed in BACKLOG) |
   | `cost-event-logging-skeleton` | Yes (`CostEvent`, `logCostEvent`, `/admin/cost`) | **SHIPPED** |
   | `housekeeping-utilities` | Yes (`blob-cleanup.mjs`, `branch-sweep.mjs`) | **SHIPPED** |
   | `scheduling-requirements` | Partial (visual mock only) | **IN-BACKLOG** + wiring **CARRY** |

3. **Part 3 spine vs recording slice 3:** Slice 3 delivered the **admin/post-session** map-reduce bridge; Part 3 delivered **live-session** clock, per-speaker infrastructure, and model abstraction. Remaining spine work is mostly **notes UX** (SMOKE-NOTES-1/2/3) and **quality/eval**, not greenfield plumbing.

4. **Smokebook item 2 (live skeleton):** Correctly SKIP/N/A — SMOKE-NOTES-2 explicitly deferred; do not treat as regression.
