# Orchestrator state — 2026-05-27 10:53 AM Mountain

> **Checkpoint:** 2026-05-27 10:53 AM (UTC-6). Bootstrap for the next orchestrator chat after this session shows truncation/slowdown risk. Read this file first, then the bootstrap reading list below.

## Project arc + North Star

- **Pilot stage:** Pre-public-launch; one pilot tutor (Sarah). Commercial app being prepared to present to school organizations.
- **North Star** (from [`AGENTS.md`](../../AGENTS.md)): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."*
- **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc) — 5-axis adversarial review; BLOCKERs belong in Phase-1 acceptance, not follow-ups.

## Current Wave focus

| Wave | Status |
|------|--------|
| **Wave 1** — reliability floor | In flight; smoke + iOS matrix runbooks shipped; **B1–B4 sync sweep** next (scope ready, awaiting Andrew go-after-commit). |
| **Wave 2.5** — session log + reporting | **Greenfield**, ratified this morning (between Wave 2 and Wave 3). Sarah billing/compliance need. |
| **Wave 3** — brand/UX/URL refresh | Imminent; **mobile-first student layout = breaking redesign** in this window (not responsive overlays). |

## Latest committed state

- **`c75e946`** — `docs: 2026-05-26 Sarah pilot session capture + brand reveal correction + social-handle backlog`
- Committed last night; pushed to `origin/master`.

## Uncommitted in working tree

All three groups uncommitted. Andrew intends **3–4 separate logical commits** when reviewed.

### Group A — doc cleanup pass (Sonnet, completed last night)

| Path | Status | Why uncommitted |
|------|--------|-----------------|
| `docs/INDEX.md` | NEW | Hub-and-spoke entry point — awaiting Andrew review |
| `docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md` | NEW | Cleanup retrospective — awaiting review |
| `AGENTS.md` | MODIFIED | § Key docs TOC update — awaiting review |
| 11 files under `docs/` + `docs/handoff/` | MODIFIED | SUPERSEDED headers — awaiting review |
| 3 files under `~/.cursor/plans/` | MODIFIED | SUPERSEDED headers (out-of-repo; not in `git status`) |

### Group B — reliability redesign (Sonnet, completed last night)

| Path | Status | Why uncommitted |
|------|--------|-----------------|
| `docs/RELIABILITY-REDESIGN-2026-05-27.md` | NEW (~416 lines) | Architecture decisions doc — awaiting review |
| `docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md` | NEW (~143 lines) | Redesign handoff + Dispatch A scope — awaiting review |

### Group C — morning cleanup pass (Composer 2.5, completed ~10:49–10:53 AM dispatch window)

| Work item | Notes |
|-----------|--------|
| C1 | `docs/DESIGN-TOKENS-PLAN.md` promote-to-spoke + focus-ring fix + selective migrations |
| C2 | `docs/GTM-READINESS.md` migrate-then-SUPERSEDED |
| C4 | `docs/handoff/per-page-view-state-bootstrapper.md` SUPERSEDED + new `docs/BACKLOG.md` entry |
| C5 | `docs/eval/` deleted |
| Workspace plans | `.cursor/plans/` triage (3 whiteboard plan files) |
| Q1 | `docs/RELIABILITY-REDESIGN-2026-05-27.md` schema patch: `billedStartLocal`, `billedEndLocal`, `billedDurationMin` + immutability invariant |
| INDEX sweep | `docs/INDEX.md` final state |
| Report | `docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md` (NEW) |

*At state-file authoring time, Group C output was visible in `git status` (morning-cleanup subagent had returned).*

## In-flight subagents

| # | Scope | Tier | ID | ETA / status |
|---|-------|------|-----|--------------|
| 1 | Morning cleanup (Group C) | Composer 2.5 `generalPurpose` | `5a6627b5-7fb3-42aa-8160-6842be19b204` | **Returned** — `morning-cleanup-2026-05-27-orchestrator-report.md` + expected file deltas present in working tree |
| 2 | Orchestrator handoff infrastructure (this doc + template + `AGENTS.md` bullet) | Composer 2.5 `generalPurpose` | *(this subagent)* | Completing at checkpoint write |

## Open decisions awaiting Andrew

| Decision | What it gates | Recommendation |
|----------|---------------|----------------|
| Default theme: light vs dark | DESIGN-TOKENS Phase 0 + brand presence in UI | Open Q in `docs/DESIGN-TOKENS-PLAN.md` — Andrew's call when Phase 0 begins |
| Frozen-time column naming: `billed*Local` vs `reported*Local` | Wave 2.5 schema in `docs/RELIABILITY-REDESIGN-2026-05-27.md` Surface 7 | Default `billed*` — Sarah bills externally off these values; rename trivial if Andrew prefers `reported*` |
| Workspace-level `.cursor/plans/` triage | 3 whiteboard plan files SUPERSEDED-or-flagged | Morning-cleanup subagent classified; ambiguous ones flagged in `docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md` |
| Commit timing | Cleanup + redesign + morning-cleanup + roadmap-update commits | Andrew commits when reviewed; suggested **3–4 separate commits** |
| Dispatch B1–B4 sync sweep next? | Wave 1 forward progress | Scope blob ready in `docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md` → "Dispatch A"; await Andrew's go after he commits |

## Recent architectural decisions

Ratified this morning; full detail in `docs/RELIABILITY-REDESIGN-2026-05-27.md` unless noted.

- **D1 — Mobile student-side layout: BREAKING redesign in Wave 3.** Mobile-first `StudentWhiteboardClient`, not responsive overlays. Sarah's iPhone showed ~35% whiteboard; can't reach Wyzant ≥80% bar without from-scratch mobile pass. Ref: redesign doc Surface 5.
- **D2 — Session log + reporting: GREENFIELD Wave 2.5** (between current Wave 2 and Wave 3). NOT Wave 6 polish. Sarah's billing/compliance need (Wyzant 25-word/session, UVU pay-period aggregate) blocks replacing Wyzant. Ref: redesign doc Surface 7.
- **D3 — Solo / in-person mode: ADDITIVE in Wave 1.** FSM already supports it; production gate must be removed. New `sessionMode` column + mode picker + signaling skip. Ref: redesign doc Surface 6.
- **Q1 schema refinement (post-D2):** Sarah already bills externally off displayed time; reported values **frozen at session-close** as audit trail. Schema adds `billedStartLocal`, `billedEndLocal`, `billedDurationMin` at close, plus `actualStartUtc`, `actualEndUtc`, `disconnectGapMs` for audit. **No rate columns** until in-app billing ships. Patched into redesign doc by morning-cleanup subagent.
- **Architecture meta:** Stay on React/Next.js; excalidraw-room sync relay stays (additive only); URL refresh = breaking with 301s; no compute platform redesign this pass. Explore-audit conclusions summarized in redesign doc + `docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md`.

## Pilot context (most recent)

- **Capture:** 2026-05-26 evening + 2026-05-27 12:03–12:17 AM Discord follow-up — [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md).
- **Wedge (Sarah-validated):** Live whiteboard + recording session is the wedge, **not** AI notes. Sarah verbatim: *"the live session is more valuable / that is unique, which I love."* AI notes are "pretty cool" but secondary. Notes-to-parents are mostly institutional compliance (Wyzant, UVU); for tutors not bound to those, parent recaps are conversational, not artifact-based.
- **Solo / in-person mode validated** — Sarah explicitly wants it (§ 9 of pilot capture).
- **Brand reveal landed cleanly** — Sarah heard "Mynk" first time (UI hadn't shipped); cold pronunciation "Mink" landed; positive on mascot/logo. Brand presence in UI to evaluate **after** Wave 3 ships.
- **Methodology caveat:** Andrew drove tutor side most of the live session; Sarah was student-side. Schedule Sarah-drives-tutor-side follow-up before heavy n=1 dependency on tutor UX.
- **Open follow-ups for next Sarah thread:** Q4 (pain point worked around); Sarah-drives-tutor methodology session; Wyzant + UVU forms (artifacts for Wave 2.5 export design).

## Queued dispatches

1. **(After commits)** Sync B1–B4 sweep — Composer 2.5; scope in [`docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md`](reliability-redesign-2026-05-27-orchestrator-report.md) "Dispatch A". Wave 1 whiteboard sync application bugs.
2. **(After B1–B4 lands)** B5–B7 + audio durability + upload outbox persistence — likely Sonnet design pass + Composer ship.
3. **(Eventually)** Wave 2.5 session-log + reporting — Sonnet design pass for data model + query surface; Composer ships per-formatter (Wyzant, UVU) once Sarah shares form artifacts.
4. **(Wave 3 entry)** Brand/UX/URL refresh + mobile-first student redesign — fresh chat (full Sonnet agentic session); Andrew participates in design moments (not subagent dispatch).

## Bootstrap reading list

Read in order if you are a **fresh orchestrator chat**:

1. [`AGENTS.md`](../../AGENTS.md) — orchestrator discipline + conventions + model usage protocol.
2. [`docs/INDEX.md`](../INDEX.md) — "where do I look for X" entry point.
3. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) — current sequencing.
4. [`docs/BACKLOG.md`](../BACKLOG.md) — deferred work + reliability gaps + operational follow-ups.
5. [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md) — most recent pilot capture.
6. [`docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md`](doc-cleanup-2026-05-27-orchestrator-report.md) — hub-and-spoke restructure (last night).
7. [`docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md`](morning-cleanup-2026-05-27-orchestrator-report.md) — C1/C2/C4/C5 + Q1 patch + workspace-plans triage.
8. [`docs/RELIABILITY-REDESIGN-2026-05-27.md`](../RELIABILITY-REDESIGN-2026-05-27.md) — architecture decisions for upcoming work.
9. [`docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md`](reliability-redesign-2026-05-27-orchestrator-report.md) — handoff for whoever ships against the redesign.
10. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — must-read before FSM/outbox/end-session code.

## Open questions still in flight

- Five morning-cleanup-flagged Andrew-confirms (light/dark theme, `billed*` vs `reported*` naming, etc.) — see [`docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md`](morning-cleanup-2026-05-27-orchestrator-report.md) once reviewed.
- Whether B1–B4 sync sweep dispatches **before or after** Andrew commits cleanup + redesign work.
- Whether to roll soon-to-emerge Sarah artifacts (Wyzant + UVU forms) into Wave 2.5 design now or wait for Sarah's next Discord thread.
