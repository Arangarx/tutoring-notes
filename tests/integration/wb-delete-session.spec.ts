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

import { type Page, type Request } from "@playwright/test";
import { test, expect } from "./fixtures";
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

/** Student detail only — the review URL is a longer path under the same id. */
function studentDetailUrl(studentId: string): RegExp {
  const id = studentId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`/admin/students/${id}/?(?:\\?.*)?$`);
}

/**
 * Delete server action the review page fires. The broken handler navigates
 * first, so the POST may land on the student page rather than the review URL.
 * It is still the Next-Action call whose argument is the session id.
 */
function isReviewDeletePost(request: Request, whiteboardSessionId: string): boolean {
  if (request.method() !== "POST") return false;
  if (!request.headers()["next-action"]) return false;
  const body = request.postData() ?? "";
  return request.url().includes(whiteboardSessionId) || body.includes(whiteboardSessionId);
}

function describeActionPost(request: Request): string {
  let pathname = request.url();
  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    // keep the raw url
  }
  const action = request.headers()["next-action"] ? "yes" : "no";
  const body = (request.postData() ?? "").slice(0, 160);
  return `next-action=${action} ${pathname} body=${body}`;
}

async function confirmReviewDelete(page: Page): Promise<void> {
  await page.getByTestId("wb-delete-session").click();
  const confirm = page.getByTestId("wb-delete-confirm-yes");
  await expect(confirm).toBeVisible();
  await expect(confirm).toBeEnabled();
  // Do not wait for the navigation this click starts. The spec checks the
  // session row as soon as the student-detail URL is showing, and a full
  // load wait lets a background delete finish first.
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
      const actionPosts: string[] = [];
      let sawDeletePost = false;
      let deletePostPath = "";
      let releaseDelete = () => {};
      const deleteHeld = new Promise<void>((resolve) => {
        releaseDelete = resolve;
      });

      await page.goto(tutorPath, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({ timeout: 45_000 });
      // The review shell is visible while notes are still loading. Wait until
      // the delete control is up so the route does not hold that load action.
      await expect(page.getByTestId("wb-delete-session")).toBeVisible();
      await expect(page.getByTestId("wb-delete-session")).toBeEnabled();

      await page.route("**/*", async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
          actionPosts.push(describeActionPost(request));
        }
        if (!isReviewDeletePost(request, seeded.whiteboardSessionId)) {
          await route.continue();
          return;
        }
        deletePostPath = new URL(request.url()).pathname;
        sawDeletePost = true;
        await deleteHeld;
        try {
          await route.continue();
        } catch {
          // The test unroutes on the way out. The request was already settled.
        }
      });

      try {
        await confirmReviewDelete(page);
        await expect
          .poll(
            () => (sawDeletePost ? "seen" : actionPosts.slice(-6).join(" || ") || "none"),
            { timeout: 15_000 },
          )
          .toBe("seen");
        // Next paints the student URL only after this POST settles, so a hold
        // cannot show the document URL and a still-present row at the same
        // time. The router canonical URL is the earlier signal: the broken
        // handler's POST is already aimed at the student page, which means
        // navigation ran before the delete was delivered. The row must
        // already be gone. The fixed handler posts to the review URL; only
        // then do we release the POST and wait for the document URL.
        const navigatedBeforeDelete = !deletePostPath.includes("/whiteboard/");
        if (navigatedBeforeDelete) {
          await expect
            .poll(async () => (await readErasureRows(seeded)).session, {
              timeout: 1_000,
              intervals: [50, 100, 200],
              message: "session row still present when navigation was already aimed at the student page",
            })
            .toBeNull();
        } else {
          releaseDelete();
          await expectSessionGoneOnStudentPage(page, seeded);
        }
        expect(
          sawDeletePost,
          `delete action POST was not intercepted. saw: ${actionPosts.join(" | ") || "(none)"}`,
        ).toBe(true);
      } finally {
        releaseDelete();
        await page.unroute("**/*").catch(() => {});
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

      let abortedDelete = false;
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (abortedDelete || !isReviewDeletePost(request, seeded.whiteboardSessionId)) {
          await route.continue();
          return;
        }
        abortedDelete = true;
        await route.abort("failed");
      });

      try {
        await confirmReviewDelete(page);
        await expect(page.getByTestId("wb-delete-session-error")).toBeVisible({ timeout: 15_000 });
        await expect(page).toHaveURL(new RegExp(`/whiteboard/${seeded.whiteboardSessionId}`));
        await expect(page.getByTestId("wb-session-review-mode")).toBeVisible();
        const rows = await readErasureRows(seeded);
        expect(rows.session, "session row kept when delete fails").not.toBeNull();
        expect(rows.note, "note row kept when delete fails").not.toBeNull();
        expect(rows.recording, "recording row kept when delete fails").not.toBeNull();
      } finally {
        await page.unroute("**/*").catch(() => {});
      }
    });
  }
);
