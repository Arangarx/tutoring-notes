-- E1 learner/family right-to-erasure — additive schema migration
-- Creates ErasureJob table + ErasureScopeKind/ErasureJobStatus enums
-- Adds Student.erasedAt (M-4 durable erasure flag for route guards)
-- Partial unique index erasure_job_active_scope (B-8 — one active job per scope)
-- ADDITIVE ONLY: no existing columns/tables are modified or dropped.

-- Erasure scope kind enum
CREATE TYPE "ErasureScopeKind" AS ENUM ('learner_profile', 'account_holder');

-- Erasure job state machine enum (includes canceled for grace-window undo)
CREATE TYPE "ErasureJobStatus" AS ENUM (
    'requested',
    'blobs_purging',
    'db_scrubbing',
    'completed',
    'failed',
    'canceled'
);

-- Student.erasedAt — set during db_scrubbing; route guards check this (M-4)
ALTER TABLE "Student" ADD COLUMN "erasedAt" TIMESTAMP(3);

-- Resumable erasure job (scopeId is plain string — no FK to tombstoned targets)
CREATE TABLE "ErasureJob" (
    "id"                   TEXT NOT NULL,
    "scopeKind"            "ErasureScopeKind" NOT NULL,
    "scopeId"              TEXT NOT NULL,
    "status"               "ErasureJobStatus" NOT NULL DEFAULT 'requested',
    "requestedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedByPrincipal" TEXT NOT NULL,
    "purgeEligibleAt"      TIMESTAMP(3) NOT NULL,
    "blobInventoryJson"    JSONB,
    "blobsDeletedJson"     JSONB,
    "lastError"            TEXT,
    "completedAt"          TIMESTAMP(3),
    "canceledAt"           TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErasureJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ErasureJob_scopeKind_scopeId_idx"
    ON "ErasureJob"("scopeKind", "scopeId");

CREATE INDEX "ErasureJob_status_purgeEligibleAt_idx"
    ON "ErasureJob"("status", "purgeEligibleAt");

-- B-8: at most one in-flight erasure job per scope (completed/failed/canceled excluded)
CREATE UNIQUE INDEX "erasure_job_active_scope"
    ON "ErasureJob"("scopeKind", "scopeId")
    WHERE "status" NOT IN ('completed', 'failed', 'canceled');
