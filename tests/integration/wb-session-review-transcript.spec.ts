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

import { expect, test, type Page, type Response } from "@playwright/test";
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

type Box = { x: number; y: number; width: number; height: number };

/** Relational containment: inner sits inside outer, with a few px of slack. */
function expectBoxInside(inner: Box, outer: Box, slack = 4): void {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - slack);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - slack);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + slack);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + slack);
}

async function expectNoTranscript(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: /transcript/i })).toHaveCount(0);
  await expect(page.getByTestId("wb-review-transcript")).toHaveCount(0);
  await expect(page.getByText(TRANSCRIPT_MARK)).toHaveCount(0);
}

function isDocumentOrFlight(response: Response): boolean {
  const contentType = response.headers()["content-type"] ?? "";
  const requestHeaders = response.request().headers();
  return (
    response.request().resourceType() === "document" ||
    contentType.includes("text/x-component") ||
    requestHeaders["rsc"] === "1" ||
    response.url().includes("_rsc")
  );
}

/**
 * DOM absence plus the navigation document, the live HTML, and any RSC flight body.
 * A transcript string that never mounts still fails if the server sent it.
 */
async function gotoAndExpectNoTranscript(
  page: Page,
  url: string,
  readyTestId: string
): Promise<void> {
  const flightBodies: string[] = [];
  const onResponse = async (response: Response) => {
    if (!isDocumentOrFlight(response)) return;
    const status = response.status();
    if (status >= 300 && status < 400) return;
    try {
      flightBodies.push(await response.text());
    } catch {
      // Body already read, or a response with no body.
    }
  };
  page.on("response", onResponse);
  try {
    const navigation = await page.goto(url, { waitUntil: "domcontentloaded" });
    let navigationText = "";
    if (navigation && navigation.status() < 300) {
      try {
        navigationText = await navigation.text();
      } catch {
        navigationText = "";
      }
    }
    await expect(page.getByTestId(readyTestId)).toBeVisible({ timeout: 30_000 });
    await expectNoTranscript(page);
    const dom = await page.content();
    expect(navigationText.includes(TRANSCRIPT_MARK), "navigation response text").toBe(
      false
    );
    expect(dom.includes(TRANSCRIPT_MARK), "page HTML").toBe(false);
    for (const [index, body] of flightBodies.entries()) {
      expect(body.includes(TRANSCRIPT_MARK), `RSC/flight response ${index}`).toBe(
        false
      );
    }
  } finally {
    page.off("response", onResponse);
  }
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

  test("collapsed Show transcript stays in view and opening it grows the aside", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fixture = await seedEndedReviewWithTranscript();
    await openTutorReview(page, fixture);

    // Collapsed: the trigger is on screen inside the notes aside, with no scroll.
    await expect(page.getByTestId("wb-review-transcript")).not.toBeVisible();
    const show = page.getByRole("button", { name: "Show transcript" });
    await expect(show).toBeVisible();

    const scrolled = await page.evaluate(() => ({
      windowY: window.scrollY,
      asideTop:
        document.querySelector("[data-testid='wb-review-notes-prominent']")
          ?.scrollTop ?? -1,
    }));
    expect(scrolled.windowY).toBe(0);
    expect(scrolled.asideTop).toBe(0);

    const showBox = await show.boundingBox();
    const aside = page.getByTestId("wb-review-notes-prominent");
    const asideBox = await aside.boundingBox();
    const viewport = page.viewportSize();
    expect(showBox, "Show transcript has a box").not.toBeNull();
    expect(asideBox, "notes aside has a box").not.toBeNull();
    expect(viewport, "viewport is set").not.toBeNull();
    expectBoxInside(showBox!, {
      x: 0,
      y: 0,
      width: viewport!.width,
      height: viewport!.height,
    });
    expectBoxInside(showBox!, asideBox!);

    const closedScrollHeight = await aside.evaluate((el) => el.scrollHeight);
    await show.click();
    await expect(page.getByTestId("wb-review-transcript")).toBeVisible();
    await expect(page.getByTestId("wb-review-transcript")).toContainText(TRANSCRIPT_MARK);
    // Opening the long transcript makes the aside's scrollable content taller.
    await expect
      .poll(async () => aside.evaluate((el) => el.scrollHeight))
      .toBeGreaterThan(closedScrollHeight);
  });

  test("open transcript scrolls inside the docked narrow aside", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await seedEndedReviewWithTranscript();
    await page.goto(
      `/admin/students/${fixture.studentId}/whiteboard/${fixture.whiteboardSessionId}/workspace?surface=replay`,
      { waitUntil: "domcontentloaded" }
    );
    const aside = page.getByTestId("wb-review-notes-docked");
    await expect(aside).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#wb-note-topics")).toHaveValue(NOTE_TOPICS, {
      timeout: 30_000,
    });

    const main = page.getByTestId("wb-review-main-frame");
    const mainBefore = await main.boundingBox();
    expect(mainBefore, "replay column has a box").not.toBeNull();
    const closedScrollHeight = await aside.evaluate((el) => el.scrollHeight);

    await page.getByRole("button", { name: "Show transcript" }).click();
    const transcript = page.getByTestId("wb-review-transcript");
    await expect(transcript).toBeVisible();
    await expect
      .poll(async () => aside.evaluate((el) => el.scrollHeight))
      .toBeGreaterThan(closedScrollHeight);

    const openMetrics = await aside.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    // The long transcript scrolls inside the aside (max-height 40vh) rather than the page.
    expect(openMetrics.scrollHeight).toBeGreaterThan(openMetrics.clientHeight);

    const mainAfter = await main.boundingBox();
    const asideBox = await aside.boundingBox();
    const viewport = page.viewportSize();
    expect(mainAfter, "replay column still has a box").not.toBeNull();
    expect(asideBox, "docked aside has a box").not.toBeNull();
    expect(viewport, "viewport is set").not.toBeNull();
    // Opening the transcript does not push the replay column down or off screen.
    expect(Math.abs(mainAfter!.y - mainBefore!.y)).toBeLessThanOrEqual(4);
    expect(mainAfter!.y).toBeGreaterThanOrEqual(0);
    expect(mainAfter!.y).toBeLessThan(viewport!.height);
    expect(asideBox!.y + asideBox!.height).toBeLessThanOrEqual(mainAfter!.y + 4);

    const transcriptBox = await transcript.boundingBox();
    expect(transcriptBox, "transcript has a box").not.toBeNull();
    // Transcript content extends past the aside's visible edge.
    expect(transcriptBox!.y + transcriptBox!.height).toBeGreaterThan(
      asideBox!.y + asideBox!.height + 4
    );
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
      await gotoAndExpectNoTranscript(
        learnerPage,
        `/join/notes/${fixture.whiteboardSessionId}/whiteboard`,
        "learner-wb-replay-page"
      );
      await gotoAndExpectNoTranscript(
        learnerPage,
        `/s/${fixture.shareToken}/whiteboard/${fixture.whiteboardSessionId}`,
        "wb-share-replay-page"
      );
    } finally {
      await context.close();
    }
  });
});
