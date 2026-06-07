-- Additive: sweep retry counter + updatedAt for stale-chunk detection.
ALTER TABLE "TranscriptChunk" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TranscriptChunk" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "TranscriptChunk_status_updatedAt_idx" ON "TranscriptChunk"("status", "updatedAt");
