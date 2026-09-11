-- SMS OTP 2FA (Workstream 3) — additive only. No second challenge table.
-- Adds SMS_OTP method, phoneE164 + change-method pending fields on AdminUser2FA,
-- and a channel column on the existing AdminUser2FAEmailChallenge table so it
-- carries both EMAIL and SMS OTP challenges (model name kept for existing imports).

-- AlterEnum
ALTER TYPE "TwoFactorMethod" ADD VALUE 'SMS_OTP';

-- CreateEnum
CREATE TYPE "AdminUser2FAEmailChallengeChannel" AS ENUM ('EMAIL', 'SMS');

-- AlterTable: AdminUser2FAEmailChallenge — channel, default EMAIL (existing rows are email).
ALTER TABLE "AdminUser2FAEmailChallenge"
  ADD COLUMN "channel" "AdminUser2FAEmailChallengeChannel" NOT NULL DEFAULT 'EMAIL';

CREATE INDEX "AdminUser2FAEmailChallenge_adminUserId_purpose_channel_idx"
  ON "AdminUser2FAEmailChallenge"("adminUserId", "purpose", "channel");

-- AlterTable: AdminUser2FA — phone + change-method pending fields.
ALTER TABLE "AdminUser2FA"
  ADD COLUMN "phoneE164" TEXT,
  ADD COLUMN "pendingPhoneE164" TEXT,
  ADD COLUMN "pendingMethod" "TwoFactorMethod";
