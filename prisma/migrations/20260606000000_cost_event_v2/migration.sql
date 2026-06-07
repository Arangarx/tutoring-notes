-- CostEvent v2: additive columns + new CostEventKind values for full-stack cost observability.
-- See docs/handoff/cost-observability-design-2026-06-06.md §3.2

-- AlterEnum
ALTER TYPE "CostEventKind" ADD VALUE 'BLOB_STORAGE';
ALTER TYPE "CostEventKind" ADD VALUE 'BLOB_EGRESS';
ALTER TYPE "CostEventKind" ADD VALUE 'VERCEL_COMPUTE';
ALTER TYPE "CostEventKind" ADD VALUE 'NEON_COMPUTE';

-- AlterTable
ALTER TABLE "CostEvent"
  ADD COLUMN IF NOT EXISTS "bytesTransferred" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gbMonths" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "computeGbHr" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "rateCardVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "sessionId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CostEvent_whiteboardSessionId_createdAt_idx" ON "CostEvent"("whiteboardSessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "CostEvent_sessionId_createdAt_idx" ON "CostEvent"("sessionId", "createdAt");
