"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { sanitizeClaimDisplayName } from "@/lib/claim-display-name";
import { normalizeEmail } from "@/lib/normalize-email";
import { requireStudentScope, studentsWhereForScope } from "@/lib/student-scope";
import {
  countPendingClaimInvites,
  MAX_PENDING_CLAIM_INVITES,
  mintStudentClaimInvite,
  reinviteTargetKind,
  startOfTutorDay,
} from "@/lib/claim-invite-service";
import { rateLimit } from "@/lib/rate-limit";
import { isSelfLearnerPendingInvite } from "@/lib/roster-invite-target";
import {
  assertTutorApproved,
  TutorNotApprovedError,
} from "@/lib/tutor-approval-scope";

export type CreateStudentResult =
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "invite_send_failed"; studentId: string; message: string };

export type RetryInviteResult =
  | { status: "success" }
  | { status: "error"; message: string }
  | { status: "invite_send_failed"; message: string };

function invalidChildIdentifierMessage(): string {
  return "Enter a child identifier or a login handle in the form username@familyid.";
}

/** Tutor-owned students since the start of that tutor's day. An org learner does not count. */
const TUTOR_DAILY_STUDENT_CAP = 20;

const TUTOR_DAILY_STUDENT_CAP_MESSAGE =
  "You have reached today's limit for new students. Try again tomorrow.";

const CREATE_STUDENT_BURST_MESSAGE = "Too many attempts. Try again later.";

const TUTOR_DAILY_CLAIM_CAP_MESSAGE =
  "You have reached today's limit for claim emails. Try again tomorrow.";

class TutorDailyStudentCapError extends Error {
  constructor() {
    super("tutor_daily_student_cap");
    this.name = "TutorDailyStudentCapError";
  }
}

/** Child name or username@familyid, stored as the roster label. Not a family lookup. */
function resolveChildRosterIdentifier(raw: string):
  | { ok: true; childLabel: string }
  | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: invalidChildIdentifierMessage() };
  }
  return { ok: true, childLabel: trimmed };
}

function tutorOwnedSince(adminUserId: string, start: Date) {
  return {
    adminUserId,
    organizationId: null as null,
    createdAt: { gte: start },
  };
}

export async function createStudent(
  _prev: CreateStudentResult | null,
  formData: FormData
): Promise<CreateStudentResult> {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") {
    return {
      status: "error",
      message: "A registered tutor account is required to add a learner.",
    };
  }
  try {
    await assertTutorApproved(scope.adminId, { surface: "create_student" });
  } catch (err) {
    if (err instanceof TutorNotApprovedError) {
      return {
        status: "error",
        message: "Your account is not approved to add learners yet.",
      };
    }
    throw err;
  }

  const learnerKind = String(formData.get("learnerKind") ?? "").trim();
  const inviteEmail = normalizeEmail(String(formData.get("inviteEmail") ?? ""));
  const childIdentifier = String(formData.get("childIdentifier") ?? "").trim();
  if (learnerKind !== "self_learner" && learnerKind !== "child_learner") {
    return { status: "error", message: "Choose Self learner / Parent or Child learner." };
  }

  if (!inviteEmail) {
    return { status: "error", message: "A valid email address is required." };
  }

  let rosterName: string;
  let parentEmail: string;

  if (learnerKind === "self_learner") {
    parentEmail = inviteEmail;
    rosterName = inviteEmail;
  } else {
    parentEmail = inviteEmail;
    const resolved = resolveChildRosterIdentifier(childIdentifier);
    if (!resolved.ok) {
      return { status: "error", message: resolved.message };
    }
    const safeLabel = sanitizeClaimDisplayName(resolved.childLabel);
    if (!safeLabel) {
      return { status: "error", message: "Enter a name or username@familyid." };
    }
    rosterName = safeLabel;
  }

  const where = studentsWhereForScope(scope);
  const dayStart = await startOfTutorDay(scope.adminId, new Date());
  const createdToday = await db.student.count({
    where: tutorOwnedSince(scope.adminId, dayStart),
  });
  if (createdToday >= TUTOR_DAILY_STUDENT_CAP) {
    return { status: "error", message: TUTOR_DAILY_STUDENT_CAP_MESSAGE };
  }

  // 10 attempts per 15 minutes, keyed by tutor. Distinct from auth/ip buckets.
  const createStudentBurstAttempts = 10;
  const createStudentBurstWindowMs = 15 * 60 * 1000;
  const burst = rateLimit(
    `create-student:${scope.adminId}`,
    createStudentBurstAttempts,
    createStudentBurstWindowMs
  );
  if (!burst.allowed) {
    return { status: "error", message: CREATE_STUDENT_BURST_MESSAGE };
  }

  let student;
  try {
    student = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AdminUser" WHERE id = ${scope.adminId} FOR UPDATE`;
      const lockedCount = await tx.student.count({
        where: tutorOwnedSince(scope.adminId, dayStart),
      });
      if (lockedCount >= TUTOR_DAILY_STUDENT_CAP) {
        throw new TutorDailyStudentCapError();
      }
      return tx.student.create({
        data: {
          name: rosterName,
          parentEmail,
          ...where,
        },
      });
    });
  } catch (err) {
    if (err instanceof TutorDailyStudentCapError) {
      return { status: "error", message: TUTOR_DAILY_STUDENT_CAP_MESSAGE };
    }
    throw err;
  }

  const pendingBeforeMint = await countPendingClaimInvites(student.id);
  if (pendingBeforeMint >= MAX_PENDING_CLAIM_INVITES) {
    await db.student.delete({ where: { id: student.id } });
    return {
      status: "error",
      message: "Too many pending invites for this learner. Retry later from the learner profile.",
    };
  }

  const emailRecipient = parentEmail;
  const inviteLabel = isSelfLearnerPendingInvite({
    name: student.name,
    parentEmail: student.parentEmail,
    learnerProfileId: null,
  })
    ? emailRecipient
    : student.name;

  try {
    const minted = await mintStudentClaimInvite({
      studentId: student.id,
      adminUserId: where.adminUserId!,
      recipientEmail: emailRecipient,
      targetKind: learnerKind,
      studentDisplayName: inviteLabel,
      sendEmail: true,
    });

    revalidatePath("/admin/students");

    if (!minted.emailSent) {
      return {
        status: "invite_send_failed",
        studentId: student.id,
        message:
          minted.emailError ??
          "The learner was added but the invitation email could not be sent. Retry sending the invite.",
      };
    }

    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "too_many_pending_invites") {
      await db.student.delete({ where: { id: student.id } }).catch(() => undefined);
      return {
        status: "error",
        message: "Too many pending invites for this learner. Retry later from the learner profile.",
      };
    }
    if (message === "tutor_daily_claim_cap") {
      await db.student.delete({ where: { id: student.id } }).catch(() => undefined);
      return { status: "error", message: TUTOR_DAILY_CLAIM_CAP_MESSAGE };
    }
    throw err;
  }
}

export async function retryStudentClaimInvite(
  _prev: RetryInviteResult | null,
  formData: FormData
): Promise<RetryInviteResult> {
  const scope = await requireStudentScope();
  const studentId = String(formData.get("studentId") ?? "").trim();
  if (!studentId) {
    return { status: "error", message: "Missing learner." };
  }

  const where = studentsWhereForScope(scope);
  const student = await db.student.findFirst({
    where: { id: studentId, ...where },
    select: {
      id: true,
      name: true,
      parentEmail: true,
      learnerProfileId: true,
      adminUserId: true,
    },
  });

  if (!student) {
    return { status: "error", message: "Learner not found." };
  }
  if (student.learnerProfileId) {
    return { status: "error", message: "This learner is already connected." };
  }
  if (!student.parentEmail) {
    return { status: "error", message: "No invitation email on file for this learner." };
  }

  const inviteLabel = isSelfLearnerPendingInvite(student)
    ? student.parentEmail
    : student.name;

  try {
    const minted = await mintStudentClaimInvite({
      studentId: student.id,
      adminUserId: student.adminUserId!,
      recipientEmail: student.parentEmail,
      targetKind: await reinviteTargetKind(student),
      studentDisplayName: inviteLabel,
      sendEmail: true,
    });

    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${student.id}`);

    if (!minted.emailSent) {
      return {
        status: "invite_send_failed",
        message:
          minted.emailError ?? "The invitation email could not be sent. Try again.",
      };
    }

    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "too_many_pending_invites") {
      return {
        status: "error",
        message: "Too many pending invites. Wait for an existing invite to expire.",
      };
    }
    if (message === "tutor_daily_claim_cap") {
      return { status: "error", message: TUTOR_DAILY_CLAIM_CAP_MESSAGE };
    }
    throw err;
  }
}
