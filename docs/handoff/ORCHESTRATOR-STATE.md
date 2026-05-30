# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. Wave 1 security (**SEC-1** admin impersonation + test-account isolation) is the likely next orchestration thread once Andrew greenlights the Sonnet design pass; **W1 audio durability** ratification is dependency-independent (different layer) — execution still serialized in the shared tree unless run in isolated worktrees.

## Last action completed

**Durability + deploy-hygiene hardening** (the "zero-catch-up fresh chat" thread): this canonical living bootstrap + auto-read wiring into the always-applied rule and `AGENTS.md` (`e10a315`); milestone-checkpoint trigger added to `.cursor/rules/orchestrator-discipline.mdc` (`8637471`); and a **testable Node Vercel ignore-build predicate** (`scripts/vercel-ignore-build.cjs` + 12/12 unit tests, `f6a3d7e`) so `docs/` / `.cursor/` / `*.md` / `*.mdc` state-tracking commits **skip Vercel deploys** (fail-safe to build on anything else). Earlier in the session: **whiteboard/regression-net** merged at `fc7b12b` (standing `npm run test:wb-sync` gate green, teeth-verified).

## Next action(s)

Pick one (**dependency-independent** — no logical ordering, different code layers — but code execution must be **serialized in the shared working tree** unless run in isolated worktrees; see [`AGENTS.md`](../../AGENTS.md) § "Parallel subagent execution + shared-working-tree safety"):

1. **SEC-1** — on Andrew's **go**, dispatch Sonnet auth/threat-model design pass → then Composer ships A/B/C per [`docs/BACKLOG.md`](../BACKLOG.md) § SEC-1.
2. **W1 audio durability** — Andrew ratifies 3 open Qs in [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) → then Composer ships A/B/C.

After either lands, update this file's head (Last / Next / Open confirms) before the next dispatch.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| **SEC-1 design dispatch go** | Sonnet design → 3× Composer ship (schema/role/OAuth, endpoint+log+banner, dashboard UI) | Sequencing confirmed (after whiteboard Phase 1, before GTM/pen-test). **Awaiting explicit go.** |
| **W1 audio durability ratification** | 3× Composer ship A/B/C | 3 Qs: recovery UX copy, cross-session stuck-row surfacing, timeslice gate ownership — [`w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md). |
| **fast-variant user rule** | Auto-select FAST model variants in orchestrator | **Offered, unconfirmed** — never auto-select unless Andrew explicitly approves. |
| **DNS admin one-liner** | Transient first-try git/Docker DNS failures | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, **not applied**. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

None.

## Uncommitted / unmerged state

**Working tree:** clean.

**`master` HEAD:** `f6a3d7e` — `fix(vercel): testable Node ignore-build predicate — skip deploys for docs + .cursor/.mdc, fail-safe to build`

Recent `master` (newest first):

```
f6a3d7e fix(vercel): testable Node ignore-build predicate — skip deploys for docs + .cursor/.mdc, fail-safe to build
e10a315 docs(handoff): canonical living ORCHESTRATOR-STATE.md + auto-read bootstrap (zero-catch-up fresh chats)
8637471 docs(rules): orchestrator must checkpoint state at milestones, not just on truncation
36350ce docs(handoff): orchestrator state checkpoint 2026-05-30-1500 (whiteboard sync resolved + regression net merged; SEC-1 next)
fc7b12b Merge whiteboard/regression-net: standing real-browser whiteboard regression net (green + teeth-verified, inv 8 PDF quarantined)
```

**Merged branches (preserved for stale-sweep):**

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `whiteboard/regression-net` | `fc7b12b` | Standing real-browser regression net |
| `whiteboard/sync-redesign-phase-1` | `750d494` | Phase 1 sync redesign |
| `phase-0/design-tokens` | `2a574cd` | Design tokens Phase 0 |

**Dead (historical only):** `reliability/sync-b1-b4` — superseded by sync redesign.

## How we work (process — pointers only)

- **Orchestration model:** [`AGENTS.md`](../../AGENTS.md) § "Model usage protocol" — Opus orchestrates; Composer 2.5 ships by default; Sonnet for auth boundaries + adversarial/5-axis review. Dispatch inline via `Task`; **always set `model` explicitly**, including on `resume` (resume can inherit parent model).
- **Dispatch vs in-chat boundary:** [`.cursor/rules/orchestrator-discipline.mdc`](../../.cursor/rules/orchestrator-discipline.mdc) — always-applied; read before in-chat execution.
- **Merging (solo pilot):** smokeable branch → Andrew smoke → `merge --no-ff` on `master`, branch preserved; no PRs. Whiteboard sync touches require local `npm run test:wb-sync` green before merge. See `AGENTS.md` § "Merging convention".
- **Commits on Windows/PowerShell:** multi-line messages via temp file + `git commit -F`, not `-m` — see `AGENTS.md` § Conventions.

## Project arc / recent architectural decisions

- **Pilot:** Pre-public; one pilot tutor (Sarah). North star: [`AGENTS.md`](../../AGENTS.md). Reliability bar: [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc).
- **Waves:** Wave 1 reliability floor — whiteboard Phase 1 **done**; SEC-1 next on security floor. Wave 2.5 session-log greenfield ratified 2026-05-27 (parallel-able). Wave 3 brand/UX/mobile student layout after Wave 1 security.
- **Whiteboard view-sync (RESOLVED):** Offset-contamination in viewport-center math — fix `123e60e`; on-device HUD `?wbdebug=1` (`src/components/whiteboard/WhiteboardDebugHud.tsx`).
- **Follow mode B:** Student matches tutor zoom + scene-center; tutor broadcasts GLOBAL center + zoom (trailing-edge throttle `bef9a9a`).
- **Phase 1 merged:** `750d494` (`whiteboard/sync-redesign-phase-1`). Supersedes dead `reliability/sync-b1-b4`.
- **Regression net merged:** `fc7b12b`. `npm run test:wb-sync` — local Docker relay (`wb-relay-local:latest`) + local Postgres `tutoring_notes_test`; gate green (Playwright 11 passed, 1 skipped); teeth-verified; **inv-8** PDF centered+fit **quarantined** (pdfjs-headless gap, not product regression).
- **Test discipline:** Independent oracle (not the code's formula); jsdom cannot prove layout — real-render / hardware gate required; red-before-green or it does not count.

## Reading list

Fresh orchestrator — read in order:

1. [`AGENTS.md`](../../AGENTS.md)
2. [`docs/handoff/ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (this file)
3. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md)
4. [`docs/BACKLOG.md`](../BACKLOG.md)
5. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md)
6. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md)
7. [`docs/handoff/whiteboard-regression-net-design-2026-05-30.md`](whiteboard-regression-net-design-2026-05-30.md)
8. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)

## History / audit trail

This file is **updated in place**; full history: `git log -p docs/handoff/ORCHESTRATOR-STATE.md`.

Dated `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` files are **legacy snapshots** (retained, not the live source). Template for heavy restructures: [`docs/handoff/orchestrator-state-template.md`](orchestrator-state-template.md).
