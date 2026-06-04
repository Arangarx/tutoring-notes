-- Add account_holder_session to LearnerAccessMode enum (IAC-6).
-- Must be in its own migration/transaction because PostgreSQL does not allow
-- using a newly-added enum value in the same transaction that added it.
-- Migration 20260602120000 uses this value and must run AFTER this one commits.

ALTER TYPE "LearnerAccessMode" ADD VALUE IF NOT EXISTS 'account_holder_session';
