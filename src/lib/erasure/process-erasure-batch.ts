/**
 * E5a — bounded batch driver for processErasureJob (cron / internal route).
 */

import { db } from "@/lib/db";
import { processErasureJob } from "@/lib/erasure/process-erasure-job";

const DEFAULT_BATCH_SIZE = 10;

export type ProcessErasureBatchResult = {
  processed: number;
  advanced: number;
  unchanged: number;
  errors: number;
  jobIds: string[];
};

/**
 * Select jobs needing work and invoke processErasureJob for each.
 * Tolerates per-job errors and continues the batch.
 */
export async function processErasureBatch(
  batchSize = DEFAULT_BATCH_SIZE
): Promise<ProcessErasureBatchResult> {
  const now = new Date();

  const jobs = await db.erasureJob.findMany({
    where: {
      OR: [
        { status: "requested", purgeEligibleAt: { lte: now } },
        { status: "blobs_purging" },
        { status: "db_scrubbing" },
      ],
    },
    orderBy: { requestedAt: "asc" },
    take: batchSize,
    select: { id: true, status: true },
  });

  let advanced = 0;
  let unchanged = 0;
  let errors = 0;
  const jobIds: string[] = [];

  for (const job of jobs) {
    jobIds.push(job.id);
    const priorStatus = job.status;

    try {
      const result = await processErasureJob(job.id);
      console.log(
        `[ers] ers=${job.id} action=worker_tick prior=${priorStatus} result=${result.status}`
      );
      if (result.status !== priorStatus) {
        advanced += 1;
      } else {
        unchanged += 1;
      }
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[ers] ers=${job.id} action=worker_error prior=${priorStatus} error=${msg.slice(0, 200)}`
      );
    }
  }

  return {
    processed: jobs.length,
    advanced,
    unchanged,
    errors,
    jobIds,
  };
}
