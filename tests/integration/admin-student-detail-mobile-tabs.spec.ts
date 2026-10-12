/**
 * Phone student page: Notes leaves the page and stays inside the column.
 *
 * Run:
 *   npx playwright test tests/integration/admin-student-detail-mobile-tabs.spec.ts --project=integration
 */

import { test, expect } from "@playwright/test";
import { TAG } from "../test-tags";
import { openManualNoteForm } from "./open-manual-note-form";
import { seedTestAdmin, seedTestStudent } from "../visual/helpers";

const PHONE_VIEWPORT = { width: 390, height: 844 };

test.describe("Admin student detail — mobile notes", () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test(
    "phone Notes link stays inside the page column and opens the paste-a-note form",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Playwright Student" })).toBeVisible({
        timeout: 15_000,
      });

      const column = page.getByTestId("student-detail-column");
      const notes = page.getByTestId("student-notes-link");
      await expect(notes).toBeVisible();
      await notes.scrollIntoViewIfNeeded();

      const columnBox = await column.boundingBox();
      const notesBox = await notes.boundingBox();
      const viewport = page.viewportSize();
      expect(columnBox).not.toBeNull();
      expect(notesBox).not.toBeNull();
      expect(viewport).not.toBeNull();

      // Inside the column, and not clipped by the viewport after scrolling it into view.
      expect(notesBox!.x).toBeGreaterThanOrEqual(columnBox!.x - 4);
      expect(notesBox!.x + notesBox!.width).toBeLessThanOrEqual(columnBox!.x + columnBox!.width + 4);
      expect(notesBox!.y).toBeGreaterThanOrEqual(-4);
      expect(notesBox!.y + notesBox!.height).toBeLessThanOrEqual(viewport!.height + 4);

      await notes.click();
      await openManualNoteForm(page);
      await expect(page.getByTestId("new-note-form")).toBeVisible();
    }
  );

  test(
    "phone session column leaves the page to open notes",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);

      await page.goto(`/admin/students/${studentId}`, {
        waitUntil: "networkidle",
      });

      await expect(page.getByRole("heading", { name: "Playwright Student" })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByTestId("new-note-form")).toHaveCount(0);

      const column = page.getByTestId("student-detail-column");
      const session = page.getByTestId("student-session-card");
      const notes = column.getByTestId("student-notes-link");
      await notes.scrollIntoViewIfNeeded();
      const sessionBox = await session.boundingBox();
      const notesBox = await notes.boundingBox();
      expect(sessionBox).not.toBeNull();
      expect(notesBox).not.toBeNull();
      // Notes sits below the session card in the same column.
      expect(notesBox!.y).toBeGreaterThanOrEqual(sessionBox!.y + sessionBox!.height - 4);
      expect(Math.abs(notesBox!.x - sessionBox!.x)).toBeLessThanOrEqual(8);

      await notes.click();
      await openManualNoteForm(page);
      await expect(page.getByTestId("new-note-form")).toBeVisible();
    }
  );
});
