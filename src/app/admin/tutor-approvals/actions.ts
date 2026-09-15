"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperatorEmail } from "@/lib/operator";
import { z } from "zod";
import {
  addTutorEmailAllowlistEntry,
  approveTutor,
  rejectTutor,
  removeTutorEmailAllowlistEntry,
  revokeTutorApproval,
} from "@/lib/tutor-approval-scope";
import { db } from "@/lib/db";
import { isPrismaUniqueViolation } from "@/lib/db/prisma-errors";
import type { TutorEmailAllowlistEntry } from "@/lib/tutor-approval-scope";

export type TutorApprovalActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type TutorAllowlistAddResult =
  | { ok: true; entry: TutorEmailAllowlistEntry }
  | { ok: false; error: string };

async function requireOperatorSession(): Promise<
  { ok: true; operatorId: string } | { ok: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!isOperatorEmail(session?.user?.email)) {
    notFound();
  }

  const operatorId = session!.user!.id;
  if (!operatorId) {
    return { ok: false, error: "Operator session has no user id." };
  }

  return { ok: true, operatorId };
}

/**
 * Approve a WAITLISTED tutor. Operator-only.
 * Logs [tap] on success.
 */
export async function approveTutorAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true, email: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus === "APPROVED") {
    return { ok: false, error: "Tutor is already approved." };
  }

  if (target.approvalStatus === "REJECTED") {
    return { ok: false, error: "Rejected tutors cannot be approved." };
  }

  await approveTutor(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}

/**
 * Reject a WAITLISTED tutor. Operator-only.
 */
export async function rejectTutorAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus === "APPROVED") {
    return { ok: false, error: "Approved tutors cannot be rejected. Revoke access first." };
  }

  if (target.approvalStatus === "REJECTED") {
    return { ok: true };
  }

  await rejectTutor(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}

/**
 * Revoke an APPROVED tutor's access (returns them to WAITLISTED). Operator-only.
 */
export async function revokeTutorApprovalAction(
  adminUserId: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const target = await db.adminUser.findUnique({
    where: { id: adminUserId },
    select: { id: true, approvalStatus: true },
  });

  if (!target) {
    return { ok: false, error: "Tutor account not found." };
  }

  if (target.approvalStatus !== "APPROVED") {
    return { ok: false, error: "Only approved tutors can have access revoked." };
  }

  await revokeTutorApproval(adminUserId, operator.operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}

const allowlistEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

/**
 * Add a normalized email to the pre-approve allowlist. Operator-only.
 * Returns the created row so the client can update local list state directly
 * (same pattern as removeTutorEmailAllowlist / TutorWaitlistActions) instead
 * of forcing a full page reload.
 */
export async function addTutorEmailAllowlist(
  email: string
): Promise<TutorAllowlistAddResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const parsed = allowlistEmailSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  let entry: TutorEmailAllowlistEntry;
  try {
    entry = await addTutorEmailAllowlistEntry(parsed.data.email, operator.operatorId);
  } catch (error) {
    if (isPrismaUniqueViolation(error)) {
      return { ok: false, error: "That email is already on the allowlist." };
    }
    throw error;
  }

  revalidatePath("/admin/tutor-approvals");
  return { ok: true, entry };
}

/**
 * Remove an allowlist row before signup. Operator-only.
 */
export async function removeTutorEmailAllowlist(
  id: string
): Promise<TutorApprovalActionResult> {
  const operator = await requireOperatorSession();
  if (!operator.ok) return operator;

  const row = await db.tutorEmailAllowlist.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!row) {
    return { ok: false, error: "Allowlist entry not found." };
  }

  await removeTutorEmailAllowlistEntry(id);
  revalidatePath("/admin/tutor-approvals");
  return { ok: true };
}
