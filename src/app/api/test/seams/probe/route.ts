import { NextRequest, NextResponse } from "next/server";
import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";
import {
  faultPoint,
  holdPoint,
  readReaperModeOverride,
  SeamFaultError,
} from "@/lib/test-seams";

/**
 * Seam self-test probe (consent wave C0, cross-module seam self-test).
 *
 * C0 adds NO call sites to product functions, so the harness proves its own
 * wiring here: this route lives in a different bundle from `/api/test/seams`
 * (which arms), and calls the seams exactly as a product call site will. If the
 * armed state were module-scoped instead of globalThis-backed, a hold armed
 * through `/api/test/seams` would never park a call made here.
 *
 *   POST ?mode=hold&sessionId=<id>[&inTx=1] -> parks at `selftest:probe[:in_tx]`, then { passed: true }
 *   POST ?mode=fault[&sessionId=<id>]       -> 500 { fault: true } when `selftest:fault` is armed, else { fault: false }
 *   POST ?mode=reaper                       -> { override } from `readReaperModeOverride()`
 */
export async function POST(req: NextRequest): Promise<Response> {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode");

  if (mode === "hold") {
    const sessionId = sp.get("sessionId") ?? "";
    await holdPoint(sp.get("inTx") === "1" ? "selftest:probe:in_tx" : "selftest:probe", sessionId);
    return NextResponse.json({ passed: true });
  }
  if (mode === "fault") {
    try {
      faultPoint("selftest:fault", sp.get("sessionId") ?? undefined);
      return NextResponse.json({ fault: false });
    } catch (err) {
      if (err instanceof SeamFaultError) {
        return NextResponse.json({ fault: true }, { status: 500 });
      }
      throw err;
    }
  }
  if (mode === "reaper") {
    return NextResponse.json({ override: readReaperModeOverride() });
  }
  return NextResponse.json({ error: "Specify mode=hold|fault|reaper" }, { status: 400 });
}
