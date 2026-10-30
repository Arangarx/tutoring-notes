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
 *
 * Also the success path of the student-page Start button: a learner with a consent
 * record, click Start, land in the workspace, and the generic error copy never
 * appears during that navigation (a redirect that resolves `undefined` used to).
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import {
  REFUSED_START_CASES,
  expectRefusedStartShown,
  seedPendingWithoutConsent,
} from "../helpers/refused-start";
import { PROD_SHAPE_NEXTAUTH_SECRET } from "../helpers/prod-shape-secret";
import { TEST_ADMIN, seedTestAdmin } from "../visual/helpers";

/**
 * Same literal the production server was started with (`PROD_SHAPE_NEXTAUTH_SECRET`
 * in `playwright.prod-shape.config.ts`). A production server enforces 2FA on every
 * real tutor, and this server is not started with `WB_E2E_HARNESS`, so the harness
 * 2FA bypass cannot sign anyone in. The suite mints the session the app's own
 * post-2FA step would: a NextAuth JWT with `twoFactorVerified: true`.
 */

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

  test("the server under test is a production build", async ({ request }) => {
    // `/api/test/playwright-harness` 404s whenever PLAYWRIGHT_TEST is unset, including
    // a plain `next dev`, so it does not prove NODE_ENV=production.
    // `/__nextjs_original-stack-frames` is a dev-server overlay route: `next dev`
    // answers GET with 400 (method must be POST) and finishes before the app.
    // `next start` has no such route, so the response is 404. That 404 is the oracle.
    const devOnly = await request.get("/__nextjs_original-stack-frames");
    expect(devOnly.status()).toBe(404);
    expect(await devOnly.text()).not.toContain("Bad Request");
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

/** Copy the student-page Start catch paints, including the TypeError from reading `.reason` on `undefined`. */
const START_NAV_ERROR =
  /Could not start the session|unexpected error|Error ID:|Cannot read properties of undefined|reading ['"]reason['"]/;

/**
 * A claimed learner with a consent record, no open session, and no appointment,
 * so the student page's main control is Start session.
 */
async function seedStudentWithConsent(
  adminUserId: string
): Promise<{ studentId: string; learnerName: string }> {
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const learnerName = `Ready start ${suffix}`;
  const prisma = new PrismaClient();
  try {
    const holder = await prisma.accountHolder.create({
      data: {
        email: `pw-ready-${suffix}@test.local`,
        emailVerifiedAt: new Date("2026-01-01"),
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: holder.id,
        displayName: learnerName,
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: learnerName,
        adminUserId,
        learnerProfileId: profile.id,
        parentEmail: "parent@test.local",
      },
      select: { id: true },
    });
    await prisma.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: holder.id,
        captureMethod: "electronic",
      },
    });
    return { studentId: student.id, learnerName };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("student-page Start session, production build", () => {
  let tutorId: string;

  test.beforeEach(async ({ context, baseURL }) => {
    tutorId = await seedTestAdmin();
    await signInAsTutor(context, baseURL!, tutorId);
  });

  test("consent on file: Start lands in the workspace and never shows an error", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const seeded = await seedStudentWithConsent(tutorId);
    const flashes: string[] = [];
    await page.exposeFunction("__prodShapeSawStartError", (text: string) => {
      flashes.push(text);
    });
    await page.addInitScript(() => {
      const bad =
        /Could not start the session|unexpected error|Error ID:|Cannot read properties of undefined|reading ['"]reason['"]/;
      const report = () => {
        for (const el of document.querySelectorAll("[role='alert']")) {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (!bad.test(text)) continue;
          const reportHit = (
            window as unknown as { __prodShapeSawStartError?: (value: string) => void }
          ).__prodShapeSawStartError;
          reportHit?.(text);
        }
      };
      const arm = () => {
        report();
        new MutationObserver(report).observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      };
      if (document.documentElement) arm();
      else document.addEventListener("DOMContentLoaded", arm);
    });

    await page.goto(`/admin/students/${seeded.studentId}`, { waitUntil: "domcontentloaded" });
    const start = page.getByTestId("start-whiteboard-session-btn");
    await expect(start).toBeEnabled({ timeout: 30_000 });
    await expect(start).toHaveText(/Start session/);

    // Poll while the click's navigation is in flight. The observer above catches a
    // flash shorter than the poll interval; the poll catches copy that is not in an alert.
    let stopPoll = false;
    const poller = (async () => {
      while (!stopPoll) {
        try {
          const text = await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
          const match = text.match(START_NAV_ERROR);
          if (match) flashes.push(match[0]);
          await page.waitForTimeout(50);
        } catch {
          // Navigation replaces the document; the next loop either stops or reads the new one.
        }
      }
    })();

    try {
      await start.click();
      await page.waitForURL(
        (url) =>
          url.pathname.includes(`/admin/students/${seeded.studentId}/whiteboard/`) &&
          url.pathname.endsWith("/workspace"),
        { timeout: 90_000 }
      );
      await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });
    } finally {
      stopPoll = true;
      await poller;
    }
    expect(flashes).toEqual([]);
  });
});
