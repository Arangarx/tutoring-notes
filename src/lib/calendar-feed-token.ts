import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/security";

export type CalendarFeedTokenRow = {
  id: string;
  adminUserId: string;
  token: string;
  revokedAt: Date | null;
  createdAt: Date;
};

/** Mint a new feed token for the tutor; revokes any prior active token so one live URL exists. */
export async function mintCalendarFeedToken(
  adminUserId: string
): Promise<CalendarFeedTokenRow> {
  const token = generateShareToken();
  const now = new Date();

  return db.$transaction(async (tx) => {
    await tx.calendarFeedToken.updateMany({
      where: { adminUserId, revokedAt: null },
      data: { revokedAt: now },
    });
    return tx.calendarFeedToken.create({
      data: { adminUserId, token },
    });
  });
}

/** Active (non-revoked) feed token for a tutor, if any. */
export async function findActiveCalendarFeedTokenForAdmin(
  adminUserId: string
): Promise<CalendarFeedTokenRow | null> {
  const row = await db.calendarFeedToken.findFirst({
    where: { adminUserId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return row ?? null;
}

/** Resolve a raw bearer token to a row, or null if missing / revoked. */
export async function findCalendarFeedTokenByRawToken(
  rawToken: string
): Promise<CalendarFeedTokenRow | null> {
  const row = await db.calendarFeedToken.findUnique({
    where: { token: rawToken },
  });
  if (!row || row.revokedAt) return null;
  return row;
}
