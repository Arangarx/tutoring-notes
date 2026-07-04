/**
 * StudentPageShell — Playwright integration tests.
 *
 * Covers:
 *  1. Header rendered height is in the app-chrome band (≤ 58px) in both
 *     light and dark themes. Uses data-testid="student-page-shell-header".
 *  2. Sign-out control (data-testid="learner-sign-out") is visible in the
 *     header and clicking it logs the learner out and navigates to /students/login.
 *
 * Auth: relies on the pre-seeded TEST_LEARNER identity (created in auth.setup.ts
 * via seedTestLearner → LearnerProfile + LearnerCredential + LearnerDeviceSession).
 *
 * Sign-out test: uses a FRESH per-test learner login (loginLearnerInContext)
 * so the shared learner.json storage state used by other integration tests is
 * not invalidated when the session is revoked.
 */

import path from "node:path";
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { TEST_LEARNER } from "../visual/helpers";
import { loginLearnerInContext } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

const LEARNER_AUTH_FILE = path.join(
  process.cwd(),
  "tests/integration/.auth/learner.json"
);

test.describe(
  "StudentPageShell",
  { tag: [TAG.WB_CHROME] },
  () => {
    /**
     * Oracle: the app-chrome band across the whole app is ≈ 56px
     * (marketing header uses height: 56; admin mobile uses h-[52px]).
     * The previous py-3 padding gave ≈ 68px — noticeably taller.
     * After reducing to py-1.5: 6px top + 44px (ThemeToggle min-h-11)
     * + 6px bottom + 1px border-b = 57px → satisfies ≤ 58px.
     */
    test(
      "header height ≤ 58px in light and dark themes",
      async ({ browser }) => {
        test.setTimeout(30_000);

        // Prefer the pre-created learner storage state (avoids a fresh login
        // round-trip and the associated API rate-limit exposure).
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          ...(fs.existsSync(LEARNER_AUTH_FILE)
            ? { storageState: LEARNER_AUTH_FILE }
            : {}),
        });
        if (!fs.existsSync(LEARNER_AUTH_FILE)) {
          await loginLearnerInContext(
            context,
            TEST_LEARNER.handle,
            TEST_LEARNER.pin
          );
        }

        try {
          const page = await context.newPage();
          await page.goto("/join", { waitUntil: "domcontentloaded" });

          const header = page.getByTestId("student-page-shell-header");
          await expect(header).toBeVisible({ timeout: 10_000 });

          // --- light theme ---
          await page.evaluate(() =>
            document.documentElement.setAttribute("data-theme", "light")
          );
          const lightBox = await header.boundingBox();
          expect(lightBox, "header bounding box should be non-null").not.toBeNull();
          expect(
            lightBox!.height,
            `[light] header height ${lightBox!.height}px must be ≤ 58px (app-chrome band)`
          ).toBeLessThanOrEqual(58);

          // --- dark theme ---
          await page.evaluate(() =>
            document.documentElement.setAttribute("data-theme", "dark")
          );
          const darkBox = await header.boundingBox();
          expect(darkBox, "header bounding box should be non-null").not.toBeNull();
          expect(
            darkBox!.height,
            `[dark] header height ${darkBox!.height}px must be ≤ 58px (app-chrome band)`
          ).toBeLessThanOrEqual(58);
        } finally {
          await context.close();
        }
      }
    );

    /**
     * Sign-out: uses a fresh per-test learner login so the shared storage
     * state (used by wb-wave5-polish and other tests) is not revoked.
     */
    test(
      "sign-out control visible; clicking logs learner out to /students/login",
      async ({ browser }) => {
        test.setTimeout(60_000);

        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
        });
        // Fresh session — deliberately NOT using the shared learner.json so
        // revoking this session doesn't break other tests in the same run.
        await loginLearnerInContext(
          context,
          TEST_LEARNER.handle,
          TEST_LEARNER.pin
        );

        try {
          const page = await context.newPage();
          await page.goto("/join", { waitUntil: "load" });
          // Wait for React hydration so the onClick handler is attached before
          // we click sign-out (the button is SSR-visible but not yet interactive
          // until the client bundle hydrates).
          await page.waitForLoadState("networkidle", { timeout: 15_000 });

          const signOut = page.getByTestId("learner-sign-out");
          await expect(signOut).toBeVisible({ timeout: 5_000 });

          // Set up the URL watcher BEFORE clicking so we don't race against a
          // fast navigation (window.location.href fires after an async fetch).
          await Promise.all([
            page.waitForURL(
              (url) => url.pathname === "/students/login",
              { timeout: 20_000 }
            ),
            signOut.click(),
          ]);
          expect(new URL(page.url()).pathname).toBe("/students/login");
        } finally {
          await context.close();
        }
      }
    );
  }
);
