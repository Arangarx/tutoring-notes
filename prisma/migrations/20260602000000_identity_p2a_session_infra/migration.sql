-- Identity Phase 2a: Session infrastructure + claim-flow schema additions
-- ADDITIVE ONLY: all changes add new columns/tables; no existing data is altered.
--
-- Changes in this migration:
--   1. AccountHolder: +passwordHash, +displayName
--   2. AccountHolderEmailToken: +payload, +targetLearnerProfileId
--   3. LearnerDeviceSession: +deviceInfo
--   4. LearnerProfile: +accessMode (new LearnerAccessMode enum; default parent_session_select)
--   5. StudentClaimInvite: rename token→tokenHash, +revokedAt, +claimedByAccountHolderId
--   6. NEW: AccountHolderSession table (opaque DB-backed session for AccountHolder realm)
--
-- Safe apply order: all new columns are nullable or have DB-level defaults.
-- token→tokenHash rename is safe: column is empty on all environments at rename time.
--
-- AH-7 LOCKED: migration timestamp ≥ 20260602000000 so it sorts after all existing migrations.

-- ---------------------------------------------------------------------------
-- 1. AccountHolder: add passwordHash, displayName, emailVerifiedAt
-- ---------------------------------------------------------------------------
ALTER TABLE "AccountHolder" ADD COLUMN "passwordHash"     TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN "displayName"      TEXT;
ALTER TABLE "AccountHolder" ADD COLUMN "emailVerifiedAt"  TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- 2. AccountHolderEmailToken: add payload and targetLearnerProfileId
-- ---------------------------------------------------------------------------
ALTER TABLE "AccountHolderEmailToken" ADD COLUMN "payload"                TEXT;
ALTER TABLE "AccountHolderEmailToken" ADD COLUMN "targetLearnerProfileId" TEXT;

-- ---------------------------------------------------------------------------
-- 3. LearnerDeviceSession: add deviceInfo
-- ---------------------------------------------------------------------------
ALTER TABLE "LearnerDeviceSession" ADD COLUMN "deviceInfo" TEXT;

-- ---------------------------------------------------------------------------
-- 4. LearnerProfile: add per-child access mode
-- ---------------------------------------------------------------------------
CREATE TYPE "LearnerAccessMode" AS ENUM ('parent_session_select', 'child_pin_required');

ALTER TABLE "LearnerProfile"
    ADD COLUMN "accessMode" "LearnerAccessMode" NOT NULL DEFAULT 'parent_session_select';

-- ---------------------------------------------------------------------------
-- 5. StudentClaimInvite: rename token→tokenHash + add revokedAt + claimedByAccountHolderId
-- ---------------------------------------------------------------------------

-- Drop old unique constraint before rename (Prisma expects StudentClaimInvite_tokenHash_key)
DROP INDEX "StudentClaimInvite_token_key";

-- Rename column (table is empty in all environments at P2a branch time — §6.4)
ALTER TABLE "StudentClaimInvite" RENAME COLUMN "token" TO "tokenHash";

-- Recreate unique constraint under the new name
CREATE UNIQUE INDEX "StudentClaimInvite_tokenHash_key" ON "StudentClaimInvite"("tokenHash");

-- Add revokedAt (nullable — null = not revoked)
ALTER TABLE "StudentClaimInvite" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- Add claimedByAccountHolderId (nullable — null until claimed; no FK so P3 schema can evolve)
ALTER TABLE "StudentClaimInvite" ADD COLUMN "claimedByAccountHolderId" TEXT;

-- ---------------------------------------------------------------------------
-- 6. AccountHolderSession: new table for AccountHolder realm sessions
-- ---------------------------------------------------------------------------
CREATE TABLE "AccountHolderSession" (
    "id"               TEXT         NOT NULL,
    "accountHolderId"  TEXT         NOT NULL,
    -- HMAC-SHA-256(rawToken, AH_SESSION_HMAC_SECRET). Raw token never stored.
    "tokenHash"        TEXT         NOT NULL,
    -- True once AccountHolder passes TOTP verification (Phase 6).
    -- Always false in Phase 2 — wired now so Phase 6 needs no ALTER TABLE.
    "twoFactorVerified" BOOLEAN     NOT NULL DEFAULT false,
    -- User-agent snippet for session management UI.
    "deviceInfo"       TEXT,
    -- Absolute expiry; renewed via sliding window on each validated request.
    "expiresAt"        TIMESTAMP(3) NOT NULL,
    "lastUsedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountHolderSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountHolderSession_tokenHash_key"
    ON "AccountHolderSession"("tokenHash");

CREATE INDEX "AccountHolderSession_accountHolderId_idx"
    ON "AccountHolderSession"("accountHolderId");

-- Separate index on tokenHash for fast lookups (covered by unique above but explicit for sweep)
CREATE INDEX "AccountHolderSession_expiresAt_idx"
    ON "AccountHolderSession"("expiresAt");

ALTER TABLE "AccountHolderSession"
    ADD CONSTRAINT "AccountHolderSession_accountHolderId_fkey"
    FOREIGN KEY ("accountHolderId")
    REFERENCES "AccountHolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
