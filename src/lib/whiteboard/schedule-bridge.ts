/**
 * Schedule → whiteboard bridge: one live session per ScheduledSession,
 * reached by the tutor or by the learner side from their dashboard.
 *
 * Authorization is per principal; creation always goes through
 * `createWhiteboardSessionCore` (ownership-free core: erasure, approval,
 * consent, blob, snapshot, participant). The session is owned by the
 * appointment's tutor regardless of who arrived first.
 *
 * Learner-side principals may only enter inside the join window, and see a
 * single neutral `not_available` for every other refusal so a lookup does
 * not reveal why (consent, approval, wrong family).
 *
 * Logs: `[slc] wbsid=<id> action=schedule_bridge scheduledSessionId=<id> principal=<kind>`.
 *
 * SERVER-ONLY.
 */

import { db, withDbRetry } from "@/lib/db";
import { decideAhJoin } from "@/lib/join-scope";
import { isWithinJoinWindow } from "@/lib/scheduling/join-window";
import { createWhiteboardSessionCore } from "@/lib/whiteboard/create-session-core";

export type ScheduleBridgePrincipal =
  | { kind: "tutor"; adminUserId: string }
  | { kind: "learner"; learnerProfileId: string }
  | { kind: "account_holder"; accountHolderId: string };

export type ScheduleBridgeResult =
  | { ok: true; whiteboardSessionId: string; studentId: string; created: boolean }
  | { ok: false; reason: "not_found" | "not_yet" | "not_available" };

export async function getOrCreateWhiteboardForSchedule(
  scheduledSessionId: string,
  principal: ScheduleBridgePrincipal,
  rid: string,
  now: Date = new Date()
): Promise<ScheduleBridgeResult> {
  const sched = await withDbRetry(
    () =>
      db.scheduledSession.findUnique({
        where: { id: scheduledSessionId },
        select: {
          id: true,
          adminUserId: true,
          studentId: true,
          startAt: true,
          endAt: true,
          student: {
            select: {
              adminUserId: true,
              learnerProfile: {
                select: {
                  id: true,
                  isSelfLearner: true,
                  accountHolderId: true,
                  tombstonedAt: true,
                },
              },
            },
          },
        },
      }),
    { label: "scheduleBridge.load" }
  );

  const deny = (reason: "not_found" | "not_yet" | "not_available", why: string) => {
    console.warn(
      `[slc] action=schedule_bridge_denied scheduledSessionId=${scheduledSessionId} principal=${principal.kind} reason=${why} rid=${rid}`
    );
    return { ok: false as const, reason };
  };

  if (!sched) return deny("not_found", "no_schedule");
  // The appointment's tutor must still own the student row.
  if (sched.student.adminUserId !== sched.adminUserId) {
    return deny("not_found", "student_owner_mismatch");
  }

  if (principal.kind === "tutor") {
    if (principal.adminUserId !== sched.adminUserId) {
      return deny("not_found", "not_owner");
    }
  } else {
    const lp = sched.student.learnerProfile;
    if (principal.kind === "learner") {
      if (!lp || lp.tombstonedAt !== null || lp.id !== principal.learnerProfileId) {
        return deny("not_found", "not_participant");
      }
    } else {
      const decision = decideAhJoin(lp, principal.accountHolderId);
      if (!decision.ok) return deny("not_found", decision.reason);
    }
    if (!isWithinJoinWindow(sched, now)) return deny("not_yet", "outside_window");
  }

  try {
    const session = await createWhiteboardSessionCore({
      adminUserId: sched.adminUserId,
      studentId: sched.studentId,
      rid,
      scheduledSessionId: sched.id,
    });
    console.info(
      `[slc] wbsid=${session.id} action=schedule_bridge scheduledSessionId=${sched.id} principal=${principal.kind} created=${session.created}`
    );
    return {
      ok: true,
      whiteboardSessionId: session.id,
      studentId: session.studentId,
      created: session.created,
    };
  } catch (err) {
    if (principal.kind === "tutor") throw err;
    console.warn(
      `[slc] action=schedule_bridge_denied scheduledSessionId=${scheduledSessionId} principal=${principal.kind} reason=create_refused err=${err instanceof Error ? err.name : "unknown"} rid=${rid}`
    );
    return { ok: false, reason: "not_available" };
  }
}
