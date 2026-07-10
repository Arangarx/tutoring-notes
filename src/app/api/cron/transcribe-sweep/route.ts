/**
 * Recording re-arch Phase 1 — Vercel Cron backstop for orphaned TranscriptChunk rows.
 *
 * Invoked by Vercel Cron (see vercel.json). Auth: `Authorization: Bearer $CRON_SECRET`
 * when CRON_SECRET is set in project env (standard Vercel Cron pattern).
 *
 * Layer 2 of durable DB-as-queue transport — see transcribe-sweep.ts.
 * Layer 3 (end-session sweep) is deferred to slice 3.
 */

import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runTranscribeSweep } from "@/lib/recording/transcribe-sweep";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  if (!verifyCronSecret(req)) {
    console.warn("[txc] action=sweep_auth_rejected");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTranscribeSweep();

  return NextResponse.json({ ok: true, ...result }, { status: 200 });
}
