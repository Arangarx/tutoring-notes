/**
 * Playwright spec — end-session confirm UX (copy oracle).
 *
 * Asserts the SPEC, NOT the current code strings, per the task brief.
 * These tests fail if the copy drifts back to the old "Finish & save" wording.
 *
 * Spec under test:
 *   - In-live workspace top-bar CTA reads exactly "End session"
 *   - Clicking it opens a confirm dialog with:
 *       title  "End this session?"
 *       body   "You'll go to review to save your notes."
 *       action "End session"
 *       cancel "Keep going"
 *   - "Keep going" dismisses the dialog; the session stays live
 *     (end pipeline did NOT fire — button re-enabled, no review surface)
 *
 * Project: integration (tutor storageState; fake media; local Postgres + relay)
 * Run:     npx playwright test tests/integration/wb-end-session-confirm.spec.ts --project=integration
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function loadTutorBoard(
  page: Page,
  session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
) {
  await page.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
}

test.describe(
  "End-session confirm UX — copy oracle",
  { tag: [TAG.WB_CHROME] },
  () => {
    test("CTA label is 'End session' (not 'Finish & save')", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const session = await seedWbLiveSyncSession();
      await loadTutorBoard(page, session);

      const cta = page.getByTestId("wb-end-session");
      await expect(cta).toBeVisible({ timeout: 15_000 });

      // Oracle: exact label — must not be "Finish & save"
      await expect(cta).toHaveText("End session");
      // Belt-and-suspenders: the button's accessible name matches
      await expect(cta).toHaveAttribute("aria-label", "End session");
    });

    test("clicking CTA opens confirm with correct title, body, and action/cancel copy", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const session = await seedWbLiveSyncSession();
      await loadTutorBoard(page, session);

      const cta = page.getByTestId("wb-end-session");
      await expect(cta).toBeVisible({ timeout: 15_000 });
      await cta.click();

      // Confirm dialog must appear
      const confirm = page.getByTestId("wb-end-session-confirm");
      await expect(confirm).toBeVisible({ timeout: 5_000 });

      // Title
      await expect(
        page.locator("#wb-end-confirm-title")
      ).toHaveText("End this session?");

      // Body
      await expect(
        page.locator("#wb-end-confirm-body")
      ).toHaveText("You'll go to review to save your notes.");

      // Confirm action button
      const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
      await expect(confirmBtn).toBeVisible();
      await expect(confirmBtn).toHaveText("End session");

      // Cancel button
      const cancelBtn = page.getByTestId("wb-end-session-confirm-cancel");
      await expect(cancelBtn).toBeVisible();
      await expect(cancelBtn).toHaveText("Keep going");
    });

    test("'Keep going' dismisses confirm; end pipeline does NOT fire", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const session = await seedWbLiveSyncSession();
      await loadTutorBoard(page, session);

      const cta = page.getByTestId("wb-end-session");
      await expect(cta).toBeVisible({ timeout: 15_000 });
      await cta.click();

      const confirm = page.getByTestId("wb-end-session-confirm");
      await expect(confirm).toBeVisible({ timeout: 5_000 });

      // Click "Keep going"
      await page.getByTestId("wb-end-session-confirm-cancel").click();

      // Confirm must disappear
      await expect(confirm).not.toBeVisible({ timeout: 3_000 });

      // End pipeline must NOT have fired:
      // (1) End CTA still present and enabled (not in a busy/finalizing state)
      await expect(cta).toBeEnabled();
      await expect(cta).toHaveText("End session");

      // (2) No review surface has appeared (session is still live)
      await expect(page.getByTestId("wb-session-review-mode")).not.toBeAttached();
    });
  }
);
