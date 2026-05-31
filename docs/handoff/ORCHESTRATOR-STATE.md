# ORCHESTRATOR STATE — canonical living bootstrap

> **READ THIS FIRST.** This file is the **single source of current orchestrator state** for tutoring-notes. We keep it current continuously (lightweight head every material turn; full restructure at milestones). A **brand-new orchestrator chat** must read it before dispatching work and must **NOT** ask Andrew for catch-up on what's done, where we are, what's next, or how we work — this doc, its reading list, and `git log` are authoritative.

## Current focus

We are on **Wave 1 reliability floor** post-whiteboard: the 2-week view-sync bug is **resolved**, Phase 1 sync redesign and the standing real-browser regression net are **merged and smoked**. Wave 1 security (**SEC-1** admin impersonation + test-account isolation) is the likely next orchestration thread once Andrew greenlights the Sonnet design pass; **W1 audio durability** ratification is dependency-independent (different layer) — execution still serialized in the shared tree unless run in isolated worktrees.

## Last action completed

**2026-05-30 — W1 ship A + replay scrub fix MERGED to master (`3c2e634`, pushed).** Two `--no-ff` merges: (1) `fix/replay-audio-fetch-on-scrub-drop` — defer replay audio range-fetches until scrubber release (no more console-storm on drag; Andrew smoke-confirmed clean); (2) `feat/audio-draft-store` — W1 ship A IndexedDB audio draft store + crash/refresh recovery banner (workspace recorder / surface B). Andrew smoked happy-path GREEN (record → timer to 1:14 → student-drop auto-pause → clean stop/save, `rid=` capture logs fired). Disjoint file sets, zero merge conflicts. Production deploy for Sarah triggered. One **SEEN-NOT-REPRODUCED** watch-item logged (BACKLOG Axis 1 item 3b): "no audio recorded" on End after student-drop auto-pause — could not reproduce with console logging; code trace shows paused→End flushes; theories = capture never reached `recordingActive` first time, or one-off upload failure.

## Next action(s)

1. **Upload re-baseline smoke (gating)** — paid Preview: ~50 MB / ~90 min audio via Upload tab (`make-test-audio.cjs` Path C); paste ~90k chars (pass) + ~150k chars (reject at 120k wall). Confirms Bucket A/B ground truth before any long-form fix. See BACKLOG § Recording item 5.
2. **W1 ship B** (after smoke) — upload-failure persistence (BACKLOG item #2): hold blob in IndexedDB on retry-exhaustion, retry/resume, survive navigation (Sarah on flaky cellular). Ship C = device health. Cross-session stuck/orphaned drafts **backlogged**. B/C may parallelize via isolated worktrees if files don't conflict.
3. **SEC-1 Composer ships** — design merged (`a1c6c3f`); [`docs/handoff/sec-1-impersonation-design-2026-05-30.md`](sec-1-impersonation-design-2026-05-30.md). **6 open Qs orchestrator-discretion delegated.**

Update this file's head as each lands.

## Open Andrew-confirms / pending decisions

| Decision | Gates | Notes |
|----------|-------|-------|
| ~~SEC-1 design ratification~~ | — | ✅ **DELEGATED 2026-05-30**: Andrew trusts orchestrator on all 6 open Qs until tests fail or a specific blocking Q surfaces. Use design-doc defaults; **do not mark Qs individually answered**. |
| ~~W1 audio durability ratification~~ | — | ✅ **RATIFIED 2026-05-30**: (1) recovery copy approved as-is; (2) cross-session stuck/orphaned drafts **backlogged** — principles: never delete without explicit confirm; auto-recover tutor-tied orphans; (3) macOS debounce unvalidated (no MacBook); (4) **iOS not a release gate** — validate on Sarah sessions or when test device acquired. |
| ~~W1 surface-A coverage~~ | — | ✅ **RESOLVED 2026-05-30:** Sarah almost always records in the whiteboard workspace (even solo); note recorder is rarer. Ship A protected the right surface. Surface-A stays **lower-priority backlog**, not A-prime. |
| **Upload re-baseline smoke** | Gates W1 ship B + long-form fix decisions | **NEXT.** Paid Preview smoke per BACKLOG § Recording item 5 + `scripts/make-test-audio.cjs`. No long-form/upload fix until ground truth confirmed. |
| ~~W1 ship A merge~~ | — | ✅ **MERGED 2026-05-30** (`3c2e634`). Andrew happy-path smoke GREEN; iOS validation tracked as debt, not a gate. |
| **fast-variant user rule** | Auto-select FAST model variants in orchestrator | **Offered, unconfirmed** — never auto-select unless Andrew explicitly approves. |
| **DNS admin one-liner** | Transient first-try git/Docker DNS failures | 192.168.1.1 → 1.1.1.1/8.8.8.8 — given, **not applied**. |
| Default theme light vs dark | DESIGN-TOKENS Phase 0 | See `docs/DESIGN-TOKENS-PLAN.md`. |
| `billed*` vs `reported*` column naming | Wave 2.5 schema | Default `billed*` per prior checkpoint. |

## In-flight subagents

**None.** All three parallel-worktree subagents (W1 ship A, SEC-1 design, tsc fix) completed 2026-05-30 ~16:10 MT.

## Uncommitted / unmerged state

**Working tree:** clean.

**`master` HEAD:** `3c2e634` — `Merge W1 ship A audio draft store (crash/refresh recovery) into master`.

Recent `master` (newest first):

```
3c2e634 Merge W1 ship A audio draft store (crash/refresh recovery) into master
1aaacdd Merge replay scrub audio-defer fix + watch-item into master
42e7dfe docs(backlog): log SEEN-NOT-REPRODUCED empty-recording-after-student-drop watch-item
588999f Add make-test-audio script for long-form transcribe smokes.
4cb81a7 docs(rules): sharpen orchestrator cost discipline — default verb is dispatch
```

**Unmerged branches awaiting gates:** none active (both W1 ship A + replay fix merged 2026-05-30). SEC-1 design merged (`a1c6c3f`); SEC-1 Composer ships not yet dispatched.

**Merged branches (preserved for stale-sweep):**

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `whiteboard/regression-net` | `fc7b12b` | Standing real-browser regression net |
| `whiteboard/sync-redesign-phase-1` | `750d494` | Phase 1 sync redesign |
| `phase-0/design-tokens` | `2a574cd` | Design tokens Phase 0 |
| `fix/replay-audio-fetch-on-scrub-drop` | `1aaacdd` | Replay scrub audio-defer (no drag storm) |
| `feat/audio-draft-store` | `3c2e634` | W1 ship A audio draft store + recovery banner |

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
