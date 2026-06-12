-- B1 tutor signup-waitlist — additive migration (never drops/renames columns)
-- Adds TutorApprovalStatus enum and three new columns to AdminUser.
-- Backfills ALL existing rows to APPROVED (grandfather existing tutors).
-- New signups land WAITLISTED via Prisma @default.

-- 1. Create the enum type
CREATE TYPE "TutorApprovalStatus" AS ENUM ('WAITLISTED', 'APPROVED');

-- 2. Add columns — nullable first so backfill can run before we add the NOT NULL default
ALTER TABLE "AdminUser"
  ADD COLUMN "approvalStatus" "TutorApprovalStatus",
  ADD COLUMN "approvedAt"      TIMESTAMP(3),
  ADD COLUMN "approvedByAdminId" TEXT;

-- 3. Grandfather ALL existing rows → APPROVED (safe: every existing tutor is a real, active user)
UPDATE "AdminUser"
   SET "approvalStatus" = 'APPROVED',
       "approvedAt"     = NOW()
 WHERE "approvalStatus" IS NULL;

-- 4. Lock in NOT NULL + default WAITLISTED for future rows
ALTER TABLE "AdminUser"
  ALTER COLUMN "approvalStatus" SET NOT NULL,
  ALTER COLUMN "approvalStatus" SET DEFAULT 'WAITLISTED';
