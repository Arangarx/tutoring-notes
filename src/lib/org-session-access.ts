import "server-only";

import { Temporal } from "@js-temporal/polyfill";
import { db } from "@/lib/db";

/**
 * In-flight uploads after an org-forced end. One window, named once.
 * 15 minutes. See docs/BACKLOG.md.
 */
export const ORG_FORCED_END_UPLOAD_WINDOW_MS = 15 * 60 * 1000;

const NOTES_FINALIZE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FORCE_END_FLOOR_MS = 10 * 60 * 1000;

export const ORG_REMOVAL_TUTOR_SENTENCE =
  "This session will end soon because you are no longer part of the organization that set up this tutoring.";

export const ORG_REMOVAL_STUDENT_SENTENCE =
  "This session will end soon. The organization that set up this tutoring has changed who teaches it.";

/** Proposed. Andrew has not accepted this sentence. */
export const ORG_SUSPENSION_SENTENCE =
  "This session will end soon because the organization that set up this tutoring has had its account suspended.";

/** Proposed. Andrew has not accepted this sentence. */
export const ORG_PENDING_SENTENCE =
  "This session will end soon because the organization that set up this tutoring is not active yet.";

export type OrgSessionAccess =
  | { ok: true; mode: "read-write" }
  | { ok: true; mode: "read-only"; notesWritable: boolean }
  | { ok: false; reason: "denied" };

export type OrgForceEndNotice = {
  forceEndAt: string;
  pillSentence: string;
};

/**
 * Later of the end of the clock hour in `timeZone` that contains `storedAt`,
 * and `storedAt` plus 10 minutes. `now` is not an input.
 */
export function orgForceEndDeadline(storedAt: Date, timeZone: string): Date {
  const instant = Temporal.Instant.fromEpochMilliseconds(storedAt.getTime());
  const zoned = instant.toZonedDateTimeISO(timeZone);
  const hourEnd = zoned
    .with({ minute: 0, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 })
    .add({ hours: 1 })
    .toInstant();
  const plusTen = instant.add({ minutes: FORCE_END_FLOOR_MS / 60_000 });
  const later = Temporal.Instant.compare(hourEnd, plusTen) >= 0 ? hourEnd : plusTen;
  return new Date(later.epochMilliseconds);
}

function notesStillWritable(endedAt: Date, now: Date): boolean {
  return now.getTime() < endedAt.getTime() + NOTES_FINALIZE_WINDOW_MS;
}

type MemberOrg = {
  removedAt: Date | null;
  approved: boolean;
  orgStatus: "pending" | "active" | "suspended";
  statusChangedAt: Date;
  timeZone: string;
};

async function loadMemberOrg(
  organizationId: string,
  adminUserId: string
): Promise<MemberOrg | null> {
  const [org, member] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { status: true, statusChangedAt: true, timezone: true },
    }),
    db.organizationMember.findUnique({
      where: { organizationId_adminUserId: { organizationId, adminUserId } },
      select: {
        removedAt: true,
        adminUser: { select: { approvalStatus: true } },
      },
    }),
  ]);
  if (!org || !member) return null;
  return {
    removedAt: member.removedAt,
    approved: member.adminUser.approvalStatus === "APPROVED",
    orgStatus: org.status,
    statusChangedAt: org.statusChangedAt,
    timeZone: org.timezone,
  };
}

/**
 * Access to a whiteboard session that was already taught for an org student.
 * Denied: not this session's tutor, no membership row, or still a member and
 * not APPROVED. A removed tutor who taught the session is read-only, not denied.
 * A dropped instructor role with removedAt null still passes.
 */
export async function resolveOrgSessionAccess(input: {
  callerAdminUserId: string;
  sessionAdminUserId: string;
  organizationId: string;
  endedAt: Date | null;
  now?: Date;
}): Promise<OrgSessionAccess> {
  const now = input.now ?? new Date();
  if (input.callerAdminUserId !== input.sessionAdminUserId) {
    return { ok: false, reason: "denied" };
  }
  const member = await loadMemberOrg(input.organizationId, input.callerAdminUserId);
  if (!member) return { ok: false, reason: "denied" };
  if (member.removedAt == null && !member.approved) {
    return { ok: false, reason: "denied" };
  }

  if (member.removedAt == null && member.approved && member.orgStatus === "active") {
    return { ok: true, mode: "read-write" };
  }

  if (member.removedAt != null) {
    const deadline = orgForceEndDeadline(member.removedAt, member.timeZone);
    if (input.endedAt == null && now.getTime() < deadline.getTime()) {
      return { ok: true, mode: "read-write" };
    }
    if (input.endedAt == null) {
      return { ok: true, mode: "read-only", notesWritable: false };
    }
    return {
      ok: true,
      mode: "read-only",
      notesWritable: notesStillWritable(input.endedAt, now),
    };
  }

  const deadline = orgForceEndDeadline(member.statusChangedAt, member.timeZone);
  if (input.endedAt == null && now.getTime() < deadline.getTime()) {
    return { ok: true, mode: "read-write" };
  }
  if (input.endedAt == null) {
    return { ok: true, mode: "read-only", notesWritable: false };
  }
  return {
    ok: true,
    mode: "read-only",
    notesWritable: notesStillWritable(input.endedAt, now),
  };
}

/**
 * True only when endedAt is a forced instant inside the upload window.
 * A forced instant equals the tutor's removedAt, or statusChangedAt when
 * the org is not active, or falls at or after that instant's deadline.
 * A tutor's own End sits strictly between the stored instant and the deadline.
 */
export async function orgForcedEndUploadOpen(input: {
  organizationId: string | null;
  sessionAdminUserId: string;
  endedAt: Date | null;
  now?: Date;
}): Promise<boolean> {
  if (!input.organizationId || !input.endedAt) return false;
  const now = input.now ?? new Date();
  const elapsed = now.getTime() - input.endedAt.getTime();
  if (elapsed < 0 || elapsed >= ORG_FORCED_END_UPLOAD_WINDOW_MS) return false;
  const member = await loadMemberOrg(input.organizationId, input.sessionAdminUserId);
  if (!member) return false;
  const storedAt =
    member.removedAt != null
      ? member.removedAt
      : member.orgStatus !== "active"
        ? member.statusChangedAt
        : null;
  if (!storedAt) return false;
  const endedMs = input.endedAt.getTime();
  if (endedMs === storedAt.getTime()) return true;
  return endedMs >= orgForceEndDeadline(storedAt, member.timeZone).getTime();
}

/**
 * Pill instant for an open org session. Null when the session has ended,
 * the org is active and the tutor is still a member, or the deadline has passed.
 */
export async function readOrgForceEndNotice(input: {
  organizationId: string | null;
  sessionAdminUserId: string;
  endedAt: Date | null;
  audience: "tutor" | "student";
  now?: Date;
}): Promise<OrgForceEndNotice | null> {
  if (!input.organizationId || input.endedAt) return null;
  const now = input.now ?? new Date();
  const member = await loadMemberOrg(input.organizationId, input.sessionAdminUserId);
  if (!member) return null;

  if (member.removedAt != null) {
    const deadline = orgForceEndDeadline(member.removedAt, member.timeZone);
    if (now.getTime() >= deadline.getTime()) return null;
    return {
      forceEndAt: deadline.toISOString(),
      pillSentence:
        input.audience === "tutor"
          ? ORG_REMOVAL_TUTOR_SENTENCE
          : ORG_REMOVAL_STUDENT_SENTENCE,
    };
  }

  if (member.orgStatus === "active") return null;
  const deadline = orgForceEndDeadline(member.statusChangedAt, member.timeZone);
  if (now.getTime() >= deadline.getTime()) return null;
  return {
    forceEndAt: deadline.toISOString(),
    pillSentence:
      member.orgStatus === "suspended" ? ORG_SUSPENSION_SENTENCE : ORG_PENDING_SENTENCE,
  };
}

/** True when an open org session is past its force-end deadline. */
export async function orgForceEndIsDue(input: {
  organizationId: string | null;
  sessionAdminUserId: string;
  endedAt: Date | null;
  now?: Date;
}): Promise<boolean> {
  if (!input.organizationId || input.endedAt) return false;
  const now = input.now ?? new Date();
  const member = await loadMemberOrg(input.organizationId, input.sessionAdminUserId);
  if (!member) return false;
  const storedAt =
    member.removedAt != null
      ? member.removedAt
      : member.orgStatus !== "active"
        ? member.statusChangedAt
        : null;
  if (!storedAt) return false;
  return now.getTime() >= orgForceEndDeadline(storedAt, member.timeZone).getTime();
}
