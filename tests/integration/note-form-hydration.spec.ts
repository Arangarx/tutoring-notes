/**
 * Student-detail note form, not whiteboard chrome.
 * note-outbox-share.spec.ts is integration-only, so this file stays out of
 * the wb-regression project.
 *
 * The disabled check reads the navigation response body (server HTML), not a
 * DOM snapshot, so it is the document from before any client script runs.
 */
import { PrismaClient } from "@prisma/client";

import { expect, test } from "./fixtures";
import { seedTestAdmin } from "../visual/helpers";
import {
  expectControlsDisabled,
  formSlices,
} from "@/__tests__/helpers/note-form-disabled-html";

test.describe("new note form hydration", () => {
  test("note form controls are disabled in the initial document, then keep typed text", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const suffix = `${Date.now()}`;
    const studentName = `Note Hydrate ${suffix}`;
    const typed = `Hydration hold ${suffix}`;

    const adminUserId = await seedTestAdmin();
    const prisma = new PrismaClient();
    let studentId = "";
    try {
      const student = await prisma.student.create({
        data: {
          name: studentName,
          adminUserId,
          parentEmail: `note-hydrate-${suffix}@test.local`,
        },
        select: { id: true },
      });
      studentId = student.id;
    } finally {
      await prisma.$disconnect();
    }

    const response = await page.goto(`/admin/students/${studentId}`, {
      waitUntil: "commit",
    });
    expect(response, "student detail document").not.toBeNull();
    expect(response!.status()).toBe(200);
    const html = await response!.text();
    const forms = formSlices(html);
    // Desktop shell and mobile shell each SSR the same form.
    expect(forms.length).toBeGreaterThanOrEqual(1);
    for (const formHtml of forms) {
      // The fields are the hydration lock. The buttons being disabled is incidental.
      expectControlsDisabled(formHtml, expect);
    }

    await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
      timeout: 15_000,
    });
    const notes = page.locator("#student-section-notes");
    await notes.scrollIntoViewIfNeeded();
    const form = notes.getByTestId("new-note-form");
    for (const selector of [
      "#note-date",
      "#note-template",
      "#note-start-time",
      "#note-end-time",
      "#note-topics",
      "#note-homework",
      "#note-assessment",
      "#note-plan",
      "#note-links",
    ]) {
      await expect(form.locator(selector)).toBeEnabled({ timeout: 15_000 });
    }

    const topics = form.locator("#note-topics");
    await topics.fill(typed);
    await expect(topics).toHaveValue(typed);
    await expect(form.getByRole("button", { name: "Save note" })).toBeEnabled();
  });
});
