"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";

/**
 * Create a new child LearnerProfile owned by the session AccountHolder.
 *
 * No Student/tutor link — parent-created learners start tutor-less.
 * accessMode starts as "account_holder_session" (parent selects); credential
 * setup (→ child_pin_required) is optional and done separately.
 *
 * IAC-2 note: tutor-connection for parent-created learners is OUT OF SCOPE
 * for MVP. TODO: tutor-discovery / connection flow for parent-created learners.
 *
 * Log: [lpr] lpr=<profileId> action=parent_created accountHolderId=<id>
 */
export async function createChildLearnerAction(
  displayName: string
): Promise<{ ok: boolean; error?: string; learnerProfileId?: string }> {
  const ahSession = await getAccountHolderSessionFromHeaders();
  if (!ahSession) return { ok: false, error: "unauthorized" };

  const trimmed = displayName.trim();
  if (!trimmed) return { ok: false, error: "invalid_name" };
  if (trimmed.length > 100) return { ok: false, error: "name_too_long" };

  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: ahSession.accountHolderId,
      displayName: trimmed,
      isSelfLearner: false,
      accessMode: "account_holder_session",
    },
  });

  console.log(
    `[lpr] lpr=${profile.id} action=parent_created accountHolderId=${ahSession.accountHolderId}`
  );

  revalidatePath("/account/dashboard");

  return { ok: true, learnerProfileId: profile.id };
}
