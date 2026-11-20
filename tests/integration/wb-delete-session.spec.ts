/**
 * Gate A5 — delete-session-and-data erasure on the real tutor control.
 *
 * The tutor opens an ended session whose share-link and learner replay are
 * already granted, then confirms "Cancel and delete session data"
 * (`deleteWhiteboardSessionAndDataAction`). After that:
 *   (a) the session, its READY note, and its recording row are gone
 *   (b) the share-link replay and the learner replay are denied (404)
 *   (c) the tutor workspace no longer resolves the session
 *
 * Blob objects are NOT part of this oracle. The action deletes database
 * rows only and leaves blob files for the stale-branch sweep.
 *
 * Spec: when the UI has left review after a confirmed delete, the session's
 * data is already gone. The AFTER row check is a short poll once the
 * student-detail URL is showing — not a long wait that lets a background
 * delete catch up after an early navigation.
 *
 * Red-proof: the BEFORE asserts (replay 200, rows present) are the state
 * the AFTER asserts reject. Skipping the confirm click fails those AFTER
 * asserts. Holding the delete POST and navigating first also fails the
 * "row already gone" check.
 *
 * Run:
 *   npx playwright test tests/integration/wb-delete-session.spec.ts --project=wb-regression
 */

import { type Locator, type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  interceptSessionDeletePost,
  type HeldSessionDelete,
} from "./session-delete-intercept";
import { PrismaClient } from "@prisma/client";
import {
  loginLearnerInContext,
  loginOwningParentForShare,
  seedWbLiveSyncSession,
  type WbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { promoteSessionNoteReady } from "./wb-replay-note.helpers";
import { resolveShareTokenForStudent } from "./share-page-audio-scrub.helpers";
import { TAG } from "../test-tags";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

/** Closed local port so the review payload's event fetch fails fast. Not a blob store. */
const UNREACHABLE_BLOB = "http://127.0.0.1:59999/pw-delete-session-not-a-blob";

type ErasureIds = {
  whiteboardSessionId: string;
  noteId: string;
  recordingId: string;
};

type SeededErasure = WbLiveSyncSession & ErasureIds;

async function withHarnessPrisma<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Ended session the share wall and the learner replay both allow, with a
 * finished tutor note so the review surface shows the real delete control.
 */
async function seedReplayGrantedSession(): Promise<SeededErasure> {
  const seeded = await seedWbLiveSyncSession();
  await promoteSessionNoteReady(seeded.whiteboardSessionId);

  return withHarnessPrisma(async (prisma) => {
    const linked = await prisma.whiteboardSession.findUniqueOrThrow({
      where: { id: seeded.whiteboardSessionId },
      select: { noteId: true },
    });
    if (!linked.noteId) {
      throw new Error("expected a READY note linked to the session");
    }

    await prisma.whiteboardSession.update({
      where: { id: seeded.whiteboardSessionId },
      data: {
        endedAt: new Date(),
        eventsBlobUrl: UNREACHABLE_BLOB,
      },
    });

    await prisma.tutorNote.create({
      data: {
        sessionId: seeded.whiteboardSessionId,
        status: "done",
        content: JSON.stringify({
          topics: "Fractions on the number line",
          assessment: "Can place halves",
          nextSteps: "Quarters next",
          links: "",
        }),
        generatedAt: new Date(),
      },
    });

    const recording = await prisma.sessionRecording.create({
      data: {
        adminUserId: seeded.adminUserId,
        studentId: seeded.studentId,
        whiteboardSessionId: seeded.whiteboardSessionId,
        noteId: linked.noteId,
        blobUrl: UNREACHABLE_BLOB,
        mimeType: "audio/webm",
        sizeBytes: 128,
        durationSeconds: 4,
      },
      select: { id: true },
    });

    return {
      ...seeded,
      noteId: linked.noteId,
      recordingId: recording.id,
    };
  });
}

/** Review workspace — not the student-detail page under the same student id. */
function reviewSessionUrl(whiteboardSessionId: string): RegExp {
  const id = whiteboardSessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/whiteboard/${id}(?:/workspace)?(?:[?#].*)?$`);
}

/** Student detail only — the review URL is a longer path under the same id. */
function studentDetailUrl(studentId: string): RegExp {
  const id = studentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/admin/students/${id}/?(?:\\?.*)?$`);
}

async function readSessionRow(whiteboardSessionId: string) {
  return withHarnessPrisma((prisma) =>
    prisma.whiteboardSession.findUnique({
      where: { id: whiteboardSessionId },
      select: { id: true },
    })
  );
}

/** The open-sessions row for this session, not the main Resume control above the disclosure. */
function rosterListItem(page: Page, sessionId: string): Locator {
  return page
    .getByTestId("student-open-sessions-disclosure")
    .locator("xpath=ancestor::*[@data-slot='accordion-item'][1]")
    .locator(`a[data-testid="roster-resume-session"][href*="${sessionId}"]`)
    .locator("xpath=ancestor::li[1]");
}

async function openRosterDelete(
  page: Page,
  seeded: { studentId: string; whiteboardSessionId: string },
): Promise<Locator> {
  await page.goto(`/admin/students/${seeded.studentId}`, { waitUntil: "domcontentloaded" });
  const disclosure = page.getByTestId("student-open-sessions-disclosure");
  await expect(disclosure).toBeVisible({ timeout: 45_000 });
  const item = rosterListItem(page, seeded.whiteboardSessionId);
  const row = item.getByTestId("roster-resume-session");
  // The disclosure is in the SSR HTML. A click before hydration is discarded
  // and the list stays closed. Click again once that first attempt misses.
  await disclosure.click();
  try {
    await expect(row).toBeVisible({ timeout: 3_000 });
  } catch {
    await disclosure.click();
    await expect(row).toBeVisible({ timeout: 15_000 });
  }
  return item;
}

async function confirmRosterDelete(
  item: Locator,
  held?: HeldSessionDelete,
): Promise<Locator> {
  await item.getByTestId("roster-cancel-delete").click();
  const confirm = item.getByTestId("roster-cancel-delete-confirm-yes");
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  // Arm only once the confirm click is about to happen, so a notes poll
  // that shares the delete body cannot pin the action id.
  if (held) await held.armDeleteCapture();
  await confirm.click({ noWaitAfter: true });
  return confirm;
}

async function confirmReviewDelete(page: Page, held?: HeldSessionDelete): Promise<void> {
  await page.getByTestId("wb-delete-session").click();
  const confirm = page.getByTestId("wb-delete-confirm-yes");
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  // Do not wait for the navigation this click starts. The spec checks the
  // session row as soon as the student-detail URL is showing, and a full
  // load wait lets a background delete finish first.
  if (held) await held.armDeleteCapture();
  await confirm.click({ noWaitAfter: true });
}

/**
 * The UI has left review. The session row must already be gone. The poll is
 * only long enough for one database read, not for a late delete to finish.
 */
async function expectSessionGoneOnStudentPage(
  page: Page,
  seeded: SeededErasure,
): Promise<void> {
  await expect(page).toHaveURL(studentDetailUrl(seeded.studentId), { timeout: 30_000 });
  await expect
    .poll(async () => (await readErasureRows(seeded)).session, {
      timeout: 1_000,
      intervals: [50, 100, 200],
      message: "session row still present after review navigated to the student page",
    })
    .toBeNull();
}

async function readErasureRows(ids: ErasureIds) {
  return withHarnessPrisma(async (prisma) => {
    const [session, note, recording] = await Promise.all([
      prisma.whiteboardSession.findUnique({
        where: { id: ids.whiteboardSessionId },
        select: { id: true },
      }),
      prisma.sessionNote.findUnique({
        where: { id: ids.noteId },
        select: { id: true },
      }),
      prisma.sessionRecording.findUnique({
        where: { id: ids.recordingId },
        select: { id: true },
      }),
    ]);
    return { session, note, recording };
  });
}

test.describe(
  "delete session and data",
  { tag: [TAG.WB_RECORDING, TAG.WB_SYNC] },
  () => {
    // Fixture setup (blob reset) counts against this, not the default 60s.
    test.describe.configure({ timeout: 180_000 });

    test("tutor delete clears session rows and denies share and learner replay", async ({
      page,
      browser,
    }) => {
      test.setTimeout(180_000);

      const seeded = await seedReplayGrantedSession();
      const shareToken = await resolveShareTokenForStudent(seeded.studentId);
      const sharePath = `/s/${shareToken}/whiteboard/${seeded.whiteboardSessionId}`;
      const learnerPath = `/join/notes/${seeded.whiteboardSessionId}/whiteboard`;
      const tutorPath = `/admin/students/${seeded.studentId}/whiteboard/${seeded.whiteboardSessionId}/workspace`;

      const parentCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const learnerCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });

      try {
        const parentPage = await parentCtx.newPage();
        await loginOwningParentForShare(parentCtx);
        const grantedShare = await parentPage.goto(sharePath, { waitUntil: "domcontentloaded" });
        // Replay is open for the share-link principal before the destructive action.
        expect(grantedShare?.status(), "share replay granted before delete").toBe(200);
        await expect(parentPage.getByTestId("wb-share-replay-page")).toBeVisible();

        const learnerPage = await learnerCtx.newPage();
        await loginLearnerInContext(learnerCtx, seeded.learnerHandle, seeded.learnerPin);
        const grantedLearner = await learnerPage.goto(learnerPath, {
          waitUntil: "domcontentloaded",
        });
        expect(grantedLearner?.status(), "learner replay granted before delete").toBe(200);
        await expect(learnerPage.getByTestId("learner-wb-replay-page")).toBeVisible();

        const before = await readErasureRows(seeded);
        expect(before.session, "session row exists before delete").not.toBeNull();
        expect(before.note, "note row exists before delete").not.toBeNull();
        expect(before.recording, "recording row exists before delete").not.toBeNull();

        await page.goto(tutorPath, { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 45_000 });
        await confirmReviewDelete(page);
        await expectSessionGoneOnStudentPage(page, seeded);

        const after = await readErasureRows(seeded);
        expect(after.session, "session row gone").toBeNull();
        expect(after.note, "note row gone").toBeNull();
        expect(after.recording, "recording row gone").toBeNull();

        const deniedShare = await parentPage.goto(sharePath, { waitUntil: "domcontentloaded" });
        expect(deniedShare?.status(), "share replay denied after delete").toBe(404);
        await expect(parentPage.getByTestId("wb-share-replay-page")).toHaveCount(0);

        const deniedLearner = await learnerPage.goto(learnerPath, {
          waitUntil: "domcontentloaded",
        });
        expect(deniedLearner?.status(), "learner replay denied after delete").toBe(404);
        await expect(learnerPage.getByTestId("learner-wb-replay-page")).toHaveCount(0);

        const missing = await page.goto(tutorPath, { waitUntil: "domcontentloaded" });
        expect(missing?.status(), "tutor read path no longer resolves the session").toBe(404);
      } finally {
        await parentCtx.close();
        await learnerCtx.close();
      }
    });

    test("delayed delete reaches the student page only after the session row is gone", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const seeded = await seedReplayGrantedSession();
      const tutorPath = `/admin/students/${seeded.studentId}/whiteboard/${seeded.whiteboardSessionId}/workspace`;

      await page.goto(tutorPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 45_000 });
      // The review shell is visible while notes are still loading. Wait until
      // the delete control is up so the route does not hold that load action.
      await expect(page.getByTestId("wb-delete-session")).toBeVisible();
      await expect(page.getByTestId("wb-delete-session")).toBeEnabled();

      const held = await interceptSessionDeletePost(page, seeded.whiteboardSessionId, "hold", {
        studentId: seeded.studentId,
        requireTutorNoteDone: true,
      });
      held.arm();

      try {
        await confirmReviewDelete(page, held);
        await expect
          .poll(
            () => (held.sawDeletePost() ? "seen" : held.actionPosts.slice(-6).join(" || ") || "none"),
            { timeout: 15_000 },
          )
          .toBe("seen");
        // A handler that navigates first aims this POST at the student page.
        // The row must already be gone. A handler that posts on the review
        // URL and then navigates still looks like a review POST, so the hold
        // below checks the page has not left, the confirm is still disabled,
        // the row is still there, and no student-detail flight has started.
        const navigatedBeforeDelete = !held.deletePostPath().includes("/whiteboard/");
        if (navigatedBeforeDelete) {
          await expect
            .poll(async () => (await readErasureRows(seeded)).session, {
              timeout: 1_000,
              intervals: [50, 100, 200],
              message: "session row still present when navigation was already aimed at the student page",
            })
            .toBeNull();
        } else {
          const confirm = page.getByTestId("wb-delete-confirm-yes");
          await page.waitForTimeout(1_500);
          await expect(page).toHaveURL(reviewSessionUrl(seeded.whiteboardSessionId));
          await expect(confirm).toBeDisabled();
          expect(
            await readSessionRow(seeded.whiteboardSessionId),
            "session row removed while the delete POST was still held",
          ).not.toBeNull();
          expect(
            held.flights,
            `student-detail RSC fired before the delete committed: ${held.flights.join(" | ") || "none"}`,
          ).toEqual([]);
          // A second click while the confirm is disabled must not send another POST.
          const secondClick = await confirm
            .click({ noWaitAfter: true, timeout: 500 })
            .then(() => "clicked" as const, () => "blocked" as const);
          expect(secondClick).toBe("blocked");
          expect(held.deletePostCount()).toBe(1);
          held.release();
          await expectSessionGoneOnStudentPage(page, seeded);
        }
        expect(
          held.sawDeletePost(),
          `delete action POST was not intercepted. saw: ${held.actionPosts.join(" | ") || "(none)"}`,
        ).toBe(true);
      } finally {
        await held.unroute();
      }
    });

    test("aborted delete stays on review, shows the error, and keeps the session", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const seeded = await seedReplayGrantedSession();
      const tutorPath = `/admin/students/${seeded.studentId}/whiteboard/${seeded.whiteboardSessionId}/workspace`;

      await page.goto(tutorPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 45_000 });
      await expect(page.getByTestId("wb-delete-session")).toBeVisible();
      await expect(page.getByTestId("wb-delete-session")).toBeEnabled();

      const held = await interceptSessionDeletePost(page, seeded.whiteboardSessionId, "abort", {
        requireTutorNoteDone: true,
      });

      try {
        await confirmReviewDelete(page, held);
        await expect(page.getByTestId("wb-delete-session-error")).toBeVisible({ timeout: 15_000 });
        await expect(page).toHaveURL(new RegExp(`/whiteboard/${seeded.whiteboardSessionId}`));
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible();
        const rows = await readErasureRows(seeded);
        expect(rows.session, "session row kept when delete fails").not.toBeNull();
        expect(rows.note, "note row kept when delete fails").not.toBeNull();
        expect(rows.recording, "recording row kept when delete fails").not.toBeNull();
      } finally {
        await held.unroute();
      }
    });

    test("student-list delete removes the row only after the session row is gone", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const seeded = await seedWbLiveSyncSession();
      const item = await openRosterDelete(page, seeded);
      await confirmRosterDelete(item);
      await expect(item.getByTestId("roster-resume-session")).toHaveCount(0, { timeout: 30_000 });
      await expect
        .poll(async () => readSessionRow(seeded.whiteboardSessionId), {
          timeout: 1_000,
          intervals: [50, 100, 200],
          message: "session row still present after the student list removed the row",
        })
        .toBeNull();
    });

    test("student-list delete keeps the row while the action is held", async ({ page }) => {
      test.setTimeout(180_000);
      const seeded = await seedWbLiveSyncSession();
      const item = await openRosterDelete(page, seeded);
      const held = await interceptSessionDeletePost(page, seeded.whiteboardSessionId, "hold", {
        studentId: seeded.studentId,
      });
      held.arm();

      try {
        const confirm = await confirmRosterDelete(item, held);
        await expect
          .poll(
            () => (held.sawDeletePost() ? "seen" : held.actionPosts.slice(-6).join(" || ") || "none"),
            { timeout: 15_000 },
          )
          .toBe("seen");

        // This control already lives on the student page, so the POST URL
        // cannot show an early push the way the review page can. The broken
        // handler dismisses the confirm and calls router.push before the
        // action. That is the list moving on while the POST is held. The
        // session row must already be gone.
        const rowLink = item.getByTestId("roster-resume-session");
        const rowGone = (await rowLink.count()) === 0;
        const confirmGone = (await confirm.count()) === 0;
        const leftPage = !studentDetailUrl(seeded.studentId).test(page.url());
        const refreshedEarly = held.flights.length > 0;
        if (rowGone || confirmGone || leftPage || refreshedEarly) {
          await expect
            .poll(async () => readSessionRow(seeded.whiteboardSessionId), {
              timeout: 1_000,
              intervals: [50, 100, 200],
              message: `session row still present after the list moved on before the delete committed (rowGone=${rowGone} confirmGone=${confirmGone} leftPage=${leftPage} flights=${held.flights.join(" | ") || "none"})`,
            })
            .toBeNull();
        } else {
          await expect(rowLink).toBeVisible();
          await expect(page).toHaveURL(studentDetailUrl(seeded.studentId));
          await expect(confirm).toBeDisabled();
          expect(
            await readSessionRow(seeded.whiteboardSessionId),
            "session row removed while the delete POST was still held",
          ).not.toBeNull();
          expect(held.flights).toEqual([]);
          // Hold the refresh flight so the row stays after refresh() returns.
          // Playwright waits until "Yes, delete" is enabled. The broken handler
          // re-enables it in that window, and a second click flashes
          // "Session not found."
          held.stallStudentDetail();
          const secondClick = confirm
            .click({ noWaitAfter: true, timeout: 5_000 })
            .then(() => "clicked" as const, () => "blocked" as const);
          const errorFlash = item
            .getByTestId("roster-cancel-delete-error")
            .waitFor({ state: "visible", timeout: 5_000 })
            .then(() => true, () => false);
          held.release();
          const second = await secondClick;
          expect(
            held.deletePostCount(),
            `second confirm click (${second}) sent another delete. posts: ${held.actionPosts.join(" | ") || "(none)"}`,
          ).toBe(1);
          expect(await errorFlash, "delete error alert flashed after the second click").toBe(false);
          held.releaseFlights();
          await expect(rowLink).toHaveCount(0, { timeout: 30_000 });
          await expect
            .poll(async () => readSessionRow(seeded.whiteboardSessionId), {
              timeout: 1_000,
              intervals: [50, 100, 200],
              message: "session row still present after the student list removed the row",
            })
            .toBeNull();
        }
        expect(
          held.sawDeletePost(),
          `delete action POST was not intercepted. saw: ${held.actionPosts.join(" | ") || "(none)"}`,
        ).toBe(true);
      } finally {
        await held.unroute();
      }
    });

    test("aborted student-list delete keeps the row and shows the error", async ({ page }) => {
      test.setTimeout(180_000);
      const seeded = await seedWbLiveSyncSession();
      const item = await openRosterDelete(page, seeded);
      const held = await interceptSessionDeletePost(page, seeded.whiteboardSessionId, "abort");

      try {
        await confirmRosterDelete(item, held);
        await expect(item.getByTestId("roster-cancel-delete-error")).toBeVisible({ timeout: 15_000 });
        await expect(item.getByTestId("roster-resume-session")).toBeVisible();
        await expect(page).toHaveURL(studentDetailUrl(seeded.studentId));
        expect(
          await readSessionRow(seeded.whiteboardSessionId),
          "session row kept when the student-list delete fails",
        ).not.toBeNull();
      } finally {
        await held.unroute();
      }
    });
  }
);
