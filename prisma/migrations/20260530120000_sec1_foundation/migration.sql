-- SEC-1 Dispatch A: isTestAccount isolation + ImpersonationLog audit table
-- ADDITIVE ONLY: no DROP COLUMN, no data loss, no row deletes or updates.
--
-- Three changes:
--   1. Make "passwordHash" nullable so test accounts (and future
--      Google-OAuth-only admins) carry NULL instead of a sentinel value.
--      Existing rows are UNAFFECTED — they keep their real hashes.
--   2. Add "isTestAccount" column (DEFAULT false) — all existing rows
--      stay false (i.e. remain real admins) until explicitly updated via
--      a manual seed script (scripts/seed-admin-google.sql).
--   3. Create the ImpersonationLog table for the audit trail.
--
-- Blocker #5 audit: inspect this file to confirm additive safety.

-- 1. passwordHash: String → String?  (existing non-null rows unaffected)
ALTER TABLE "AdminUser" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- 2. isTestAccount: new column, default false (no existing row changes)
ALTER TABLE "AdminUser" ADD COLUMN "isTestAccount" BOOLEAN NOT NULL DEFAULT false;

-- 3. ImpersonationLog table (brand new — no pre-existing rows)
CREATE TABLE "ImpersonationLog" (
    "id"                  TEXT NOT NULL,
    "adminUserId"         TEXT NOT NULL,
    "impersonatedUserId"  TEXT NOT NULL,
    "startedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"             TIMESTAMP(3),
    "vercelDeploymentUrl" TEXT,

    CONSTRAINT "ImpersonationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImpersonationLog_adminUserId_startedAt_idx"
    ON "ImpersonationLog"("adminUserId", "startedAt");

CREATE INDEX "ImpersonationLog_impersonatedUserId_idx"
    ON "ImpersonationLog"("impersonatedUserId");

ALTER TABLE "ImpersonationLog"
    ADD CONSTRAINT "ImpersonationLog_adminUserId_fkey"
    FOREIGN KEY ("adminUserId")
    REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImpersonationLog"
    ADD CONSTRAINT "ImpersonationLog_impersonatedUserId_fkey"
    FOREIGN KEY ("impersonatedUserId")
    REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
