-- Cost observability: OpenAI usage rows (additive only).

CREATE TYPE "CostEventKind" AS ENUM ('WHISPER_TRANSCRIPTION', 'GPT_NOTES_GENERATION', 'GPT_ASSESSMENT_EXTRACTION');

CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "kind" "CostEventKind" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "audioSeconds" DOUBLE PRECISION,
    "estimatedCostUsd" DECIMAL(10,6),
    "adminUserId" TEXT,
    "studentId" TEXT,
    "sessionRecordingId" TEXT,
    "whiteboardSessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CostEvent_kind_createdAt_idx" ON "CostEvent"("kind", "createdAt");
CREATE INDEX "CostEvent_adminUserId_createdAt_idx" ON "CostEvent"("adminUserId", "createdAt");
CREATE INDEX "CostEvent_studentId_createdAt_idx" ON "CostEvent"("studentId", "createdAt");
CREATE INDEX "CostEvent_createdAt_idx" ON "CostEvent"("createdAt");

ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_sessionRecordingId_fkey" FOREIGN KEY ("sessionRecordingId") REFERENCES "SessionRecording"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_whiteboardSessionId_fkey" FOREIGN KEY ("whiteboardSessionId") REFERENCES "WhiteboardSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
