-- Additive: tutor email confirm. Backfill existing AdminUser rows in THIS
-- migration so deploying a later middleware gate cannot lock out existing tutors.

-- CreateEnum
CREATE TYPE "AdminUserEmailTokenPurpose" AS ENUM ('SIGNUP_VERIFY');

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "AdminUser" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;

-- CreateTable
CREATE TABLE "AdminUserEmailToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "AdminUserEmailTokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUserEmailToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUserEmailToken_tokenHash_key" ON "AdminUserEmailToken"("tokenHash");
CREATE INDEX "AdminUserEmailToken_adminUserId_idx" ON "AdminUserEmailToken"("adminUserId");

ALTER TABLE "AdminUserEmailToken" ADD CONSTRAINT "AdminUserEmailToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
