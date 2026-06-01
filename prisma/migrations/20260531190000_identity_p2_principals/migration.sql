-- Identity Phase 2: Three-Principal Data Model Foundation
-- ADDITIVE ONLY: no DROP TABLE, no DROP COLUMN, no data loss, no row deletes or updates.
-- All new tables start empty; Student.learnerProfileId is NULL on all existing rows.
--
-- Three principals introduced:
--   1. AccountHolder  -- parent or self-learner (holds PII + billing relationship)
--   2. LearnerProfile -- a single learner identity under an AccountHolder (1..N)
--   3. Student        -- existing business record; gets nullable FK to LearnerProfile
--
-- Supporting models:
--   AccountHolderEmailToken  -- one-time email tokens (signup, password-reset, etc.)
--   LearnerCredential        -- PIN/password credential for learner login (optional)
--   LearnerDeviceSession     -- long-lived device session token for learner auth
--   StudentClaimInvite       -- tutor-minted invite for AccountHolder to claim a Student
--
-- Separation principle maintained: WhiteboardSession, SessionRecording, CostEvent,
-- SessionNote, etc. continue referencing Student by opaque id only.
--
-- MERGE NOTE (F12): The identity-p1-2fa branch (unmerged as of 2026-05-31)
-- introduces migration 20260531180000_admin_user_2fa. When both branches land
-- on v1-redesign, migration timestamps must remain monotonic. This migration
-- (20260531190000) is timestamped AFTER 20260531180000, so if identity-p1-2fa
-- merges to v1-redesign first, the ordering is correct. If identity-p2-schema
-- merges first, identity-p1-2fa's 20260531180000 would land out-of-order
-- relative to the applied history -- the orchestrator MUST reconcile timestamps
-- at merge time (bump identity-p1-2fa to 20260531200000 or similar, or merge
-- identity-p1-2fa first, then this branch).
--
-- Blocker audit: inspect this file to confirm additive safety.

-- 1. Enum: AccountHolderEmailTokenPurpose
CREATE TYPE "AccountHolderEmailTokenPurpose" AS ENUM (
    'SIGNUP_VERIFY',
    'PASSWORD_RESET',
    'EMAIL_CHANGE',
    'CRITICAL_ACTION'
);

-- 2. AccountHolder table
CREATE TABLE "AccountHolder" (
    "id"            TEXT         NOT NULL,
    "email"         TEXT         NOT NULL,
    "isSelfLearner" BOOLEAN      NOT NULL DEFAULT false,
    "tombstonedAt"  TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountHolder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountHolder_email_key" ON "AccountHolder"("email");
CREATE INDEX "AccountHolder_email_idx"        ON "AccountHolder"("email");

-- 3. AccountHolderEmailToken table
CREATE TABLE "AccountHolderEmailToken" (
    "id"              TEXT         NOT NULL,
    "accountHolderId" TEXT         NOT NULL,
    "tokenHash"       TEXT         NOT NULL,
    "purpose"         "AccountHolderEmailTokenPurpose" NOT NULL,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "consumedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountHolderEmailToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountHolderEmailToken_tokenHash_key"        ON "AccountHolderEmailToken"("tokenHash");
CREATE INDEX        "AccountHolderEmailToken_accountHolderId_idx"   ON "AccountHolderEmailToken"("accountHolderId");

ALTER TABLE "AccountHolderEmailToken"
    ADD CONSTRAINT "AccountHolderEmailToken_accountHolderId_fkey"
    FOREIGN KEY ("accountHolderId")
    REFERENCES "AccountHolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. LearnerProfile table
CREATE TABLE "LearnerProfile" (
    "id"              TEXT         NOT NULL,
    "accountHolderId" TEXT         NOT NULL,
    "displayName"     TEXT         NOT NULL,
    "tombstonedAt"    TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LearnerProfile_accountHolderId_idx" ON "LearnerProfile"("accountHolderId");

ALTER TABLE "LearnerProfile"
    ADD CONSTRAINT "LearnerProfile_accountHolderId_fkey"
    FOREIGN KEY ("accountHolderId")
    REFERENCES "AccountHolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. LearnerCredential table
CREATE TABLE "LearnerCredential" (
    "id"               TEXT         NOT NULL,
    "learnerProfileId" TEXT         NOT NULL,
    "username"         TEXT         NOT NULL,
    "secretHash"       TEXT         NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnerCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerCredential_learnerProfileId_key" ON "LearnerCredential"("learnerProfileId");
CREATE UNIQUE INDEX "LearnerCredential_username_key"         ON "LearnerCredential"("username");

ALTER TABLE "LearnerCredential"
    ADD CONSTRAINT "LearnerCredential_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. LearnerDeviceSession table
CREATE TABLE "LearnerDeviceSession" (
    "id"               TEXT         NOT NULL,
    "learnerProfileId" TEXT         NOT NULL,
    "tokenHash"        TEXT         NOT NULL,
    "expiresAt"        TIMESTAMP(3) NOT NULL,
    "lastSeenAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearnerDeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LearnerDeviceSession_tokenHash_key"          ON "LearnerDeviceSession"("tokenHash");
CREATE INDEX        "LearnerDeviceSession_learnerProfileId_idx"    ON "LearnerDeviceSession"("learnerProfileId");

ALTER TABLE "LearnerDeviceSession"
    ADD CONSTRAINT "LearnerDeviceSession_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. StudentClaimInvite table
CREATE TABLE "StudentClaimInvite" (
    "id"          TEXT         NOT NULL,
    "studentId"   TEXT         NOT NULL,
    "adminUserId" TEXT         NOT NULL,
    "token"       TEXT         NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "claimedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentClaimInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentClaimInvite_token_key"       ON "StudentClaimInvite"("token");
CREATE INDEX        "StudentClaimInvite_studentId_idx"   ON "StudentClaimInvite"("studentId");
CREATE INDEX        "StudentClaimInvite_adminUserId_idx" ON "StudentClaimInvite"("adminUserId");

ALTER TABLE "StudentClaimInvite"
    ADD CONSTRAINT "StudentClaimInvite_studentId_fkey"
    FOREIGN KEY ("studentId")
    REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentClaimInvite"
    ADD CONSTRAINT "StudentClaimInvite_adminUserId_fkey"
    FOREIGN KEY ("adminUserId")
    REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Student.learnerProfileId: nullable FK to LearnerProfile (additive; all existing rows get NULL)
ALTER TABLE "Student"
    ADD COLUMN "learnerProfileId" TEXT;

-- @unique enforces 1-to-1 Student<->LearnerProfile
CREATE UNIQUE INDEX "Student_learnerProfileId_key" ON "Student"("learnerProfileId");

ALTER TABLE "Student"
    ADD CONSTRAINT "Student_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
