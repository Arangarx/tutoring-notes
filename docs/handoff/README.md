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
