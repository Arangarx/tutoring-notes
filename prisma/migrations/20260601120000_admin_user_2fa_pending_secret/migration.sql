-- Add rotation support to AdminUser2FA (additive; no DROP, no DELETE, no UPDATE).
-- pendingTotpSecretEnc: stores a new TOTP secret during rotation while the existing
--   totpSecretEnc remains valid (no-lockout guarantee). Cleared on confirm or abandon.
-- pendingEnrolledAt: timestamp when rotation was started. Used for expiry (optional).
ALTER TABLE "AdminUser2FA" ADD COLUMN "pendingTotpSecretEnc" TEXT;
ALTER TABLE "AdminUser2FA" ADD COLUMN "pendingEnrolledAt" TIMESTAMP(3);
