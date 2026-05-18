# Tutoring notes — agent context

You are working in the **tutoring-notes** app: a **standalone `git` repo** that
lives next to the **`agenticPipeline`** monorepo under a shared parent (typical
layout: `…/dev/agentic-projects/tutoring-notes`). Same reliability expectations as
before — this is the live commercial app Sarah (our pilot tutor) uses for real
sessions.

## North star

> *"People need to use the app with confidence. Sarah is being patient,
> but that won't last forever."*

If a tutor would need to run a backup recorder alongside our app, the
feature is not done. See [reliability-bar.mdc](../../agenticPipeline/.cursor/rules/reliability-bar.mdc)
for the full reliability standard. **Every feature plan in this app must
include an adversarial review against the 5 reliability axes, with
BLOCKERs folded into Phase-1 acceptance — not deferred to follow-ups.**

The whiteboard plan
([../../agenticPipeline/docs/whiteboard-plan](../../agenticPipeline/docs/whiteboard-plan)
or `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md`)
and `docs/WHITEBOARD-STATUS.md` are the working example of this pattern.

## Key docs

- [docs/BACKLOG.md](docs/BACKLOG.md) — pilot feedback, known follow-ups,
  reliability gaps audit.
- [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) — **read
  before touching `lifecycle-machine.ts`, `upload-outbox.ts`,
  `endWhiteboardSession`, or workspace `handleEndSession`.** Maps the
  three pillars (FSM, outbox, atomic end-session) plus Phase 1c
  surfaces (snapshot PNG, preview-before-Start), the end-session
  flow diagram, and the cheat sheet for common questions.
- [docs/RECORDER-REFACTOR-STATUS.md](docs/RECORDER-REFACTOR-STATUS.md) —
  pattern for STATUS docs (per-feature handoff between sessions).
- [docs/WHITEBOARD-STATUS.md](docs/WHITEBOARD-STATUS.md) — current
  whiteboard build status, guardrails, adversarial review, demo gate.
- [docs/PHASE-1B-STATUS.md](docs/PHASE-1B-STATUS.md) — outbox + atomic
  end-session branch handoff (Pillars 2 + 3).
- [docs/PHASE-4A-STATUS.md](docs/PHASE-4A-STATUS.md) — live-A/V peer-mesh
  + signaling foundation branch handoff (Pillar 6, first of 4 Phase 4 sub-chats).
- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + Neon deploy notes.
- [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) — local setup.

## Conventions

- **Per-session ID logging is mandatory.** Audio uses `rid=<id>`; whiteboard
  uses `wbsid=<id>`. New capture/sync features pick a 3-letter prefix and
  log every state transition. Without this, prod debugging is impossible.
  Currently in use: `rid` (audio recorder), `wbsid` (whiteboard session),
  `obx` (upload-outbox row), `snp` (snapshot generation), `pvw`
  (workspace preview-before-Start), `pvs` (per-page whiteboard pan/zoom —
  Phase 5 task 8), `avx` (live-A/V session — Phase 4a;
  per-peer events also carry `peer=<peerId>`), `cev` (cost-event row —
  OpenAI usage observability), `blb` (blob cleanup CLI), `brs` (branch
  sweep CLI). See
  [docs/RECORDER-LIFECYCLE.md](docs/RECORDER-LIFECYCLE.md) for the
  registry.
- **Migrations are additive.** Production runs on Neon; never drop or
  rename a column without a multi-step migration.
- **Server actions assert ownership.** `assertOwnsStudent(adminUserId,
  studentId)` (or the equivalent for the resource) runs before any
  mutation or read of student data.
- **Share links are tokenized + revocable.** No public Blob URLs for
  student content.
- **CSP is tight.** Adding a new external origin (sync server, embed,
  font CDN) requires updating `src/middleware.ts` and documenting it in
  the feature's STATUS doc.
- **This repo (`tutoring-notes`) — feature branches: commit + push by default.** After substantive work on a named branch here, create a descriptive commit and push (`origin`; retry transient network failures) unless Andrew says to hold off. (Scope is this app only, not every workspace.)
- **Executor bootstrappers live in `docs/handoff/`** — when the orchestrator drafts a briefing for a fresh executor chat, write it as `docs/handoff/<scope>-bootstrapper.md` rather than `~/.cursor/plans/`. Two reasons: (a) Cursor's chat UI only resolves workspace-relative file paths so in-workspace bootstrappers are clickable, (b) committed bootstrappers create an audit trail pairing "what we asked for" with "what shipped." **Bootstrappers must be pure executor briefings from line 1** — no orchestrator wrapper, no "copy below the rule line" headers. They must also include a top-of-file blockquote that disambiguates intent when the file arrives via `@`-reference (so Andrew's workflow can use either paste-the-blob or single-`@`-reference, whichever is faster). See `docs/handoff/README.md` for the required top-of-file template + full lifecycle.

## When picking up work mid-feature

1. Read the feature's `*-STATUS.md` first. Find the phase status table.
2. Read the `~/.cursor/plans/*.plan.md` for the feature if it exists.
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes.
4. Update the STATUS doc as you finish each sub-phase.

## Merging convention (solo-tutor pilot stage)

While the pilot is solo (just Andrew + Sarah) and there's no adversarial
CI agent reviewing PRs automatically:

- Executors deliver a **smokeable branch** with the Vercel Preview URL +
  a smoke checklist + a clear final report. They do NOT open PRs.
- Andrew (or the orchestrator after Andrew confirms smoke pass) merges
  directly to master via `git merge --no-ff <branch>` to keep a clean,
  revertable merge commit. The branch is preserved (and later cleaned up
  by the stale-branch sweep utility).
- **Direct pushes to master WITHOUT a smoked branch are still
  forbidden** — branch + commit + push + smoke + merge is the
  discipline; only the PR step is dropped.
- **When this changes:** revisit the convention if (a) the team grows
  beyond solo or (b) an adversarial agentic CI pipeline lands that auto-
  reviews PRs. At that point, PRs become the right shape again. Until
  then, no notes were being added to PRs anyway — the ceremony was pure
  overhead.
