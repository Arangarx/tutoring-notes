/**
 * Local Playwright harness identity — paired with `tests/visual/helpers.ts` TEST_ADMIN.
 *
 * Two separate flags govern the harness:
 *   - NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1  — CLIENT-SIDE only; mounts the e2e bridge in the
 *     browser bundle. Set by playwright.config.ts webServer. Safe to be public because it
 *     only enables a UI hook, carries no auth privilege.
 *   - WB_E2E_HARNESS=1  — SERVER-ONLY (not NEXT_PUBLIC_); gates the 2FA bypass in
 *     auth-options.ts. Never set in Vercel env vars (prod or preview). Explicit opt-in
 *     required in the webServer command to keep the harness working locally.
 *
 * Defense-in-depth: Vercel sets VERCEL=1 in ALL deployments (prod + preview). If
 * WB_E2E_HARNESS were ever accidentally set in a Vercel env var, the VERCEL guard
 * blocks the bypass at runtime.
 */
export const PLAYWRIGHT_HARNESS_ADMIN_EMAIL = "playwright@test.local";
/** Identity e2e erasure operator — paired with tests/integration/identity/identity.helpers.ts */
export const PLAYWRIGHT_HARNESS_ERASURE_ADMIN_EMAIL =
  "playwright-erasure-admin@test.local";

export function isPlaywrightHarnessActive(): boolean {
  // WB_E2E_HARNESS must be explicitly set (server-only, not inlined into client bundle).
  // VERCEL is always "1" in every Vercel deployment — belt-and-suspenders against
  // misconfigured prod/preview env vars.
  return process.env.WB_E2E_HARNESS === "1" && !process.env.VERCEL;
}

export function isPlaywrightHarnessAdminEmail(
  email: string | undefined | null
): boolean {
  return (
    email === PLAYWRIGHT_HARNESS_ADMIN_EMAIL ||
    email === PLAYWRIGHT_HARNESS_ERASURE_ADMIN_EMAIL
  );
}
