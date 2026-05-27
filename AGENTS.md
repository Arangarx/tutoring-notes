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

**If you are an Opus orchestrator chat:** before doing anything in-chat
that smells like execution (reading code, writing code/tests, drafting
handoff docs, multi-step refactors), STOP and read
[.cursor/rules/orchestrator-discipline.mdc](.cursor/rules/orchestrator-discipline.mdc).
That rule defines the dispatch-vs-do boundary and the strict carve-outs
for in-chat tool calls. Full tier-assignment + escalation criteria live
in § "Model usage protocol" below.

The whiteboard plan
([../../agenticPipeline/docs/whiteboard-plan](../../agenticPipeline/docs/whiteboard-plan)
or `~/.cursor/plans/whiteboard_-_match_wyzant_for_sarah_plus_our_wedge_*.plan.md`)
and `docs/WHITEBOARD-STATUS.md` are the working example of this pattern.

## Key docs

- [docs/INDEX.md](docs/INDEX.md) — **start here.** Literal "where do I
  look for X" map: every canonical doc, spoke, and smoke runbook indexed
  by topic (sequencing, reliability, brand/UX, pilot feedback, deploy,
  legal, security, smoke runbooks, recorder lifecycle gate, handoff docs).
  Updated 2026-05-27 doc-cleanup pass.
- [docs/RELEASE-ROADMAP.md](docs/RELEASE-ROADMAP.md) — canonical
  sequencing source. Wave-by-wave ordering from solo-tutor reliability
  floor to Aug 2026 university-pitch readiness. Re-validate quarterly or
  after major Sarah feedback.
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
- [docs/LIVE-AV.md](docs/LIVE-AV.md) — **read before touching
  `peer-mesh.ts`, `useLiveAV.ts`, `mic-recorder-audio.ts`, or anything
  claiming to "simplify" peer connection or remote audio recording.**
  Live A/V architecture cheat sheet — peer-mesh, signaling, recording
  outbox integration, participants-reconcile effect.
- [docs/PHASE-1B-STATUS.md](docs/PHASE-1B-STATUS.md) — outbox + atomic
  end-session branch handoff (Pillars 2 + 3).
- [docs/PHASE-4A-STATUS.md](docs/PHASE-4A-STATUS.md) — live-A/V peer-mesh
  + signaling foundation branch handoff (Pillar 6, first of 4 Phase 4 sub-chats).
- [docs/DEPLOY.md](docs/DEPLOY.md) — Vercel + Neon deploy notes.
- [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md) — local setup.
- [docs/PLATFORM-ASSUMPTIONS.md](docs/PLATFORM-ASSUMPTIONS.md) — **read
  before migrating to a different compute platform / managed-service tier,
  or onboarding a new external dependency.** Single inventory of every
  load-bearing infra, runtime, browser, and OS assumption (Vercel Pro
  300s ceiling, Neon branching, Vercel Blob shared store, CSP origins,
  Node 20+, ffmpeg-static, Excalidraw API surface, etc.) + a migration
  checklist.
- [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md) — **read before touching
  `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, the Gmail OAuth
  consent flow, or any external policy reference.**
- [docs/SARAH-CALL-PREP.md](docs/SARAH-CALL-PREP.md) — rolling doc for
  pilot questions: next-call open questions + answered questions from
  all prior calls (newest at top). Read before any Sarah call or when
  acting on pilot questions.
- [docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md](docs/handoff/sarah-pilot-feedback-2026-05-26-orchestrator-report.md) —
  latest pilot call capture (2026-05-26, commit `c75e946`): Sarah's 3
  questions, key themes, strategic reframe (notes as institutional
  memory), action items, brand-awareness check deferral.

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
- **Platform assumptions are tracked.** Any commit that introduces a
  new load-bearing infrastructure dependency (a hardcoded timeout
  cap, a per-tier limit, a new external origin, a new runtime
  requirement, a new env var with platform-specific semantics) MUST
  update [docs/PLATFORM-ASSUMPTIONS.md](docs/PLATFORM-ASSUMPTIONS.md)
  in the same commit. Orchestrators check this during executor
  handoff review. Migration to a new compute platform reads that
  doc as the primary checklist.
- **Legal copy stays synced with the umbrella.** `https://www.mortensenapps.com/privacy`
  + `https://www.mortensenapps.com/terms` are the **canonical legal
  source** and the URLs registered in the shared "Mortensen Apps" OAuth
  consent screen that Tutoring Notes uses (confirmed from Google Cloud
  Console 2026-05-17). The mortensenapps.com site repo has the
  verification-round history. The product's `/privacy` and `/terms` are
  **local subordinate facades** that supplement the umbrella with
  product-specific sections (Vercel Blob audio, OpenAI Whisper,
  whiteboard data, minor-data tutor-consent specifics); they are not a
  parallel canonical source and are not registered with Google for this
  OAuth client. Any change to either TSX file MUST follow the sync
  protocol in [docs/LEGAL-SYNC.md](docs/LEGAL-SYNC.md): identify whether
  the edited section is umbrella-derived (must match upstream verbatim)
  or product-specific (free to edit), update the top-of-file sync date
  and the in-UI "Last updated" string, and update the doc's
  classification tables if the section changed type. Quarterly drift
  review applies — re-confirm the OAuth consent screen URLs as part of
  the review.
- **This repo (`tutoring-notes`) — feature branches: commit + push by default.** After substantive work on a named branch here, create a descriptive commit and push (`origin`; retry transient network failures) unless Andrew says to hold off. (Scope is this app only, not every workspace.)
- **Executor bootstrappers AND orchestrator reports live in `docs/handoff/`** — when the orchestrator drafts a briefing for a fresh executor chat, write it as `docs/handoff/<scope>-bootstrapper.md`; when the orchestrator captures session retrospectives for a future orchestrator picking up, write it as `docs/handoff/<scope>-<date>-orchestrator-report.md`. Both go here, not `~/.cursor/plans/`. Two reasons: (a) Cursor's chat UI only resolves workspace-relative file paths so in-workspace handoff docs are clickable, (b) committed handoff docs create an audit trail pairing "what we asked for" with "what shipped" (bootstrappers) and "what we did and decided" with "what's open" (orchestrator reports). **Bootstrappers must be pure executor briefings from line 1** with the required top-of-file template. **Both bootstrappers AND orchestrator reports should be Composer-2.5-authored via subagent dispatch** when length > ~3 paragraphs — Opus supplies the scope blob and structural outline; Composer types the prose. See `docs/handoff/README.md` for both templates + full lifecycle.
- **Orchestrator state checkpoints — keep a fresh-chat bootstrap current.** When the current orchestrator chat shows signs of truncation/slowdown **or** on user request, the orchestrator dispatches Composer 2.5 to write `docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` using the template at [`docs/handoff/orchestrator-state-template.md`](docs/handoff/orchestrator-state-template.md). Timestamp is Mountain time (UTC-6). The next orchestrator chat opens with that state file `@`-referenced as bootstrap context — pre-loaded with project arc, current wave focus, uncommitted state, in-flight subagents, open Andrew-confirms, recent architectural decisions, and a reading list. State files are versioned per checkpoint (not overwritten); old ones stay as audit trail without SUPERSEDED headers. **Authoring tier:** Composer 2.5 always (Opus provides the scope blob; Composer types the prose). Do not write the state file as Opus tool calls inline — that is the cost discipline this rule addresses.
- **Chat output links use workspace-relative paths only.** Cursor's chat UI clickably resolves paths like `docs/BACKLOG.md` and `src/lib/ai.ts` but renders absolute paths (`c:/Users/...`, `/Users/...`) and `file://` URIs as plain unclickable text, breaking Andrew's workflow. Same rule applies inside any `docs/handoff/*.md` since those files are designed to be `@`-referenced in fresh chats. When citing a file, always use the workspace-relative form.
- **Windows PowerShell: multi-line commit messages via temp file, not `-m`.** PowerShell 5.x (the default on Win10/11 without an explicit pwsh install — Andrew's setup) mangles multi-line strings, Unicode escape sequences (`\u2014`), and backtick-escaped characters when passed to `git commit -m "..."`. Safe pattern: Write the message to `.git/COMMIT_MSG_DRAFT.txt`, then `git commit -F .git/COMMIT_MSG_DRAFT.txt`, then delete the temp file in a **sequential** subsequent call (NOT a parallel tool call — a parallel `Delete` races the `commit` and the file vanishes before git reads it; this has bitten us).

## When picking up work mid-feature

1. Read the feature's `*-STATUS.md` first. Find the phase status table.
2. Read the `~/.cursor/plans/*.plan.md` for the feature if it exists.
3. Re-run the test suite (`npx jest`) to know your baseline before
   making changes.
4. Update the STATUS doc as you finish each sub-phase.

## Model usage protocol (provisional, captured 2026-05-18 post-Composer-2.5-launch, refined same day after discovering Task-tool per-subagent model selection)

Cost discipline matters because Opus on-demand burn was a non-trivial
line item even before this pilot started charging anyone. Composer 2.5
(released 2026-05-18) is ~30x cheaper per token than Opus 4.7 at the
Standard tier, ~5x cheaper at the Fast tier, and demonstrated
production-grade quality on this codebase the day it launched (security
audit Tier A, commits `5aa16f9` + `8cdbe58` — see "Real-world
observations" below).

**Default execution path: inline subagent dispatch from the Opus
orchestration chat.** When orchestration decides a task needs doing,
the default is `Task(model="composer-2.5", prompt="<scope blob>")`
from the Opus chat itself — NOT a separately-spawned Composer chat
that Andrew has to context-switch into. Andrew stays in the
orchestration chat; subagent runs foreground or background; results
report back inline. This collapses the prior "Andrew switches between
chats" friction to "Opus dispatches; Andrew sees results in flow."

- **Executor work**: `subagent_type="generalPurpose"`,
  `model="composer-2.5"`. The dispatch prompt carries the scope blob
  the orchestrator would have otherwise asked Andrew to paste into a
  new chat.
- **Investigation** (read N files to understand a thing):
  `subagent_type="explore"`, `model="composer-2.5"`. Readonly, cheap,
  returns a focused summary instead of consuming Opus tokens on file
  reads.
- **Large-diff adversarial review or 5-axis reliability checks**:
  `model="claude-4.6-sonnet-medium-thinking"`.
- **Long-running execution**: `run_in_background=true`. Opus keeps
  orchestrating in parallel; system notifies on completion.

**Bootstrappers (`docs/handoff/*-bootstrapper.md`) are now usually
unnecessary.** They were an artifact from when subagent context had
to be hand-curated via paste-blob into fresh chats. With inline
dispatch, the dispatch prompt IS the scope blob. Write a bootstrapper
only when: (a) the work is novel architecture where Opus is doing the
design pass and the bootstrapper IS the design artifact worth
committing for audit trail (the "Opus designs, Composer ships"
pattern below); (b) the work will be re-run via `best-of-n-runner`
subagent type; (c) async handoff across days/weeks where the spec
needs to be durable memory. Otherwise: dispatch with a scope-blob
prompt and skip the file.

**Tier assignment** (which model to dispatch — escalate only on the
criteria in the next subsection):

- **Composer 2.5** is the default. Use for executor work, spike
  chats, code review, security audits, cleanup passes, and most
  refactor + feature work where the pattern is clear from prior
  similar work in the repo.

- **Sonnet** when more than Composer is needed but Opus is overkill:
  novel architecture that fits in ~half-day design, cross-cutting
  changes needing broader context than a single feature, code review
  of large diffs where subtle issues (concurrency, auth boundaries)
  might be missed, 5-axis adversarial reliability reviews.

- **Opus reserved for orchestration only**:
  - Phase planning + sequencing (this chat-style orchestration
    session).
  - Cross-cutting design decisions that span multiple phases
    (e.g. introducing the FSM/outbox/atomic end-session three-pillar
    pattern back in Phase 1).
  - Multi-day novel architecture where wrong design = days of
    unwinding.
  - Strategic decisions (Vercel Pro upgrade, when to merge, when to
    defer a phase, brand resumption gating).
  - Synthesizing results from multiple subagents back to Andrew.
  - Tiny in-chat doc commits where dispatch overhead > task cost
    (≤5 tool calls AND docs-only AND single coherent thought
    already loaded).

**Escalation criteria** — what triggers moving up a tier:

- Composer 2.5 → Sonnet: the work surface has any of (a) auth-boundary
  or ownership-assertion change, (b) concurrency or race-condition
  reasoning, (c) cross-cutting refactor affecting >3 phases of code,
  (d) a feature plan where the 5-axis reliability review has not yet
  been done.
- Sonnet → Opus: the work is (a) introducing a new architectural
  pillar to the recorder lifecycle / outbox / sync layer (Pillar
  language from RECORDER-LIFECYCLE.md), (b) revisiting a design
  decision that has already cost us a recovery cycle in pilot, (c)
  multi-day with high blast radius (Phase 4 series, Phase 1
  outbox/FSM work, Phase 11d prompt iteration meta-loop), or (d)
  determining the shape of a future Phase that doesn't yet have a
  scope.

**Proven patterns** — combine tiers when it pays off:

- **"Opus dispatches inline"** (default since 2026-05-18 refinement).
  Opus chat dispatches Composer 2.5 subagents for execution,
  `explore` subagents for investigation, Sonnet subagents for
  adversarial review. Andrew stays in one chat. The dispatch prompt
  carries the scope. This very revision was committed via this
  pattern as the inaugural demonstration.
- **"Opus designs, Composer ships"** (validated 2026-05-17 PDF
  feature + per-page view state). Opus does the design pass + writes
  a bootstrapper as the design artifact; Composer 2.5 executes via
  subagent dispatch with the bootstrapper @-referenced or paste-
  blobbed in the prompt. Optimal when the design is high-stakes
  (audit-trail value) and the execution is well-patterned.
- **"Composer designs and ships"** (validated 2026-05-18 security
  Tier A, commit `8cdbe58`). Composer 2.5 handles both spec and
  implementation in-chat or in a single subagent dispatch. Optimal
  when work is clearly scoped, has a definite acceptance criterion,
  and orchestrator has prior context to write a good dispatch
  prompt.

**What Opus should NOT do in-chat** (these are subagent-dispatch
candidates, not Opus tool calls):

- Reading code files to "understand a thing" → dispatch an `explore`
  subagent instead.
- Writing bootstrappers for well-patterned work → dispatch a
  Composer subagent to author (or skip the bootstrapper entirely
  per "Default execution path" above).
- Multi-step refactors, migrations, or feature implementation →
  dispatch a Composer subagent with a scope blob.
- Investigating failing CI checks → dispatch a `ci-investigator`
  subagent.

**Real-world observations** — what we've actually seen, updated when
evidence changes:

- **Composer 2.5 quality (2026-05-18, day-of-launch)**: production-grade
  on the security Tier A scope. Read 3 files to confirm 1 claim
  (`/forgot-password` enumeration safety); caught the silent
  `npm audit fix` no-op via `git diff --stat`; correctly diagnosed
  peer-dep conflict from the ERESOLVE warnings; held scope discipline
  on zod-validation generalization. Verified pre-push via tsc + eslint.
  Slightly verbose code comments but otherwise indistinguishable from
  Opus-class output for this scope.
- **Composer 2 fell short of marketing claims in practice** (Andrew,
  pilot history). Composer 2.5's marketing is similar in shape; treat
  this protocol as PROVISIONAL pending independent benchmark data and
  more multi-week observation of Composer 2.5 in real work.
- **What to watch for that would trigger protocol revision**: (a)
  complexity ceiling — work where Composer 2.5 silently produces
  mediocre work without obvious failure (rename to "default-with-
  caveats" if it appears); (b) reliability ceiling — instances where
  Composer 2.5 cuts corners on tests/lints/docs that an Opus pass
  would have caught; (c) debugging depth ceiling — issues where
  Composer 2.5 gives up at a layer Opus would have pushed through.
  Capture these as dated entries under "Real-world observations"
  when they occur.

**Cost discipline rule**: default to the cheapest tier that can do
the job. Default to inline subagent dispatch over in-chat Opus tool
calls. Escalate only when the cost of a wrong call (hours of
unwinding) > the marginal model cost (cents per Composer 2.5
subagent vs dollars per Opus chat).

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
