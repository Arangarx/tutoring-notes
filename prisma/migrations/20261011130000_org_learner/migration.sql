-- Stage 3 org learners. Additive. Do not run against Neon.
-- Student may have a tutor owner, an organization owner, or neither (env-admin).
-- Not both. ConsentRecord must have exactly one owner. Both-null is rejected there.
-- dailyInviteCap nulls are left alone. They stay unlimited.

ALTER TABLE "Student" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "Student"
  ADD CONSTRAINT "Student_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Student_organizationId_learnerProfileId_key"
  ON "Student"("organizationId", "learnerProfileId");

CREATE INDEX "Student_organizationId_idx" ON "Student"("organizationId");

ALTER TABLE "Student" ADD CONSTRAINT student_single_owner
  CHECK (NOT ("adminUserId" IS NOT NULL AND "organizationId" IS NOT NULL));

CREATE TABLE "OrganizationLearner" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "givenName" TEXT NOT NULL,
  "familyName" TEXT NOT NULL,
  "brief" TEXT NOT NULL DEFAULT '',
  "createdByAdminUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationLearner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationLearner_studentId_key" ON "OrganizationLearner"("studentId");
CREATE INDEX "OrganizationLearner_organizationId_idx" ON "OrganizationLearner"("organizationId");

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrganizationLearner"
  ADD CONSTRAINT "OrganizationLearner_createdByAdminUserId_fkey"
  FOREIGN KEY ("createdByAdminUserId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "dailyLearnerCap" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "dailyClaimEmailCap" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "statusChangedAt" TIMESTAMP(3);

UPDATE "Organization" SET "dailyLearnerCap" = 20 WHERE "dailyLearnerCap" IS NULL;
UPDATE "Organization" SET "dailyClaimEmailCap" = 30 WHERE "dailyClaimEmailCap" IS NULL;
UPDATE "Organization" SET "statusChangedAt" = "createdAt" WHERE "statusChangedAt" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "statusChangedAt" SET NOT NULL;
ALTER TABLE "Organization" ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ConsentRecord" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "ConsentRecord" ALTER COLUMN "adminUserId" DROP NOT NULL;

ALTER TABLE "ConsentRecord"
  ADD CONSTRAINT "ConsentRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentRecord" ADD CONSTRAINT consent_record_single_owner
  CHECK (
    ("adminUserId" IS NOT NULL AND "organizationId" IS NULL)
    OR
    ("adminUserId" IS NULL AND "organizationId" IS NOT NULL)
  );

-- The tutor unique index from 20260611010000 stays. It is an index, not a
-- table constraint, and null adminUserId does not collide in Postgres.
-- The partial indexes below are the org-or-tutor rule Prisma cannot express.

CREATE UNIQUE INDEX "ConsentRecord_tutor_version_key"
  ON "ConsentRecord" ("learnerProfileId", "adminUserId", "version")
  WHERE "adminUserId" IS NOT NULL;

CREATE UNIQUE INDEX "ConsentRecord_org_version_key"
  ON "ConsentRecord" ("learnerProfileId", "organizationId", "version")
  WHERE "organizationId" IS NOT NULL;

CREATE INDEX "ConsentRecord_learnerProfileId_organizationId_idx"
  ON "ConsentRecord"("learnerProfileId", "organizationId");

-- Version-1 consent for existing self-learner tutor links that have no record.
-- All four toggles true. setByAccountHolderId is the profile's account holder.
-- captureMethod presumed: not a ticked form. Org links do not exist yet.
INSERT INTO "ConsentRecord" (
  "id",
  "learnerProfileId",
  "adminUserId",
  "organizationId",
  "version",
  "allowLiveSession",
  "allowAudioRecording",
  "allowWhiteboardRecording",
  "allowNoteSending",
  "setByAccountHolderId",
  "captureMethod",
  "setAt"
)
SELECT
  gen_random_uuid()::text,
  lp."id",
  s."adminUserId",
  NULL,
  1,
  TRUE,
  TRUE,
  TRUE,
  TRUE,
  lp."accountHolderId",
  'presumed',
  CURRENT_TIMESTAMP
FROM "LearnerProfile" lp
JOIN "Student" s ON s."learnerProfileId" = lp."id"
WHERE lp."isSelfLearner" = TRUE
  AND lp."tombstonedAt" IS NULL
  AND s."adminUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ConsentRecord" cr
    WHERE cr."learnerProfileId" = lp."id"
      AND cr."adminUserId" = s."adminUserId"
  );
