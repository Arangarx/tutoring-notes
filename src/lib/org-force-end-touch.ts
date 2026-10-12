import "server-only";

import { db } from "@/lib/db";
import { orgForceEndIsDue } from "@/lib/org-session-access";
import { stampStaleWhiteboardSessionEnd } from "@/lib/whiteboard/stale-session-stamp";

/**
 * First read after the force-end deadline stamps the open session.
 * A row nobody reads stays unended. A second read does not move endedAt.
 */
export async function touchOrgForceEndIfDue(sessionId: string): Promise<void> {
  const session = await db.whiteboardSession.findUnique({
    where: { id: sessionId },
    select: {
      endedAt: true,
      adminUserId: true,
      student: { select: { organizationId: true, adminUserId: true } },
    },
  });
  if (!session || session.endedAt) return;
  const organizationId =
    session.student.organizationId != null && session.student.adminUserId == null
      ? session.student.organizationId
      : null;
  const due = await orgForceEndIsDue({
    organizationId,
    sessionAdminUserId: session.adminUserId,
    endedAt: session.endedAt,
  });
  if (!due) return;
  const now = new Date();
  const stamped = await db.$transaction((tx) =>
    stampStaleWhiteboardSessionEnd(tx, sessionId, now)
  );
  if (stamped) {
    console.info(
      `[slc] wbsid=${sessionId} action=session_ended phase=force_end endedAt=${stamped.endedAt.toISOString()}`
    );
  }
}
