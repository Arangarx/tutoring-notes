-- BLOCKER B (Step 1b): soft-disable learner credential during erasure grace (Option A).
-- ADDITIVE ONLY: new column with safe default false.

ALTER TABLE "LearnerCredential" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
