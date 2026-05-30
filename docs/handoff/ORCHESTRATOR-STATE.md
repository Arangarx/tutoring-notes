# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. Wave 1 security (**SEC-1** admin impersonation + test-account isolation) is the likely next orchestration thread once Andrew greenlights the Sonnet design pass; **W1 audio durability** ratification is dependency-independent (different layer) — execution still serialized in the shared tree unless run in isolated worktrees.

## Last action completed

**2026-05-30 session decisions captured (docs-only).** Surface-A **RESOLVED** — workspace is Sarah's primary recording surface; ship A protected the right path. **Long-form upload re-baselined** — Sarah's prior failures likely free-tier Vercel (10–60s) + free Neon artifacts; infra now Pro 300s + paid Neon; no fix ships until upload-focused smoke on paid Preview establishes ground truth (`scripts/make-test-audio.cjs`, [`docs/SMOKE-LONG-FORM-TRANSCRIBE.md`](../SMOKE-LONG-FORM-TRANSCRIBE.md)). W1 ship B = upload-reliability (BACKLOG item #2), prioritized next build after smoke. `feat/audio-draft-store` updated-to-master @ `2cde72e`, tsc + recorder-tests green, happy-path verifier GREEN — **awaiting Andrew smoke or waive before `--no-ff` merge.**

## Next action(s)

1. **W1 ship A merge gate** — `feat/audio-draft-store` @ `2cde72e` (pushed). Andrew smokes crash/refresh recovery on **workspace recorder** (surface B) or waives; **iOS not blocking**. Then `merge --no-ff`.
2. **Upload re-baseline smoke (gating)** — paid Preview: ~50 MB / ~90 min audio via Upload tab (`make-test-audio.cjs` Path C); paste ~90k chars (pass) + ~150k chars (reject at 120k wall). Confirms Bucket A/B ground truth before any long-form fix. See BACKLOG § Recording item 5.
3. **W1 ship B** (after smoke) — upload-failure persistence (BACKLOG item #2): hold blob in IndexedDB on retry-exhaustion, retry/resume, survive navigation (Sarah on flaky cellular). Ship C = device health. Cross-session stuck/orphaned drafts **backlogged**. B/C may parallelize via isolated worktrees if files don't conflict.
4. **SEC-1 Composer ships** — design merged (`a1c6c3f`); [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md). **6 open Qs orchestrator-discretion delegated.**

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| ~~SEC-1 design ratification~~ | — | ✅ **DELEGATED 2026-05-30**: Andrew trusts orchestrator on all 6 open Qs until tests fail or a specific blocking Q surfaces. Use design-doc defaults; **do not mark Qs individually answered**. |
| ~~W1 audio durability ratification~~ | — | ✅ **RATIFIED 2026-05-30**: (1) recovery copy approved as-is; (2) cross-session stuck/orphaned drafts **backlogged** — principles: never delete without explicit confirm; auto-recover tutor-tied orphans; (3) macOS debounce unvalidated (no MacBook); (4) **iOS not a release gate** — validate on Sarah sessions or when test device acquired. |
| ~~W1 surface-A coverage~~ | — | ✅ **RESOLVED 2026-05-30:** Sarah almost always records in the whiteboard workspace (even solo); note recorder is rarer. Ship A protected the right surface. Surface-A stays **lower-priority backlog**, not A-prime. |
| **Upload re-baseline smoke** | Gates W1 ship B + long-form fix decisions | **NEXT.** Paid Preview smoke per BACKLOG § Recording item 5 + `scripts/make-test-audio.cjs`. No long-form/upload fix until ground truth confirmed. |
| **W1 ship A merge** | `--no-ff` `feat/audio-draft-store` | **PENDING.** Branch @ `2cde72e`, verifier GREEN — Andrew happy-path smoke or waive. |
| **fast-variant user rule** | Auto-select FAST model variants in orchestrator | **Offered, unconfirmed** — never auto-select unless Andrew explicitly approves. |
| **DNS admin one-liner** | Transient first-try git/Docker DNS failures | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, **not applied**. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

**None.** All three parallel-worktree subagents (W1 ship A, SEC-1 design, tsc fix) completed 2026-05-30 ~16:10 MT.

## Uncommitted / unmerged state

**Working tree:** clean.

**`master` HEAD:** `588999f` — `Add make-test-audio script for long-form transcribe smokes.`

Recent `master` (newest first):

```
588999f Add make-test-audio script for long-form transcribe smokes.
4cb81a7 docs(rules): sharpen orchestrator cost discipline — default verb is dispatch
dd9f12b docs(backlog): item 1c — consolidate post-crash recovery banner PRESENTATION only
34441a8 docs: Andrew 2026-05-30 W1/SEC-1 ratifications + surface-A scope gap
a1c6c3f Merge feat/sec-1-design: SEC-1 design doc (docs-only)
```

**Unmerged branches awaiting gates:** `feat/audio-draft-store` (`2cde72e`, pushed — updated-to-master, tsc + recorder-tests green, happy-path verifier GREEN; awaiting Andrew smoke or waive); ~~`feat/sec-1-design`~~ merged (`a1c6c3f`).

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
