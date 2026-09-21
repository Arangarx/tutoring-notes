import { logIcsAccess } from "@/lib/calendar/ics-access-log";
import { buildIcsCalendarBody } from "@/lib/calendar/ics-feed";
import {
  icsFeedDeniedResponse,
  icsFeedErrorResponse,
  icsFeedSuccessResponse,
} from "@/lib/calendar/ics-feed-response";
import {
  loadAdminTutorTimezone,
  loadIcsFeedSessionsForAdmin,
} from "@/lib/calendar/load-ics-feed-sessions";
import { findCalendarFeedTokenByRawToken } from "@/lib/calendar-feed-token";

/**
 * GET /api/calendar/ics/[token]
 *
 * Public bearer-token ICS subscription feed for a tutor's scheduled sessions.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> }
): Promise<Response> {
  const { token } = await ctx.params;
  const tokenPrefix = token.slice(0, 8);

  const tokenRow = await findCalendarFeedTokenByRawToken(token);
  if (!tokenRow) {
    logIcsAccess({ tokenPrefix, action: "denied" });
    return icsFeedDeniedResponse();
  }

  try {
    const [sessions, adminTimezone] = await Promise.all([
      loadIcsFeedSessionsForAdmin(tokenRow.adminUserId),
      loadAdminTutorTimezone(tokenRow.adminUserId),
    ]);

    const body = buildIcsCalendarBody(sessions, adminTimezone);
    logIcsAccess({
      tokenPrefix,
      action: "feed_served",
      adminUserId: tokenRow.adminUserId,
    });
    return icsFeedSuccessResponse(body);
  } catch {
    logIcsAccess({
      tokenPrefix,
      action: "error",
      adminUserId: tokenRow.adminUserId,
    });
    return icsFeedErrorResponse();
  }
}
