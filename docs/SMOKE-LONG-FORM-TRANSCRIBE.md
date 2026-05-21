# Long-form transcribe (60–90 min) — Tier 1 smoke harness

> **Wave 1 BLOCKER-PROD** — validates Tier 1 parallel transcribe (`docs/PHASE-6-TIER-1-STATUS.md`, merge `5ccf1c7`) against the **Vercel Pro 300s Server Action ceiling** before Sarah relies on it for a real weekend session. Code shipped 2026-05-17; this smoke was deferred at merge time (`docs/BACKLOG.md` Recording item 5, `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md`).

**Audience:** Andrew (manual smoke on Preview or Production). Optional follow-up dispatch can add `scripts/smoke-long-form-transcribe.mjs` once a headless entry point exists — today the **only supported trigger** is the authenticated admin UI Server Action.

---

## 1. Purpose

This smoke proves that a **Sarah-scale session** (roughly **60–90 minutes** of tutor speech, possibly split into **2+ auto-rollover segments** at ~50 min each) can complete the full pipeline:

1. Audio already in **Vercel Blob** (uploaded from browser).
2. **`transcribeAndGenerateAction`** runs on Vercel with `maxDuration = 300` (`src/app/admin/students/[id]/page.tsx`).
3. **ffmpeg duration splits** + **inner (6) / outer (3) Whisper parallelism** finish inside the wall-clock budget.
4. **`CostEvent`** rows (`cev=`) accumulate with sane USD estimates.
5. Tutor receives a **non-empty English transcript** and structured note fields (or an explicit, actionable failure).

**Why BLOCKER-PROD:** Sarah's Apr 24 repro (50:01 + 20:13 segments) hit *"The server stopped responding before transcription finished"* on Hobby-era limits. Tier 1 mitigations are merged; **without this smoke we do not know whether 300s is enough** for 60–90 min on Preview/prod infra. Failure at ~300s ⇒ **Tier 2 background `TranscribeJob` queue** moves from Backlog into Wave 1 follow-up (Phase 6 task 2).

**Reliability axes touched:** server-side capture processing (Whisper/ffmpeg), observability (`rid=`, `cev=`), cross-platform parity only if you also run **S7** on iOS (`docs/PHASE-2-IOS-SMOKE-MATRIX.md`).

---

## 2. Pre-conditions

Check all before starting the clock.

| # | Requirement | How to verify |
|---|-------------|---------------|
| P1 | **Vercel Pro** active on the tutoring-notes project | Dashboard → Billing = Pro (not Hobby). Hobby silently caps Server Actions at **~60s** regardless of `maxDuration = 300` in code (`docs/PLATFORM-ASSUMPTIONS.md`). |
| P2 | Target deploy includes Tier 1 transcribe | `master` at or after merge `5ccf1c7` (or Preview built from that tip). |
| P3 | **`maxDuration = 300`** on student routes | Confirm in repo: `src/app/admin/students/[id]/page.tsx` and `src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/page.tsx`. |
| P4 | **`OPENAI_API_KEY`** set on target environment | AI panel enabled on student page; absent key = panel disabled (no crash). |
| P5 | **`BLOB_READ_WRITE_TOKEN`** set | Record/Upload tabs visible; client-direct upload path works. |
| P6 | **60–90 min audio fixture** ready (see §2.1) | Blob URL(s) you can pass into transcribe, or ability to record/upload on the target deploy. |
| P7 | Tutor account with **ownership** of a test student | Log in as admin; student row must pass `assertOwnsStudent`. |
| P8 | **Neon / DB access** (optional but recommended) | For candidate discovery + post-run `CostEvent` / `SessionRecording` checks. |

### 2.1 Audio fixture — three paths (pick one)

**There is no `transcribeStatus` column.** Progress is inferred from Vercel logs (`rid=`), UI state, and post-run DB fields: `SessionRecording.transcript`, `SessionRecording.durationSeconds`, plus new rows created during the run.

#### Path A — Reuse existing `SessionRecording` rows (preferred if data exists)

Model: **`SessionRecording`** (`prisma/schema.prisma`). Relevant fields: `id`, `blobUrl`, `mimeType`, `sizeBytes`, `durationSeconds`, `transcript`, `orderIndex`, `studentId`, `whiteboardSessionId`, `createdAt`.

**Neon SQL — single segments in the 60–90 min window:**

```sql
SELECT id,
       "studentId",
       "durationSeconds",
       "sizeBytes",
       "mimeType",
       LEFT("blobUrl", 80) AS blob_prefix,
       "createdAt"
FROM "SessionRecording"
WHERE "durationSeconds" BETWEEN 3600 AND 5400
  AND "blobUrl" IS NOT NULL
ORDER BY "createdAt" DESC
LIMIT 20;
```

**Neon SQL — multi-segment sessions totaling ~60–90 min** (Sarah Apr 24 shape: 50:01 + 20:13):

```sql
SELECT "studentId",
       "noteId",
       "whiteboardSessionId",
       COUNT(*) AS segment_count,
       SUM("durationSeconds") AS total_seconds,
       ARRAY_AGG(id ORDER BY "orderIndex", "createdAt") AS recording_ids,
       ARRAY_AGG("durationSeconds" ORDER BY "orderIndex", "createdAt") AS durations
FROM "SessionRecording"
WHERE "durationSeconds" IS NOT NULL
GROUP BY "studentId", "noteId", "whiteboardSessionId"
HAVING SUM("durationSeconds") BETWEEN 3600 AND 5400
ORDER BY MAX("createdAt") DESC
LIMIT 10;
```

**Important:** `transcribeAndGenerateAction` does **not** re-transcribe an existing row by `id`. It accepts **`{ blobUrl, mimeType }[]`** and **creates new `SessionRecording` rows** per invocation. For Path A, copy the **`blobUrl` + `mimeType`** from candidate rows into a fresh transcribe run (Upload tab or manual pending list — see §3).

#### Path B — Fresh long capture on target deploy

1. Open `/admin/students/<studentId>` on Preview or Production.
2. **Record** tab: speak continuously (or play looped speech into the mic) until **≥60 min** elapsed, allowing **auto-rollover** at ~50 min (`SEGMENT_MAX_SECONDS` in `src/lib/recording/segment-policy.ts`).
3. Stop; confirm segments appear in the pending list before transcribe.

Use Wi-Fi; keep the tab **foregrounded** on mobile (iOS background throttling — see iOS matrix).

#### Path C — Synthetic / concatenated file via Upload

When no DB rows exist:

1. Build a **60–75 min** English speech file (Voice Memos, Audacity, or ffmpeg concat of shorter clips).
2. **Upload** tab → client-direct Blob upload (`/api/upload/audio` token route).
3. For **multi-segment** smoke, upload **two** files (~50 min + ~20 min) to mirror Sarah's repro.

**ffmpeg concat sketch** (local machine; re-encode if codecs differ):

```bash
# files.txt: one path per line — file 'part1.m4a' etc.
ffmpeg -f concat -safe 0 -i files.txt -c copy long-session.m4a
```

Match **mime** the app expects: `audio/m4a`, `audio/webm`, etc. (`AiAssistPanel` payload uses each segment's `mimeType`).

---

## 3. Run procedure

### 3.1 Choose environment

| Target | When to use |
|--------|-------------|
| **Vercel Preview** | Primary — exercises real Server Action timeout + ffmpeg on serverless. |
| **Production** | Only after Preview passes; same config, real pilot data risk — use a **dedicated test student**. |

Record: deploy URL, git SHA (Vercel deployment detail), date/time (UTC).

### 3.2 Identify candidate session (optional pre-step)

- **SQL:** §2.1 queries in Neon console.
- **Admin UI:** No global "long recordings" list today — open the student who owns the rows from SQL, inspect saved notes / recording history if exposed on the student page.

### 3.3 Trigger transcription (canonical entry point)

| Step | Action |
|------|--------|
| 1 | Log in as tutor → navigate to **`/admin/students/<studentId>`**. |
| 2 | Scroll to **Auto-fill from session** (`AiAssistPanel`, `data-testid="ai-transcribe-btn"` on the primary button). |
| 3 | Ensure **Record** or **Upload** tab has **all segments** in the pending list (`PendingSegmentList`). Multi-segment: every `blobUrl` is included in one batch. |
| 4 | Click **Transcribe & generate notes**. |
| 5 | Start **wall-clock timer** at click (phone stopwatch or `console.time` in desktop devtools). |
| 6 | Leave tab open until success UI or error (do not navigate away mid-flight). |

**Server implementation:**

- **Action:** `transcribeAndGenerateAction(studentId, recordings[])` — `src/app/admin/students/[id]/actions.ts`.
- **Logs:** `[transcribeAndGenerateAction] rid=<uuid> … begin` → `ok` or `returned ok:false` / `invocation budget exceeded`.
- **Parallelism:** `[transcribe-parallel] rid=… outer-cap=3 segments=N` then per-part `inner-cap=6 parts=M`.
- **Not used for this smoke:** `generateNotesFromWhiteboardSessionAction` (whiteboard post-session path) — same Tier 1 stack but different UX; run separately if whiteboard-long-audio is in scope.

**Whiteboard-only long audio:** After a workspace session with audio segments registered, `WhiteboardNotesPanel` calls `generateNotesFromWhiteboardSessionAction(whiteboardSessionId)` — `src/app/admin/students/[id]/whiteboard/actions.ts`. Document separately if that path must pass; student-page smoke is the Sarah Record → Transcribe path.

### 3.4 Observe progress

#### A. Vercel Logs (strongest signal)

Filter the deployment logs around the run window:

| Pattern | Meaning |
|---------|---------|
| `[transcribeAndGenerateAction] rid=` | Action started / finished / budget exceeded |
| `[transcribe-parallel] rid=` | Outer segment parallelism |
| `[transcribe-parallel] … part=` | Inner Whisper chunk parallelism |
| `[transcribe-parallel] … retry attempt=` | 429/5xx backoff |
| `[cost-events] cev=` | Cost row persisted |
| `FUNCTION_INVOCATION_TIMEOUT` | Platform killed the function (~300s on Pro) |

Copy the **`rid=`** value from the UI **Ref:** line on failure (`formatUserFacingActionError`).

#### B. Browser UI

| Outcome | What you see |
|---------|----------------|
| Success | Form fields populate; may include yellow warning for skipped silent segments (`warningKind`: `skipped-only` / `ai-fallback`). |
| Timeout | `FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE` from `src/app/admin/students/[id]/transcribe-result.ts` **or** AiAssistPanel generic *"server stopped responding"* if the framework throws before the action returns. |
| Hallucination (all segments bad) | Mic troubleshooting message (`HALLUCINATION_MIC_MESSAGE` / silence guard). |

#### C. Database (after run)

**New rows** from this run (action always creates fresh `SessionRecording` rows):

```sql
-- Replace <rid-log-window> with approximate createdAt from your run
SELECT id, "durationSeconds", LENGTH(transcript) AS transcript_chars,
       "estimatedCostUsd", kind, model, "audioSeconds", "createdAt"
FROM "SessionRecording" sr
LEFT JOIN "CostEvent" ce ON ce."sessionRecordingId" = sr.id
WHERE sr."createdAt" > NOW() - INTERVAL '30 minutes'
  AND sr."studentId" = '<studentId>'
ORDER BY sr."createdAt" DESC, ce."createdAt";
```

```sql
SELECT id, kind, model, "audioSeconds", "estimatedCostUsd", "sessionRecordingId", "createdAt"
FROM "CostEvent"
WHERE kind = 'WHISPER_TRANSCRIPTION'
  AND "createdAt" > NOW() - INTERVAL '30 minutes'
ORDER BY "createdAt" DESC;
```

Expect **multiple** `WHISPER_TRANSCRIPTION` rows for long audio (one per ffmpeg part, not one per session).

### 3.5 Expected timing

| Phase | Rough budget (60 min audio, Tier 1) |
|-------|-------------------------------------|
| Blob metadata + download | ~5–15 s per segment |
| ffmpeg split per segment | ~10–40 s |
| Whisper (parallel parts) | ~2–4 min total (dominant) |
| GPT note structuring | ~10–20 s |
| **Total wall-clock** | **Target &lt; 240 s** (comfort margin under **300 s** hard ceiling) |

Multi-segment outer parallelism processes up to **3 segments at a time**; total time is not strictly `sum(segments)`.

---

## 4. Observation points (capture in notes)

Record these in the smoke run history (§8):

1. **Wall-clock seconds** — click → success or error.
2. **Segment count** and per-segment duration (pending list labels / DB `durationSeconds`).
3. **Vercel outcome** — completed vs `FUNCTION_INVOCATION_TIMEOUT` vs action returned `ok:false` with `debugId`.
4. **`rid=`** — from logs + UI Ref line.
5. **`[transcribe-parallel]`** — max `parts=N` (want **N &gt; 1** for long single-segment audio); `outer-cap=3 segments=S`.
6. **`CostEvent` sum** — `SUM(estimatedCostUsd)` for the run; row count ≈ Whisper part count.
7. **Transcript quality** — length, English-only, no CJK garbage, no obvious repetition loops, spot-check for silence-hallucination phrases ("thanks for watching", etc.).
8. **Segment order** — if multi-part, confirm Topics text reflects **Part 1 / Part 2** ordering.
9. **Skipped segments** — warning text if one segment was silent-filtered.
10. **Platform** — desktop Chrome vs iOS Safari if running paired iOS matrix **S7**.

---

## 5. Acceptance criteria

Smoke **passes** only if **all** of the following hold:

| # | Criterion |
|---|-----------|
| A1 | Server Action **returns** `ok: true` to the client (no uncaught framework throw). |
| A2 | **Wall-clock &lt; 300 s** on Vercel Pro Preview (ideally **&lt; 240 s** with margin). No `FUNCTION_INVOCATION_TIMEOUT` in logs. |
| A3 | **Transcript non-empty** — `SessionRecording.transcript` length ≫ 0 for every **kept** segment; concatenated content is **English** and tutoring-relevant (manual skim). |
| A4 | **No `transcribeStatus` field** — completion means rows exist with transcripts; UI shows populated note fields. |
| A5 | **`CostEvent` sanity** — total `estimatedCostUsd` for Whisper rows **&lt; $1.50** for 90 min audio. Pricing: `WHISPER_USD_PER_MINUTE = 0.006` in `src/lib/observability/cost-events.ts` → **90 min ≈ $0.54** nominal; $1.50 is a generous ceiling including multi-part overhead. |
| A6 | **Logs show Tier 1 parallelism** — for long single file: `parts=N` with **N &gt; 1**; for multi-segment: `segments=S` with **S ≥ 2** when testing Sarah-shaped input. |
| A7 | **No new error class** — failure modes match known strings (timeout, hallucination skip, DB hiccup retry); grep logs for novel stack traces. |

**Partial pass (investigate, do not call Wave 1 green):**

- Success but wall-clock **240–290 s** — Tier 2 queue still optional but prioritize before 90 min sessions.
- Success with **`ai-fallback` warning** — transcript OK, GPT structuring failed (separate from Whisper smoke).
- One segment skipped, others kept — valid per shipped semantics; note in history.

---

## 6. What to do if smoke fails

Decision tree — pick the first matching branch.

```
Smoke failed?
├─ Wall-clock ≥ ~290s OR FUNCTION_INVOCATION_TIMEOUT OR friendly timeout copy
│  └─► Tier 2 background TranscribeJob queue → Wave 1 follow-up (BACKLOG Phase 6 task 2).
│      Do NOT ask Sarah to rely on 90 min in-browser transcribe until re-smoke passes.
├─ Transcript garbage / wrong language / repetition loops (segment completes but text bad)
│  └─► Expedite Wave 1: Whisper pin `language: en` + repetition guardrail (BACKLOG / roadmap).
│      Re-smoke after ship; keep rid= + sample transcript in BACKLOG entry.
├─ OpenAI 401/429/5xx persistent after retries (logs: retry attempt= exhausted)
│  └─► Stop — fix API key / billing / rate limits before re-run.
├─ CostEvent sum >> $1.50 for ≤90 min
│  └─► Audit `estimateCostUsd` constants + duplicate part calls (unexpected N).
├─ ok:false "Could not reach audio file" / download failed
│  └─► Blob token / CDN — not Tier 1 parallelism; fix upload path first.
├─ All segments skipped (hallucination guard)
│  └─► Fixture had no real speech — fix audio, not Tier 2.
├─ iOS-only: "unexpected response" / no rid= in logs (Sarah historical)
│  └─► Run docs/PHASE-2-IOS-SMOKE-MATRIX.md S7; may be WebKit Server Action transport, not Whisper timeout.
└─ Desktop pass, iOS fail
   └─► Split BLOCKER: desktop Tier 1 OK, iOS transport BLOCKER-PROD.
```

**Do not modify `docs/BACKLOG.md` in the same session as this smoke** — append results here (§8), then a separate dispatch files BACKLOG rows with rid= + transcript excerpt.

---

## 7. How to record results

### 7.1 This document — Smoke run history

Append one block per run to **§8** below.

### 7.2 Optional git commit of results (Andrew)

When committing smoke outcomes, use the **PowerShell-safe** pattern from `AGENTS.md`:

1. Write message to `.git/COMMIT_MSG_DRAFT.txt`
2. `git commit -F .git/COMMIT_MSG_DRAFT.txt`
3. Delete the temp file in a **sequential** next step (parallel delete races git read)

### 7.3 Escalation

- **Pass** → tell orchestrator Wave 1 long-form row can clear; keep iOS S7 matrix separate.
- **Fail at 300s** → orchestrator re-sequences Tier 2 ahead of other Wave 1 polish.
- **Ambiguous** → attach Vercel log excerpt + `rid=` + SQL row counts.

---

## 8. Smoke run history

<!-- Append newest run at the bottom. Template: -->

<!--
### YYYY-MM-DD — &lt;Preview|Production&gt; — &lt;PASS|FAIL&gt;

| Field | Value |
|-------|-------|
| Deploy URL | |
| Git SHA | |
| Student ID | |
| Input | e.g. 2 segments 50:01 + 20:13 / single 72 min upload |
| Segment count | |
| Wall-clock (s) | |
| rid= | |
| Outcome | ok:true / error string |
| CostEvent USD sum | |
| Whisper part rows (count) | |
| Transcript chars (total) | |
| Notes | |

-->

*No runs recorded yet.*

---

## Appendix — Quick reference

| Item | Location |
|------|----------|
| Server Action | `src/app/admin/students/[id]/actions.ts` → `transcribeAndGenerateAction` |
| UI trigger | `src/app/admin/students/[id]/AiAssistPanel.tsx` → `handleGenerateFromAudio` |
| Timeout helpers | `src/app/admin/students/[id]/transcribe-result.ts` |
| Whisper + parallel | `src/lib/transcribe.ts`, `src/lib/transcribe-ffmpeg.ts` |
| Cost logging | `src/lib/observability/cost-events.ts` |
| Tier 1 status | `docs/PHASE-6-TIER-1-STATUS.md` |
| Platform ceiling | `docs/PLATFORM-ASSUMPTIONS.md` §1 |
| Prior handoff | `docs/handoff/long-form-transcribe-tier-1-orchestrator-report.md` |

**Companion script:** Not shipped in this artifact — `transcribeAndGenerateAction` requires an authenticated Next.js Server Action invocation; manual UI procedure above is canonical until a dedicated API or test-only route exists.
