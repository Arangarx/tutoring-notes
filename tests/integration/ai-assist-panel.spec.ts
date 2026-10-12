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

  await page.goto(`/admin/students/${studentId}/notes`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: studentName })).toBeVisible({
    timeout: 15_000,
  });
  const panel = page.getByTestId("ai-assist-panel");
  const form = page.getByTestId("new-note-form");
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(form).toBeVisible();
  // The note fields start disabled in the server HTML. Enabled means the client is live.
  await expect(form.locator("#note-topics")).toBeEnabled({ timeout: 15_000 });
  await expect(form.locator("#note-topics")).toHaveValue("");

  await panel.getByTestId("ai-session-text").fill(
    "PW_AI_HARNESS We worked on placing fractions on a number line."
  );
  const generate = panel.getByTestId("ai-generate-btn");
  await expect(generate).toBeEnabled({ timeout: 15_000 });
  await generate.click();

  await expect(form.locator("#note-topics")).toHaveValue(HARNESS_TOPICS, {
    timeout: 15_000,
  });
  await expect(form.locator("#note-homework")).toHaveValue(HARNESS_HOMEWORK);
  await expect(form.locator("#note-assessment")).toHaveValue(HARNESS_ASSESSMENT);
  await expect(form.locator("#note-plan")).toHaveValue(HARNESS_PLAN);
  await expect(panel.getByTestId("ai-filled-hint")).toBeVisible();
});
