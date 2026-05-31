-- SEC-1 follow-up: AdminRole enum + role column on AdminUser
-- Additive migration only — no DROP, no DELETE, no RENAME.
--
-- Two steps:
--   1. Create the AdminRole enum type.
--   2. Add the role column (DEFAULT 'TUTOR' — all existing rows land here safely).
--   3. Idempotent backfill: promote the single pilot admin to ADMIN.
--      Hardcoded email is intentional — mirrors scripts/seed-admin-google.sql
--      pattern; this is a one-time pilot bootstrap. Update if the operator
--      email changes before a second pilot admin is added.

-- Step 1: enum type
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'TUTOR');

-- Step 2: add role column; NOT NULL with DEFAULT covers all existing rows
ALTER TABLE "AdminUser" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'TUTOR';

-- Step 3: promote the operator account to ADMIN immediately so there is no
-- lockout window between migration apply and app restart on each branch.
-- This UPDATE is safe to replay (idempotent — SET role='ADMIN' WHERE already ADMIN is a no-op).
UPDATE "AdminUser" SET "role" = 'ADMIN' WHERE "email" = 'arangarx@gmail.com';
