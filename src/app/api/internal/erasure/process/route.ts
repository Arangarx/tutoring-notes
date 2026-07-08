/**
 * E5a — erasure worker batch endpoint (cron + manual POST).
 *
 * Auth: `Authorization: Bearer $ERASURE_WORKER_SECRET` or Vercel Cron
 * `CRON_SECRET` bearer (see erasure-worker-auth.ts).
 *
 * GET is supported for Vercel Cron (cron invocations are GET-only).
 */

import { NextResponse } from "next/server";
import { verifyErasureWorkerAuth } from "@/lib/erasure/erasure-worker-auth";
import { processErasureBatch } from "@/lib/erasure/process-erasure-batch";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handleProcess(req: Request): Promise<Response> {
  if (!verifyErasureWorkerAuth(req)) {
    console.warn("[ers] action=worker_auth_rejected");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await processErasureBatch();

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}

export async function GET(req: Request): Promise<Response> {
  return handleProcess(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleProcess(req);
}
