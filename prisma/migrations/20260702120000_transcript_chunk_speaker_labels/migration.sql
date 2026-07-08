-- AlterTable
ALTER TABLE "TranscriptChunk" ADD COLUMN     "speakerId" TEXT,
ADD COLUMN     "streamId" TEXT NOT NULL DEFAULT 'tutor:mic';

-- CreateIndex
CREATE INDEX "TranscriptChunk_sessionId_streamId_idx" ON "TranscriptChunk"("sessionId", "streamId");
