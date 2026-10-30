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
import { orgInstructorAdmitted } from "@/lib/org-scope";
import { decideAhJoin } from "@/lib/join-scope";
import { isWithinJoinWindow } from "@/lib/scheduling/join-window";
import {
  entryRefusalError,
  loadSessionEntryState,
} from "@/lib/scheduling/session-entry-loader";
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
              name: true,
              adminUserId: true,
              organizationId: true,
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
  const orgOwned =
    sched.student.organizationId != null && sched.student.adminUserId == null;
  if (orgOwned) {
    const admitted = await orgInstructorAdmitted(
      db,
      sched.student.organizationId as string,
      sched.adminUserId
    );
    if (!admitted) return deny("not_found", "org_admission");
  } else if (sched.student.adminUserId !== sched.adminUserId) {
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

  // Before creating anything: the one entry rule (D3), called in place. A learner
  // (always remote, so `online`) the parent has not allowed into live sessions, or a
  // tutor with no usable consent (`inPerson`: the room is reachable in person), must
  // not leave a session row + blob behind. The refusal logs the same reason code the UI shows.
  const entryMode = principal.kind === "tutor" ? "inPerson" : "online";
  const entry = await loadSessionEntryState({
    studentId: sched.studentId,
    adminUserId: sched.adminUserId,
    student: {
      adminUserId: sched.student.adminUserId,
      organizationId: sched.student.organizationId,
      learnerProfileId: sched.student.learnerProfile?.id ?? null,
      learnerProfile: sched.student.learnerProfile
        ? { isSelfLearner: sched.student.learnerProfile.isSelfLearner }
        : null,
    },
  });
  const decision = entry[entryMode];
  if (!decision.allowed) {
    console.warn(
      `[slc] action=schedule_bridge_refused scheduledSessionId=${scheduledSessionId} principal=${principal.kind} mode=${entryMode} reason=${decision.reason} rid=${rid}`
    );
    if (principal.kind === "tutor") {
      throw entryRefusalError(decision.reason, sched.student.name);
    }
    return { ok: false, reason: "not_available" };
  }

  try {
    const session = await createWhiteboardSessionCore({
      adminUserId: sched.adminUserId,
      studentId: sched.studentId,
      rid,
      scheduledSessionId: sched.id,
    });
    // The entry check above already refused every refusal the core can return, so this is
    // only a race (the record vanished in between). Same outcome as the check: a tutor gets
    // the table line, a learner the neutral `not_available` (via the catch below).
    if (!session.ok) throw entryRefusalError(session.reason, sched.student.name);
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
