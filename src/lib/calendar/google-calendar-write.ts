/**
 * Google Calendar write sync for native scheduled sessions (WS2).
 * Fail-soft: errors never throw to schedule CRUD callers.
 */

import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";

import {
  buildScheduledSessionGoogleEventResource,
  scheduledSessionIcalUid,
} from "@/lib/calendar/google-calendar-event-payload";
import {
  clearGoogleCalendarReconnectRequired,
  markGoogleCalendarReconnectRequired,
} from "@/lib/calendar/google-calendar-reconnect";
import { logGcw } from "@/lib/calendar/google-calendar-write-log";
import { db, withDbRetry } from "@/lib/db";
import { getGoogleAccessToken } from "@/lib/google-oauth-access";

export {
  buildScheduledSessionGoogleEventResource,
  scheduledSessionIcalUid,
} from "@/lib/calendar/google-calendar-event-payload";

const PRIMARY_CALENDAR_ID = "primary";

export type ScheduledSessionGoogleSyncInput = {
  id: string;
  adminUserId: string;
  date: Date;
  startTime: string;
  endTime: string;
  startAt: Date | null;
  endAt: Date | null;
  subject: string;
  notes: string;
  location: string;
  googleEventId: string | null;
  student: {
    name: string;
    icsShowFullName: boolean;
  };
};

export type GoogleCalendarWriteClient = {
  listEventsByICalUid: (iCalUID: string) => Promise<{ id: string } | null>;
  insertEvent: (resource: calendar_v3.Schema$Event) => Promise<{ id: string }>;
  patchEvent: (
    eventId: string,
    resource: calendar_v3.Schema$Event
  ) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
};

export async function createGoogleCalendarWriteClient(
  refreshToken: string
): Promise<
  | { ok: true; client: GoogleCalendarWriteClient }
  | { ok: false; invalidGrant: boolean; message: string }
> {
  const tokenResult = await getGoogleAccessToken(refreshToken);
  if (!tokenResult.ok) {
    return {
      ok: false,
      invalidGrant: tokenResult.invalidGrant,
      message: tokenResult.message,
    };
  }

  const calendar = google.calendar({
    version: "v3",
    auth: tokenResult.oauth2Client,
  });

  const client: GoogleCalendarWriteClient = {
    listEventsByICalUid: async (iCalUID) => {
      const res = await calendar.events.list({
        calendarId: PRIMARY_CALENDAR_ID,
        iCalUID,
        singleEvents: true,
        maxResults: 1,
      });
      const item = res.data.items?.[0];
      return item?.id ? { id: item.id } : null;
    },
    insertEvent: async (resource) => {
      const res = await calendar.events.insert({
        calendarId: PRIMARY_CALENDAR_ID,
        requestBody: resource,
      });
      const id = res.data.id;
      if (!id) {
        throw new Error("Google Calendar insert returned no event id");
      }
      return { id };
    },
    patchEvent: async (eventId, resource) => {
      await calendar.events.patch({
        calendarId: PRIMARY_CALENDAR_ID,
        eventId,
        requestBody: resource,
      });
    },
    deleteEvent: async (eventId) => {
      await calendar.events.delete({
        calendarId: PRIMARY_CALENDAR_ID,
        eventId,
      });
    },
  };

  return { ok: true, client };
}

export type GoogleCalendarSyncDeps = {
  getClient: (
    refreshToken: string
  ) => Promise<
    | { ok: true; client: GoogleCalendarWriteClient }
    | { ok: false; invalidGrant: boolean; message: string }
  >;
  persistEventId: (sessionId: string, googleEventId: string) => Promise<void>;
};

const defaultDeps: GoogleCalendarSyncDeps = {
  getClient: createGoogleCalendarWriteClient,
  persistEventId: async (sessionId, googleEventId) => {
    await withDbRetry(
      () =>
        db.scheduledSession.update({
          where: { id: sessionId },
          data: { googleEventId },
        }),
      { label: "persistGoogleEventId" }
    );
  },
};

let depsOverride: Partial<GoogleCalendarSyncDeps> | null = null;

export function setGoogleCalendarSyncDepsForTests(
  deps: Partial<GoogleCalendarSyncDeps> | null
): void {
  depsOverride = deps;
}

function resolveDeps(): GoogleCalendarSyncDeps {
  return { ...defaultDeps, ...depsOverride };
}

async function logInvalidGrantAndMarkReconnect(args: {
  adminUserId: string;
  sessionId: string;
  googleEventId?: string | null;
}): Promise<void> {
  logGcw({
    adminUserId: args.adminUserId,
    sessionId: args.sessionId,
    action: "invalid_grant",
    googleEventId: args.googleEventId ?? undefined,
  });
  await markGoogleCalendarReconnectRequired(args.adminUserId);
}

function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "invalid_grant") return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("invalid_grant");
}

async function resolveClient(refreshToken: string): Promise<
  | { ok: true; client: GoogleCalendarWriteClient }
  | { ok: false; invalidGrant: boolean; message: string }
> {
  try {
    return await resolveDeps().getClient(refreshToken);
  } catch (err) {
    return {
      ok: false,
      invalidGrant: isInvalidGrantError(err),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncScheduledSessionInsertToGoogle(args: {
  refreshToken: string;
  adminTimezone: string | null | undefined;
  session: ScheduledSessionGoogleSyncInput;
}): Promise<void> {
  const { session, refreshToken, adminTimezone } = args;
  const iCalUID = scheduledSessionIcalUid(session.id);

  logGcw({
    adminUserId: session.adminUserId,
    sessionId: session.id,
    action: "insert_start",
    googleEventId: session.googleEventId,
  });

  if (session.googleEventId) {
    return;
  }

  const clientResult = await resolveClient(refreshToken);
  if (!clientResult.ok) {
    if (clientResult.invalidGrant) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId: session.adminUserId,
        sessionId: session.id,
      });
    } else {
      logGcw({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        action: "insert_error",
        detail: clientResult.message,
      });
    }
    return;
  }

  await clearGoogleCalendarReconnectRequired(session.adminUserId);

  const { client } = clientResult;

  try {
    const existing = await client.listEventsByICalUid(iCalUID);
    if (existing) {
      await resolveDeps().persistEventId(session.id, existing.id);
      logGcw({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        action: "insert_linked",
        googleEventId: existing.id,
      });
      return;
    }

    const resource = buildScheduledSessionGoogleEventResource(session, adminTimezone);
    const inserted = await client.insertEvent(resource);

    try {
      await resolveDeps().persistEventId(session.id, inserted.id);
    } catch (persistErr) {
      logGcw({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        action: "persist_error",
        googleEventId: inserted.id,
        detail: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
      return;
    }

    logGcw({
      adminUserId: session.adminUserId,
      sessionId: session.id,
      action: "insert_success",
      googleEventId: inserted.id,
    });
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId: session.adminUserId,
        sessionId: session.id,
      });
      return;
    }
    logGcw({
      adminUserId: session.adminUserId,
      sessionId: session.id,
      action: "insert_error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function syncScheduledSessionUpdateToGoogle(args: {
  refreshToken: string;
  adminTimezone: string | null | undefined;
  session: ScheduledSessionGoogleSyncInput;
}): Promise<void> {
  const { session, refreshToken, adminTimezone } = args;

  if (!session.googleEventId) {
    await syncScheduledSessionInsertToGoogle(args);
    return;
  }

  logGcw({
    adminUserId: session.adminUserId,
    sessionId: session.id,
    action: "patch_start",
    googleEventId: session.googleEventId,
  });

  const clientResult = await resolveClient(refreshToken);
  if (!clientResult.ok) {
    if (clientResult.invalidGrant) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        googleEventId: session.googleEventId,
      });
    } else {
      logGcw({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        action: "patch_error",
        googleEventId: session.googleEventId,
        detail: clientResult.message,
      });
    }
    return;
  }

  await clearGoogleCalendarReconnectRequired(session.adminUserId);

  const resource = buildScheduledSessionGoogleEventResource(session, adminTimezone);
  try {
    await clientResult.client.patchEvent(session.googleEventId, resource);
    logGcw({
      adminUserId: session.adminUserId,
      sessionId: session.id,
      action: "patch_success",
      googleEventId: session.googleEventId,
    });
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId: session.adminUserId,
        sessionId: session.id,
        googleEventId: session.googleEventId,
      });
      return;
    }
    logGcw({
      adminUserId: session.adminUserId,
      sessionId: session.id,
      action: "patch_error",
      googleEventId: session.googleEventId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function syncScheduledSessionDeleteFromGoogle(args: {
  refreshToken: string;
  adminUserId: string;
  sessionId: string;
  googleEventId: string;
}): Promise<void> {
  const { refreshToken, adminUserId, sessionId, googleEventId } = args;

  logGcw({
    adminUserId,
    sessionId,
    action: "delete_start",
    googleEventId,
  });

  const clientResult = await resolveClient(refreshToken);
  if (!clientResult.ok) {
    if (clientResult.invalidGrant) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId,
        sessionId,
        googleEventId,
      });
    } else {
      logGcw({
        adminUserId,
        sessionId,
        action: "delete_error",
        googleEventId,
        detail: clientResult.message,
      });
    }
    return;
  }

  await clearGoogleCalendarReconnectRequired(adminUserId);

  try {
    await clientResult.client.deleteEvent(googleEventId);
    logGcw({
      adminUserId,
      sessionId,
      action: "delete_success",
      googleEventId,
    });
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await logInvalidGrantAndMarkReconnect({
        adminUserId,
        sessionId,
        googleEventId,
      });
      return;
    }
    logGcw({
      adminUserId,
      sessionId,
      action: "delete_error",
      googleEventId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

const googleSyncSelect = {
  id: true,
  adminUserId: true,
  date: true,
  startTime: true,
  endTime: true,
  startAt: true,
  endAt: true,
  subject: true,
  notes: true,
  location: true,
  googleEventId: true,
  student: { select: { name: true, icsShowFullName: true } },
} as const;

export async function loadScheduledSessionForGoogleSync(
  sessionId: string
): Promise<(ScheduledSessionGoogleSyncInput & { adminTimezone: string | null }) | null> {
  const row = await withDbRetry(
    () =>
      db.scheduledSession.findUnique({
        where: { id: sessionId },
        select: {
          ...googleSyncSelect,
          adminUser: { select: { tutorTimezone: true } },
        },
      }),
    { label: "loadScheduledSessionForGoogleSync" }
  );
  if (!row) return null;
  return {
    id: row.id,
    adminUserId: row.adminUserId,
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    startAt: row.startAt,
    endAt: row.endAt,
    subject: row.subject,
    notes: row.notes,
    location: row.location,
    googleEventId: row.googleEventId,
    student: row.student,
    adminTimezone: row.adminUser.tutorTimezone,
  };
}

export async function afterScheduledSessionCreated(
  adminUserId: string,
  sessionId: string,
  refreshToken: string | null
): Promise<void> {
  if (!refreshToken) return;
  try {
    const loaded = await loadScheduledSessionForGoogleSync(sessionId);
    if (!loaded) return;
    const { adminTimezone, ...session } = loaded;
    await syncScheduledSessionInsertToGoogle({
      refreshToken,
      adminTimezone,
      session,
    });
  } catch {
    // fail-soft — native CRUD already succeeded
  }
}

export async function afterScheduledSessionUpdated(
  adminUserId: string,
  sessionId: string,
  refreshToken: string | null
): Promise<void> {
  if (!refreshToken) return;
  try {
    const loaded = await loadScheduledSessionForGoogleSync(sessionId);
    if (!loaded) return;
    const { adminTimezone, ...session } = loaded;
    await syncScheduledSessionUpdateToGoogle({
      refreshToken,
      adminTimezone,
      session,
    });
  } catch {
    // fail-soft
  }
}

export async function beforeScheduledSessionDeleted(
  adminUserId: string,
  sessionId: string,
  googleEventId: string | null,
  refreshToken: string | null
): Promise<void> {
  if (!refreshToken || !googleEventId) return;
  try {
    await syncScheduledSessionDeleteFromGoogle({
      refreshToken,
      adminUserId,
      sessionId,
      googleEventId,
    });
  } catch {
    // fail-soft — local delete proceeds regardless
  }
}
