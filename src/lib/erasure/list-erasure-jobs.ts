/**
 * E5b — admin list query for erasure jobs (operator UI).
 */

import type { ErasureJobStatus, ErasureScopeKind } from "@prisma/client";
import { db } from "@/lib/db";

const ACTIVE_STATUSES: ErasureJobStatus[] = [
  "requested",
  "blobs_purging",
  "db_scrubbing",
];

export type ErasureJobListRow = {
  id: string;
  scopeKind: ErasureScopeKind;
  scopeId: string;
  /** Resolved display name when job is active; null for terminal jobs. */
  scopeLabel: string | null;
  status: ErasureJobStatus;
  requestedAt: Date;
  purgeEligibleAt: Date;
  completedAt: Date | null;
  canceledAt: Date | null;
};

export async function listErasureJobsForAdmin(): Promise<ErasureJobListRow[]> {
  const jobs = await db.erasureJob.findMany({
    orderBy: { requestedAt: "desc" },
    take: 100,
    select: {
      id: true,
      scopeKind: true,
      scopeId: true,
      status: true,
      requestedAt: true,
      purgeEligibleAt: true,
      completedAt: true,
      canceledAt: true,
    },
  });

  const activeLearnerIds = new Set<string>();
  const activeAccountHolderIds = new Set<string>();

  for (const job of jobs) {
    if (!ACTIVE_STATUSES.includes(job.status)) continue;
    if (job.scopeKind === "learner_profile") {
      activeLearnerIds.add(job.scopeId);
    } else {
      activeAccountHolderIds.add(job.scopeId);
    }
  }

  const [learnerProfiles, accountHolders] = await Promise.all([
    activeLearnerIds.size > 0
      ? db.learnerProfile.findMany({
          where: { id: { in: [...activeLearnerIds] } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    activeAccountHolderIds.size > 0
      ? db.accountHolder.findMany({
          where: { id: { in: [...activeAccountHolderIds] } },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
  ]);

  const learnerLabelById = new Map(
    learnerProfiles.map((p) => [p.id, p.displayName] as const)
  );
  const accountHolderLabelById = new Map(
    accountHolders.map((a) => [a.id, a.displayName] as const)
  );

  return jobs.map((job) => {
    let scopeLabel: string | null = null;
    if (ACTIVE_STATUSES.includes(job.status)) {
      if (job.scopeKind === "learner_profile") {
        scopeLabel = learnerLabelById.get(job.scopeId) ?? null;
      } else {
        scopeLabel = accountHolderLabelById.get(job.scopeId) ?? null;
      }
    }

    return {
      id: job.id,
      scopeKind: job.scopeKind,
      scopeId: job.scopeId,
      scopeLabel,
      status: job.status,
      requestedAt: job.requestedAt,
      purgeEligibleAt: job.purgeEligibleAt,
      completedAt: job.completedAt,
      canceledAt: job.canceledAt,
    };
  });
}
