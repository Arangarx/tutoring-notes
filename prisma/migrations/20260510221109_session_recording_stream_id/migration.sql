-- Phase 1b — Pillar 2 (multi-stream recording lifecycle).
--
-- Adds a per-capture-stream identifier to SessionRecording so the
-- upload outbox + atomic end-session action can persist N parallel
-- streams (tutor mic today; Phase 4: + student mic(s) + future
-- video tracks) per WhiteboardSession.
--
-- See:
--   - prisma/schema.prisma (canonical model + field comment)
--   - src/lib/recording/upload-outbox.ts (Phase 1b outbox)
--   - src/lib/recording/lifecycle-machine.ts (Phase 1a FSM —
--     TUTOR_MIC_STREAM_ID / studentMicStreamId helpers)
--   - src/app/admin/students/[id]/whiteboard/actions.ts
--     (Phase 1b atomic endWhiteboardSession + register action)
--
-- Additive only:
--   - New `streamId` column defaults to `'tutor:mic'`. The default
--     backfills every existing SessionRecording row to the single
--     pre-Phase-1b capture stream, which matches the historical
--     mental model exactly (every old recording = one tutor mic
--     stream).
--   - New composite index supports per-stream lookups in the atomic
--     end-session transaction and Phase 6's multi-track transcribe
--     pipeline. The existing single-column `whiteboardSessionId`
--     index stays in place so queries that don't filter by streamId
--     keep their original plan.
--   - No DROP, no RENAME, no ALTER COLUMN losing data.
--
-- Idempotent (IF [NOT] EXISTS guards) so a re-deploy after a partial
-- migrate-with-retry retry is safe.

ALTER TABLE "SessionRecording"
    ADD COLUMN IF NOT EXISTS "streamId" TEXT NOT NULL DEFAULT 'tutor:mic';

CREATE INDEX IF NOT EXISTS "SessionRecording_whiteboardSessionId_streamId_idx"
    ON "SessionRecording"("whiteboardSessionId", "streamId");
