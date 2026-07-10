# Archive ledger

Audit trail for docs moved to cold storage on **2026-06-07** (conservative pass on `v1-redesign`). Original paths preserved under `docs/archive/` (e.g. `docs/handoff/X.md` → `docs/archive/handoff/X.md`).

| Archived file | Bucket | Reason + canonical doc/section |
|---|---|---|
| `docs/AGENT-BOOTSTRAP.md` | superseded | Old pre-`AGENTS.md` bootstrap; replaced by `AGENTS.md` + `docs/INDEX.md` (INDEX § Stale archive row, 2026-05-27 cleanup). |
| `docs/RESUME-AUDIO-BUILD.md` | superseded | Audio build shipped; file said delete after ship. Canonical: `docs/RECORDER-LIFECYCLE.md`. |
| `docs/UX-REFRESH-PLAN.md` | superseded | v1 redesign superseded phased refresh; internal SUPERSEDED notice. Canonical: `docs/UX-AND-A11Y-SPEC.md`, `docs/MYNK-BRAND-PHASE-2-DECISIONS.md`, `docs/BRAND.md`. |
| `docs/GTM-READINESS.md` | superseded | Pre-Neon GTM checklist; hosting facts stale. Canonical: `docs/RELEASE-ROADMAP.md`, `docs/DEPLOY.md`, `docs/COMMERCIAL-LAUNCH-CHECKLIST.md`. |
| `docs/WHITEBOARD-ROADMAP-NEXT.md` | superseded | Earlier consolidated WB roadmap. Canonical: `docs/RELEASE-ROADMAP.md` + `docs/WHITEBOARD-STATUS.md` + `docs/BACKLOG.md`; chrome reqs in `docs/handoff/whiteboard-chrome-requirements.md` § Sources swept. |
| `docs/handoff/live-av-device-management-bootstrapper.md` | superseded | Work shipped merge `ac92137`. Canonical: `docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md`, `docs/LIVE-AV.md`. |
| `docs/handoff/long-form-transcribe-tier-1-parallelize-bootstrapper.md` | superseded | Work shipped merge `5ccf1c7`. Canonical: `docs/PHASE-6-TIER-1-STATUS.md`, `docs/SMOKE-LONG-FORM-TRANSCRIBE.md`. |
| `docs/handoff/pdf-page-picker-and-per-page-boards-bootstrapper.md` | superseded | Work shipped merge `9ff5b11`; Sarah PDF UX reqs captured in `docs/handoff/whiteboard-chrome-requirements.md` (TB-08, PU-04, SR-10). Canonical: `docs/PHASE-PDF-STATUS.md`. |
| `docs/handoff/phase-4a-bootstrapper.md` | superseded | Work shipped merge `59d13ad`. Canonical: `docs/PHASE-4A-STATUS.md`, `docs/LIVE-AV.md`. |
| `docs/handoff/phase-4b-bootstrapper.md` | superseded | Work shipped (4b in 4c train). Canonical: `docs/PHASE-4B-STATUS.md`, `docs/LIVE-AV.md`. |
| `docs/handoff/phase-4c-bootstrapper.md` | superseded | Work shipped merge `d7fd583`. Canonical: `docs/PHASE-4C-STATUS.md`, `docs/LIVE-AV.md`. |
| `docs/handoff/phase-4d-bootstrapper.md` | superseded | Work shipped merge `41bf006`. Canonical: `docs/PHASE-4D-STATUS.md`, `docs/LIVE-AV.md`. |
| `docs/handoff/spike-long-form-transcribe-smoke-bootstrapper.md` | superseded | Spike complete. Canonical: `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` (outcome artifact). |
| `docs/handoff/per-page-view-state-bootstrapper.md` | superseded | Tutor-side per-page view state shipped. Canonical: `docs/WHITEBOARD-STATUS.md` + `docs/BACKLOG.md` (student-side validation row). |
| `docs/handoff/MORNING-RUNBOOK-2026-06-07.md` | superseded | Dated smoke queue; transport thread closed. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md` § Recording transport thread — CLOSED; live runbook `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md`. |
| `docs/handoff/RETURN-RUNBOOK-2026-06-06-PM.md` | superseded | Same as above. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md` § Recording transport thread — CLOSED; `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md`. |
| `docs/handoff/MORNING-SMOKE-RUNBOOK-2026-06-06.md` | superseded | Dated identity/smoke runbook superseded by live smoke runbook. Canonical: `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md`. |
| `docs/handoff/MORNING-SMOKE-RUNBOOK-2026-06-05.md` | superseded | Dated smoke runbook superseded by live smoke runbook. Canonical: `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md`. |
| `docs/handoff/SMOKE-RUNBOOK-2026-06-05-PM.md` | superseded | Older dated smoke runbook superseded by `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md`. |
| `docs/handoff/orchestrator-state-2026-05-27-1053.md` | superseded | Legacy dated snapshot per `AGENTS.md` § Orchestrator state checkpoints. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/orchestrator-state-2026-05-30-1500.md` | superseded | Legacy dated snapshot per `AGENTS.md` § Orchestrator state checkpoints. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/usemynk-domain-cutover-bootstrapper.md` | superseded | usemynk.com cutover merged to `v1-redesign`. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md` § Current focus (usemynk cutover merged) + `docs/handoff/v1-redesign-STATUS.md`. |
| `docs/handoff/v1ds-tweak-wave-smokebook-2026-06-12.md` | superseded | v1-design-system epic fully merged into `v1-redesign` @ `36727ea`; smoke complete (notes committed `e403191`), follow-ups extracted to `docs/BACKLOG.md`. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md` § HEAD (v1ds merge milestone). |
| `docs/handoff/v1ds-wave2-smokebook-2026-06-12.md` | superseded | v1-design-system epic fully merged into `v1-redesign` @ `36727ea`; wave-2 smoke complete (notes committed `ec8d49d`), follow-ups extracted to `docs/BACKLOG.md`. Canonical: `docs/handoff/ORCHESTRATOR-STATE.md` § HEAD (v1ds merge milestone). |

## 2026-07-09 master-cut doc-cleanup pass

Full doc + plan cleanup after the v1-redesign → master cut. Every transient STATUS/handoff/smokebook/design/plan/orchestrator-report + tutoring plan archived; all open items consolidated into `docs/BACKLOG.md` (reorganized taxonomy). Protected living docs stayed in place.

| Archived file | Bucket | Reason + canonical pointer |
|---|---|---|
| `docs/AUTH-IDENTITY-REDESIGN.md` | captured-elsewhere | Post-Sarah auth UX spec — entire scope deferred; open items → `docs/BACKLOG.md` § Identity. |
| `docs/DESIGN-TOKENS-PLAN.md` | captured-elsewhere | Token taxonomy + `dark:` debt + TU-12 → `docs/BACKLOG.md` Gate A1 + `docs/V1-COMPONENT-LIBRARY.md` §2. |
| `docs/PHASE-1B-STATUS.md` | superseded | Outbox + atomic end-session shipped → `docs/RECORDER-LIFECYCLE.md`; open observability → `docs/BACKLOG.md` § Reliability. |
| `docs/PHASE-4A-STATUS.md` | superseded | Live A/V foundation shipped → `docs/LIVE-AV.md`; TURN/SFU → `docs/BACKLOG.md` A4. |
| `docs/PHASE-4B-STATUS.md` | superseded | Hook/outbox integration shipped → `docs/LIVE-AV.md` + `docs/RECORDER-LIFECYCLE.md`. |
| `docs/PHASE-4C-STATUS.md` | superseded | Mount/CSP hotfixes → `docs/LIVE-AV.md`; student-mic replay mix → `docs/BACKLOG.md`. |
| `docs/PHASE-4D-STATUS.md` | superseded | Smoke matrix + fixes → `docs/LIVE-AV.md` + `docs/BACKLOG.md` pilot A/V rows. |
| `docs/PHASE-6-TIER-1-STATUS.md` | superseded | Long-form transcribe constants shipped → `src/lib/transcribe.ts`; open smoke → `docs/BACKLOG.md`. |
| `docs/PHASE-LIVE-AV-DEVICE-MGMT-STATUS.md` | superseded | Device-mgmt shipped → `docs/LIVE-AV.md`. |
| `docs/PHASE-PDF-SMOKE-1.md` | captured-elsewhere | PDF bleed/gate archaeology → `docs/whiteboard-smoke-log.md` + `docs/BACKLOG.md` WB-STROKE-BLEED. |
| `docs/PHASE-PDF-STATUS.md` | superseded | PDF model shipped → `docs/WHITEBOARD-STATUS.md`; defer list → `docs/BACKLOG.md`. |
| `docs/RECORDER-REFACTOR-STATUS.md` | superseded | Refactor complete → code + `docs/BACKLOG.md` § Recording. |
| `docs/RELIABILITY-REDESIGN-2026-05-27.md` | captured-elsewhere | Surfaces 4–7 open items → `docs/BACKLOG.md`; wave structure → `docs/RELEASE-ROADMAP.md`. |
| `docs/ROAD-TO-GA.md` | captured-elsewhere | Business Gates 1–3 + ops checklist → `docs/BACKLOG.md` + `docs/COMMERCIAL-LAUNCH-CHECKLIST.md`; Andrew-owned rows stay there. |
| `docs/SEC-1-STATUS.md` | superseded | SEC-1 impersonation shipped → code + `docs/BACKLOG.md` BL-IMP-* residuals. |
| `docs/WHITEBOARD-P2-STATUS.md` | superseded | P2 phase table historical → `docs/WHITEBOARD-STATUS.md` + `docs/BACKLOG.md`. |
| `docs/handoff/2fa-remember-device-5axis-2026-06-13.md` | superseded | Adversarial review record; B1 scope resolved. |
| `docs/handoff/2fa-remember-device-plan-2026-06-13.md` | superseded | Feature shipped; nits → `docs/BACKLOG.md`. |
| `docs/handoff/2fa-remember-device-smokebook-2026-06-13.md` | captured-elsewhere | Smoke artifact; item B → `docs/BACKLOG.md` BL-RESET-GENERATE; test 10 → BL-ADMIN-UUID-PICKER. |
| `docs/handoff/MASTER-CUT-SMOKE-2026-06-11.md` | superseded | Dated master-cut smoke; notes preserved in `smoke-round-1-findings-2026-06-11.md` (also archived). |
| `docs/handoff/POC-SMOKE-wb-chrome-2026-06-07.md` | superseded | GREEN POC verdict; Phase 1 unblocked — no open items. |
| `docs/handoff/SMOKE-RUNBOOK-2026-06-07.md` | superseded | Both targets PASS; superseded by later smokebooks. |
| `docs/handoff/SMOKE-RUNBOOK-A-prime-theme-2026-06-08.md` | captured-elsewhere | A′ merged GREEN; standing req → `docs/BACKLOG.md` Gate A1 + `docs/V1-COMPONENT-LIBRARY.md` §2.11. |
| `docs/handoff/ai-edit-signal-phase-1-bootstrapper.md` | captured-elsewhere | FUTURE Phase 11 spec → `docs/BACKLOG.md` (archive path cited in backlog row). |
| `docs/handoff/authed-session-access-design-2026-06-10.md` | captured-elsewhere | Phase 1 join + notes wall shipped; Gate B2 + Phase 2 notes chrome → `docs/BACKLOG.md`. |
| `docs/handoff/b2-consent-design-2026-06-11.md` | superseded | D-1/D-5 semantics → `src/lib/consent-scope.ts` + `docs/BACKLOG.md` WB-CONSENT-UNCONDITIONAL. |
| `docs/handoff/b2-consent-smokebook-2026-06-11.md` | superseded | Flag-OFF smoke obsolete; superseded by Block B/CC tests. |
| `docs/handoff/cc1-cc2-consent-gate-plan.md` | superseded | CC-1/CC-2 acceptance → Jest/Playwright consent test files. |
| `docs/handoff/cc1-cc2-consent-gate-smokebook.md` | captured-elsewhere | Andrew skip rationale → `docs/BACKLOG.md` CH-SMOKE-PLAYWRIGHT-GAP. |
| `docs/handoff/component-dry-mechanical-smokebook-2026-06-11.md` | superseded | Branch smoke; utilities shipped in `src/lib/notes/display-utils.ts`, `useThemeDropdown.ts`. |
| `docs/handoff/consent-blocker-5axis-review-2026-06-30.md` | captured-elsewhere | Blocker IDs → tests + `docs/BACKLOG.md` ERASURE-* residuals. |
| `docs/handoff/consent-gates-capture-design-2026-05-31.md` | captured-elsewhere | Three-layer model + Pillar-3 split → `docs/RECORDER-LIFECYCLE.md` + `docs/BACKLOG.md` COPPA. |
| `docs/handoff/consent-honesty-premerge-smoke-index.md` | superseded | Run-order index only; grace-read nuance corrected in safe-erasure work. |
| `docs/handoff/consent-honesty-safe-erasure-plan.md` | captured-elsewhere | Option A tombstone + BLOCKERs A–I → `docs/BACKLOG.md` § Consent-honesty + erasure tests. |
| `docs/handoff/consent-honesty-smoke-findings-2026-07-01.md` | captured-elsewhere | MB/MB-* triage → `docs/BACKLOG.md` CH-SMOKE-*; audit trail. |
| `docs/handoff/coppa-compliance-research-2026-05-31.md` | captured-elsewhere | Counsel pack → `docs/LEGAL-SYNC.md` + `docs/BACKLOG.md` CONSENT-LEGAL-CONSULT. |
| `docs/handoff/coppa-p2-data-encryption-spike-2026-06-11.md` | captured-elsewhere | No-ZK-mandate verdict → `docs/BACKLOG.md` at-rest encryption. |
| `docs/handoff/cost-event-logging-skeleton-bootstrapper.md` | superseded | Fully shipped → `docs/COST-OBSERVABILITY.md` + `/admin/cost`. |
| `docs/handoff/cost-observability-design-2026-06-06.md` | captured-elsewhere | Phase 1 shipped → `docs/COST-OBSERVABILITY.md`; Phase 2 hardening → `docs/BACKLOG.md`. |
| `docs/handoff/doc-cleanup-2026-05-27-orchestrator-report.md` | superseded | INDEX-creation inventory; outcomes in `docs/INDEX.md`. |
| `docs/handoff/erasure-smokebook.md` | captured-elsewhere | Admin erasure steps → Playwright `erasure*.spec.ts`; stale grace items corrected in backlog. |
| `docs/handoff/go-to-sarah-master-cut-plan.md` | captured-elsewhere | WS-A–E sequencing + risk register → `docs/BACKLOG.md` + `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/go-to-sarah-master-cut-smokebook.md` | captured-elsewhere | Hardware FAIL/PARTIAL rows → `docs/BACKLOG.md` pre-Sarah / durability-wave. |
| `docs/handoff/go-to-sarah-plan-5axis-review.md` | superseded | Findings folded into plan 2026-07-04; no unique open items. |
| `docs/handoff/housekeeping-utilities-bootstrapper.md` | superseded | Shipped → `scripts/blob-cleanup.mjs`, `scripts/branch-sweep.mjs`, `docs/LOCAL-DEV.md`. |
| `docs/handoff/identity-phase2-auth-session-design-2026-06-01.md` | captured-elsewhere | P2a/P2b shipped; Phase 3–6 + P2c → `docs/BACKLOG.md`. |
| `docs/handoff/known-issues-and-roadmap-DRAFT.md` | captured-elsewhere | Open engineering rows → `docs/BACKLOG.md`; Sarah-facing copy decision deferred. |
| `docs/handoff/learner-erasure-plan.md` | captured-elsewhere | DELETE/SCRUB tables valid; grace semantics superseded → `docs/BACKLOG.md` erasure rows. |
| `docs/handoff/live-transcription-spike-STATUS.md` | captured-elsewhere | Spike verdict → `docs/BACKLOG.md` LTX + counsel memo cross-ref. |
| `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` | superseded | Superseded; smoke → `docs/BACKLOG.md` + `docs/SMOKE-LONG-FORM-TRANSCRIBE.md`. |
| `docs/handoff/long-session-smoke-scripts.md` | captured-elsewhere | Field scripts for long-form smoke → companion to `docs/SMOKE-LONG-FORM-TRANSCRIBE.md`. |
| `docs/handoff/morning-cleanup-2026-05-27-orchestrator-report.md` | superseded | Mechanical cleanup outcomes → canonical docs; confirms → `docs/BACKLOG.md`. |
| `docs/handoff/openai-data-retention-2026-05-31.md` | captured-elsewhere | Counsel handoff → `docs/LEGAL-SYNC.md` + `docs/BACKLOG.md` CONSENT-LEGAL-CONSULT. |
| `docs/handoff/overnight-v1-design-system-handoff-2026-06-11.md` | captured-elsewhere | Locked decisions → `AGENTS.md`, `docs/V1-COMPONENT-LIBRARY.md`, scheduling reqs (archived). |
| `docs/handoff/p2b-smoke-fixes.md` | superseded | Identity UX rounds shipped; real email provider → `docs/BACKLOG.md`. |
| `docs/handoff/parent-create-learner-smokebook-2026-06-11.md` | captured-elsewhere | Deferred TODOs → `docs/BACKLOG.md` claim/B2; validation → `parent-create-learner.test.ts`. |
| `docs/handoff/part2-test-buildout-plan.md` | captured-elsewhere | Test-gap ledger → `docs/TESTING-COVERAGE.md` + `docs/BACKLOG.md` test debt. |
| `docs/handoff/part3-execution-bootstrapper.md` | captured-elsewhere | Part 3 sequence → `docs/RECORDER-LIFECYCLE.md` + `docs/LIVE-AV.md`; open → `docs/BACKLOG.md` p3-*. |
| `docs/handoff/part3-notes-reliability-spine-smokebook.md` | captured-elsewhere | Hardware findings → `docs/BACKLOG.md` SMOKE-NOTES-* / Part 3 rows. |
| `docs/handoff/part3-overnight-2026-07-02-orchestrator-report.md` | superseded | Commit ledger → git history; decisions → `docs/RECORDER-LIFECYCLE.md`, `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/pause-disconnect-code-analysis-2026-06-04.md` | captured-elsewhere | P0 clock analysis → `docs/BACKLOG.md` Phase 2 deferred clock rows. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-5axis-2026-06-14.md` | superseded | BLOCKERs folded + shipped; historical review only. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-plan-2026-06-14.md` | captured-elsewhere | Option B replay architecture → `docs/RECORDER-LIFECYCLE.md` / `docs/WHITEBOARD-STATUS.md`; defer → `docs/BACKLOG.md`. |
| `docs/handoff/phase-1-wb-floor-replay-in-frame-smokebook-2026-06-14.md` | captured-elsewhere | Hardware failures → `docs/BACKLOG.md`; superseded by later review smokebooks. |
| `docs/handoff/phase-2-student-new-shell-smokebook-2026-06-16.md` | captured-elsewhere | Pre-unify hardware FAIL/PARTIAL → `docs/BACKLOG.md` triage. |
| `docs/handoff/phase-2-student-on-new-shell-5axis-2026-06-16.md` | superseded | Blockers folded and shipped; audit trail only. |
| `docs/handoff/phase-2-student-on-new-shell-plan-2026-06-16.md` | superseded | Separate-shell plan obsolete post-unification; lessons → `AGENTS.md` hard-won. |
| `docs/handoff/phase-3-waiting-room-5axis-2026-06-16.md` | superseded | BLOCKER fold-in record; residual gaps → `docs/BACKLOG.md`. |
| `docs/handoff/phase-3-waiting-room-plan-2026-06-16.md` | captured-elsewhere | Waiting room shipped as `WaitingRoomOverlay`; open P4 → `docs/BACKLOG.md`. |
| `docs/handoff/plan1-lifecycle-authed-join-smokebook.md` | captured-elsewhere | Authed-join smoke; hardware FAILs → `docs/BACKLOG.md` PLAYWRIGHT-GAP rows. |
| `docs/handoff/posthog-analytics-tier-0-1-bootstrapper.md` | captured-elsewhere | FUTURE; superseded by first-party instrumentation → `docs/BACKLOG.md` § Instrumentation. |
| `docs/handoff/pre-master-smoke-deferral-ledger-2026-06-16.md` | captured-elsewhere | PRE-MASTER/CUT gates → `docs/handoff/ORCHESTRATOR-STATE.md` + `docs/RELEASE-ROADMAP.md`; DEFER → `docs/BACKLOG.md`. |
| `docs/handoff/presarah-batch-resmoke-smokebook-2026-07-03.md` | captured-elsewhere | FAIL → `docs/BACKLOG.md`; PASS → shipped table in EXTRACT-I. |
| `docs/handoff/preview-branch-badge-smokebook-2026-06-14.md` | superseded | Feature smoke shipped; badge note → `docs/LOCAL-DEV.md` / `docs/DEPLOY.md` if needed. |
| `docs/handoff/recording-rearchitecture-design-2026-06-05.md` | captured-elsewhere | Ratified decisions → `docs/RECORDER-LIFECYCLE.md` + `docs/BACKLOG.md` § Recording re-arch. |
| `docs/handoff/recording-slice3-autonotes-bootstrapper.md` | superseded | Slice 3 shipped; deferred S3/N1–N3 → `docs/BACKLOG.md`. |
| `docs/handoff/reliability-and-prompt-v7-2026-05-20-orchestrator-report.md` | captured-elsewhere | Retrospective → `docs/BACKLOG.md` reliability + v7 rows; bootstrapper → `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/reliability-redesign-2026-05-27-orchestrator-report.md` | superseded | Companion to `RELIABILITY-REDESIGN-2026-05-27.md`; dispatch briefings historical. |
| `docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md` | captured-elsewhere | Primary-source Sarah quotes → `docs/SARAH-CALL-PREP.md` (living); archive = audit trail. |
| `docs/handoff/sarah-pilot-feedback-2026-06-06-orchestrator-report.md` | captured-elsewhere | Triage complete → `docs/BACKLOG.md`; validations captured. |
| `docs/handoff/sarah-pilot-feedback-2026-06-16-orchestrator-report.md` | captured-elsewhere | Prod bugs + SSG hooks → `docs/BACKLOG.md`. |
| `docs/handoff/scheduling-requirements-2026-06-11.md` | captured-elsewhere | Scheduling intent → `docs/BACKLOG.md` § Scheduling + `docs/RELEASE-ROADMAP.md` Wave 3. |
| `docs/handoff/sec-1-impersonation-design-2026-05-30.md` | superseded | SEC-1 design artifact shipped; BL-IMP-REAL reqs in `docs/BACKLOG.md`. |
| `docs/handoff/security-tier-b-findings-2026-06-11.md` | captured-elsewhere | Mostly shipped; SHOULD-FIX-4 deps → `docs/BACKLOG.md`; runbooks live in `docs/handoff/`. |
| `docs/handoff/session-experience-arc-continuation-bootstrapper.md` | superseded | Erasure/CF done; testing contract → `AGENTS.md` + playwright-on-fix rule. |
| `docs/handoff/session-identity-access-design-2026-05-31.md` | captured-elsewhere | IAC-13 shipped; IAC-6/10/14 + Phases 3–6 → `docs/BACKLOG.md`. |
| `docs/handoff/session-lifecycle-consent-design-2026-05-31.md` | captured-elsewhere | Mid-session swap PROPOSED → `docs/BACKLOG.md` BL-B; Q-CGC → shipped code. |
| `docs/handoff/session-lifecycle-redesign-brief-2026-06-02.md` | superseded | Recorder/lifecycle thread — cross-link only; not identity backlog substance. |
| `docs/handoff/session-wrong-identity-fix-design-2026-06-05.md` | superseded | RC-A shipped; Q4 SameSite minor follow-on → `docs/BACKLOG.md` if open. |
| `docs/handoff/signup-waitlist-smokebook-2026-06-11.md` | captured-elsewhere | B1 gating validated; operator UX deferrals → `docs/BACKLOG.md`. |
| `docs/handoff/site-wide-coverage-audit.md` | captured-elsewhere | P1–P3 test gaps → `docs/TESTING-COVERAGE.md` + `docs/BACKLOG.md`. |
| `docs/handoff/smoke-round-1-findings-2026-06-11.md` | captured-elsewhere | Structured findings → `docs/BACKLOG.md` (B1/consent/laser/replay). |
| `docs/handoff/usersmoke-2026-07-08-problem-quicklist.md` | captured-elsewhere | Living triage index at master cut → findings in `docs/BACKLOG.md` + `docs/handoff/ORCHESTRATOR-STATE.md`. |
| `docs/handoff/usersmoke-2026-07-09-recheck-quicklist.md` | captured-elsewhere | Authoritative recheck at cut → `docs/BACKLOG.md` § Pre-Sarah / durability-wave. |
| `docs/handoff/v1-component-redesign-design-2026-05-31.md` | captured-elsewhere | Per-surface B1–D specs → `docs/V1-COMPONENT-LIBRARY.md` §5 + `docs/BACKLOG.md` Gate A1. |
| `docs/handoff/v1-design-gap-inventory-2026-06-11.md` | captured-elsewhere | FULL/PARTIAL/OLD matrix → `docs/V1-COMPONENT-LIBRARY.md` §5 checklist + `docs/BACKLOG.md`. |
| `docs/handoff/v1-design-session-2026-05-19-pm-orchestrator-report.md` | captured-elsewhere | IA deferral context; Sarah 2026-05-26 answers → `docs/SARAH-CALL-PREP.md`. |
| `docs/handoff/v1-design-system-morning-status-2026-06-12.md` | captured-elsewhere | Merge train + tweak wave → `docs/BACKLOG.md` scheduling/consent + library gaps. |
| `docs/handoff/v1-redesign-STATUS.md` | captured-elsewhere | v1-redesign spine at master cut → `docs/handoff/ORCHESTRATOR-STATE.md` + `docs/V1-COMPONENT-LIBRARY.md`. |
| `docs/handoff/v1-redesign-bootstrapper.md` | superseded | Onboarding superseded by `docs/handoff/ORCHESTRATOR-STATE.md` + orchestrator-discipline rule. |
| `docs/handoff/v1-redesign-durability-wave-usersmoke-2026-07-08.md` | captured-elsewhere | Full annotated runbook; findings → quicklists + `docs/BACKLOG.md`. |
| `docs/handoff/w1-audio-durability-design-2026-05-27.md` | captured-elsewhere | W1 principles → `docs/BACKLOG.md` § Wave 1 reliability #1–#2. |
| `docs/handoff/w1-audio-durability-orchestrator-report.md` | superseded | Dispatch context only; open Qs → `docs/BACKLOG.md`. |
| `docs/handoff/wave5-fixbatch-resmoke-smokebook-2026-07-03.md` | captured-elsewhere | Superseded by rebuild smokebook; regressions → `docs/BACKLOG.md` SMOKE-NOTES-1 / SMOKE-UX-1. |
| `docs/handoff/wave5-rebuild-resmoke-smokebook-2026-07-03.md` | captured-elsewhere | SSG-2 shipped; open replay/shimmer → `docs/BACKLOG.md`. |
| `docs/handoff/wb-block-b-consent-gate-plan.md` | superseded | Hook matrix → `audio-capture-policy.ts` + tests. |
| `docs/handoff/wb-block-b-consent-gate-smokebook-2026-06-30.md` | captured-elsewhere | Hardware oracle notes → `docs/BACKLOG.md` CH-SMOKE-* PLAYWRIGHT-GAP. |
| `docs/handoff/wb-chrome-redo-STATUS.md` | superseded | 2026-06-09 branch journal; fixes merged → `docs/WHITEBOARD-STATUS.md`. |
| `docs/handoff/wb-end-session-review-smokebook-2026-06-11.md` | captured-elsewhere | Phase A shipped; Phase B polish → `docs/BACKLOG.md` chrome/review. |
| `docs/handoff/wb-laser-sync-smokebook-2026-06-11.md` | captured-elsewhere | Wire design → Gate A5 + `docs/BACKLOG.md` laser rows. |
| `docs/handoff/wb-mobile-phone-portrait-smokebook-2026-06-10.md` | captured-elsewhere | Phase 0–3 PASS; AV pip FAIL → `docs/BACKLOG.md` SR-16. |
| `docs/handoff/wb-replay-a6-slice-smokebook-2026-06-11.md` | captured-elsewhere | A6-2 shipped; A6-1 → `docs/BACKLOG.md` SSG-3. |
| `docs/handoff/wb-student-shell-smoke-triage-2026-06-17.md` | superseded | Pre-unify symptom catalog superseded by unify + `docs/BACKLOG.md`. |
| `docs/handoff/wb-unify-stabilization-plan-2026-06-17.md` | superseded | Unified shell decision → `docs/WHITEBOARD-STATUS.md` / `AGENTS.md`; wave complete. |
| `docs/handoff/wb-unify-stabilize-smokebook-2026-06-17.md` | captured-elsewhere | W1-3 gate + FAIL notes → `docs/BACKLOG.md`. |
| `docs/handoff/wb-wave4-responsive-smokebook-2026-06-19.md` | captured-elsewhere | Compaction saga → `docs/BACKLOG.md` WB-STUDENT-TOPBAR-CONTRACTION; R6 polish open. |
| `docs/handoff/wb-wave5-consent-perms-2026-06-30.md` | captured-elsewhere | Legal callout + Andrew sign-off trail; coverage → Playwright mapping in test docs. |
| `docs/handoff/wb-wave5-execution-queue.md` | captured-elsewhere | OPEN queue rows → `docs/BACKLOG.md` wb-wave5 section; SHIPPED → git/ORCHESTRATOR-STATE. |
| `docs/handoff/wb-wave5-liveboard-chrome-smokebook-2026-06-29.md` | captured-elsewhere | Over-compaction judgment → `docs/BACKLOG.md` WB-STUDENT-TOPBAR-CONTRACTION. |
| `docs/handoff/wb-wave5-next-session-bootstrap.md` | superseded | Historical orchestrator bootstrap; invariants in `AGENTS.md`. |
| `docs/handoff/wb-wave5-polish-confirm-2026-06-29.md` | captured-elsewhere | Andrew PASS/FAIL audit trail; verify-email gap → `docs/BACKLOG.md` UX. |
| `docs/handoff/wb-wave5-polish-part1-checkpoint-smokebook.md` | captured-elsewhere | WB-AV-GAP human results → `docs/BACKLOG.md` PLAYWRIGHT-GAP. |
| `docs/handoff/wb-wave5-polish-smokebook-2026-06-21.md` | captured-elsewhere | Hardware FAIL cluster → `docs/BACKLOG.md` WB-AV-GAP + polish rows. |
| `docs/handoff/wb-wave5-waiting-polish-quickwins-resmoke-2026-06-28.md` | captured-elsewhere | Tip-dependent fixes → `docs/BACKLOG.md` WB-ADULT-JOIN; quick-wins shipped. |
| `docs/handoff/wb-wave5-waiting-polish-smokebook-2026-06-28.md` | captured-elsewhere | Adult-join FAIL → `docs/BACKLOG.md` WB-ADULT-JOIN-ENABLEMENT. |
| `docs/handoff/whiteboard-chrome-design-2026-06-07.md` | captured-elsewhere | POC phasing history; open reqs → `docs/handoff/whiteboard-chrome-requirements.md` (protected). |
| `docs/handoff/whiteboard-chrome-p1.2-visual-design-2026-06-08.md` | superseded | Visual spec executed in `whiteboard-chrome.css` + components. |
| `docs/handoff/whiteboard-excalidraw-function-audit-2026-06-08.md` | captured-elsewhere | NR disposition → requirements cross-ref; NR-07/09/12 → `docs/BACKLOG.md`. |
| `docs/handoff/whiteboard-regression-net-design-2026-05-30.md` | superseded | Gate lives in `AGENTS.md`, `playwright.config.ts`, `package.json`. |
| `docs/handoff/whiteboard-session-shell-design-2026-06-08.md` | captured-elsewhere | Shell/review/consent → shipped code; ghost bounds → `docs/BACKLOG.md` SMOKE-POST-1. |
| `docs/handoff/whiteboard-sync-redesign-2026-05-27.md` | captured-elsewhere | Invariants P1–P8 → `docs/WHITEBOARD-STATUS.md` + relay tests; Yjs/IDB → `docs/BACKLOG.md`. |
| `docs/research/continuity-wedge-brainstorm-2026-06-12.md` | captured-elsewhere | Phase 2 moat spec → `docs/BACKLOG.md` program banner + future continuity rows. |
| `docs/research/market-analysis-strategic-review-2026-06-12.md` | captured-elsewhere | Strategy OQ/H/K themes → `docs/RELEASE-ROADMAP.md` overlay + `docs/BACKLOG.md`. |

### Plans archived (`~/.cursor/plans/archive/`)

| Archived plan | Bucket | Reason + canonical pointer |
|---|---|---|
| `admin_notes_history_view_4a88827e.plan.md` | superseded | Phases 1–5 core shipped; Phase 0 matrix + F2–F8 deferrals → `docs/BACKLOG.md` admin UX. |
| `ai-notes-from-text_cdf842d7.plan.md` | superseded | Shipped Apr 2026 → `src/lib/ai.ts`, `AiAssistPanel.tsx`. |
| `audio-1_opus_escalate_1765eb9a.plan.md` | superseded | Escalation record; active work → `docs/BACKLOG.md` SMOKE-AUDIO-1. |
| `audio-1_opus_escalate_6882e392.plan.md` | superseded | Duplicate of `1765eb9a`; discard. |
| `audio_session_capture_72c46b5d.plan.md` | superseded | Whisper+Blob spine shipped → transcribe/upload paths. |
| `billable_time_rounding_8ddd36ee.plan.md` | superseded | WS-J shipped → `src/lib/billing/`, billing settings. |
| `evening_smoke_triage_8584a975.plan.md` | superseded | Smoke snapshot 2026-07-09; superseded by BACKLOG SMOKE-AUDIO-1. |
| `evening_smoke_triage_b93d0fc4.plan.md` | superseded | Duplicate pending copy of `8584a975`. |
| `experience-driven_wedge_ae2776e1.plan.md` | captured-elsewhere | Strategic compass; Phases 2–4 → `docs/RELEASE-ROADMAP.md` + `docs/BACKLOG.md` program banner. |
| `go_to_sarah_durability_cut_4d5e7c76.plan.md` | superseded | Pillars A–D shipped; master cut 2026-07-09 → `docs/BACKLOG.md` MASTER-CUT waive row. |
| `live_reduce_notes_ready_at_end_ded9005b.plan.md` | captured-elsewhere | WS-K open → `docs/BACKLOG.md` (incremental reduce + End ≤2–3s invariant). |
| `live_session_floor_2e662852.plan.md` | superseded | Absorbed into wave5/v1-redesign; SSG-2 linkage → `docs/BACKLOG.md` PRESARAH-2. |
| `live_session_lifecycle_and_authed_join_85ab15e4.plan.md` | superseded | Fully executed → `/join`, `WaitingRoomOverlay`, session FSM. |
| `mic_persistence_hardening_67d9cd4b.plan.md` | captured-elsewhere | Partial shipped; remainder → `docs/BACKLOG.md` SMOKE-AUDIO-1 / SMOKE-BUG-11. |
| `phase_0_hardening_+_operator_cleanup_2d24ddb5.plan.md` | captured-elsewhere | Meta-plan done; operator wipe/sweep spec → `docs/BACKLOG.md` § Operational. |
| `recorder-test-refactor_00e7871e.plan.md` | superseded | Phases 1–3 shipped; Phases 4–6 optional debt in `docs/BACKLOG.md`. |
| `recorder_refactor_wrap_and_sarah_unblock_8301e036.plan.md` | superseded | B1–B5 shipped Apr 2026; deferred commerce → `docs/RELEASE-ROADMAP.md` Wave 5. |
| `scrubber_multi-segment_seek_fix_663915e7.plan.md` | captured-elsewhere | Partial unit fixes; hardware regressions → `docs/BACKLOG.md` SMOKE-UX-1 / SSG-3. |
| `seamless_replay_concat_eaea8414.plan.md` | captured-elsewhere | WS-G not shipped → `docs/BACKLOG.md` replay concat row. |
| `see_the_existing_plan_file._this_update_reorders_to_put_multi-recording_(phase_1,_was_phase_5)_right_db448af5.plan.md` | superseded | Phases 0–5 mostly shipped (multi-rec, NoteView, admin notes history). |
| `solo_recording_always-on_5ba5984e.plan.md` | captured-elsewhere | Spec for unshipped fix → `docs/BACKLOG.md` SMOKE-BLOCK-5 / PRESARAH-1. |
| `solo_recording_always-on_f2f0970e.plan.md` | captured-elsewhere | Actionable duplicate of `5ba5984e` → same BACKLOG rows. |
| `tutoring_notes_pilot_ready_master_plan_9aaca460.plan.md` | captured-elsewhere | **Superseded 2026-05-27** → `docs/RELEASE-ROADMAP.md` is sequencing source. |
| `tutoring_notes_release_plan_781d48c1.plan.md` | superseded | Apr 2026 audit + deploy; all todos completed. |
| `tutor_mute_honored_in_recording_8d0e254b.plan.md` | captured-elsewhere | WS-I not merged → `docs/BACKLOG.md` WS-I-PRESTART-MUTE. |
| `waiting-room_exit_affordance_0e0372c5.plan.md` | superseded | WS-F shipped → `WaitingRoomOverlay` + Playwright lifecycle specs. |
| `whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_cc1eb419.plan.md` | superseded | Stub superseded 2026-05-27 → `docs/WHITEBOARD-STATUS.md` + `docs/RELEASE-ROADMAP.md`. |
| `whiteboard_mvp_phased_plan_2be643b4.plan.md` | captured-elsewhere | Phase 1 complete; Phase 2 demo gate → `docs/WHITEBOARD-STATUS.md` + `docs/BACKLOG.md`. |
| `whiteboard_reliability_remaining_b082882.plan.md` | captured-elsewhere | Part 3 shipped; P0 blockers + structural debt → `docs/BACKLOG.md` consent/chrome/coordinator rows. |
