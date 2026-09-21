-- AlterTable
ALTER TABLE "Student" ADD COLUMN "icsShowFullName" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CalendarFeedToken" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarFeedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarFeedToken_token_key" ON "CalendarFeedToken"("token");

-- CreateIndex
CREATE INDEX "CalendarFeedToken_adminUserId_idx" ON "CalendarFeedToken"("adminUserId");

-- AddForeignKey
ALTER TABLE "CalendarFeedToken" ADD CONSTRAINT "CalendarFeedToken_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dedupe OAuthCalendarConnection before unique index (keep newest updatedAt per provider+adminUserId)
DELETE FROM "OAuthCalendarConnection" AS doomed
WHERE doomed."adminUserId" IS NOT NULL
  AND doomed."id" IN (
    SELECT a."id"
    FROM "OAuthCalendarConnection" AS a
    INNER JOIN "OAuthCalendarConnection" AS b
      ON a."provider" = b."provider"
      AND a."adminUserId" = b."adminUserId"
      AND a."updatedAt" < b."updatedAt"
    WHERE a."adminUserId" IS NOT NULL
  );

-- CreateIndex
CREATE UNIQUE INDEX "OAuthCalendarConnection_provider_adminUserId_key" ON "OAuthCalendarConnection"("provider", "adminUserId");
