import { NextRequest, NextResponse } from "next/server";

import { guardPlaywrightTestRoute } from "@/lib/playwright-test-route";

export const dynamic = "force-dynamic";

/**
 * globalSetup calls this to prove the process on :3100/:3101 was started
 * with PLAYWRIGHT_TEST=1. A reused `npm run dev` fails the guard.
 */
export function GET(req: NextRequest) {
  const denied = guardPlaywrightTestRoute(req);
  if (denied) return denied;
  return NextResponse.json(
    { playwrightTest: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
