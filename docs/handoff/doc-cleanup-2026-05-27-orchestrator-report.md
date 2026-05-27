# Doc cleanup 2026-05-27 — orchestrator report

> **For the orchestrator picking up after this session.** Captures the full inventory, every classification decision, every file touched, and the Andrew-confirms list for items requiring human review before further action.

**Session scope.** Hub-and-spoke doc restructure pass. No code changes. No commits (Andrew reviews + commits). Two new files created (`docs/INDEX.md`, this file). AGENTS.md § Key docs updated. SUPERSEDED headers added to stale docs (in-workspace + out-of-workspace plan files).

**Date:** 2026-05-27 (overnight session). **Tier:** Sonnet (cross-cutting reasoning + supersession judgment).

---

## Inventory — all `.md` files scanned

### `docs/` root (38 files)

| File | Classification | Notes |
|---|---|---|
| `docs/AGENT-BOOTSTRAP.md` | **Stale → SUPERSEDED** | Old-style bootstrap pre-dating AGENTS.md + handoff pattern; references stale branch `feature/whiteboard-phase1`, old plan paths, old `latest tip` commit |
| `docs/BACKLOG.md` | **Canonical** | Updated tonight (c75e946). Do not touch. |
| `docs/BRAND.md` | **Canonical** | Engineering-ready brand reference (committed cf7fb63). |
| `docs/COMMERCIAL-LAUNCH-CHECKLIST.md` | **Orphan → Andrew confirms** | Not referenced in AGENTS.md; post-PMF checklist; not stale per se but unindexed |
| `docs/COST-OBSERVABILITY.md` | **Spoke** | Phase 9 early-action CostEvent table; architectural reference for `cev` logging prefix |
| `docs/DEPLOY.md` | **Canonical** | Listed in AGENTS.md Key docs. |
| `docs/DESIGN-TOKENS-PLAN.md` | **Orphan → Andrew confirms** | Phase 0 UX plan; parent doc UX-REFRESH-PLAN.md is superseded; unclear if still in play |
| `docs/GOOGLE-OAUTH-VERIFICATION.md` | **Spoke** | Ops reference for Gmail connect scaling; orthogonal to LEGAL-SYNC.md |
| `docs/GTM-READINESS.md` | **Orphan/Stale → Andrew confirms** | SQLite-era GTM checklist; partially superseded by RELEASE-ROADMAP.md + COMMERCIAL-LAUNCH-CHECKLIST.md |
| `docs/LEGAL-SYNC.md` | **Canonical** | Listed in AGENTS.md Key docs. |
| `docs/LIVE-AV.md` | **Canonical** | Must-read gate for live A/V; referenced in Phase 4a STATUS but missing from AGENTS.md Key docs — added in this pass |
| `docs/LOCAL-DEV.md` | **Canonical** | Listed in AGENTS.md Key docs. |
| `docs/MYNK-BRAND-CAPTURE-CHECKLIST.md` | **Spoke** | Active brand capture status log |
| `docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md` | **Spoke** | Brand validation record (completed decision, historical) |
| `docs/MYNK-BRAND-PHASE-2-DECISIONS.md` | **Canonical** | Locked brand decisions (committed cf7fb63). |
| `docs/MYNK-ORG-PILOT-BACKLOG.md` | **Spoke** | Future org-pilot backlog; NOT YET STARTED; gated |
| `docs/Mynk-Pre-Trademark-Implementation-Backlog.md` | **Spoke** | Active pre-trademark backlog; P0 app-surface wiring unchecked |
| `docs/PHASE-1B-STATUS.md` | **Spoke (archived SHIPPED)** | Outbox + atomic end-session; SHIPPED 2026-05-10–13; listed in AGENTS.md Key docs; historical pillar reference |
| `docs/PHASE-2-IOS-SMOKE-MATRIX.md` | **Spoke** | Wave 1 BLOCKER-PROD iOS smoke runbook; active |
| `docs/PHASE-4A-STATUS.md` | **Spoke (archived SHIPPED)** | Live-A/V Phase 4a; SHIPPED; listed in AGENTS.md Key docs |
| `docs/PHASE-4B-STATUS.md` | **Spoke (archived SHIPPED)** | Phase 4b; SHIPPED (in 4c train); not in AGENTS.md |
| `docs/PHASE-4C-STATUS.md` | **Spoke (archived SHIPPED)** | Phase 4c; SHIPPED merge d7fd583 |
| `docs/PHASE-4D-STATUS.md` | **Spoke (archived SHIPPED)** | Phase 4d; SHIPPED merge 41bf006 |
| `docs/PHASE-6-TIER-1-STATUS.md` | **Spoke (archived SHIPPED)** | Tier 1 parallelize; SHIPPED merge 5ccf1c7 2026-05-17 |
| `docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md` | **Spoke (archived SHIPPED)** | Device management; SHIPPED merge ac92137 2026-05-17 |
| `docs/PHASE-PDF-SMOKE-1.md` | **Spoke** | Historical smoke findings for PDF phase |
| `docs/PHASE-PDF-STATUS.md` | **Spoke (archived SHIPPED)** | PDF page-picker + per-page boards; SHIPPED merge 9ff5b11 2026-05-17 |
| `docs/PLATFORM-ASSUMPTIONS.md` | **Canonical** | Listed in AGENTS.md Key docs. |
| `docs/RECORDER-LIFECYCLE.md` | **Canonical** | Must-read gate; listed in AGENTS.md Key docs. |
| `docs/RECORDER-REFACTOR-STATUS.md` | **Spoke (archived SHIPPED)** | All phases merged; preserved as STATUS doc pattern reference; listed in AGENTS.md Key docs |
| `docs/RELEASE-ROADMAP.md` | **Canonical** | Canonical sequencing source (committed this session). Was missing from AGENTS.md Key docs — added in this pass. |
| `docs/RESUME-AUDIO-BUILD.md` | **Stale → SUPERSEDED** | Audio build shipped long ago; file itself said "delete this once shipped" |
| `docs/SARAH-CALL-PREP.md` | **Canonical** | Updated tonight (c75e946). Do not touch. Was missing from AGENTS.md Key docs — added in this pass. |
| `docs/SMOKE-LONG-FORM-TRANSCRIBE.md` | **Spoke** | Wave 1 BLOCKER-PROD smoke runbook; active |
| `docs/UX-AND-A11Y-SPEC.md` | **Canonical** | Conformance bar + open IA decisions (committed cf7fb63). |
| `docs/UX-REFRESH-PLAN.md` | **Stale → SUPERSEDED** | Already had informal internal SUPERSEDED notice (2026-05-19 PM); added standard 3-line block at very top |
| `docs/WHITEBOARD-ROADMAP-NEXT.md` | **Orphan/Stale → Andrew confirms** | Consolidated whiteboard roadmap; likely superseded by RELEASE-ROADMAP.md + BACKLOG.md |
| `docs/whiteboard-smoke-log.md` | **Spoke** | Living manual smoke log for whiteboard |
| `docs/WHITEBOARD-STATUS.md` | **Canonical** | Listed in AGENTS.md Key docs. |

### `docs/handoff/` (17 files)

| File | Classification | Notes |
|---|---|---|
| `docs/handoff/README.md` | **Spoke (meta)** | Canonical handoff doc lifecycle, naming convention, templates |
| `docs/handoff/ai-edit-signal-phase-1-bootstrapper.md` | **Spoke (active future)** | Phase 11b; not yet started |
| `docs/handoff/cost-event-logging-skeleton-bootstrapper.md` | **Spoke (active future)** | Phase 9; not yet started |
| `docs/handoff/housekeeping-utilities-bootstrapper.md` | **Spoke (active future)** | Blob cleanup + stale-branch sweep; not yet started |
| `docs/handoff/live-av-device-management-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge ac92137 |
| `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` | **Spoke (archive)** | Already has internal SUPERSEDED notice for actionable content; the doc is the audit artifact for the Tier 1 implementation details (constants, file-by-file list, smoke checklist); retained as archive |
| `docs/handoff/long-form-transcribe-tier-1-parallelize-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge 5ccf1c7 |
| `docs/handoff/pdf-page-picker-and-per-page-boards-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge 9ff5b11 |
| `docs/handoff/per-page-view-state-bootstrapper.md` | **Spoke (active future — Andrew confirms)** | Classified as Phase 5 task 8 (`pvs` prefix per AGENTS.md); if work quietly shipped, should be superseded |
| `docs/handoff/phase-4a-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge 59d13ad |
| `docs/handoff/phase-4b-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED |
| `docs/handoff/phase-4c-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge d7fd583 |
| `docs/handoff/phase-4d-bootstrapper.md` | **Stale → SUPERSEDED** | Work SHIPPED merge 41bf006 |
| `docs/handoff/posthog-analytics-tier-0-1-bootstrapper.md` | **Spoke (active future)** | Phase 11a; not yet started |
| `docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md` | **Spoke (archive)** | 2026-05-20 session retrospective; audit archive |
| `docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md` | **Canonical** | Freshly committed c75e946; latest pilot call capture. Do not touch. |
| `docs/handoff/spike-long-form-transcribe-smoke-bootstrapper.md` | **Stale → SUPERSEDED** | Spike completed; orchestrator report is outcome artifact |
| `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md` | **Spoke (archive)** | 2026-05-19 PM session retrospective; contains important deferred IA decision context |

### `docs/brand-previews/` (1 file; audit artifact dir)

| File | Classification | Notes |
|---|---|---|
| `docs/brand-previews/archived/README.md` | **Spoke (meta)** | Audit artifact; points to canonical BRAND.md + MYNK-BRAND-PHASE-2-DECISIONS.md. Excluded from INDEX per scope instruction. |

### `docs/eval/` (2 files)

| File | Classification | Notes |
|---|---|---|
| `docs/eval/README.md` | **Orphan → Andrew confirms** | Says "Delete after umbrella-topic work is done and re-golded"; may be untracked |
| `docs/eval/sarah-b3b4-evaluation-transcripts.md` | **Orphan → Andrew confirms** | Same note as README; untracked per old AGENT-BOOTSTRAP.md |

### `docs/legal-drafts/` (1 file)

| File | Classification | Notes |
|---|---|---|
| `docs/legal-drafts/umbrella-pending-2026-05-18.md` | **Spoke** | Drafted umbrella additions NOT yet shipped; Phase 11a/11b bootstrappers hard-fail without them |

### `~/.cursor/plans/` (tutoring-notes-relevant only)

| File | Classification | Notes |
|---|---|---|
| `tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` | **Stale → SUPERSEDED** | Primary master plan; most todos completed; RELEASE-ROADMAP.md is canonical sequencing now |
| `tutoring_notes_release_plan_781d48c1.plan.md` | **Stale → SUPERSEDED** | Earlier release plan; superseded by RELEASE-ROADMAP.md |
| `whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_cc1eb419.plan.md` | **Stale → SUPERSEDED** | Whiteboard strategy plan; mostly completed; WHITEBOARD-STATUS.md + RELEASE-ROADMAP.md are live references |
| `WHITEBOARD-IMPROVEMENT-PLAN.md` | **Spoke (redirect stub)** | Just a redirect to the in-workspace plans; not superseded — it IS the redirect |

---

## Inventory summary (counts)

| Classification | Count |
|---|---|
| **Canonical** | 14 |
| **Spoke** | 24 |
| **Stale → SUPERSEDED (in-workspace)** | 11 |
| **Stale → SUPERSEDED (out-of-workspace plan files)** | 3 |
| **Orphan → Andrew confirms** | 6 |
| **Total scanned** | 58 |

---

## Files touched

### New files created

| File | Lines | Notes |
|---|---|---|
| `docs/INDEX.md` | ~215 | "Where do I look for X" map; 9 topic sections + stale archive + Andrew-confirms triage |
| `docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md` | ~230 | This file |

### SUPERSEDED headers added (in-workspace)

| File | Lines added | Superseded by |
|---|---|---|
| `docs/AGENT-BOOTSTRAP.md` | +3 | `AGENTS.md` + `docs/INDEX.md` |
| `docs/RESUME-AUDIO-BUILD.md` | +3 | `docs/RECORDER-LIFECYCLE.md` |
| `docs/UX-REFRESH-PLAN.md` | +3 | `docs/UX-AND-A11Y-SPEC.md` (+ MYNK-BRAND-PHASE-2-DECISIONS, BRAND) |
| `docs/handoff/live-av-device-management-bootstrapper.md` | +3 | `docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md` |
| `docs/handoff/long-form-transcribe-tier-1-parallelize-bootstrapper.md` | +3 | `docs/PHASE-6-TIER-1-STATUS.md` |
| `docs/handoff/pdf-page-picker-and-per-page-boards-bootstrapper.md` | +3 | `docs/PHASE-PDF-STATUS.md` |
| `docs/handoff/phase-4a-bootstrapper.md` | +3 | `docs/PHASE-4A-STATUS.md` |
| `docs/handoff/phase-4b-bootstrapper.md` | +3 | `docs/PHASE-4B-STATUS.md` |
| `docs/handoff/phase-4c-bootstrapper.md` | +3 | `docs/PHASE-4C-STATUS.md` |
| `docs/handoff/phase-4d-bootstrapper.md` | +3 | `docs/PHASE-4D-STATUS.md` |
| `docs/handoff/spike-long-form-transcribe-smoke-bootstrapper.md` | +3 | `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` |

### SUPERSEDED headers added (out-of-workspace plan files)

| File | Lines added | Superseded by |
|---|---|---|
| `~/.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` | +3 | `docs/RELEASE-ROADMAP.md` |
| `~/.cursor/plans/tutoring_notes_release_plan_781d48c1.plan.md` | +3 | `docs/RELEASE-ROADMAP.md` |
| `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_cc1eb419.plan.md` | +3 | `docs/RELEASE-ROADMAP.md` + `docs/WHITEBOARD-STATUS.md` |

### `AGENTS.md` § Key docs updated

Lines added: +16 (5 new entries + inline framing text). No entries removed. See "Decisions made" below for rationale.

---

## Decisions made

### 1. LIVE-AV.md added to AGENTS.md Key docs

`docs/LIVE-AV.md` has a clear "Read this BEFORE editing peer-mesh.ts…" header but was missing from AGENTS.md Key docs. Added with the same must-read framing as RECORDER-LIFECYCLE.md. Phase-4A-STATUS.md's listing in Key docs is preserved (historical reference); LIVE-AV.md is the current canonical cheat sheet.

### 2. RECORDER-REFACTOR-STATUS.md kept in Key docs

It's listed in AGENTS.md with "pattern for STATUS docs (per-feature handoff between sessions)." The handoff/README.md is the new canonical for that pattern, but RECORDER-REFACTOR-STATUS.md is still the most visible in-flight example. Kept rather than removed. Future orchestrator can re-evaluate.

### 3. Phase 4a/4b/4c/4d bootstrappers classified as Stale

All four have "Archive (2026-05-19): SHIPPED to master" headers. The STATUS docs (PHASE-4A through PHASE-4D) are the canonical shipped-state records. Bootstrappers are now historical spec artifacts only — SUPERSEDED headers added pointing to respective STATUS docs.

### 4. `long-form-transcribe-tier-1-orchestrator-report.md` NOT superseded (already flagged internally)

This doc already has an internal `> **✅ SUPERSEDED (2026-05-17 evening)**` notice for the actionable content, while retaining the implementation-detail context (constants, file-by-file change list, smoke checklist). The smoke is still deferred (BACKLOG line 89). Classifying it as Spoke (archive) with the internal flag sufficient — no additional standard 3-line block added to avoid double-labeling.

### 5. `per-page-view-state-bootstrapper.md` classified as active Spoke

AGENTS.md Conventions list `pvs` (per-page whiteboard pan/zoom — Phase 5 task 8) as an in-use prefix, which means the feature has a registered scope but no STATUS doc exists yet. Classified as active future bootstrapper. Flagged in Andrew-confirms to verify it hasn't quietly shipped.

### 6. Plan files: SUPERSEDED headers added before YAML front matter

The three tutoring-notes plan files in `~/.cursor/plans/` start with YAML front matter (`---`). The standard markdown blockquote was added *before* the `---` opening. This is technically non-standard YAML (the document start marker is no longer at byte 0), but Cursor's plan management has historically tolerated leading content. **Risk:** Cursor Build plan parsing may reject or ignore these files after the header addition. Andrew should verify that Cursor Build still reads these plan files correctly after committing. If it breaks parsing, the SUPERSEDED notice can move into the YAML `overview:` field as a prepended string instead.

### 7. GTM-READINESS.md and WHITEBOARD-ROADMAP-NEXT.md not auto-superseded

Both are clearly stale but not precisely superseded by a single canonical doc. Left for Andrew-confirms rather than making the supersession call unilaterally. GTM-READINESS.md predates Neon (references SQLite concerns). WHITEBOARD-ROADMAP-NEXT.md is a merge-consolidation doc that's likely stale once RELEASE-ROADMAP + BACKLOG are the references. Suggested action in both cases: add SUPERSEDED headers.

### 8. COMMERCIAL-LAUNCH-CHECKLIST.md kept as active Spoke

It's explicitly framed as "NOT a now list — reference for when you're ready to scale beyond pilots." That framing is still accurate. Indexed under "Org + commercial launch readiness" in INDEX.md rather than stale archive.

---

## Andrew-confirms list

| Item | Why held | Suggested action |
|---|---|---|
| `docs/COMMERCIAL-LAUNCH-CHECKLIST.md` | Not referenced anywhere; but content is genuinely useful for post-PMF planning | Keep as Spoke under "Org + commercial launch"; add to INDEX (done in this pass) |
| `docs/DESIGN-TOKENS-PLAN.md` | Phase 0 UX plan; parent UX-REFRESH-PLAN is superseded; unclear if v1 redesign still needs explicit design-tokens phase | If superseded: add SUPERSEDED header pointing to `docs/UX-AND-A11Y-SPEC.md` + `docs/BRAND.md`. If still active: keep as Spoke and add to INDEX. |
| `docs/GTM-READINESS.md` | Pre-Neon SQLite-era checklist; partially superseded but not by one clean canonical | Add SUPERSEDED header pointing to `docs/RELEASE-ROADMAP.md`. Keep `docs/COMMERCIAL-LAUNCH-CHECKLIST.md` as the forward reference. |
| `docs/WHITEBOARD-ROADMAP-NEXT.md` | Consolidated whiteboard roadmap; RELEASE-ROADMAP.md + BACKLOG.md now cover this; no explicit SHIPPED marker but content looks stale | Add SUPERSEDED header pointing to `docs/RELEASE-ROADMAP.md`. |
| `docs/handoff/per-page-view-state-bootstrapper.md` | Classified as Phase 5 task 8 active future; but could have shipped without a STATUS doc | Check git log for any `pvs` commits; if shipped, add SUPERSEDED header pointing to a new PHASE-5-PVS-STATUS.md (or just WHITEBOARD-STATUS.md). |
| `docs/eval/README.md` + `docs/eval/sarah-b3b4-evaluation-transcripts.md` | README says "Delete after umbrella-topic work is done"; may be untracked | Confirm if eval re-gold work is complete. If yes: delete (these are test fixtures, not docs). If no: keep as-is. |

---

## Open questions for Andrew

1. **Plan file YAML parsing** — after adding SUPERSEDED headers before `---` front matter in the three plan files, do they still parse correctly in Cursor Build? If not, the header needs to move inside the YAML `overview:` field.

2. **`docs/WHITEBOARD-ROADMAP-NEXT.md`** — was this actively used as a working doc or was it a one-off consolidation? If it's still being updated, it should stay as Spoke (not superseded).

3. **`docs/handoff/per-page-view-state-bootstrapper.md`** — has Phase 5 task 8 (per-page pan/zoom persistence, `pvs` prefix) started or shipped? If started but not complete, the bootstrapper is still live. If shipped, needs a STATUS doc + SUPERSEDED header on the bootstrapper.
