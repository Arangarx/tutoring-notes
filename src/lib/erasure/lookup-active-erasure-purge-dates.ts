/**
 * Batch lookup of active ErasureJob purgeEligibleAt for roster/detail pages.
 */

import { db } from "@/lib/db";
import { ACTIVE_ERASURE_STATUSES } from "@/lib/erasure/active-erasure-scope";

export type ActiveErasurePurgeDateMaps = {
  byLearnerProfileId: Map<string, Date>;
  byAccountHolderId: Map<string, Date>;
};

export async function lookupActiveErasurePurgeDates(
  learnerProfileIds: string[],
  accountHolderIds: string[]
): Promise<ActiveErasurePurgeDateMaps> {
  const byLearnerProfileId = new Map<string, Date>();
  const byAccountHolderId = new Map<string, Date>();

  const orClauses: Array<{
    scopeKind: "learner_profile" | "account_holder";
    scopeId: { in: string[] };
  }> = [];

  if (learnerProfileIds.length > 0) {
    orClauses.push({
      scopeKind: "learner_profile",
      scopeId: { in: learnerProfileIds },
    });
  }
  if (accountHolderIds.length > 0) {
    orClauses.push({
      scopeKind: "account_holder",
      scopeId: { in: accountHolderIds },
    });
  }

  if (orClauses.length === 0) {
    return { byLearnerProfileId, byAccountHolderId };
  }

  const jobs = await db.erasureJob.findMany({
    where: {
      status: { in: ACTIVE_ERASURE_STATUSES },
      OR: orClauses,
    },
    select: {
      scopeKind: true,
      scopeId: true,
      purgeEligibleAt: true,
    },
  });

  for (const job of jobs) {
    if (job.scopeKind === "learner_profile") {
      byLearnerProfileId.set(job.scopeId, job.purgeEligibleAt);
    } else {
      byAccountHolderId.set(job.scopeId, job.purgeEligibleAt);
    }
  }

  return { byLearnerProfileId, byAccountHolderId };
}
