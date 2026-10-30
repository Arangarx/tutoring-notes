/**
 * Production-build proof (`npm run test:prod-shape`, `next build && next start`): a refused
 * waiting-room Start shows the line for the learner's situation, not the generic failure.
 *
 * Why this exists: Next REDACTS a thrown server-action error in a production build, so an
 * implementation that throws a typed error and parses the message passes under `next dev`
 * (every other Playwright project) and shows the generic "Couldn't start the session" /
 * "Error ID" copy in production (commit e1994f9c shipped exactly that). Returned data
 * survives the boundary. Same fixtures and expected lines as the dev-server spec
 * (`wb-org-qol-bridge.spec.ts`), via `tests/helpers/refused-start.ts`.
 */

import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import {
  REFUSED_START_CASES,
  expectRefusedStartShown,
  seedPendingWithoutConsent,
} from "../helpers/refused-start";
import { TEST_ADMIN, seedTestAdmin } from "../visual/helpers";

/**
 * Must equal `NEXTAUTH_SECRET` in `playwright.prod-shape.config.ts`. A production server
 * enforces 2FA on every real tutor, a credentials login for a real tutor can never get past
 * it unattended, and the harness bypass env is deliberately absent here. So the suite signs
 * in the way the app's own post-2FA step ends: a NextAuth session JWT with
 * `twoFactorVerified: true`, minted with the server's secret.
 */
const PROD_SHAPE_NEXTAUTH_SECRET = "prod-shape-nextauth-secret-not-for-anything-real";

async function signInAsTutor(context: BrowserContext, baseURL: string, adminUserId: string) {
  const token = await encode({
    secret: PROD_SHAPE_NEXTAUTH_SECRET,
    token: {
      sub: adminUserId,
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.displayName,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerified: true,
      twoFactorVerified: true,
      isTestAccount: false,
    },
  });
  await context.addCookies([{ name: "next-auth.session-token", value: token, url: baseURL }]);
}

test.describe("refused waiting-room Start, production build", () => {
  let tutorId: string;

  test.beforeEach(async ({ context, baseURL }) => {
    tutorId = await seedTestAdmin();
    await signInAsTutor(context, baseURL!, tutorId);
  });

  test("the server under test is a production build (test routes are locked)", async ({
    request,
  }) => {
    // Independent oracle: the harness route 404s only when NODE_ENV=production (or a
    // production Vercel env). If this ever returns 200 the suite is not proving the shape.
    const res = await request.get("/api/test/playwright-harness");
    expect(res.status()).toBe(404);
  });

  for (const testCase of REFUSED_START_CASES) {
    test(`${testCase.situation}: the refusal reads the learner's own line`, async ({ page }) => {
      const seeded = await seedPendingWithoutConsent(testCase.situation, tutorId);
      await page.goto(
        `/admin/students/${seeded.studentId}/whiteboard/${seeded.whiteboardSessionId}/workspace`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });

      // No e2e bridge in a production build, so retry the click until hydration lets it land;
      // a refused Start is idempotent (nothing is written).
      const start = page.getByTestId("wb-start-session");
      await expect(start).toBeEnabled({ timeout: 30_000 });
      const error = page.getByTestId("wb-waiting-start-error");
      await expect(async () => {
        await start.click();
        await expect(error).toBeVisible({ timeout: 4_000 });
      }).toPass({ timeout: 60_000 });

      await expectRefusedStartShown(page, testCase, seeded);
    });
  }
});
