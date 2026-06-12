"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isOperatorEmail } from "@/lib/operator";
import { approveTutor } from "@/lib/tutor-approval-scope";
import { db } from "@/lib/db";

export type ApproveTutorResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Approve a WAITLISTED tutor. Operator-only.
 * Logs [tap] on success.
 */
export async function approveTutorAction(
  adminUserId: string
): Promise<ApproveTutorResult> {
  const session = await getServerSession(authOptions);

  if (!isOperatorEmail(session?.user?.email)) {
    notFound();
  }

  const operatorId = session!.user!.id;
  if (!operatorId) {
    return { ok: false, error: "Operator session has no user id." };
  }

  // Verify the target row exists and is WAITLISTED.
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

  await approveTutor(adminUserId, operatorId);

  revalidatePath("/admin/tutor-approvals");

  return { ok: true };
}
