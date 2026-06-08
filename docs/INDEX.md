# Tutoring-notes (Mynk) — "where do I look for X" index

> **Start here.** This is the single entry point for any new chat, agent, or human picking up work in this repo. Every canonical doc, spoke doc, and smoke runbook is mapped below by topic. For the curated reading-list with in-depth framing, see `AGENTS.md § Key docs`.
>
> Last updated: 2026-06-07 (whiteboard chrome design pass + INDEX entry).

---

## Docs cleanup / archival policy

On every docs-cleanup pass: **archive** anything verified to be captured elsewhere or later superseded/overridden — but **never** archive information that would be lost if it's still valid and unique.

Bar to archive a doc or section: **(a)** its still-valid content is provably captured in a canonical consolidated doc, **or** **(b)** it's been explicitly superseded. If removing it would lose valid unique information, **keep it**. Goal: reduce docs sprawl without losing signal.

**Canonical pattern:** consolidate scattered feedback into one source, verify capture, **then** archive the redundant copies. See [docs/BACKLOG.md](docs/BACKLOG.md) § Docs cleanup pass (next).

**Archive (cold storage):** superseded or captured-elsewhere docs live in [`docs/archive/`](docs/archive/) — not authoritative; see [`docs/archive/ARCHIVE-LEDGER.md`](docs/archive/ARCHIVE-LEDGER.md) for the audit trail. Agents ignore this tree by default (`.cursorindexingignore`).

---

## Sequencing + roadmap

| Doc | What's in it | When to read |
|---|---|---|
| [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) | Canonical wave-by-wave sequencing from solo-tutor reliability floor to Aug 2026 university-pitch readiness. Re-validate quarterly or after major Sarah feedback. | Start of any session where you're deciding what to work on next |
| [docs/BACKLOG.md](docs/BACKLOG.md) | Pilot feedback items, known follow-ups, reliability gaps audit (Axes 1–5), security recon results, and deferred phase notes | Whenever triaging new work, checking reliability posture, or looking for a deferred item |

---

## Testing + quality

| Doc | What's in it | When to read |
|---|---|---|
| [docs/TESTING-COVERAGE.md](docs/TESTING-COVERAGE.md) | Feature × automated-coverage tier matrix (U/I/E/RB/M), teeth-gap summary, Playwright smoke-automation roadmap | Before planning test work, pre-merge gates, or converting manual smokes to e2e |

---

## Reliability + architecture

| Doc | What's in it | When to read |
|---|---|---|
| [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) | **Must-read gate.** Three-pillar FSM + outbox + atomic end-session; end-session flow diagram; Phase 1c surfaces (snapshot PNG, preview-before-Start); per-session ID registry (`rid`, `wbsid`, `obx`, `snp`, `pvw`, `avx`, …) | Before touching `lifecycle-machine.ts`, `upload-outbox.ts`, `endWhiteboardSession`, or workspace `handleEndSession` |
| [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) | Current whiteboard build status, guardrails, adversarial review, demo gate, sync-host deploy notes | Before any whiteboard feature work or smoke pass |
| [docs/handoff/whiteboard-chrome-requirements.md](docs/handoff/whiteboard-chrome-requirements.md) | **Custom Mynk whiteboard chrome** — LOCKED decision, 63 Sarah UX requirements (toolbar, properties, defaults, mobile incl. TM-09), feasibility tags | Before any Excalidraw UI replacement work |
| [docs/handoff/whiteboard-chrome-design-2026-06-07.md](docs/handoff/whiteboard-chrome-design-2026-06-07.md) | **Whiteboard chrome design (ratified 2026-06-07)** — hybrid tutor layout, architecture, fork resolutions, Phase 0–3 phasing + POC gate, sync invariants | Before building Phase 1 tutor-desktop chrome or reviewing POC results |
| [docs/LIVE-AV.md](docs/LIVE-AV.md) | Live A/V architecture cheat sheet — peer-mesh, signaling, `useLiveAV`, `mic-recorder-audio`, participants-reconcile effect | Before touching `peer-mesh.ts`, `useLiveAV.ts`, `mic-recorder-audio.ts`, or anything claiming to "simplify" peer connection or audio recording |
| [docs/PHASE-1B-STATUS.md](docs/PHASE-1B-STATUS.md) | Outbox + atomic end-session branch handoff (Pillars 2 + 3) — **SHIPPED** 2026-05-10–13 | Historical reference for Pillars 2 + 3 design decisions |
| [docs/PHASE-4A-STATUS.md](docs/PHASE-4A-STATUS.md) | Live-A/V peer-mesh + signaling foundation — **SHIPPED** (Phase 4a; first of 4 sub-chats; full stack shipped through 4d + device-mgmt) | Historical reference for Pillar 6 decisions; see `docs/LIVE-AV.md` for the current cheat sheet |
| [docs/PLATFORM-ASSUMPTIONS.md](docs/PLATFORM-ASSUMPTIONS.md) | Inventory of every load-bearing infra, runtime, browser, and OS assumption (Vercel Pro 300s ceiling, Neon branching, Vercel Blob, CSP origins, Node 20+, ffmpeg-static, Excalidraw API surface) + migration checklist | Before migrating platform, changing managed-service tier, or adding a new external dependency |
| [docs/BACKLOG.md](docs/BACKLOG.md) § Reliability gaps Axis 1–5 | Per-axis audit with BLOCKER-PROD and deferred items | 5-axis reliability check for any new feature plan |

---

## Brand + UX

| Doc | What's in it | When to read |
|---|---|---|
| [docs/V1-COMPONENT-LIBRARY.md](docs/V1-COMPONENT-LIBRARY.md) | **V1 component spine.** Full inventory + dedup status of every shared component; UX rubric (card-usage convention, spacing, typography, form patterns); component-pass chunk tracker; slice-3/live-session collision-zone lock list. | **Before any UI chunk pass.** Read this to know what's canonical, what's a duplicate, and what conventions the next chunk must follow. |
| [docs/BRAND.md](docs/BRAND.md) | Engineering-ready brand reference — Mynka Blue palette (`#1E3D54`), coral accent (`#E27D60`), cream surfaces, Fraunces/Inter/JetBrains Mono typography, voice | Before any UI or branding work |
| [docs/MYNK-BRAND-PHASE-2-DECISIONS.md](docs/MYNK-BRAND-PHASE-2-DECISIONS.md) | Locked palette + typography + voice decisions from the 2026-05-19 PM design session | Before making design decisions or creative direction choices |
| [docs/UX-AND-A11Y-SPEC.md](docs/UX-AND-A11Y-SPEC.md) | Conformance bar, contrast audit, Pre-flight checklist, open IA decisions | Before implementing any UX components or accessibility work |
| [docs/DESIGN-TOKENS-PLAN.md](docs/DESIGN-TOKENS-PLAN.md) | Phase 0 token engineering execution playbook (migration sequence + lint rule spec + dual-theme snapshot list). Read when starting design-tokens work; will SUPERSEDE after Phase 0 ships. | When executing Phase 0 design-token migration |
| [docs/MYNK-BRAND-CAPTURE-CHECKLIST.md](docs/MYNK-BRAND-CAPTURE-CHECKLIST.md) | Tier 1 domain + social handle capture status (7/7 domains, 5/8 social targets) | When acting on remaining social handle captures or verifying brand asset status |
| [docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md](docs/MYNK-BRAND-NAME-VALIDATION-NOTES.md) | Brand name validation record — VALIDATED 2026-05-18; US-only tutoring pilot stage; trademark still deferred | When reviewing brand decision rationale or trademark gate criteria |
| [docs/Mynk-Pre-Trademark-Implementation-Backlog.md](docs/Mynk-Pre-Trademark-Implementation-Backlog.md) | Pre-trademark implementation backlog — P0 app-surface wiring, social handles, gating criteria | When acting on pre-trademark work items |
| [docs/SARAH-CALL-PREP.md](docs/SARAH-CALL-PREP.md) § brand-awareness check | Deferred brand-awareness check (forwarded to next-call queue from 2026-05-26 call) | When the brand-awareness validation gate opens post-ship |

---

## Pilot feedback

| Doc | What's in it | When to read |
|---|---|---|
| [docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md](docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md) | **Latest (2026-05-26 call, commit `c75e946`).** Sarah's 3 questions, key themes, strategic reframe (notes as institutional memory), action items, brand check deferral | Before planning any work Sarah's feedback gates; before next Sarah call |
| [docs/SARAH-CALL-PREP.md](docs/SARAH-CALL-PREP.md) | Rolling doc — next-call open questions + answered questions from all prior calls (newest at top) | Before any Sarah call or when acting on pilot questions |
| [docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md](docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md) | 2026-05-20 session retrospective — reliability work + AI prompt v7 decisions, lessons from in-branch revert | Historical context for reliability/prompt architecture decisions |
| [docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md](docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md) | 2026-05-19 PM session retrospective — v1 redesign direction, 3 resolved / 5 deferred IA decisions, next-session bootstrapper template | Historical context for v1 redesign design-session decisions |

---

## Deploy + ops

| Doc | What's in it | When to read |
|---|---|---|
| [docs/DEPLOY.md](docs/DEPLOY.md) | Vercel + Neon deploy notes | Before any deploy, env setup, or infra change |
| [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) | Local dev setup | First-time setup or onboarding a new dev environment |
| [docs/GOOGLE-OAUTH-VERIFICATION.md](docs/GOOGLE-OAUTH-VERIFICATION.md) | Google OAuth verification process and current state (Testing mode) | Before scaling Gmail connect beyond listed test users |
| [docs/COST-OBSERVABILITY.md](docs/COST-OBSERVABILITY.md) | `CostEvent` table schema + per-session logging — Phase 9 early action (pre-dashboard) | When working on AI cost tracking or Phase 9 admin dashboard |

---

## Legal

| Doc | What's in it | When to read |
|---|---|---|
| [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md) | Sync protocol between the product's `/privacy` + `/terms` facades and the canonical umbrella at `mortensenapps.com`; quarterly drift review cadence; section classification table (umbrella-derived vs. product-specific) | Before touching `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, the Gmail OAuth consent flow, or any external policy reference |
| `src/app/privacy/page.tsx` | Local subordinate privacy facade — product-specific sections supplement the umbrella; NOT the registered canonical OAuth URL | Edit only per `docs/LEGAL-SYNC.md` protocol |
| `src/app/terms/page.tsx` | Local subordinate terms facade — same subordinate relationship as privacy | Edit only per `docs/LEGAL-SYNC.md` protocol |
| [docs/legal-drafts/umbrella-pending-2026-05-18.md](docs/legal-drafts/umbrella-pending-2026-05-18.md) | Drafted umbrella additions NOT yet shipped to `mortensenapps.com`; both Phase 11a (PostHog) and 11b (AI edit signal) bootstrappers hard-fail their pre-check if these are missing from the live umbrella | Before running Phase 11a or 11b bootstrappers |

---

## Security

No standalone security doc. The canonical list of open security items lives in [docs/BACKLOG.md](docs/BACKLOG.md) § Security — 2026-05-18 recon + Tier A audit results (commits `5aa16f9` + `8cdbe58`). The audit found no critical gaps; Tier A work shipped same day.

---

## Smoke + manual runbooks

| Doc | What's in it | When to read |
|---|---|---|
| [docs/SMOKE-LONG-FORM-TRANSCRIBE.md](docs/SMOKE-LONG-FORM-TRANSCRIBE.md) | Long-form transcribe (60–90 min) Tier 1 smoke harness — **Wave 1 BLOCKER-PROD** (Vercel Pro 300s ceiling validation); the only supported trigger is the authenticated admin UI Server Action | Before running long-form transcribe smoke on Production or Preview |
| [docs/PHASE-2-IOS-SMOKE-MATRIX.md](docs/PHASE-2-IOS-SMOKE-MATRIX.md) | iOS Safari real-hardware smoke matrix — **Wave 1 BLOCKER-PROD** (Axis 4 cross-platform parity; Sarah uses iPhone); becomes the living iOS limitations doc as rows are ticked | Before iOS Safari smoke pass; fill on real hardware only |
| [docs/whiteboard-smoke-log.md](docs/whiteboard-smoke-log.md) | Manual whiteboard smoke log — living doc updated after each smoke pass or pilot quote capture | After any whiteboard smoke run |
| [docs/PHASE-PDF-SMOKE-1.md](docs/PHASE-PDF-SMOKE-1.md) | PDF phase first smoke findings (2026-05-16) — historical smoke log for the PDF page-picker + per-page boards build | Historical reference for PDF phase smoke results |

---

## Recorder lifecycle (must-read gate)

> **Always read `docs/RECORDER-LIFECYCLE.md` before touching `lifecycle-machine.ts`, `upload-outbox.ts`, `endWhiteboardSession`, or workspace `handleEndSession`.** This is a hard gate, not a suggestion. The three-pillar pattern (FSM, outbox, atomic end-session) is the load-bearing architecture of the capture pipeline. Without it, prod debugging is impossible and the end-session atomicity guarantee breaks.

| Doc | What's in it |
|---|---|
| [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) | Three-pillar architecture, end-session flow diagram, Phase 1c surfaces (snapshot, preview-before-Start), per-session ID registry, cheat sheet for common questions |
| [docs/PHASE-1B-STATUS.md](docs/PHASE-1B-STATUS.md) | Historical handoff for Pillars 2 + 3 implementation (outbox + atomic end-session) |
| [docs/RECORDER-REFACTOR-STATUS.md](docs/RECORDER-REFACTOR-STATUS.md) | Historical recorder refactor handoff — all phases merged to master; preserved as STATUS doc pattern reference |

---

## Handoff docs (bootstrappers + orchestrator reports)

See [docs/handoff/README.md](docs/handoff/README.md) for the full lifecycle, naming convention, and templates.

**Active bootstrappers (future phases not yet started):**

| Doc | Scope |
|---|---|
| [docs/handoff/ai-edit-signal-phase-1-bootstrapper.md](docs/handoff/ai-edit-signal-phase-1-bootstrapper.md) | Phase 11b — AI edit signal capture (self-improving transcription foundation, Phase 1: data capture only) |
| [docs/handoff/cost-event-logging-skeleton-bootstrapper.md](docs/handoff/cost-event-logging-skeleton-bootstrapper.md) | Phase 9 — cost observability skeleton (pre-dashboard CostEvent table logging) |
| [docs/handoff/housekeeping-utilities-bootstrapper.md](docs/handoff/housekeeping-utilities-bootstrapper.md) | Vercel Blob cleanup CLI + stale-branch sweep utilities |
| [docs/handoff/posthog-analytics-tier-0-1-bootstrapper.md](docs/handoff/posthog-analytics-tier-0-1-bootstrapper.md) | Phase 11a — PostHog analytics Tier 0 + Tier 1 (observability foundation) |

---

## Org + commercial launch readiness (future)

| Doc | What's in it | When to read |
|---|---|---|
| [docs/MYNK-ORG-PILOT-BACKLOG.md](docs/MYNK-ORG-PILOT-BACKLOG.md) | Organization/university pilot backlog — **NOT YET STARTED**; gated on solo-tutor stability + UX refresh complete + brand finalized + Mynk trademark filed | When the org-pilot gate criteria are met |
| [docs/COMMERCIAL-LAUNCH-CHECKLIST.md](docs/COMMERCIAL-LAUNCH-CHECKLIST.md) | Post-PMF commercial launch checklist — NOT a now list; a reference for when scaling beyond pilots | When you're ready to launch at scale beyond the pilot |

---

## External plan files (superseded — not in repo)

These live outside the repo under `~/.cursor/plans/`. Canonical sequencing is [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) + live STATUS/BACKLOG docs. Repo-local superseded docs are in [`docs/archive/`](docs/archive/) (see ledger).

| Doc | Superseded by | Reason |
|---|---|---|
| `../../../../../.cursor/plans/tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` | [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) | Master plan todos mostly completed |
| `../../../../../.cursor/plans/tutoring_notes_release_plan_781d48c1.plan.md` | [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) | Earlier release plan |
| `../../../../../.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_cc1eb419.plan.md` | [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) + [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) | Whiteboard strategy plan mostly completed |
| [.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md](.cursor/plans/WHITEBOARD-IMPROVEMENT-PLAN.md) | [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) + [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) + [docs/BACKLOG.md](docs/BACKLOG.md) | W-item checklist superseded |
| [.cursor/plans/whiteboard_backlog_execution.plan.md](.cursor/plans/whiteboard_backlog_execution.plan.md) | [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) + [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) + [docs/BACKLOG.md](docs/BACKLOG.md) | Cursor Build YAML waves stale |
| [.cursor/plans/whiteboard_improvement_execution.plan.md](.cursor/plans/whiteboard_improvement_execution.plan.md) | [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) + [docs/BACKLOG.md](docs/BACKLOG.md) | All YAML todos completed 2026-05 |
