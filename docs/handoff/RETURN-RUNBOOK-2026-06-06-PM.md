# Return runbook — 2026-06-06 PM

**Branch:** `v1-redesign` @ [`68086c4`](https://github.com/Arangarx/tutoring-notes/commit/68086c4c8d89e6c34e5ee8b3b51fda9f511f501a)  
**Context:** Autonomous build window while you were away. Single doc for what shipped, how to smoke it, and what you need to decide.

**Orchestrator state:** [`ORCHESTRATOR-STATE.md`](ORCHESTRATOR-STATE.md) (🏗️ BUILD PROGRESS block)  
**Design refs:** [`recording-rearchitecture-design-2026-06-05.md`](recording-rearchitecture-design-2026-06-05.md) · [`cost-observability-design-2026-06-06.md`](cost-observability-design-2026-06-06.md)

---

## TL;DR

| Track | Branch / merge | SHA | What it does |
|---|---|---|---|
| Recording P1 slice 1 (schema) | `feat/recording-p1-schema` → `83870a3` | [`6abbc30`](https://github.com/Arangarx/tutoring-notes/commit/6abbc30) | Additive `TranscriptChunk` / `TranscriptChunkExtraction` / `TutorNote` + store scaffolding. **Zero runtime change.** |
| Cost-obs P1 | `feature/cost-observability-phase1` → `83870a3` | [`b040276`](https://github.com/Arangarx/tutoring-notes/commit/b040276) | `rate-card.ts`, `cev` v2, `/admin/cost` dashboard (ADMIN-only). |
| Slice 2a (backend pipeline) | → `359bd16` | [`795cea8`](https://github.com/Arangarx/tutoring-notes/commit/795cea8) | `transcribe-chunk.ts` (`gpt-4o-mini-transcribe` + `whisper-1` fallback), idempotent worker, queue-consumer route, cost events. |
| Slice 2b (producer wedge) | → `758230f` | [`9c08b14`](https://github.com/Arangarx/tutoring-notes/commit/9c08b14) | `enqueueChunkTranscriptionAction` + fire-and-forget wire in `onWorkspaceAudioRecorded`. **Activates pipeline at runtime.** |

**Headline:** The during-session transcription pipeline is **built and functional** via a **direct-invocation stub** ([`chunk-transcribe-enqueue.ts`](../src/lib/recording/chunk-transcribe-enqueue.ts) runs the worker inline, fire-and-forget). Transcripts land in `TranscriptChunk` but are **not shown in any tutor UI yet** (slice 3 consumes them).

**Your queue:** **2 decisions** + **1 prerequisite** (Neon migrations) before meaningful smoke. **Slice 3 deliberately not started** — gated on your picks.

---

## ⚠️ PREREQUISITE — Step 0 (before ANY smoke)

All Vercel previews share **one** preview Neon DB. Migrations do **not** auto-apply until master cutover. These two are **not on preview yet** (DDL is greenlight-gated):

| Migration folder | Creates / alters |
|---|---|
| [`prisma/migrations/20260606000000_cost_event_v2/`](../prisma/migrations/20260606000000_cost_event_v2/migration.sql) | `CostEvent` v2 cols + 4 new `CostEventKind` enum values |
| [`prisma/migrations/20260606120000_recording_p1_schema/`](../prisma/migrations/20260606120000_recording_p1_schema/migration.sql) | `TranscriptChunk`, `TranscriptChunkExtraction`, `TutorNote` |

**Both** `/admin/cost` **and** the transcription-pipeline smoke **require these applied to the preview DB first.**

Apply via Neon MCP / console (`prisma migrate deploy` against preview connection) — **say "go" for DDL** per MCP write-safety. Local dev DB already has them.

---

## Smoke script

**Preview:** [Vercel project — tutoring-notes](https://vercel.com/arangarx-5209s-projects/tutoring-notes) → `v1-redesign` deployment (branch alias `tutoring-notes-git-v1-redesign-…`).

**Accounts:** `arangarx@gmail.com` = **ADMIN/operator** (cost dashboard). `arangarx@hotmail.com` = **TUTOR** (whiteboard session). Tutor in Chrome; student in Edge, same device (standard methodology).

### 1. Cost observability — `/admin/cost`

1. Log in as **`arangarx@gmail.com`** (ADMIN).
2. Open **`/admin/cost`**.
3. **Expect:** Summary cards, by-source / by-tutor breakdowns, monthly bars, rate-card staleness banner, pricing-floor anchor (~$0.36/60 min on whisper-1 basis), per-session drill-down links.
4. **Expect NOT:** Any tutor-facing cost UI anywhere in the app.

### 2. Transcription pipeline — make-or-break ⭐

This is the **Q1 quality gate** — does `gpt-4o-mini-transcribe` produce good-enough text on your real tutoring audio?

1. Log in as **`arangarx@hotmail.com`** (TUTOR). Start a whiteboard session with mic enabled; speak realistically (background noise, normal mic, tutoring cadence) for **≥30–60 s**.
2. **Trigger ≥1 segment upload mid-session** (pick one):
   - **Easiest:** Toolbar **"Pause recording"** (`data-testid="wb-pause-recording"`) — calls `stopAndUpload("final")`, uploads segment, fires `enqueueChunkTranscriptionAction` via [`onWorkspaceAudioRecorded`](../src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardWorkspaceClient.tsx). Click **"Start recording"** again if continuing.
   - **Alt (dev/test seam):** Before starting recording, in browser console set `window.__SEGMENT_MAX_SECONDS_OVERRIDE = 6` (and optionally `__WARN_SEGMENT_SECONDS_OVERRIDE = 3`) per [`segment-policy.ts`](../src/lib/recording/segment-policy.ts) — rollover fires in ~6 s. **Non-prod only**; must be set before recorder mounts.
   - **Also valid:** End session after speaking — final segment uploads on end.
3. Note the **`whiteboardSessionId`** from the workspace URL (`…/whiteboard/<id>/workspace`).
4. **Confirm DB rows** (Neon SQL or Prisma Studio against preview DB):

```sql
SELECT id, status, "recordingTimeOffsetMs", "durationMs",
       LEFT(transcript, 300) AS transcript_preview, error, "transcribedAt"
FROM "TranscriptChunk"
WHERE "sessionId" = '<whiteboardSessionId>'
ORDER BY "recordingTimeOffsetMs";
```

5. **Expect:** ≥1 row with `status = 'done'`, non-empty `transcript`, `transcribedAt` set. Vercel function logs show `[txc] wbsid=<id> …` transitions (`pending` → `transcribing` → `done`).
6. **Inspect transcript quality** — read the full `transcript` column. Is it accurate enough on your messy real audio to trust for auto-notes? **This answer gates slice 3.**
7. **Expect NOT:** Transcripts visible in tutor UI (by design until slice 3).

**Pipeline note:** Worker runs **inline** today ([`enqueueChunkTranscribe`](../src/lib/recording/chunk-transcribe-enqueue.ts) → `processChunkTranscribeJob`). Transcription may take a few seconds after upload; refresh the SQL query if status is still `transcribing`.

---

## 🔵 DECISION #1 — Durable async transport (queue vs cron)

| Option | Status | Trade-off |
|---|---|---|
| **Vercel Queues** | **BETA** (`@vercel/queue`, `experimentalTriggers`, `queue/v2beta` in vercel.json) | Native at-least-once delivery; beta on critical path. Consumer route already exists: [`/api/queues/chunk-transcribe`](../src/app/api/queues/chunk-transcribe/route.ts). |
| **DB-as-queue + sweep** *(recommended)* | **GA** | `TranscriptChunk.status = 'pending'` is the durable queue. Keep immediate fire-and-forget attempt (what the stub does today) **plus** Vercel Cron and/or end-session sweep for stragglers (~≤60 s cron floor). No beta dependency. |

**Recommendation:** DB-as-queue + sweep. Document as capability-contract in [`PLATFORM-ASSUMPTIONS.md`](../PLATFORM-ASSUMPTIONS.md) if chosen.

**Your pick gates:** slice 3's notes trigger wiring + how transcription async retry is implemented. **Don't provision either until you decide.**

Reply: **"queue"** or **"cron/sweep"** (or hybrid).

---

## 🔵 DECISION #2 / GATE — Q1 transcript quality

After smoke §2, answer:

| Outcome | Path |
|---|---|
| **Yes** — mini-transcribe is good enough on realistic audio | Proceed slice 3 on **`gpt-4o-mini-transcribe`** primary. |
| **No** — quality fails on noise/kids/mediocre mic | Fall back to **`whisper-1`** as primary in the new pipeline ([`transcribe-chunk.ts`](../src/lib/recording/transcribe-chunk.ts) already has fallback wiring). |

**Slice 3 is gated on this.** Andrew's ratified caveat: verify on **real** audio, not benchmark WER alone.

---

## What's NEXT (gated — not started)

| Slice | Scope | Blocked on |
|---|---|---|
| **3 — Auto-notes + map-reduce** | Consumes `TranscriptChunk`; touches guarded `handleEndSession`; retires manual "Transcribe & generate notes" | Decisions #1 + #2 |
| **4 — Consolidation / play-as-one** | Server-side ffmpeg → one canonical blob; unified playback | Slice 3 + design doc |
| **5 — Forward-migration / cutover** | Sarah's tiny real dataset → new schema; prod cutover | Slices 3–4 |

Autonomous build **stopped here intentionally** — slice 3 on unresolved transport + unverified transcript quality = patchwork risk.

---

## Known non-regressions (don't chase)

| Item | Notes |
|---|---|
| `password-reset.test.ts` | Pre-existing strength-policy baseline |
| `auth.test.ts` | Test stubs `DATABASE_URL=file:./test.db` → Prisma rejects non-postgres; **test's own bug** |
| Parallel `jest` DB flakes | Shared `tutoring_notes_test` races — use `--runInBand` for DB suites |

Automated gates at merge: serial jest **1817/1819** (2 known above); slice 2a **29 tests**, slice 2b **14 tests** green.

---

## Quick links

- Morning runbook (earlier today): [`MORNING-SMOKE-RUNBOOK-2026-06-06.md`](MORNING-SMOKE-RUNBOOK-2026-06-06.md)
- v1 redesign tracker: [`v1-redesign-STATUS.md`](v1-redesign-STATUS.md)
