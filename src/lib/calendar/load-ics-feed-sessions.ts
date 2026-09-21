import { db } from "@/lib/db";

import type { IcsFeedSessionInput } from "@/lib/calendar/ics-feed";

export async function loadIcsFeedSessionsForAdmin(
  adminUserId: string
): Promise<IcsFeedSessionInput[]> {
  return db.scheduledSession.findMany({
    where: { adminUserId },
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
