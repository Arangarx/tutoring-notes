# Morning runbook — 2026-06-07

**Branch:** `fix/transcription-blob-auth` (off `v1-redesign`, validated, **NOT merged**)  
**Context:** Overnight transcription fixes + E2E validation. One decision left before slice 3.

**Full detail:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (🏗️ BUILD PROGRESS block)  
**Supersedes:** [`RETURN-RUNBOOK-2026-06-06-PM.md`](RETURN-RUNBOOK-2026-06-06-PM.md) for the transcription smoke section (fixes + validation landed since that doc was written).

---

## TL;DR

| What | Status |
|---|---|
| Cost-obs `/admin/cost` | ✅ PASS (Andrew 2026-06-06 PM) |
| Transcription pipeline (403 auth + verbose_json) | ✅ Fixed + E2E-validated overnight |
| Q1 transcript quality (`gpt-4o-mini-transcribe`) | ✅ Looks PASS — pending your concurrence |
| **Decision left** | **#1 only — durable async transport** (queue vs cron/sweep) |
| **Your smoke** | Optional preview confirm (2 watch-items) or merge-and-verify |

---

## Validated overnight (low/no smoke needed)

### Transcription pipeline — fixed + E2E-validated

Two root-caused fixes on `fix/transcription-blob-auth`:

| Fix | SHA | What |
|---|---|---|
| Private blob auth | [`08d3d36`](https://github.com/Arangarx/tutoring-notes/commit/08d3d36) | Worker used unauthenticated `fetch()` on private Vercel Blob → 403; now `fetchPrivateBlobBytes` with Bearer token |
| `response_format` | [`8671f37`](https://github.com/Arangarx/tutoring-notes/commit/8671f37) | `gpt-4o-mini-transcribe` rejected `verbose_json` (400); primary path uses `json`; whisper-1 fallback keeps verbose_json |

**Orchestrator E2E validation** (no live session needed): ran `transcribeChunk` against the **real blob** from session `c7818b67` (the prior failed chunk's audio). Result: authenticated fetch OK (5,007,175 bytes, `audio/webm`); **`gpt-4o-mini-transcribe` primary, no fallback** → full transcript; chunk would be `status=done`.

**Q1 evidence (excerpt from validated transcript):** clean capture of a fast 2-voice math lesson — e.g. *"0.999 repeating equals one"*, *"one ninth in decimal form"*, and related fraction/decimal discussion. Quality looks sufficient to trust for auto-notes (slice 3).

### Cost observability

Already passed Andrew smoke 2026-06-06 PM — dashboard cards, breakdowns, staleness banner all present. No re-smoke needed unless you want a spot-check.

---

## What's left to smoke (your call — all quick)

The heavy lifting is done. Optional items only:

1. **OPTIONAL preview confirm** on a real session (or skip and merge-and-verify):
   - `durationMs` populates on the `TranscriptChunk` row (local validation had null because ffmpeg wasn't on PATH; Vercel bundles `ffmpeg-static`)
   - Cost-event row writes successfully (local FK-failed because the whiteboard-session row only exists on preview-dev, not local DB)
2. **Anything you want to re-confirm** — cost dashboard spot-check, transcript quality eyeball on a fresh session, etc.

If you're satisfied with the orchestrator E2E evidence, you can merge without a live session.

---

## Merge recommendation

**`fix/transcription-blob-auth` → `v1-redesign`** via `git merge --no-ff`.

Bundles **2 transcription fixes + 3 docs commits:**

| SHA | Summary |
|---|---|
| [`08d3d36`](https://github.com/Arangarx/tutoring-notes/commit/08d3d36) | fix(recording): authenticate private blob fetch in transcription worker |
| [`8671f37`](https://github.com/Arangarx/tutoring-notes/commit/8671f37) | fix(txc): use json response_format for gpt-4o-mini-transcribe |
| [`d27683a`](https://github.com/Arangarx/tutoring-notes/commit/d27683a) | docs: state head — smoke 2026-06-06 PM |
| [`60f1f4b`](https://github.com/Arangarx/tutoring-notes/commit/60f1f4b) | docs: capture Sarah 2026-06-06 live session pilot feedback |
| *(this commit)* | docs: morning runbook 2026-06-07 + state update |

Preview: [fix/transcription-blob-auth deployment](https://vercel.com/arangarx-5209s-projects/tutoring-notes) (branch alias `tutoring-notes-git-fix-transcrip-…`).

---

## Decision needed — durable async transport

**Slice 3 (auto-notes + map-reduce) is gated on this pick.**

| Option | Status | Trade-off |
|---|---|---|
| **Vercel Queues** | BETA (`@vercel/queue`, experimental triggers) | Native at-least-once delivery; beta dependency on the critical path |
| **DB-as-queue + sweep** *(recommended)* | GA | `TranscriptChunk.status = 'pending'` is the durable queue; keep today's immediate fire-and-forget attempt + Vercel Cron and/or end-session sweep for stragglers (~≤60 s cron floor) |

Reply: **"queue"** or **"cron/sweep"** (or hybrid). Don't provision either until you decide.

---

## New since last runbook — Sarah pilot feedback

Captured from Sarah's **2026-06-06 evening live session** (real production tutoring, Mac tutor + PC student):

- **2 real bugs:** Ctrl+Z undo broken; copy-link clipboard failure
- **Backlog items:** navigation/share-link UX, login confusion, UI debt (non-blocking per Sarah)

Full report: [`sarah-pilot-feedback-2026-06-06-orchestrator-report.md`](sarah-pilot-feedback-2026-06-06-orchestrator-report.md)  
Also updated: [`BACKLOG.md`](../BACKLOG.md), [`SARAH-CALL-PREP.md`](../SARAH-CALL-PREP.md)

---

## Quick links

- Orchestrator state: [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md)
- Prior return runbook (transcription section superseded): [`RETURN-RUNBOOK-2026-06-06-PM.md`](RETURN-RUNBOOK-2026-06-06-PM.md)
- Recording design: [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md)
- Cost-obs design: [`cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md)
