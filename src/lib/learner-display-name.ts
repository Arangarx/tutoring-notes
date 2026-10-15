import { sanitizeClaimDisplayName } from "@/lib/claim-display-name";
import { db } from "@/lib/db";

/**
 * Tutor-visible name for a learner the account holder owns.
 * Writes the profile and every private-tutor roster row. Organization roster
 * rows keep the name the organization stored. A self-learner's account name
 * is filled only when that account has none yet.
 */
export async function saveOwnedLearnerDisplayName(args: {
  accountHolderId: string;
  learnerProfileId: string;
  rawDisplayName: string;
}): Promise<
  { ok: true; displayName: string } | { ok: false; error: "missing_display_name" | "forbidden" }
> {
  const displayName = sanitizeClaimDisplayName(args.rawDisplayName);
  if (!displayName) return { ok: false, error: "missing_display_name" };

  const learnerProfile = await db.learnerProfile.findUnique({
    where: { id: args.learnerProfileId },
    select: {
      accountHolderId: true,
      isSelfLearner: true,
      tombstonedAt: true,
      accountHolder: { select: { displayName: true } },
    },
  });
  if (
    !learnerProfile ||
    learnerProfile.tombstonedAt !== null ||
    learnerProfile.accountHolderId !== args.accountHolderId
  ) {
    return { ok: false, error: "forbidden" };
  }

  await db.$transaction(async (tx) => {
    await tx.learnerProfile.update({
      where: { id: args.learnerProfileId },
      data: { displayName },
    });
    await tx.student.updateMany({
      where: {
        learnerProfileId: args.learnerProfileId,
        organizationId: null,
      },
      data: { name: displayName },
    });
    if (learnerProfile.isSelfLearner) {
      const ahDisplay = learnerProfile.accountHolder.displayName?.trim();
      if (!ahDisplay) {
        await tx.accountHolder.update({
          where: { id: args.accountHolderId },
          data: { displayName },
        });
      }
    }
  });

  return { ok: true, displayName };
}
