-- Identity Phase 1: TOTP 2FA enrollment tables
-- ADDITIVE ONLY: no DROP COLUMN, no data loss, no row deletes or updates.
--
-- Adds:
--   1. AdminUser2FA  — one-to-one with AdminUser; holds encrypted TOTP secret.
--   2. AdminUser2FABackupCode — single-use recovery codes (bcrypt hashed).
--
-- totpSecretEnc is AES-256-GCM ciphertext; the plaintext TOTP base32 secret
-- is NEVER stored in the database or emitted in logs.
--
-- Rotating or losing the TOTP_ENCRYPTION_KEY env var requires re-enrolling all
-- tutors — see docs/PLATFORM-ASSUMPTIONS.md for the key-rotation story.

CREATE TABLE "AdminUser2FA" (
    "id"             TEXT        NOT NULL,
    "adminUserId"    TEXT        NOT NULL,
    "totpSecretEnc"  TEXT        NOT NULL,
    "enrolledAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "AdminUser2FA_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser2FA_adminUserId_key"
    ON "AdminUser2FA"("adminUserId");

ALTER TABLE "AdminUser2FA"
    ADD CONSTRAINT "AdminUser2FA_adminUserId_fkey"
    FOREIGN KEY ("adminUserId")
    REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdminUser2FABackupCode" (
    "id"        TEXT         NOT NULL,
    "twoFaId"   TEXT         NOT NULL,
    "codeHash"  TEXT         NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser2FABackupCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminUser2FABackupCode_twoFaId_idx"
    ON "AdminUser2FABackupCode"("twoFaId");

ALTER TABLE "AdminUser2FABackupCode"
    ADD CONSTRAINT "AdminUser2FABackupCode_twoFaId_fkey"
    FOREIGN KEY ("twoFaId")
    REFERENCES "AdminUser2FA"("id") ON DELETE CASCADE ON UPDATE CASCADE;
