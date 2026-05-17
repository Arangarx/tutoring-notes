# `docs/handoff/` — executor bootstrappers (audit pattern)

This folder holds **executor bootstrappers** that the orchestrator chat
hands to a fresh Composer chat to build a feature, fix a bug, or run a
spike. Each file is a self-contained briefing: workspace + path +
branch discipline, project context, read-first list, scope/commits,
smoke checklist, wrap-up + merge instructions, and stop conditions.

## Why commit them?

- **Audit pattern** — pairs the "what we asked for" with the "what
  shipped" (git history). When a feature surfaces a bug months later,
  the bootstrapper documents the original constraints + decisions, not
  just the resulting code.
- **Clickable from chat** — Cursor's chat UI only resolves
  workspace-relative paths; absolute paths and `file://` URIs silently
  fail. Keeping bootstrappers inside the workspace means the
  orchestrator can link to them in chat without forcing manual file
  navigation.
- **Pattern reuse** — a new bootstrapper for similar work can be
  drafted by adapting a prior one rather than starting from scratch.

## File contents convention — pure executor briefing, no orchestrator header

Bootstrappers in this folder are **pure executor briefings from line 1**.
No orchestrator-facing wrapper (no "copy below the rule line" notes, no
"don't include this header" instructions). The file works as either a
pasted blob OR a single `@`-reference in a fresh Composer chat —
Andrew's workflow can use whichever is faster.

**Required top-of-file structure**:

```markdown
# <Scope> — executor briefing (<phase-or-context>)

> **Recommended model: <Composer | Opus | Sonnet>** (<one-line rationale: why this model, what scope, what's well-patterned vs novel>). If you spawn this chat on a different model, that's fine, but <call out the obvious mismatch — e.g. "Opus is overkill" or "Composer may struggle with novel architecture">.
>
> **This file is your complete task briefing.** If you're seeing it because Andrew pasted its contents or `@`-referenced it at the start of a fresh Composer chat, your instructions are below — start by reading the AGENTS.md + the other files in the "Read first" section, then proceed through the deliverables in order. No further confirmation needed; begin work.

<the actual briefing body starts here — workspace discipline, branch discipline, project context, read-first, scope, smoke, wrap-up, stop conditions>
```

**Why all three elements**:

- **H1 title** — orients the executor (and Andrew's chat history) on what the work is.
- **Model recommendation blockquote** — Andrew sees it when opening the file before spawning the chat, so he picks the right model class. Composer for well-patterned work (~2-4 hr); Opus for novel architecture / cross-cutting design / >1 day scope; Sonnet for in-between. See master plan's "Model usage protocol" section for full guidance.
- **Briefing-intent blockquote** — disambiguates intent when the file arrives as an
  `@`-reference. Without it, the receiving agent may treat the file as
  "reference material the user wants me to know about" rather than "my
  complete task spec." With it, the agent immediately knows to execute,
  not just observe.

Anything else orchestrator-only (handoff notes, internal reasoning,
audit metadata) belongs in the chat that drafts the bootstrapper or in
the master plan, not in the bootstrapper file itself.

## Naming convention

`<scope>-bootstrapper.md` in kebab-case. Examples:

- `live-av-device-management-bootstrapper.md`
- `pdf-page-picker-and-per-page-boards-bootstrapper.md`
- `cost-event-logging-skeleton-bootstrapper.md`
- `phase-4d-bootstrapper.md` (sub-phase identifier when applicable)
- `spike-long-form-transcribe-smoke-bootstrapper.md` (`spike-` prefix
  for empirical-data-gathering chats, not feature builds)

## Lifecycle

1. **Drafted by orchestrator** when a piece of work is scoped for a
   fresh executor chat.
2. **Kicked off by Andrew** — copies the content into a fresh Composer
   chat. The bootstrapper is the entire briefing; no prior chat
   context is assumed.
3. **Executor runs** — branches, commits, pushes, reports back per the
   bootstrapper's wrap-up instructions.
4. **Smoked + merged** per the AGENTS.md merging convention.
5. **Bootstrapper stays in this folder** as audit record. The
   corresponding STATUS doc (e.g. `docs/PHASE-XXX-STATUS.md`) captures
   what actually shipped vs the original briefing.

## When NOT to use this folder

- **Master plan files** — those live in `~/.cursor/plans/` (Cursor's
  plan-management infrastructure manages naming + IDs).
- **STATUS docs** — those live directly under `docs/` (e.g.
  `docs/PHASE-4D-STATUS.md`).
- **Reference architecture docs** — those live directly under `docs/`
  (e.g. `docs/LIVE-AV.md`, `docs/RECORDER-LIFECYCLE.md`).
- **Backlog** — `docs/BACKLOG.md`.

This folder is specifically for the **orchestrator-to-executor
briefing artifacts**, nothing else.
