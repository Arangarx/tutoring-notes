import { NextRequest, NextResponse } from "next/server";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";
import {
  armFault,
  armHold,
  armReaperMode,
  disarmFault,
  disarmHold,
  disarmReaperMode,
  faultPointState,
  holdPointState,
  releaseHold,
  resetSeams,
  type FaultPointName,
  type HoldPointName,
} from "@/lib/test-seams";

/**
 * Test-only control surface for `src/lib/test-seams.ts` (consent wave C0).
 * Guarded by `guardPlaywrightTestRoute` (404 in any production runtime, test
 * secret required); the seam module re-checks its own gate on every arm.
 *
 *   GET  ?hold=<name>&sessionId=<id>   -> holdPointState (poll `parked`, never sleep)
 *   GET  ?fault=<name>[&sessionId=<id>] -> faultPointState
 *   POST { action, ... }               -> arm / release / disarm / reset
 */
export async function GET(req: NextRequest): Promise<Response> {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const hold = sp.get("hold");
  if (hold) {
    return NextResponse.json(
      holdPointState(hold as HoldPointName, sp.get("sessionId") ?? "")
    );
  }
  const fault = sp.get("fault");
  if (fault) {
    return NextResponse.json(
      faultPointState(fault as FaultPointName, sp.get("sessionId") ?? undefined)
    );
  }
  return NextResponse.json({ error: "Specify hold= or fault=" }, { status: 400 });
}

type SeamAction =
  | { action: "armHold"; name: HoldPointName; sessionId: string; parkFirstN?: number }
  | { action: "releaseHold"; name: HoldPointName; sessionId: string }
  | { action: "disarmHold"; name: HoldPointName; sessionId: string }
  | { action: "armFault"; name: FaultPointName; sessionId?: string; times?: number }
  | { action: "disarmFault"; name: FaultPointName; sessionId?: string }
  | { action: "armReaperMode"; raw: string | null; sticky?: boolean }
  | { action: "disarmReaperMode" }
  | { action: "reset" };

export async function POST(req: NextRequest): Promise<Response> {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as SeamAction | null;
  if (!body || typeof body.action !== "string") {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }
  try {
    switch (body.action) {
      case "armHold":
        armHold({ name: body.name, sessionId: body.sessionId, parkFirstN: body.parkFirstN });
        return NextResponse.json({ ok: true });
      case "releaseHold":
        return NextResponse.json({ ok: true, released: releaseHold(body.name, body.sessionId) });
      case "disarmHold":
        disarmHold(body.name, body.sessionId);
        return NextResponse.json({ ok: true });
      case "armFault":
        armFault({ name: body.name, sessionId: body.sessionId, times: body.times });
        return NextResponse.json({ ok: true });
      case "disarmFault":
        disarmFault(body.name, body.sessionId);
        return NextResponse.json({ ok: true });
      case "armReaperMode":
        armReaperMode(body.raw, { sticky: body.sticky });
        return NextResponse.json({ ok: true });
      case "disarmReaperMode":
        disarmReaperMode();
        return NextResponse.json({ ok: true });
      case "reset":
        resetSeams();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "seam error" },
      { status: 400 }
    );
  }
}
