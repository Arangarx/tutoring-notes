/**
 * Restored from the deleted smoke in tests/smoke-admin-student-detail.spec.ts.
 * Today's notes save as DRAFT and the share page hides drafts, and the notes
 * auth wall requires the owning account holder. The tutor still saves, marks
 * ready, sends, and the outbox link is the share page that parent sees.
 */
import { PrismaClient } from "@prisma/client";

import { expect, test } from "./fixtures";
import { loginAccountHolderInContext } from "./whiteboard-live-sync.helpers";
import { seedTestAdmin, seedSelfLearner, TEST_SELF_LEARNER } from "../visual/helpers";

test("saving a note, sending it, and opening the outbox link shows that note", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = `${Date.now()}`;
  const studentName = `Outbox Share ${suffix}`;
  const topics = `Fractions practice ${suffix}`;
  const homework = `Worksheet ${suffix}`;
  const plan = `Word problems ${suffix}`;
  const parentEmail = `outbox-parent-${suffix}@test.local`;

  const adminUserId = await seedTestAdmin();
  const prisma = new PrismaClient();
  let studentId = "";
  try {
    const student = await prisma.student.create({
      data: {
        name: studentName,
        adminUserId,
        parentEmail,
      },
      select: { id: true },
    });
    studentId = student.id;
  } finally {
    await prisma.$disconnect();
  }
  await seedSelfLearner(studentId);

  await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
    timeout: 15_000,
  });
  const notes = page.locator("#student-section-notes");
  await notes.scrollIntoViewIfNeeded();
  const form = notes.getByTestId("new-note-form");
  const typeInto = async (selector: string, value: string) => {
    const field = form.locator(selector);
    await field.click();
    await field.fill("");
    await field.pressSequentially(value);
    await expect(field).toHaveValue(value);
  };
  await typeInto("#note-homework", homework);
  await typeInto("#note-plan", plan);
  await typeInto("#note-topics", topics);
  const save = form.getByRole("button", { name: "Save note" });
  await expect(save).toBeEnabled();
  await expect(form.locator("#note-topics")).toHaveValue(topics);
  await save.click();
  await expect(form.locator("#note-topics")).toHaveValue("", { timeout: 15_000 });

  await page.goto(`/admin/students/${studentId}/notes`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(topics)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mark ready" }).click();
  await expect(page.getByText("Status: READY")).toBeVisible({ timeout: 15_000 });

  await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
  const notesAgain = page.locator("#student-section-notes");
  await notesAgain.scrollIntoViewIfNeeded();
  await notesAgain.locator("#toEmail").fill(parentEmail);
  await notesAgain.getByRole("button", { name: "Send" }).click();
  await expect(notesAgain.getByRole("status")).toHaveText(
    /saved to outbox|Sent to .+|Failed to send/i,
    { timeout: 15_000 }
  );

  await page.goto("/admin/outbox", { waitUntil: "domcontentloaded" });
  const row = page.getByRole("listitem").filter({ hasText: parentEmail }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const shareUrl = await row.getByLabel("Share link URL").inputValue();
  expect(shareUrl).toMatch(/\/s\/[^/]+$/);

  const parentContext = await browser.newContext();
  try {
    await loginAccountHolderInContext(
      parentContext,
      TEST_SELF_LEARNER.email,
      TEST_SELF_LEARNER.password
    );
    const parentPage = await parentContext.newPage();
    await parentPage.goto(shareUrl, { waitUntil: "domcontentloaded" });
    const topicsSection = parentPage
      .locator("section")
      .filter({ has: parentPage.getByRole("heading", { name: "Topics covered" }) });
    await expect(topicsSection.locator("div").first()).toHaveText(topics, {
      timeout: 15_000,
    });
    await expect(
      parentPage
        .locator("section")
        .filter({ has: parentPage.getByRole("heading", { name: "Homework" }) })
        .locator("div")
        .first()
    ).toHaveText(homework);
  } finally {
    await parentContext.close();
  }
});
