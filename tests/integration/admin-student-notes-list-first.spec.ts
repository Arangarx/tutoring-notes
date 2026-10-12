/**
 * Personal student notes page: existing notes lead. Paste/upload/record is
 * visible on first paint. Add note reveals only the manual form.
 * Not enrolled in wb-regression.
 *
 *   npx playwright test tests/integration/admin-student-notes-list-first.spec.ts --project=integration --workers=1
 */
import { PrismaClient } from "@prisma/client";

import { expect, test } from "@playwright/test";
import { seedTestAdmin } from "../visual/helpers";
import { openManualNoteForm } from "./open-manual-note-form";

test("existing notes lead the page until Add note opens the manual form", async ({ page }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}`;
  const studentName = `Notes First ${suffix}`;
  const topics = `Existing note ${suffix}`;
  const adminUserId = await seedTestAdmin();
  const prisma = new PrismaClient();
  let studentId = "";
  try {
    const student = await prisma.student.create({
      data: {
        name: studentName,
        adminUserId,
        parentEmail: `notes-first-${suffix}@test.local`,
      },
      select: { id: true },
    });
    studentId = student.id;
    await prisma.sessionNote.create({
      data: {
        studentId,
        date: new Date("2026-10-01T00:00:00.000Z"),
        topics,
        homework: "Practice set",
        assessment: "Steady",
        nextSteps: "Continue",
        linksJson: "[]",
        status: "DRAFT",
      },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto(`/admin/students/${studentId}/notes`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
    timeout: 15_000,
  });

  const card = page.locator('[data-slot="card"]').filter({ hasText: topics }).first();
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  expect(cardBox).not.toBeNull();

  const form = page.getByTestId("new-note-form");
  const panel = page.getByTestId("ai-assist-panel");

  // First paint: paste/upload/record is on the page, the manual form is not,
  // and the existing note sits above that panel.
  await expect(panel).toBeVisible();
  await expect(form).toBeHidden();
  const panelBox = await panel.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(
    cardBox!.y,
    "existing note card is above the paste/upload/record panel"
  ).toBeLessThan(panelBox!.y);

  await expect(page.getByRole("button", { name: "Add note" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Back to student" })).toBeVisible();

  const reminder = page.getByTestId("email-reminder-button");
  await expect(reminder).toBeVisible();
  const reminderBox = await reminder.boundingBox();
  expect(reminderBox).not.toBeNull();
  expect(
    reminderBox!.y,
    "Email a reminder is not in the header above the list"
  ).toBeGreaterThanOrEqual(cardBox!.y);

  await openManualNoteForm(page);
  await expect(form).toBeVisible();
  const cardAfter = await card.boundingBox();
  const formBox = await form.boundingBox();
  expect(cardAfter).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(cardAfter!.y, "existing note card is above the manual note form").toBeLessThan(
    formBox!.y
  );
});
