/**
 * Local Playwright harness identity — paired with `tests/visual/helpers.ts` TEST_ADMIN.
 * Only active when `NEXT_PUBLIC_WB_E2E_SCENE_HOOK=1` (set by playwright.config.ts webServer).
 */
export const PLAYWRIGHT_HARNESS_ADMIN_EMAIL = "playwright@test.local";

export function isPlaywrightHarnessActive(): boolean {
  return process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK === "1";
}

export function isPlaywrightHarnessAdminEmail(
  email: string | undefined | null
): boolean {
  return email === PLAYWRIGHT_HARNESS_ADMIN_EMAIL;
}
