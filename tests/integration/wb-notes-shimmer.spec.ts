import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { seedTestAdmin, seedTestStudent } from "../visual/helpers";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/**
 * Seed an ended WhiteboardSession + TutorNote in a specified status.
 *
 * The session has endedAt set so page.tsx passes initialMode="review"
 * to WhiteboardSessionShell, which mounts SessionReviewMode. That component
 * calls loadSessionReviewPayload (server action) to fetch the TutorNote status
 * from the DB, which is what TutorNotesSection receives as initialNote.
 *
 * This bypasses the real OpenAI pipeline — the note status is seeded directly.
 */
async function seedEndedSessionWithNote(params: {
  adminUserId: string;
  studentId: string;
  noteStatus: "generating" | "done";
  noteContent?: string | null;
}): Promise<string> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId: params.adminUserId,
        studentId: params.studentId,
        consentAcknowledged: true,
        eventsBlobUrl: "https://pw.local/placeholder-whiteboard-events.json",
        sessionPhase: "ACTIVE",
        sessionMode: "LIVE",
        activatedAt: new Date(Date.now() - 60_000),
        endedAt: new Date(),
        durationSeconds: 60,
      },
      select: { id: true },
    });

    await prisma.tutorNote.create({
      data: {
        sessionId: session.id,
        status: params.noteStatus,
        content: params.noteContent ?? null,
        isPartial: false,
        generatedAt: params.noteStatus === "done" ? new Date() : null,
      },
    });

    return session.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("notes shimmer — generating vs done state rendering", () => {
  /**
   * Spec oracle — generating state:
   *   (a) form fields visible (NOT skeleton bars / hidden)
   *   (b) shimmer/blur treatment applied across fields
   *   (c) empty fields carry the dimmed-placeholder class
   *   (d) tutor-notes-content NOT present; save button NOT present
   */
  test("generating state: form fields visible with shimmer overlay, placeholders dimmed", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    const sessionId = await seedEndedSessionWithNote({
      adminUserId,
      studentId,
      noteStatus: "generating",
      noteContent: null,
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${sessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    // Wait for SessionReviewMode to load the payload and show the generating container.
    const generatingEl = page.getByTestId("tutor-notes-generating");
    await expect(generatingEl).toBeVisible({ timeout: 30_000 });

    // (a) Form fields are visible — textareas present and visible in the DOM.
    const topicsField = page.locator("#wb-note-topics");
    const assessmentField = page.locator("#wb-note-assessment");
    await expect(topicsField).toBeVisible();
    await expect(assessmentField).toBeVisible();

    // (b) Shimmer overlay is attached inside the generating container.
    //     It carries the shimmer CSS animation (animationName !== "none").
    const shimmerOverlay = generatingEl.locator('[aria-hidden="true"]').first();
    await expect(shimmerOverlay).toBeAttached();

    const hasShimmerAnimation = await shimmerOverlay.evaluate((el) => {
      const style = getComputedStyle(el);
      return style.animationName !== "none" && style.animationName !== "";
    });
    expect(hasShimmerAnimation, "shimmer overlay has animation").toBe(true);

    // (c) Empty fields carry the dimmed-placeholder class.
    const topicsClass = await topicsField.getAttribute("class");
    expect(topicsClass ?? "").toContain("tn-notes-generating-field");

    // Placeholder dimming rule is injected via <style> inside the component.
    const hasPlaceholderRule = await page.evaluate(() => {
      try {
        for (const sheet of document.styleSheets) {
          for (const rule of sheet.cssRules) {
            if (rule.cssText.includes("tn-notes-generating-field") &&
                rule.cssText.includes("placeholder") &&
                rule.cssText.includes("opacity")) {
              return true;
            }
          }
        }
      } catch {
        // cross-origin sheet — skip
      }
      return false;
    });
    expect(hasPlaceholderRule, "placeholder opacity rule injected").toBe(true);

    // Fields are read-only during generating.
    const isReadOnly = await topicsField.evaluate(
      (el) => (el as HTMLTextAreaElement).readOnly
    );
    expect(isReadOnly, "textarea is readOnly during generating").toBe(true);

    // (d) tutor-notes-content NOT visible; save button NOT present.
    await expect(page.getByTestId("tutor-notes-content")).not.toBeVisible();
    await expect(page.getByTestId("wb-save-note")).not.toBeVisible();
  });

  /**
   * Spec oracle — done state:
   *   shimmer gone; generated content fills fields; save button present and enabled.
   */
  test("done state: shimmer gone, generated content shown and saveable", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const adminUserId = await seedTestAdmin();
    const { studentId } = await seedTestStudent(adminUserId);
    const noteContent = JSON.stringify({
      topics: "Quadratic equations",
      assessment: "Strong on factoring, needs work on completing the square",
      nextSteps: "Practice worksheet pages 5-7",
      links: "",
    });
    const sessionId = await seedEndedSessionWithNote({
      adminUserId,
      studentId,
      noteStatus: "done",
      noteContent,
    });

    await page.goto(
      `/admin/students/${studentId}/whiteboard/${sessionId}/workspace`,
      { waitUntil: "domcontentloaded" }
    );

    // Wait for the done form to appear.
    const contentEl = page.getByTestId("tutor-notes-content");
    await expect(contentEl).toBeVisible({ timeout: 30_000 });

    // tutor-notes-generating NOT present in done state.
    await expect(page.getByTestId("tutor-notes-generating")).not.toBeVisible();

    // Generated content is shown in the textareas.
    await expect(page.locator("#wb-note-topics")).toHaveValue(
      "Quadratic equations"
    );
    await expect(page.locator("#wb-note-assessment")).toHaveValue(
      "Strong on factoring, needs work on completing the square"
    );

    // No shimmer class on the done-state textareas.
    const topicsClass = await page
      .locator("#wb-note-topics")
      .getAttribute("class");
    expect(topicsClass ?? "").not.toContain("tn-notes-generating-field");

    // Textareas are editable (not readOnly) in done state.
    const isReadOnly = await page
      .locator("#wb-note-topics")
      .evaluate((el) => (el as HTMLTextAreaElement).readOnly);
    expect(isReadOnly, "textarea is NOT readOnly when done").toBe(false);

    // Save button present and enabled (non-empty fields satisfy the empty-notes guard).
    const saveBtn = page.getByTestId("wb-save-note");
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).not.toBeDisabled();
  });
});
