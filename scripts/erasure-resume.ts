/**
 * Manual erasure worker resume for support — calls processErasureJob for one job.
 *
 * Usage:
 *   npm run erasure:resume -- --jobId=<uuid>
 *
 * Requires DATABASE_URL (and blob env vars if the job reaches blob purge).
 */

import { PrismaClient } from "@prisma/client";
import { processErasureJob } from "@/lib/erasure/process-erasure-job";

function parseJobId(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.startsWith("--jobId=")) {
      return arg.slice("--jobId=".length).trim() || null;
    }
    if (arg === "--jobId") {
      const idx = argv.indexOf(arg);
      return argv[idx + 1]?.trim() ?? null;
    }
  }
  return null;
}

const jobId = parseJobId(process.argv.slice(2));

if (!jobId) {
  console.error("Usage: npm run erasure:resume -- --jobId=<uuid>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const job = await prisma.erasureJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true },
  });

  if (!job) {
    console.error(`ErasureJob not found: ${jobId}`);
    process.exit(1);
  }

  console.log(`[ers] ers=${jobId} action=cli_resume prior=${job.status}`);
  const result = await processErasureJob(jobId);
  console.log(`[ers] ers=${jobId} action=cli_resume_done status=${result.status}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ers] ers=${jobId} action=cli_resume_error error=${msg}`);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
