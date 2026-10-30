/**
 * Tutor review transcript stays collapsed behind Show transcript.
 * The student replay and the family share replay never render it.
 *
 * Fixtures follow the ended-session + transcript chunk in
 * wb-org-booking.spec.ts and the learner replay login in wb-child-home.spec.ts.
 *
 * Run:
 *   npx playwright test tests/integration/wb-session-review-transcript.spec.ts --project=wb-regression
 */

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TAG } from "../test-tags";
import { seedTestAdmin } from "../visual/helpers";
import { loginLearnerInContext } from "./whiteboard-live-sync.helpers";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

const TRANSCRIPT_MARK = "W8 harness transcript: the student solved for x.";
const NOTE_TOPICS = "Quadratic factoring";
const LEARNER_PIN = "482916";

function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type ReviewFixture = {
  studentId: string;
  whiteboardSessionId: string;
  shareToken: string;
  learnerHandle: string;
};

async function seedEndedReviewWithTranscript(): Promise<ReviewFixture> {
  const adminUserId = await seedTestAdmin();
  const prisma = new PrismaClient();
  const id = suffix();
  const familyId = `w8fam${id}`.replace(/[^a-z0-9]/g, "").slice(0, 16);
  const username = `w8${id}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
  try {
    const accountHolder = await prisma.accountHolder.create({
      data: {
        email: `w8-parent-${id}@test.local`,
        emailVerifiedAt: new Date("2026-01-01"),
        familyId,
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: accountHolder.id,
        displayName: `W8 learner ${id}`,
        accessMode: "child_pin_required",
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: `W8 learner ${id}`,
        adminUserId,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    await prisma.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: accountHolder.id,
        username,
        secretHash: await bcrypt.hash(LEARNER_PIN, 10),
      },
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
        setByAccountHolderId: accountHolder.id,
        captureMethod: "electronic",
      },
    });
    const note = await prisma.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-01T00:00:00.000Z"),
        topics: NOTE_TOPICS,
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "READY",
      },
      select: { id: true },
    });
    const session = await prisma.whiteboardSession.create({
      data: {
        adminUserId,
        studentId: student.id,
        noteId: note.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://example.invalid/w8-missing-events.json",
        sessionPhase: "ACTIVE",
        endedAt: new Date("2026-06-01T01:00:00.000Z"),
        durationSeconds: 120,
      },
      select: { id: true },
    });
    const share = await prisma.shareLink.create({
      data: {
        studentId: student.id,
        token: `w8-share-${id}`,
      },
      select: { token: true },
    });
    await prisma.tutorNote.create({
      data: {
        sessionId: session.id,
        status: "done",
        content: JSON.stringify({
          topics: NOTE_TOPICS,
          assessment: "",
          nextSteps: "",
          links: "",
        }),
        generatedAt: new Date(),
      },
    });
    const longTranscript = Array.from({ length: 40 }, () => TRANSCRIPT_MARK).join("\n");
    await prisma.transcriptChunk.create({
      data: {
        sessionId: session.id,
        chunkBlobUrl: `https://example.invalid/w8-chunk-${id}.webm`,
        recordingTimeOffsetMs: 0,
        transcript: longTranscript,
        status: "done",
      },
    });
    return {
      studentId: student.id,
      whiteboardSessionId: session.id,
      shareToken: share.token,
      learnerHandle: `${username}@${familyId}`,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function openTutorReview(page: Page, fixture: ReviewFixture): Promise<void> {
  await page.goto(
    `/admin/students/${fixture.studentId}/whiteboard/${fixture.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("#wb-note-topics")).toHaveValue(NOTE_TOPICS, {
    timeout: 30_000,
  });
}

async function expectNoTranscript(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /transcript/i })).toHaveCount(0);
  await expect(page.getByTestId("wb-review-transcript")).toHaveCount(0);
  await expect(page.getByText(TRANSCRIPT_MARK)).toHaveCount(0);
}

test.describe("review transcript toggle", { tag: [TAG.WB_RECORDING, TAG.WB_CHROME] }, () => {
  test("review transcript is collapsed until Show transcript", async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await seedEndedReviewWithTranscript();
    await openTutorReview(page, fixture);

    await expect(page.getByTestId("wb-review-transcript")).not.toBeVisible();
    const show = page.getByRole("button", { name: "Show transcript" });
    await expect(show).toBeVisible();

    await show.click();
    await expect(page.getByTestId("wb-review-transcript")).toBeVisible();
    await expect(page.getByTestId("wb-review-transcript")).toContainText(TRANSCRIPT_MARK);
    const hide = page.getByRole("button", { name: "Hide transcript" });
    await expect(hide).toBeVisible();

    await hide.click();
    await expect(page.getByTestId("wb-review-transcript")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Show transcript" })).toBeVisible();
  });

  test("the notes surface stays above the fold with the transcript collapsed", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fixture = await seedEndedReviewWithTranscript();
    await openTutorReview(page, fixture);

    await expect(page.getByTestId("wb-review-transcript")).not.toBeVisible();

    const notes = page.getByTestId("wb-review-notes-prominent");
    const notesBox = await notes.boundingBox();
    const viewport = page.viewportSize();
    expect(notesBox, "notes surface has a box").not.toBeNull();
    expect(viewport, "viewport is set").not.toBeNull();
    // Above the fold: the notes surface top sits inside the viewport.
    expect(notesBox!.y).toBeGreaterThanOrEqual(0);
    expect(notesBox!.y).toBeLessThan(viewport!.height);

    const topics = page.locator("#wb-note-topics");
    const topicsBox = await topics.boundingBox();
    expect(topicsBox, "notes field has a box").not.toBeNull();
    expect(topicsBox!.y).toBeGreaterThanOrEqual(notesBox!.y);
    expect(topicsBox!.y).toBeLessThan(viewport!.height);
  });

  test("the student and family replay never shows the transcript control", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const fixture = await seedEndedReviewWithTranscript();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, fixture.learnerHandle, LEARNER_PIN);
      const learnerPage = await context.newPage();
      await learnerPage.goto(
        `/join/notes/${fixture.whiteboardSessionId}/whiteboard`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(learnerPage.getByTestId("learner-wb-replay-page")).toBeVisible({
        timeout: 30_000,
      });
      await expectNoTranscript(learnerPage);

      await learnerPage.goto(
        `/s/${fixture.shareToken}/whiteboard/${fixture.whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(learnerPage.getByTestId("wb-share-replay-page")).toBeVisible({
        timeout: 30_000,
      });
      await expectNoTranscript(learnerPage);
    } finally {
      await context.close();
    }
  });
});
