-- Recording re-arch Phase 1, Slice 1 — additive schema groundwork (zero behavior change).

-- CreateTable
CREATE TABLE "TranscriptChunk" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chunkBlobUrl" TEXT NOT NULL,
    "recordingTimeOffsetMs" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "transcript" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "transcribedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranscriptChunkExtraction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "topics" TEXT NOT NULL DEFAULT '[]',
    "studentQuestions" TEXT NOT NULL DEFAULT '[]',
    "corrections" TEXT NOT NULL DEFAULT '[]',
    "followUps" TEXT NOT NULL DEFAULT '[]',
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TranscriptChunkExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "content" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TranscriptChunk_sessionId_recordingTimeOffsetMs_idx" ON "TranscriptChunk"("sessionId", "recordingTimeOffsetMs");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptChunk_sessionId_chunkBlobUrl_key" ON "TranscriptChunk"("sessionId", "chunkBlobUrl");

-- CreateIndex
CREATE UNIQUE INDEX "TranscriptChunkExtraction_chunkId_key" ON "TranscriptChunkExtraction"("chunkId");

-- CreateIndex
CREATE INDEX "TranscriptChunkExtraction_sessionId_idx" ON "TranscriptChunkExtraction"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorNote_sessionId_key" ON "TutorNote"("sessionId");

-- AddForeignKey
ALTER TABLE "TranscriptChunk" ADD CONSTRAINT "TranscriptChunk_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhiteboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TranscriptChunkExtraction" ADD CONSTRAINT "TranscriptChunkExtraction_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "TranscriptChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorNote" ADD CONSTRAINT "TutorNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhiteboardSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
