import { getGoogleCalendarConnectionForTutor } from "@/lib/calendar-oauth";
import {
  rewriteUpcomingSessionInstants,
  syncUpcomingUnsyncedScheduledSessions,
} from "@/lib/calendar/google-calendar-connect-backfill";
import { db, withDbRetry } from "@/lib/db";
import { snapSystemIanaToBillingTimezone } from "@/lib/time/system-timezone";

/**
 * If the tutor has no timezone override yet, persist the device IANA zone.
 * Never overwrites a saved Settings → billing timezone.
 */
export async function seedTutorTimezoneIfUnset(
  adminUserId: string,
  iana: string | null | undefined
): Promise<{ seeded: boolean; timeZone: string | null }> {
  const snapped = snapSystemIanaToBillingTimezone(iana);
  if (!snapped) {
    const row = await withDbRetry(
      () =>
        db.adminUser.findUnique({
          where: { id: adminUserId },
          select: { tutorTimezone: true },
        }),
      { label: "seedTutorTimezoneIfUnset.read" }
    );
    return { seeded: false, timeZone: row?.tutorTimezone ?? null };
  }

  const updated = await withDbRetry(
    () =>
      db.adminUser.updateMany({
        where: { id: adminUserId, tutorTimezone: null },
        data: { tutorTimezone: snapped },
      }),
    { label: "seedTutorTimezoneIfUnset" }
  );

  if (updated.count > 0) {
    try {
      const conn = await getGoogleCalendarConnectionForTutor(adminUserId);
      if (conn?.refreshToken && !conn.reconnectRequired) {
        // Patch existing Google events in place — no Disconnect/Connect required.
        await syncUpcomingUnsyncedScheduledSessions(adminUserId, conn.refreshToken);
      } else {
        await rewriteUpcomingSessionInstants(adminUserId, snapped);
      }
    } catch {
      // fail-soft — timezone seed already persisted
    }
    return { seeded: true, timeZone: snapped };
  }

  const row = await withDbRetry(
    () =>
      db.adminUser.findUnique({
        where: { id: adminUserId },
        select: { tutorTimezone: true },
      }),
    { label: "seedTutorTimezoneIfUnset.after" }
  );
  return { seeded: false, timeZone: row?.tutorTimezone ?? null };
}
