# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. Wave 1 security (**SEC-1** admin impersonation + test-account isolation) is the likely next orchestration thread once Andrew greenlights the Sonnet design pass; **W1 audio durability** ratification is dependency-independent (different layer) — execution still serialized in the shared tree unless run in isolated worktrees.

## Last action completed

**Andrew ratified W1 + SEC-1 rulings (2026-05-30, this turn).** W1: recovery copy approved as-is; cross-session stuck/orphaned drafts **backlogged** (never-delete + auto-recover principles recorded); macOS debounce unvalidated; **iOS not a release gate**. SEC-1: 6 open Qs **orchestrator-discretion delegated** (escalate on test fail / blocking Q only). **New scope finding:** W1 ship A covers workspace recorder only — student-page note recorder (surface A) unprotected; BACKLOG item + priority gate OPEN. Prior: W1 ship A on `feat/audio-draft-store` (`63d1897`); SEC-1 design merged (`a1c6c3f`); tsc fix merged (`de3e9c0`).

## Next action(s)

1. **W1 ship A awaiting smoke** (`feat/audio-draft-store` @ `63d1897`, pushed) — Andrew smokes crash/refresh recovery on **workspace recorder** (surface B); **iOS not blocking** merge. Then `merge --no-ff`.
2. **W1 ships B + C** after A smoke-passes: B = upload-failure persistence (outbox `stuck` semantics); C = device health. Cross-session stuck/orphaned draft surfacing is **backlogged** (principles in BACKLOG § W1 durability). B/C may parallelize via isolated worktrees if files don't conflict (see [`AGENTS.md`](../../AGENTS.md) § parallel-execution), else serial.
3. **SEC-1 Composer ships** — design merged (`a1c6c3f`); [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md). **6 open Qs orchestrator-discretion delegated** — use design-doc defaults; escalate to Andrew only on test failures or a specific blocking question.
4. **W1 surface-A coverage decision (OPEN)** — does Sarah record in workspace or note recorder? Gates whether surface-A draft protection is A-prime or lower-priority backlog. See [`docs/BACKLOG.md`](../BACKLOG.md) § W1 surface-A.
5. **Transcription speed (Tier 2)** — backlogged (BACKLOG § Recording item 6): VAD/silence-boundary chunking + provider/concurrency levers; Sonnet design pass when prioritized.

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| ~~SEC-1 design ratification~~ | — | ✅ **DELEGATED 2026-05-30**: Andrew trusts orchestrator on all 6 open Qs until tests fail or a specific blocking Q surfaces. Use design-doc defaults; **do not mark Qs individually answered**. |
| ~~W1 audio durability ratification~~ | — | ✅ **RATIFIED 2026-05-30**: (1) recovery copy approved as-is; (2) cross-session stuck/orphaned drafts **backlogged** — principles: never delete without explicit confirm; auto-recover tutor-tied orphans; (3) macOS debounce unvalidated (no MacBook); (4) **iOS not a release gate** — validate on Sarah sessions or when test device acquired. |
| **W1 surface-A coverage** | Priority of note-recorder draft protection vs backlog | **OPEN.** Ship A protects workspace recorder only; student-page note recorder unprotected. Gates A-prime vs lower-priority. Question: does Sarah record in workspace or via note recorder? |
| **fast-variant user rule** | Auto-select FAST model variants in orchestrator | **Offered, unconfirmed** — never auto-select unless Andrew explicitly approves. |
| **DNS admin one-liner** | Transient first-try git/Docker DNS failures | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, **not applied**. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

**None.** All three parallel-worktree subagents (W1 ship A, SEC-1 design, tsc fix) completed 2026-05-30 ~16:10 MT.

## Uncommitted / unmerged state

**Working tree:** clean.

**`master` HEAD:** `a1c6c3f` — `Merge feat/sec-1-design: SEC-1 design doc (docs-only; 6 open Qs await ratification)`. Also landed this turn: tsc gate fix (`de3e9c0`) + iOS validation-debt note (`4b2f29f`, BACKLOG § Axis 4 matrix — W1-A banner + whiteboard sync untested on real iPhone; no device on hand).

Recent `master` (newest first):

```
de3e9c0 Merge fix/tsc-vercel-ignore-types: restore clean tsc --noEmit gate (typed .d.ts)
b951be0 fix(types): declare vercel-ignore-build.cjs exports for tsc
574d890 docs: W1 ratified (plain copy + cross-session stuck surfacing) + transcription-speed Tier 2 backlog
2f25782 docs: codify parallel-subagent worktree safety policy (serialize-by-default, parallelize-when-safe)
f6a3d7e fix(vercel): testable Node ignore-build predicate — skip deploys for docs + .cursor/.mdc, fail-safe to build
```

**Unmerged branches awaiting gates:** `feat/audio-draft-store` (`63d1897`, pushed — awaiting W1-A smoke; iOS not blocking); ~~`feat/sec-1-design`~~ merged (`a1c6c3f`).

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
