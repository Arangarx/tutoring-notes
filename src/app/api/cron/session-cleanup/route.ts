/**
 * Session cleanup cron (consent wave C4b). Today one job: the board purge sweep for whiteboard-off
 * sessions. The job runs in its own try/catch so a later job (the reaper) cannot be starved by it, and a
 * throwing purge is a 500 naming the job; the next run retries from the stamped intent.
 *
 * Every budget is measured from `routeStart`, the route's first statement, so time spent before a job
 * still counts against `maxDuration`.
 */

import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { SESSION_CLEANUP_MARGIN_MS } from "@/lib/session-cleanup-config";
import { runBoardPurgeSweep } from "@/lib/whiteboard/board-purge";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const routeStart = Date.now();
  if (!verifyCronSecret(req)) {
    console.warn("[slc] cron=session-cleanup action=auth_rejected");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const deadline = routeStart + maxDuration * 1000 - SESSION_CLEANUP_MARGIN_MS;
  try {
    const purge = await runBoardPurgeSweep({ deadline });
    return NextResponse.json({ ok: true, purge });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[slc] cron=session-cleanup job=purge action=job_error err=${message}`);
    return NextResponse.json({ ok: false, failedJob: "purge", error: message }, { status: 500 });
  }
}
