-- Additive (consent wave C4b, plan § 5). Four nullable columns, no defaults: every existing row stays
-- NULL and is never purged. Production apply needs Andrew's go.
ALTER TABLE "WhiteboardSession" ADD COLUMN "boardPurgeRequestedAt" TIMESTAMP(3);
ALTER TABLE "WhiteboardSession" ADD COLUMN "boardPurgeFirstPassAt" TIMESTAMP(3);
ALTER TABLE "WhiteboardSession" ADD COLUMN "boardPurgeAttemptedAt" TIMESTAMP(3);
ALTER TABLE "WhiteboardSession" ADD COLUMN "boardPurgedAt" TIMESTAMP(3);

CREATE INDEX "WhiteboardSession_boardPurgeRequestedAt_idx" ON "WhiteboardSession"("boardPurgeRequestedAt");
