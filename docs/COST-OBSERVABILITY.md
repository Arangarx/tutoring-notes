# Cost observability (Phase 9 early action)

## Purpose

The `CostEvent` table stores **server-side OpenAI usage** (Whisper transcription and GPT note structuring) so we can analyze spend per tutor, per student, and per session before the Phase 9 admin dashboard ships. Rows are written **best-effort**; logging failures must never affect transcription or note generation.

## Schema (summary)

- **kind**: `WHISPER_TRANSCRIPTION` | `GPT_NOTES_GENERATION` | `GPT_ASSESSMENT_EXTRACTION` (reserved for a future split call path).
- **model**: exact model id from the API (e.g. `whisper-1`, `gpt-4o-mini`).
- **Usage**: `inputTokens` / `outputTokens` (chat), `audioSeconds` (Whisper — from API-reported duration when present).
- **estimatedCostUsd**: optional; filled when `estimateCostUsd()` recognizes the model (see pricing constants in `src/lib/observability/cost-events.ts`).
- **Provenance**: optional FKs to `AdminUser`, `Student`, `SessionRecording`, `WhiteboardSession`.

## Call sites (where rows come from)

| Location | Operation |
|----------|-----------|
| `src/lib/transcribe.ts` | Each Whisper `audio.transcriptions.create` success (multi-part files log one row per API call). |
| `src/lib/ai.ts` | Each `chat.completions.create` success for session note JSON. |
| `src/app/admin/students/[id]/actions.ts` | Passes tutor/student (+ `sessionRecordingId`) into transcription and notes on the standard upload pipeline. |
| `src/app/admin/students/[id]/whiteboard/actions.ts` | Same for whiteboard-sourced audio + `whiteboardSessionId`. |

Utility: `logCostEvent()` in `src/lib/observability/cost-events.ts`. Logs use prefix **`cev=`** (see `AGENTS.md`).

## Example Prisma queries

```ts
// Spend by tutor in a date range (may include null adminUserId for legacy paths)
await db.costEvent.groupBy({
  by: ["adminUserId"],
  where: { createdAt: { gte: start, lte: end } },
  _sum: { estimatedCostUsd: true },
});

// Events for one student
await db.costEvent.findMany({
  where: { studentId, createdAt: { gte: start } },
  orderBy: { createdAt: "desc" },
});

// Attach to whiteboard session
await db.costEvent.findMany({ where: { whiteboardSessionId } });
```

## Out of scope (future)

- Vercel function duration / Edge billing
- Neon compute / storage
- Vercel Blob egress / storage
- Client-side or non-OpenAI model providers (until wired server-side)
