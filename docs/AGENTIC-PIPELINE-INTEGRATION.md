# Agentic pipeline integration plan (living)

Goal (Andrew 2026-07-10): advance the **`agenticPipeline`** project (`C:\Users\arang\Documents\Andrew\dev\agenticPipeline` — first crack, unrefined) toward a true autonomous, **industry-standard black-box agentic dev pipeline**, and **integrate it with tutoring-notes**. Priority stays tutoring-notes functionality/stability/responsiveness; pipeline advances in real, solid steps, deferrable only if it blocks release (Andrew approval), never permanently.

> **Status: PLAN — awaiting Andrew review before pipeline code changes.** Pipeline architecture is a design-direction call; capturing the path here rather than autonomously refactoring an unfamiliar runner overnight. Source: read-only exploration 2026-07-10 ([agenticPipeline explore](7812a767-cc56-4a3a-bf8b-e316289305fb)).

## Current state of agenticPipeline (~15–25% of vision)

- **Strong:** stage contracts (`spec → research → design → build → test → verifier → approval → deploy → handoff`), guardrail docs (trust bar, reliability-bar globbed at tutoring-notes), a verifier subagent spec (`.cursor/agents/verifier.md`), working bootstrap/approval scripts (`run.js` start + `--approve`), model-tiering rules.
- **Missing for autonomy:** no programmatic stage loop (today a human pastes `AGENT-PROMPT.md` into a Cursor chat); verifier is a prompt, not invoked; **approval is fail-OPEN** (allowed even if `verification-report.md` is absent — `run.js` ~L217-219); no change/iteration mode for existing repos; no merge/PR automation; no task queue/isolation; no post-release loop; no pipeline self-CI.
- **tutoring-notes already reinvented the core** (executor → independent verifier → gates) as always-apply rules + the overnight Wave A loop. That loop is the natural first "unit" to encode into the pipeline.

## Integration principles (hard)

1. **Never auto-merge to tutoring-notes `master`.** The pipeline may branch, run gates, and request approval; merge stays orchestrator/Andrew. Sarah's production path is sacrosanct.
2. **Fail-closed gates.** Approval blocked unless verification report says PASS. No fail-open.
3. **tutoring-notes stays a sibling repo** (not nested under `pipeline-projects/`); pipeline orchestrates via `spec.source.path` + `--project-dir`.
4. Reuse tutoring-notes' non-negotiable rules (dedupe / exhaustive-testing / agentic-verification / playwright-on-fix / fragile-surface protections) as the verifier's checklist.

## Phased path (ranked; each a real solid step)

### Phase 1 — encode the change-run unit (highest leverage, safest) — NEEDS ANDREW OK
- Add a **`change`/iteration run mode** to `agenticPipeline` (`spec.source.path` → tutoring-notes sibling; scoped acceptance criteria; work on a feature branch; **stop at approval, no merge**).
- **Close the fail-open hole:** `run.js` approval requires `verification-report.md` with `Result: PASS`.
- Author a tutoring-notes-targeted `AGENT-PROMPT` template: executor → independent verifier (TN rules) → TN gates (`npm run test:wb-affected:run`, `npx next build`) → approval-request.
- Prove on ONE already-safe Wave A dedupe chunk (or a dry-run producing only artifacts).

### Phase 2 — make verification executable
- Upgrade `scripts/verify-run.js` from prompt-printer to a real invocation (Cursor Agent SDK/CLI of the verifier agent) **and/or** a deterministic checklist script (intent-coverage parse + `results.json` presence + TN gate exit codes). Without this, "black box" never leaves chat-paste.

### Phase 3 — orchestration + safety rails (later, higher blast radius)
- Real stage loop that advances/checkpoints/retries; task queue + worktree isolation + cost budgets; merge/PR automation with required checks (still no silent master push); pipeline self-CI proving the approve gates; learning aggregation stub. Defer greenfield deploy automation / post-release auto-fix / cloud runner — high blast radius, low help for the release track.

## First concrete step when Andrew greenlights
Phase 1: implement change-run mode + fail-closed approval in `agenticPipeline`, with the tutoring-notes verifier checklist, and drive one Wave A dedupe chunk through it end-to-end (branch + gates + verify + approval-request, no merge). This converts tonight's manual loop into durable pipeline machinery without risking production.

## Cross-refs
- tutoring-notes: [`.cursor/rules/agentic-verification-pipeline.mdc`](../.cursor/rules/agentic-verification-pipeline.mdc), [`docs/DEDUPE-PLAN.md`](DEDUPE-PLAN.md), BACKLOG `PIPELINE-1`.
- agenticPipeline: `run.js`, `stages/`, `.cursor/agents/verifier.md`, `docs/PRINCIPLES.md`, `docs/MASTER-FLOW.md`.
