-- AlterTable
ALTER TABLE "ScheduledSession" ADD COLUMN "startAt" TIMESTAMPTZ(3),
ADD COLUMN "endAt" TIMESTAMPTZ(3);

-- Backfill UTC instants from naive wall clock in the tutor zone (Mountain if unset).
UPDATE "ScheduledSession" AS s
SET
  "startAt" = ((s.date::text || ' ' || s."startTime")::timestamp AT TIME ZONE COALESCE(NULLIF(a."tutorTimezone", ''), 'America/Denver')),
  "endAt" = ((s.date::text || ' ' || s."endTime")::timestamp AT TIME ZONE COALESCE(NULLIF(a."tutorTimezone", ''), 'America/Denver'))
FROM "AdminUser" AS a
WHERE a.id = s."adminUserId";

CREATE INDEX "ScheduledSession_adminUserId_startAt_idx" ON "ScheduledSession"("adminUserId", "startAt");
