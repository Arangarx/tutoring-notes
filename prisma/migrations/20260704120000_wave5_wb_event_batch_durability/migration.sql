-- AlterTable
ALTER TABLE "WhiteboardSession" ADD COLUMN     "lastPersistedBatchSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastPersistedToIndex" INTEGER NOT NULL DEFAULT -1;

-- CreateTable
CREATE TABLE "WhiteboardEventBatch" (
    "id" TEXT NOT NULL,
    "whiteboardSessionId" TEXT NOT NULL,
    "batchSeq" INTEGER NOT NULL,
    "fromEventIndex" INTEGER NOT NULL,
    "toEventIndex" INTEGER NOT NULL,
    "eventsJson" JSONB NOT NULL,
    "boardDocumentJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhiteboardEventBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhiteboardEventBatch_whiteboardSessionId_createdAt_idx" ON "WhiteboardEventBatch"("whiteboardSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "WhiteboardEventBatch_whiteboardSessionId_toEventIndex_idx" ON "WhiteboardEventBatch"("whiteboardSessionId", "toEventIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardEventBatch_whiteboardSessionId_batchSeq_key" ON "WhiteboardEventBatch"("whiteboardSessionId", "batchSeq");

-- CreateIndex
CREATE UNIQUE INDEX "SessionRecording_whiteboardSessionId_orderIndex_key" ON "SessionRecording"("whiteboardSessionId", "orderIndex");

-- AddForeignKey
ALTER TABLE "WhiteboardEventBatch" ADD CONSTRAINT "WhiteboardEventBatch_whiteboardSessionId_fkey" FOREIGN KEY ("whiteboardSessionId") REFERENCES "WhiteboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
