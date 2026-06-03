-- IAC-2: Replace global Student.learnerProfileId @unique with @@unique([adminUserId, learnerProfileId])
-- IAC-7: Add AccountHolder.familyId + per-family LearnerCredential.accountHolderId + username uniqueness
-- IAC-5/8: Add LearnerProfile.isSelfLearner
-- IAC-6: Update LearnerProfile.accessMode default (enum value added in migration 20260602110000)
--
-- Additive changes: familyId column, isSelfLearner column, LearnerCredential.accountHolderId column.
-- Non-additive changes:
--   (A) Student.learnerProfileId: drop global @unique, add @@unique([adminUserId, learnerProfileId])
--   (B) LearnerCredential.username: drop global @unique, add @@unique([accountHolderId, username])
--
-- Both non-additive tables (LearnerCredential, and the new multi-tutor Student constraint) are
-- empty in production; the constraint swap is safe.

-- ============================================================
-- 1. IAC-7: Add AccountHolder.familyId (globally unique, nullable, lazily set)
-- ============================================================
ALTER TABLE "AccountHolder" ADD COLUMN IF NOT EXISTS "familyId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "AccountHolder_familyId_key" ON "AccountHolder"("familyId");
CREATE INDEX IF NOT EXISTS "AccountHolder_familyId_idx" ON "AccountHolder"("familyId");

-- ============================================================
-- 2. IAC-5/8: Add LearnerProfile.isSelfLearner
-- ============================================================
ALTER TABLE "LearnerProfile" ADD COLUMN IF NOT EXISTS "isSelfLearner" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 3. IAC-6: Update LearnerProfile.accessMode default to account_holder_session
--    (enum value 'account_holder_session' was committed in migration 20260602110000)
-- ============================================================
ALTER TABLE "LearnerProfile" ALTER COLUMN "accessMode" SET DEFAULT 'account_holder_session';

-- ============================================================
-- 4. IAC-2 (non-additive): Replace Student.learnerProfileId global @unique
--    with @@unique([adminUserId, learnerProfileId])
-- ============================================================
-- Drop the old global unique constraint (if it exists — may be absent on fresh DBs)
DROP INDEX IF EXISTS "Student_learnerProfileId_key";

-- Add the new per-tutor composite unique.
-- NULL adminUserId or NULL learnerProfileId are excluded from uniqueness by Postgres NULL semantics.
CREATE UNIQUE INDEX IF NOT EXISTS "Student_adminUserId_learnerProfileId_key"
  ON "Student"("adminUserId", "learnerProfileId");

-- ============================================================
-- 5. IAC-7 (non-additive): Add LearnerCredential.accountHolderId
--    and change username uniqueness to per-family
-- ============================================================
-- 5a. Add accountHolderId column (nullable first; backfill; then make NOT NULL)
ALTER TABLE "LearnerCredential" ADD COLUMN IF NOT EXISTS "accountHolderId" TEXT;

-- 5b. Backfill accountHolderId from the related LearnerProfile (no-op on empty table)
UPDATE "LearnerCredential" lc
SET "accountHolderId" = lp."accountHolderId"
FROM "LearnerProfile" lp
WHERE lc."learnerProfileId" = lp."id"
  AND lc."accountHolderId" IS NULL;

-- 5c. Make non-nullable (table is empty in production; safe to do immediately after backfill)
ALTER TABLE "LearnerCredential" ALTER COLUMN "accountHolderId" SET NOT NULL;

-- 5d. Drop old global username unique index
DROP INDEX IF EXISTS "LearnerCredential_username_key";

-- 5e. Add FK constraint to AccountHolder
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'LearnerCredential_accountHolderId_fkey'
  ) THEN
    ALTER TABLE "LearnerCredential"
      ADD CONSTRAINT "LearnerCredential_accountHolderId_fkey"
      FOREIGN KEY ("accountHolderId")
      REFERENCES "AccountHolder"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

-- 5f. Add per-family composite unique index
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerCredential_accountHolderId_username_key"
  ON "LearnerCredential"("accountHolderId", "username");
