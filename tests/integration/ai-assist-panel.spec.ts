/**
 * Restored from the deleted tests/ai-panel.spec.ts.
 * The text panel calls generateNoteFromTextAction. Under PLAYWRIGHT_TEST the
 * sentinel skips OpenAI and returns a fixed note; the oracle is that the
 * empty note form then shows those exact fields.
 */
import { PrismaClient } from "@prisma/client";

import { expect, test } from "./fixtures";
import { seedTestAdmin } from "../visual/helpers";

const HARNESS_TOPICS = "Fractions on a number line";
const HARNESS_HOMEWORK = "Worksheet pages 4-6";
const HARNESS_ASSESSMENT = "Places halves correctly";
const HARNESS_PLAN = "Tenths next session";

test("the AI text panel fills the empty note form", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = `${Date.now()}`;
  const studentName = `AI Panel ${suffix}`;
  const adminUserId = await seedTestAdmin();
  const prisma = new PrismaClient();
  let studentId = "";
  try {
    const student = await prisma.student.create({
      data: {
        name: studentName,
        adminUserId,
        parentEmail: `ai-panel-${suffix}@test.local`,
      },
      select: { id: true },
    });
    studentId = student.id;
  } finally {
    await prisma.$disconnect();
  }

  await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
    timeout: 15_000,
  });
  const notes = page.locator("#student-section-notes");
  await notes.scrollIntoViewIfNeeded();
  const panel = notes.getByTestId("ai-assist-panel");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(notes.getByTestId("new-note-form")).toBeVisible();
  await expect(notes.locator("#note-topics")).toHaveValue("");

  await panel.getByTestId("tab-text").click();
  await panel.getByTestId("ai-session-text").fill(
    "PW_AI_HARNESS We worked on placing fractions on a number line."
  );
  await panel.getByTestId("ai-generate-btn").click();

  await expect(notes.locator("#note-topics")).toHaveValue(HARNESS_TOPICS, {
    timeout: 15_000,
  });
  await expect(notes.locator("#note-homework")).toHaveValue(HARNESS_HOMEWORK);
  await expect(notes.locator("#note-assessment")).toHaveValue(HARNESS_ASSESSMENT);
  await expect(notes.locator("#note-plan")).toHaveValue(HARNESS_PLAN);
  await expect(panel.getByTestId("ai-filled-hint")).toBeVisible();
});
