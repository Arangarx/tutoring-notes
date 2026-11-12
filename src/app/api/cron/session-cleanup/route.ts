/**
 * Session cleanup cron (consent waves C4b + C4c). Two jobs, in this order: the stale-session reaper, then the
 * board purge sweep for whiteboard-off sessions. Each runs in its own try/catch, so a throwing job cannot starve
 * the other; if either threw the route returns 500 naming the failed job(s) and the next run retries from the
 * durable state (the stamped intent, the still-open session).
 *
 * Every budget is measured from `routeStart`, the route's first statement, so time spent before a job
 * still counts against `maxDuration`. The reaper is capped at its own share; the purge gets whatever is left
 * up to the route deadline.
 */

import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { SESSION_CLEANUP_MARGIN_MS, SESSION_REAPER_TIME_BUDGET_MS } from "@/lib/session-cleanup-config";
import { runBoardPurgeSweep } from "@/lib/whiteboard/board-purge";
import { resolveReaperModeForRun, runStaleSessionReaper } from "@/lib/whiteboard/stale-session-reaper";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const routeStart = Date.now();
  if (!verifyCronSecret(req)) {
    console.warn("[slc] cron=session-cleanup action=auth_rejected");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const routeDeadline = routeStart + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS;
  const reaperDeadline = Math.min(routeStart + SESSION_REAPER_TIME_BUDGET_MS, routeDeadline);
  const failedJobs: Array<{ job: "reaper" | "purge"; error: string }> = [];
  let reaper: Awaited<ReturnType<typeof runStaleSessionReaper>> | null = null;
  let purge: Awaited<ReturnType<typeof runBoardPurgeSweep>> | null = null;

  try {
    reaper = await runStaleSessionReaper({ mode: resolveReaperModeForRun(), deadline: reaperDeadline });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[slc] cron=session-cleanup job=reaper action=job_error err=${message}`);
    failedJobs.push({ job: "reaper", error: message });
  }

  try {
    purge = await runBoardPurgeSweep({ deadline: routeDeadline });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[slc] cron=session-cleanup job=purge action=job_error err=${message}`);
    failedJobs.push({ job: "purge", error: message });
  }

  if (failedJobs.length > 0) {
    return NextResponse.json(
      { ok: false, failedJob: failedJobs[0].job, failedJobs, error: failedJobs[0].error, reaper, purge },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, reaper, purge });
}
