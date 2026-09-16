import { db, withDbRetry } from "@/lib/db";

/** Mark tutor Google Calendar connection as needing reconnect (invalid_grant). */
export async function markGoogleCalendarReconnectRequired(
  adminUserId: string
): Promise<void> {
  try {
    await withDbRetry(
      () =>
        db.oAuthCalendarConnection.updateMany({
          where: { provider: "google", adminUserId },
          data: { reconnectRequiredAt: new Date() },
        }),
      { label: "markGoogleCalendarReconnectRequired" }
    );
  } catch {
    // fail-soft — schedule CRUD already succeeded
  }
}

/** Clear reconnect flag after successful token use or OAuth reconnect. */
export async function clearGoogleCalendarReconnectRequired(
  adminUserId: string
): Promise<void> {
  try {
    await withDbRetry(
      () =>
        db.oAuthCalendarConnection.updateMany({
          where: { provider: "google", adminUserId },
          data: { reconnectRequiredAt: null },
        }),
      { label: "clearGoogleCalendarReconnectRequired" }
    );
  } catch {
    // fail-soft
  }
}
