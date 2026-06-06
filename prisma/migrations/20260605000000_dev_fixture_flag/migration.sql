-- Dev-tools fixture flag (feat/admin-dev-dashboard)
-- ADDITIVE ONLY: adds isTestFixture column (default false) to the four
-- entities that the dev-tools dashboard can create/delete.
-- The delete path may ONLY touch rows where isTestFixture = true (hard guard
-- in the WHERE clause — physically incapable of deleting real users).
-- Enabled only when VERCEL_ENV != 'production' (env gate).

ALTER TABLE "AdminUser"      ADD COLUMN "isTestFixture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountHolder"  ADD COLUMN "isTestFixture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LearnerProfile" ADD COLUMN "isTestFixture" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Student"        ADD COLUMN "isTestFixture" BOOLEAN NOT NULL DEFAULT false;
