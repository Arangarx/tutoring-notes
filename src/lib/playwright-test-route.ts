import { NextRequest, NextResponse } from "next/server";

/** Production deploys must hard-404 test routes even if Playwright sentinels leak. */
export function isPlaywrightTestProductionLocked(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/**
 * The ONE test-gate predicate: the Playwright sentinel is set AND this is not a
 * production runtime. `next start` (what `npm run test:prod-shape` runs) is
 * NODE_ENV=production, so every gate built on this is closed there even if a
 * sentinel leaks into the environment. The blob harness and the test seams
 * (`src/lib/test-seams.ts`) both compose it; nothing re-derives it.
 */
export function isPlaywrightTestEnvEnabled(): boolean {
  return (
    !isPlaywrightTestProductionLocked() && process.env.PLAYWRIGHT_TEST === "1"
  );
}

function isPlaywrightTestRouteEnv(): boolean {
  return (
    process.env.NODE_ENV === "test" || process.env.PLAYWRIGHT_TEST === "1"
  );
}

/**
 * Canonical gate for `/api/test/whiteboard/*` Playwright helpers.
 * Returns a response when the request must be rejected; `null` when allowed.
 */
export function guardPlaywrightTestRoute(
  req: NextRequest
): NextResponse | null {
  if (isPlaywrightTestProductionLocked()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isPlaywrightTestRouteEnv()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const secret = process.env.PLAYWRIGHT_TEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
