-- WS-K: Add live-reduce watermark to TutorNote.
-- lastReducedChunkCount: tracks how many done chunks were included in the last live reduce.
--   At End, if this matches total done chunks, the LLM call is skipped (fast-path).
-- lastLiveReduceAt: timestamp of last live reduce, used for time-based debounce.
-- Both fields are ADDITIVE — no existing data is modified.

ALTER TABLE "TutorNote" ADD COLUMN "lastReducedChunkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TutorNote" ADD COLUMN "lastLiveReduceAt" TIMESTAMP(3);
