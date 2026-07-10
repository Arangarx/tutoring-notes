-- Session lifecycle + participant tracking (workstream 1)
-- ADDITIVE ONLY: new enums, WhiteboardSession columns, SessionParticipant table.
-- Legacy sessions are backfilled to ACTIVE with activatedAt = startedAt.

-- Step 1: enum types
CREATE TYPE "SessionPhase" AS ENUM ('PENDING', 'ACTIVE');
CREATE TYPE "SessionMode" AS ENUM ('LIVE', 'IN_PERSON');

-- Step 2: WhiteboardSession lifecycle columns
ALTER TABLE "WhiteboardSession" ADD COLUMN "sessionPhase" "SessionPhase" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "WhiteboardSession" ADD COLUMN "sessionMode" "SessionMode" NOT NULL DEFAULT 'LIVE';
ALTER TABLE "WhiteboardSession" ADD COLUMN "activatedAt" TIMESTAMP(3);

-- Step 3: backfill legacy rows (predate pending/active split — treat as ACTIVE)
UPDATE "WhiteboardSession"
SET "sessionPhase" = 'ACTIVE', "activatedAt" = "startedAt"
WHERE "endedAt" IS NOT NULL OR "startedAt" IS NOT NULL;

-- Step 4: SessionParticipant table
CREATE TABLE "SessionParticipant" (
    "id"                  TEXT NOT NULL,
    "whiteboardSessionId" TEXT NOT NULL,
    "learnerProfileId"    TEXT NOT NULL,
    "joinedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt"              TIMESTAMP(3),

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SessionParticipant_whiteboardSessionId_learnerProfileId_key"
    ON "SessionParticipant"("whiteboardSessionId", "learnerProfileId");

ALTER TABLE "SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_whiteboardSessionId_fkey"
    FOREIGN KEY ("whiteboardSessionId")
    REFERENCES "WhiteboardSession"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionParticipant"
    ADD CONSTRAINT "SessionParticipant_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
