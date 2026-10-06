-- Additive only. Org + QoL branch: strict claim-invite target, schedule→whiteboard
-- bridge, server-held live key. Every new column is nullable; no backfill.

-- CreateEnum
CREATE TYPE "ClaimInviteTargetKind" AS ENUM ('self_learner', 'child_learner');

-- AlterTable
ALTER TABLE "StudentClaimInvite" ADD COLUMN "intendedEmail" TEXT,
ADD COLUMN "inviteTargetKind" "ClaimInviteTargetKind";

-- AlterTable
ALTER TABLE "WhiteboardSession" ADD COLUMN "scheduledSessionId" TEXT,
ADD COLUMN "liveKeyEnc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhiteboardSession_scheduledSessionId_key" ON "WhiteboardSession"("scheduledSessionId");

-- AddForeignKey
ALTER TABLE "WhiteboardSession" ADD CONSTRAINT "WhiteboardSession_scheduledSessionId_fkey" FOREIGN KEY ("scheduledSessionId") REFERENCES "ScheduledSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
