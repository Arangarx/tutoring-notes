import "server-only";

import type { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";

import { sendClaimInviteEmail } from "@/lib/account-holder-email";
import { mintStudentClaimInvite, reinviteTargetKind } from "@/lib/claim-invite-service";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize-email";
import { STAFF_HOME_ROLES } from "@/lib/org-appointment-scope";
import {
  assertCanAddOrgLearner,
  assertCanSendOrgClaimEmail,
  assertOrgRole,
  orgLog,
} from "@/lib/org-scope";
import { getPublicBaseUrl } from "@/lib/public-url";
import { entryBlockCopy } from "@/lib/scheduling/session-entry";

/** Implementation cap. Andrew did not choose this number. Tests import it from here. */
export const ORG_LEARNER_BRIEF_MAX_CHARS = 500;

/** Scheduler short reasons come from the one entry copy table. */
const SCHEDULER_WAITING_ON_FAMILY = entryBlockCopy("unclaimed", "scheduler", "");
const SCHEDULER_LIVE_SESSIONS_OFF = entryBlockCopy("live_off", "scheduler", "");

export class OrgLearnerError extends Error {
  readonly code:
    | "invalid_name"
    | "brief_too_long"
    | "missing_email"
    | "not_org_learner"
    | "already_connected";

  constructor(code: OrgLearnerError["code"]) {
    super(code);
    this.name = "OrgLearnerError";
    this.code = code;
  }
}

type NameClient = Prisma.TransactionClient | typeof db;

export function orgLearnerFullName(givenName: string, familyName: string): {
  givenName: string;
  familyName: string;
  studentName: string;
} {
  const given = givenName.trim();
  const family = familyName.trim();
  if (!given || !family) throw new OrgLearnerError("invalid_name");
  return { givenName: given, familyName: family, studentName: `${given} ${family}` };
}

/**
 * The only writer of givenName, familyName, and Student.name for an org learner.
 */
export async function writeOrgLearnerName(
  client: NameClient,
  studentId: string,
  givenName: string,
  familyName: string
): Promise<{ givenName: string; familyName: string; studentName: string }> {
  const names = orgLearnerFullName(givenName, familyName);
  const row = await client.student.findUnique({
    where: { id: studentId },
    select: { organizationId: true },
  });
  if (!row?.organizationId) throw new OrgLearnerError("not_org_learner");
  await client.organizationLearner.update({
    where: { studentId },
    data: { givenName: names.givenName, familyName: names.familyName },
  });
  await client.student.update({
    where: { id: studentId },
    data: { name: names.studentName },
  });
  return names;
}

function assertBrief(brief: string): string {
  const trimmed = brief.trim();
  if (trimmed.length > ORG_LEARNER_BRIEF_MAX_CHARS) throw new OrgLearnerError("brief_too_long");
  return trimmed;
}

export async function createOrgLearner(input: {
  organizationId: string;
  givenName: string;
  familyName: string;
  brief: string;
  /** "the student" is a self-learner. "their parent" is a child learner. */
  inviteFor: "student" | "parent";
  email: string;
}): Promise<{ studentId: string; inviteId: string }> {
  const actor = await assertOrgRole(input.organizationId, ["owner", "admin"]);
  const email = normalizeEmail(input.email);
  if (!email) throw new OrgLearnerError("missing_email");
  const names = orgLearnerFullName(input.givenName, input.familyName);
  const brief = assertBrief(input.brief);
  const targetKind = input.inviteFor === "student" ? "self_learner" : "child_learner";
  const now = new Date();

  const created = await db.$transaction(async (tx) => {
    await assertCanAddOrgLearner(tx, input.organizationId, now);
    await assertCanSendOrgClaimEmail(tx, input.organizationId, now);
    const student = await tx.student.create({
      data: {
        name: names.studentName,
        parentEmail: email,
        adminUserId: null,
        organizationId: input.organizationId,
        organizationLearner: {
          create: {
            organizationId: input.organizationId,
            givenName: names.givenName,
            familyName: names.familyName,
            brief,
            createdByAdminUserId: actor.adminId,
          },
        },
      },
      select: { id: true },
    });
    const minted = await mintStudentClaimInvite({
      studentId: student.id,
      adminUserId: actor.adminId,
      recipientEmail: email,
      targetKind,
      studentDisplayName: names.studentName,
      sendEmail: false,
      client: tx,
    });
    return { studentId: student.id, inviteId: minted.inviteId, inviteLink: minted.inviteLink };
  });

  const mailed = await sendClaimInviteEmail(
    email,
    `${getPublicBaseUrl()}${created.inviteLink}`,
    names.studentName,
    { inviteId: created.inviteId }
  );
  if (!mailed.sent) {
    console.error(
      `[org] org=${input.organizationId} action=learner_invite_send_fail student=${created.studentId}`
    );
  }

  orgLog(input.organizationId, "learner_created", {
    actor: actor.adminId,
    student: created.studentId,
    inv: created.inviteId.slice(0, 8),
  });
  return created;
}

export async function reinviteOrgLearner(
  organizationId: string,
  studentId: string
): Promise<{ inviteId: string }> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, adminUserId: null },
    select: {
      id: true,
      name: true,
      parentEmail: true,
      learnerProfileId: true,
      organizationLearner: { select: { givenName: true } },
    },
  });
  if (!student?.parentEmail || !student.organizationLearner) notFound();
  if (student.learnerProfileId) throw new OrgLearnerError("already_connected");

  const targetKind = await reinviteTargetKind(student);
  const now = new Date();
  const minted = await db.$transaction(async (tx) => {
    await assertCanSendOrgClaimEmail(tx, organizationId, now);
    return mintStudentClaimInvite({
      studentId: student.id,
      adminUserId: actor.adminId,
      recipientEmail: student.parentEmail!,
      targetKind,
      studentDisplayName: student.name,
      sendEmail: false,
      client: tx,
    });
  });
  await sendClaimInviteEmail(
    student.parentEmail,
    `${getPublicBaseUrl()}${minted.inviteLink}`,
    student.name,
    { inviteId: minted.inviteId }
  );
  orgLog(organizationId, "learner_reinvited", {
    actor: actor.adminId,
    student: student.id,
    inv: minted.inviteId.slice(0, 8),
  });
  return { inviteId: minted.inviteId };
}

export type SchedulerLearnerCard = {
  studentId: string;
  fullName: string;
  brief: string;
  blockedReason: string | null;
};

/** Full name, the brief, and a short blocked reason. Never parent email, toggles, or notes. */
export async function loadSchedulerLearner(
  organizationId: string,
  studentId: string
): Promise<SchedulerLearnerCard> {
  const actor = await assertOrgRole(organizationId, STAFF_HOME_ROLES);
  const student = await db.student.findFirst({
    where: { id: studentId, organizationId, adminUserId: null },
    select: {
      id: true,
      name: true,
      learnerProfileId: true,
      organizationLearner: {
        select: { givenName: true, familyName: true, brief: true },
      },
    },
  });
  if (!student?.organizationLearner) notFound();
  orgLog(organizationId, "learner_record_view", {
    actor: actor.adminId,
    student: student.id,
  });
  const side = student.organizationLearner;
  const fullName = orgLearnerFullName(side.givenName, side.familyName).studentName;
  let blockedReason: string | null = null;
  if (!student.learnerProfileId) {
    blockedReason = SCHEDULER_WAITING_ON_FAMILY;
  } else {
    const consent = await db.consentRecord.findFirst({
      where: { learnerProfileId: student.learnerProfileId, organizationId },
      orderBy: { version: "desc" },
      select: { allowLiveSession: true },
    });
    if (consent && consent.allowLiveSession === false) {
      blockedReason = SCHEDULER_LIVE_SESSIONS_OFF;
    }
  }
  return {
    studentId: student.id,
    fullName,
    brief: side.brief,
    blockedReason,
  };
}

/** Scheduler roster. Same fields as one card. No parent email. */
export async function listSchedulerLearners(
  organizationId: string
): Promise<SchedulerLearnerCard[]> {
  await assertOrgRole(organizationId, STAFF_HOME_ROLES);
  const rows = await db.student.findMany({
    where: { organizationId, adminUserId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const cards: SchedulerLearnerCard[] = [];
  for (const row of rows) {
    cards.push(await loadSchedulerLearner(organizationId, row.id));
  }
  return cards;
}

export type OrgLearnerRecord = {
  studentId: string;
  fullName: string;
  brief: string;
  parentEmail: string;
  claimed: boolean;
};

/** Owner and admin see the record they entered, including parent email. */
export async function loadOrgLearnerRecords(
  organizationId: string
): Promise<OrgLearnerRecord[]> {
  const actor = await assertOrgRole(organizationId, ["owner", "admin"]);
  const rows = await db.organizationLearner.findMany({
    where: { organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      givenName: true,
      familyName: true,
      brief: true,
      student: {
        select: { id: true, parentEmail: true, learnerProfileId: true },
      },
    },
  });
  orgLog(organizationId, "learner_record_view", { actor: actor.adminId });
  return rows.map((row) => ({
    studentId: row.student.id,
    fullName: orgLearnerFullName(row.givenName, row.familyName).studentName,
    brief: row.brief,
    parentEmail: row.student.parentEmail ?? "",
    claimed: row.student.learnerProfileId != null,
  }));
}

export type InstructorTaughtSession = {
  sessionId: string;
  noteCount: number;
  replayAvailable: boolean;
  audioAvailable: boolean;
  transcriptAvailable: boolean;
};

export type InstructorTaughtGroup = {
  studentId: string;
  fullName: string;
  sessions: InstructorTaughtSession[];
};

/**
 * Sessions this instructor taught in the organization, grouped by learner.
 * Omit `studentId` for every learner they taught. A student id that is missing
 * or that they did not teach returns no groups — the same empty result, so the
 * caller cannot tell those cases apart. The result has no parent email.
 */
export async function loadInstructorTaughtSessions(
  organizationId: string,
  studentId?: string
): Promise<InstructorTaughtGroup[]> {
  const actor = await assertOrgRole(organizationId, [
    "owner",
    "admin",
    "scheduler",
    "instructor",
  ]);
  const learnerFilter = studentId?.trim() ?? "";
  orgLog(organizationId, "taught_session_list", {
    actor: actor.adminId,
    learner: learnerFilter ? "requested" : "all",
  });
  const sessions = await db.whiteboardSession.findMany({
    where: {
      adminUserId: actor.adminId,
      ...(learnerFilter ? { studentId: learnerFilter } : {}),
      student: { organizationId, adminUserId: null },
    },
    select: {
      id: true,
      studentId: true,
      eventsBlobUrl: true,
      student: {
        select: {
          organizationLearner: { select: { givenName: true, familyName: true } },
        },
      },
      _count: { select: { audioRecordings: true } },
    },
  });
  const sessionIds = sessions.map((session) => session.id);
  const [noteGroups, transcriptGroups] = await Promise.all([
    sessionIds.length === 0
      ? []
      : db.sessionNote.findMany({
          where: { whiteboardSessions: { some: { id: { in: sessionIds } } } },
          select: { whiteboardSessions: { select: { id: true } } },
        }),
    sessionIds.length === 0
      ? []
      : db.transcriptChunk.findMany({
          where: { sessionId: { in: sessionIds }, transcript: { not: "" } },
          select: { sessionId: true },
        }),
  ]);
  const notesBySession = new Map<string, number>();
  for (const note of noteGroups) {
    for (const linked of note.whiteboardSessions) {
      notesBySession.set(linked.id, (notesBySession.get(linked.id) ?? 0) + 1);
    }
  }
  const transcripts = new Set(transcriptGroups.map((row) => row.sessionId));

  const groups = new Map<string, InstructorTaughtGroup>();
  for (const session of sessions) {
    const learner = session.student.organizationLearner;
    if (!learner) continue;
    let group = groups.get(session.studentId);
    if (!group) {
      group = {
        studentId: session.studentId,
        fullName: orgLearnerFullName(learner.givenName, learner.familyName).studentName,
        sessions: [],
      };
      groups.set(session.studentId, group);
    }
    group.sessions.push({
      sessionId: session.id,
      noteCount: notesBySession.get(session.id) ?? 0,
      replayAvailable: session.eventsBlobUrl.length > 0,
      audioAvailable: session._count.audioRecordings > 0,
      transcriptAvailable: transcripts.has(session.id),
    });
  }
  return [...groups.values()];
}
