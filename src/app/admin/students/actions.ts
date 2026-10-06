"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize-email";
import { requireStudentScope, studentsWhereForScope } from "@/lib/student-scope";
import { parseChildRosterHandle } from "@/lib/parse-child-roster-handle";
import { mintStudentClaimInvite } from "@/lib/claim-invite-service";
import { isSelfLearnerPendingInvite } from "@/lib/roster-invite-target";

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

/**
 * Resolve child identifier: plain id or username@familyid (anti-enumeration on miss).
 */
async function resolveChildRosterIdentifier(raw: string): Promise<
  | { ok: true; childLabel: string }
  | { ok: false; message: string }
> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, message: invalidChildIdentifierMessage() };
  }

  const parsed = parseChildRosterHandle(trimmed);
  if (!parsed) {
    return { ok: true, childLabel: trimmed };
  }

  const ah = await db.accountHolder.findUnique({
    where: { familyId: parsed.familyId },
    select: { id: true },
  });
  if (!ah) {
    return { ok: false, message: invalidChildIdentifierMessage() };
  }

  const cred = await db.learnerCredential.findUnique({
    where: {
      accountHolderId_username: {
        accountHolderId: ah.id,
        username: parsed.username,
      },
    },
    select: { id: true },
  });
  if (!cred) {
    return { ok: false, message: invalidChildIdentifierMessage() };
  }

  return { ok: true, childLabel: trimmed.toLowerCase() };
}

export async function createStudent(
  _prev: CreateStudentResult | null,
  formData: FormData
): Promise<CreateStudentResult> {
  const scope = await requireStudentScope();
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
    const resolved = await resolveChildRosterIdentifier(childIdentifier);
    if (!resolved.ok) {
      return { status: "error", message: resolved.message };
    }
    rosterName = resolved.childLabel;
  }

  const where = studentsWhereForScope(scope);

  const student = await db.student.create({
    data: {
      name: rosterName,
      parentEmail,
      ...where,
    },
  });

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
      return {
        status: "error",
        message: "Too many pending invites for this learner. Retry later from the learner profile.",
      };
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
    throw err;
  }
}
