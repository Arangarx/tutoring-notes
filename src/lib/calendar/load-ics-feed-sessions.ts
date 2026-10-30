import { db } from "@/lib/db";
import { tutorAppointmentsWhere } from "@/lib/scheduling/tutor-appointments";

import type { IcsFeedSessionInput } from "@/lib/calendar/ics-feed";

/**
 * The feed lists exactly what the tutor's Schedule lists (`tutorAppointmentsWhere`),
 * so a removed or waitlisted instructor stops receiving org appointments.
 */
export async function loadIcsFeedSessionsForAdmin(
  adminUserId: string
): Promise<IcsFeedSessionInput[]> {
  return db.scheduledSession.findMany({
    where: tutorAppointmentsWhere(adminUserId),
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      startAt: true,
      endAt: true,
      subject: true,
      notes: true,
      location: true,
      updatedAt: true,
      student: {
        select: {
          name: true,
          icsShowFullName: true,
          organizationLearner: { select: { givenName: true, familyName: true } },
        },
      },
    },
  });
}

export async function loadAdminTutorTimezone(
  adminUserId: string
): Promise<string | null> {
  const row = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { tutorTimezone: true },
  });
  return row?.tutorTimezone ?? null;
}
