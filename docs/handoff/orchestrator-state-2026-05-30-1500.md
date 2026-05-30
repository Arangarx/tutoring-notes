# Orchestrator state — 2026-05-30 3:00 PM Mountain

> **Checkpoint:** 2026-05-30 3:00 PM (UTC-6). Bootstrap for the next orchestrator chat after whiteboard sync resolution + regression net merge. Read this file first, then the bootstrap reading list below.

## Project arc + North Star

- **Pilot stage:** Pre-public-launch; one pilot tutor (Sarah). Commercial app being prepared to present to school organizations.
- **North Star** (from [`AGENTS.md`](../../AGENTS.md)): *"People need to use the app with confidence. Sarah is being patient, but that won't last forever."*
- **Reliability bar:** [`../../agenticPipeline/.cursor/rules/reliability-bar.mdc`](../../agenticPipeline/.cursor/rules/reliability-bar.mdc) — 5-axis adversarial review; BLOCKERs belong in Phase-1 acceptance, not follow-ups.

## Current Wave focus

| Wave | Status |
|------|--------|
| **Wave 1** — reliability floor | **Whiteboard sync Phase 1 DONE** (merged `750d494`); standing real-browser regression net merged (`fc7b12b`). Andrew smoked 5/5 core invariants on real hardware (desktop tutor + phone student). **Next Wave 1 security item:** SEC-1 admin impersonation + test-account isolation. |
| **Wave 2.5** — session log + reporting | Greenfield, ratified 2026-05-27. Unchanged; parallel-able with SEC-1. |
| **Wave 3** — brand/UX/URL refresh | Imminent after Wave 1 security floor; mobile-first student layout = breaking redesign. |

## Latest committed state

- **`fc7b12b`** — `Merge whiteboard/regression-net: standing real-browser whiteboard regression net (green + teeth-verified, inv 8 PDF quarantined)`
- On `master`; pushed to `origin/master`. Working tree clean.

## Uncommitted in working tree

**None.** All work from this session committed and pushed.

## In-flight subagents

None.

## Open decisions awaiting Andrew

| Decision | What it gates | Recommendation |
|----------|---------------|----------------|
| **SEC-1 design dispatch go** | Sonnet auth/threat-model pass → 3 Composer ship dispatches (A schema+role+OAuth, B endpoint+ImpersonationLog+banner, C dashboard UI) | Andrew confirmed sequencing (after whiteboard Phase 1, before GTM/pen-test); paused to request this state checkpoint first. **Likely immediate next action** pending his go. |
| **W1 audio durability ratification** | 3 Composer ship dispatches A/B/C in [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) | 3 open Qs: recovery UX copy, cross-session stuck-row surfacing, timeslice gate ownership. Parallel-able with SEC-1 (different layers). |
| **fast-variant user rule** | Whether orchestrator may auto-select FAST model variants | OFFERED, not yet confirmed — never auto-select unless Andrew explicitly approves. |
| **DNS fix (192.168.1.1 → 1.1.1.1/8.8.8.8)** | Transient first-try git/Docker DNS failures on Andrew's adapter | Admin one-liner given; not yet applied. |
| Default theme: light vs dark | DESIGN-TOKENS Phase 0 | Still open from prior checkpoint — see `docs/DESIGN-TOKENS-PLAN.md`. |
| Frozen-time column naming: `billed*` vs `reported*` | Wave 2.5 schema | Still open; default `billed*` per prior checkpoint. |

## Recent architectural decisions

Ratified since [`orchestrator-state-2026-05-27-1053.md`](orchestrator-state-2026-05-27-1053.md); full detail in linked docs.

- **Whiteboard view-sync root cause (RESOLVED):** Offset-contamination in viewport-center math — center leaked `offsetLeft`/`offsetTop`, drifting with PAGE scroll / browser resize. Fix: `center = (width/2)/zoom - scroll` (offset-invariant), commit `123e60e`. On-screen debug HUD (`?wbdebug=1`, `src/components/whiteboard/WhiteboardDebugHud.tsx`) exposed it on real hardware.
- **Follow mode = B:** Student matches tutor zoom exactly + scene-center aligned. Fit-region (A) rejected. Tutor broadcasts GLOBAL scene center + zoom via trailing-edge throttle (`bef9a9a` — was debounce that fired 0 broadcasts during continuous drawing); student places via vendored Excalidraw 0.18.1 transform (`99c7a40`).
- **PDF/image fixes:** assetUrl re-stamping (`e3e9952`); PDF pages open centered+zoom-to-fit deterministically (`e9a48ac`).
- **Whiteboard sync redesign Phase 1:** Merged `--no-ff` at `750d494`. Supersedes the old B1–B4 sync sweep (`reliability/sync-b1-b4` branch is dead — historical reference only).
- **Standing regression net (2026-05-30):** `npm run test:wb-sync` drives 2 real Excalidraw instances over LOCAL Dockerized relay (`wb-relay-local:latest` from `../../whiteboard-sync`) + LOCAL Postgres (`tutoring_notes_test` @ `127.0.0.1:5432`). Hard local-DB safety rail (`scripts/wb-regression-assert-local-db.cjs`). Gate GREEN: Jest 502/502, Playwright 11 passed + 1 skipped. Teeth-verified: breaking inv-4 viewport oracle reddens at 322.84px, restoring greens. **LOCAL pre-merge gate only** — NOT wired into Vercel build/CI (needs local Docker). Run before any merge touching whiteboard sync.
- **Test discipline:** Assert external requirement via INDEPENDENT oracle, never the code's own formula. jsdom cannot see real Excalidraw layout → real-render harness is the gate; unit-green alone is not "done."
- **inv-8 quarantined:** PDF centered+fit test skipped — pdfjs-dist won't load in headless Playwright (`Object.defineProperty called on non-object`); env/gate gap, NOT product regression; covered by manual PDF smoke.
- **Subagent dispatch:** Always specify `model` explicitly INCLUDING on resume (resume inherits orchestrator model otherwise — bit us). Ref: `1e0fad5`.
- **Merging convention:** Smokeable branch → Andrew smoke → `merge --no-ff`, branch preserved for stale-sweep; no PRs at solo-pilot stage.

## Pilot context (most recent)

- **Capture:** 2026-05-26 — [`docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md`](sarah-pilot-feedback-2026-05-26-orchestrator-report.md) (commit `c75e946`). No new Sarah session since prior checkpoint.
- **Wedge (Sarah-validated):** Live whiteboard + recording session is the wedge, not AI notes.
- **Whiteboard smoke:** Andrew verified 5/5 core invariants on real hardware post-merge (desktop tutor + phone student).
- **Open follow-ups for next Sarah thread:** Q4 pain point; Sarah-drives-tutor methodology session; Wyzant + UVU forms (Wave 2.5 export design).

## Queued dispatches

1. **SEC-1 Sonnet design pass** — auth/threat model, schema, Google-OAuth-for-admin-login, banner UX, exit contract. Andrew about to greenlight; paused for this checkpoint. See [`docs/BACKLOG.md`](../BACKLOG.md) § Security, 🟡 SEC-1 (~line 490).
2. **SEC-1 Composer ship A** — schema + role + OAuth (after design ratified).
3. **SEC-1 Composer ship B** — endpoint + ImpersonationLog + banner.
4. **SEC-1 Composer ship C** — dashboard UI.
5. **W1 audio durability ships A/B/C** — after Andrew ratifies [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) (parallel-able with SEC-1).
6. **(Eventually)** Wave 2.5 session-log + reporting — Sonnet design pass once Sarah shares form artifacts.
7. **(Wave 3 entry)** Brand/UX/URL refresh + mobile-first student redesign.

## Bootstrap reading list

Read in order if you are a **fresh orchestrator chat**:

1. [`AGENTS.md`](../../AGENTS.md) — orchestrator discipline + conventions + model usage protocol.
2. [`docs/RELEASE-ROADMAP.md`](../RELEASE-ROADMAP.md) — current sequencing.
3. [`docs/BACKLOG.md`](../BACKLOG.md) — deferred work + SEC-1 + reliability gaps.
4. [`docs/WHITEBOARD-STATUS.md`](../WHITEBOARD-STATUS.md) — Phase 1 merged status + guardrails.
5. [`docs/RECORDER-LIFECYCLE.md`](../RECORDER-LIFECYCLE.md) — must-read before FSM/outbox/end-session code.
6. [`docs/handoff/whiteboard-regression-net-design-2026-05-30.md`](whiteboard-regression-net-design-2026-05-30.md) — regression net architecture + gate contract.
7. [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md) — W1 design awaiting ratification.
8. [`docs/handoff/orchestrator-state-2026-05-27-1053.md`](orchestrator-state-2026-05-27-1053.md) — prior checkpoint (continuity).

## Open questions still in flight

- W1 audio durability 3 open Qs (recovery UX copy, cross-session stuck-row surfacing, timeslice gate ownership) — blocks W1 ship dispatches.
- **Whiteboard follow-ups (backlog, non-blocking):** inv-8 pdfjs-headless re-enable; sign-in button reverts to idle before auth completes (logged `16e48c1`); eraser cursor mismatch; A/V Phase 4 student tile "waiting for camera" + missing tutor "T" initial; student-side mic picker gap; Phase B replay + scrubbing-at-scale 429-storm; new pages insert-after-active-page UX question.
- Prior checkpoint open items still live: light/dark theme default, `billed*` vs `reported*` naming, Sarah Wyzant/UVU form artifacts for Wave 2.5.

## Branch inventory (merged, preserved for stale-sweep)

| Branch | Merge commit | Notes |
|--------|--------------|-------|
| `master` | HEAD `fc7b12b` | Current |
| `whiteboard/regression-net` | `fc7b12b` | Merged; preserve |
| `whiteboard/sync-redesign-phase-1` | `750d494` | Merged; preserve |
| `phase-0/design-tokens` | `2a574cd` | Merged; preserve |
| `reliability/sync-b1-b4` | — | **DEAD** — superseded by redesign; historical reference only |
