# Orchestrator state — template

## Purpose

A durable bootstrap doc for a **fresh orchestrator chat** (typically Opus). The current orchestrator writes one whenever (a) the chat shows signs of truncation or slowdown, (b) the user requests one, or (c) at any major checkpoint (architecture decision committed, wave transition, pilot session captured). The next orchestrator opens a fresh chat with the latest instance `@`-referenced as bootstrap context — not a transcript replay, but a compressed operational snapshot.

## When to write

- At signs of current chat slowness (turn latency growing, tool-call hesitation, drift on prior context).
- On explicit user request.
- At major checkpoint (architecture decision committed, wave transition, pilot session captured).
- **Authoring tier:** dispatch Composer 2.5 `generalPurpose` to author from a scope blob the current orchestrator provides. Do **not** have Opus type the prose itself (per `.cursor/rules/orchestrator-discipline.mdc`).

## Filing convention

`docs/handoff/orchestrator-state-<YYYY-MM-DD>-<HHMM>.md` — timestamp in **Mountain time (UTC-6)**, Andrew's local. Versioned per checkpoint; **never overwrite** a prior instance.

## Required sections

Instance docs must include these headers (populate; do not leave as placeholders):

### `## Project arc + North Star`

Pilot stage, North Star quote (link to `AGENTS.md`), reliability bar reference.

*Example:* Pre-public pilot with one tutor; North Star from `AGENTS.md`; 5-axis bar at `../../agenticPipeline/.cursor/rules/reliability-bar.mdc`.

### `## Current Wave focus`

Which wave(s) of `docs/RELEASE-ROADMAP.md` are active or imminent.

*Example:* Wave 1 reliability floor in flight; Wave 2.5 session-log greenfield ratified; Wave 3 brand/UX breaking redesign next.

### `## Latest committed state`

Most recent commit hash + one-line summary. Mental model: `git log -1` on `master` (or the branch the orchestrator is tracking).

*Example:* `c75e946` — `docs: Sarah pilot capture + brand correction`.

### `## Uncommitted in working tree`

Files modified/created/deleted since the latest commit, **grouped by purpose**. Note **why** each group is uncommitted (awaiting review, awaiting decision, subagent in flight).

*Example:* Group A doc-cleanup (awaiting Andrew review); Group B redesign (awaiting review); Group C morning-cleanup (in flight).

### `## In-flight subagents`

Any background subagents currently running: scope, model tier, subagent ID if known, ETA.

*Example:* Morning cleanup (Composer 2.5, `5a6627b5-…`, ETA 10 min).

### `## Open decisions awaiting Andrew`

Table or bullets: decision name | what it gates | recommendation (if any).

### `## Recent architectural decisions`

What was ratified in the last few turns of the prior chat. Cross-link source docs; do not re-derive full specs here.

### `## Pilot context (most recent)`

Last pilot capture doc, key takeaways, outstanding follow-ups for the next Sarah thread.

### `## Queued dispatches`

What's been planned but not yet kicked off, **in order**.

### `## Bootstrap reading list`

Literal "if you're a fresh orchestrator chat, read these in this order" list. Workspace-relative paths only (clickable in Cursor chat).

### `## Open questions still in flight`

Anything the prior chat surfaced but did not resolve.

## What NOT to put in the instance

- Do **not** duplicate canonical doc content; cross-link instead.
- Do **not** include verbatim chat history; summarize state, not transcript.
- Do **not** leak credentials or environment secrets.

## Lifecycle

1. The fresh orchestrator chat reads the latest `orchestrator-state-*.md` **first** (before dispatching work).
2. As that chat ages, it can supersede by writing a new `orchestrator-state-<later-date>-<HHMM>.md` once slowness appears or at the next checkpoint.
3. Old state files stay in the repo as audit trail. No `SUPERSEDED` headers — they are per-checkpoint snapshots, not stale plans.
