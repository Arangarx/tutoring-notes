/**
 * Notes "View whiteboard" / "Watch whiteboard" must mount WhiteboardReplayInFrame,
 * not legacy WhiteboardReplay (old range scrubber + tiny board).
 *
 * Oracles:
 *   - `wb-replay-in-frame` present
 *   - legacy `wb-replay` absent
 *
 * Run:
 *   npx playwright test tests/integration/view-whiteboard-new-replay.spec.ts --project=wb-regression
 */

import { test, expect } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { TEST_LEARNER } from "../visual/helpers";
import {
  loginAccountHolderInContext,
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
} from "./whiteboard-live-sync.helpers";
import { resolveShareTokenForStudent } from "./share-page-audio-scrub.helpers";
import { uploadReplayEvents } from "./wb-replay-harness.helpers";
import { TAG } from "../test-tags";

/** Password for TEST_LEARNER.parentEmail AH login (share wall requires entitled session). */
const TEST_LEARNER_PARENT_AH_PASSWORD = "PlaywrightParentAh!456";

async function loginOwningParentForShare(
  context: import("@playwright/test").BrowserContext
) {
  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(TEST_LEARNER_PARENT_AH_PASSWORD, 10);
    await prisma.accountHolder.update({
      where: { email: TEST_LEARNER.parentEmail },
      data: { passwordHash, emailVerifiedAt: new Date("2026-01-01") },
    });
  } finally {
    await prisma.$disconnect();
  }
  await loginAccountHolderInContext(
    context,
    TEST_LEARNER.parentEmail,
    TEST_LEARNER_PARENT_AH_PASSWORD
  );
}

/** Parent share card reads WhiteboardSession.noteId — end-session alone does not set it. */
async function linkEndedWhiteboardToReadyShareNote(
  studentId: string,
  whiteboardSessionId: string
) {
  const prisma = new PrismaClient();
  try {
    let note = await prisma.sessionNote.findFirst({
      where: { studentId, status: "READY" },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!note) {
      note = await prisma.sessionNote.create({
        data: {
          studentId,
          date: new Date(),
          topics: "Playwright ended session",
          homework: "",
          assessment: "",
          nextSteps: "",
          linksJson: "[]",
          status: "READY",
          shareRecordingInEmail: true,
        },
        select: { id: true },
      });
    }
    await prisma.whiteboardSession.update({
      where: { id: whiteboardSessionId },
      data: { noteId: note.id },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function endSessionOnWorkspace(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(page, "tutor");
  await page.waitForTimeout(3_000);
  await page.getByTestId("wb-end-session").click();
  const confirmBtn = page.getByTestId("wb-end-session-confirm-yes");
  if (await confirmBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await confirmBtn.click();
  }
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 120_000,
  });
}

async function assertNewReplayStack(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("wb-replay-in-frame")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("wb-replay")).toHaveCount(0);
  await expect(page.getByTestId("wb-replay-timeline-strip")).toBeVisible();
}

/**
 * Real recording shape: recorder.recordViewport fires at t≈0, then a stroke.
 * No audio, so the synthetic clock keeps painting that viewport.
 * Excalidraw's label is "Loading scene…" (U+2026); substring match is enough.
 */
function viewportAtStartEventsJson(): string {
  return JSON.stringify({
    schemaVersion: 1,
    startedAt: "2026-10-21T18:00:00.000Z",
    durationMs: 8000,
    events: [
      {
        t: 0,
        type: "viewport",
        panX: 12,
        panY: -40,
        zoom: 1,
        viewportWidth: 1280,
        viewportHeight: 800,
      },
      {
        t: 400,
        type: "add",
        element: {
          id: "pw-loading-scene-stroke",
          type: "freehand",
          x: 48,
          y: 72,
          width: 96,
          height: 28,
          points: [
            [0, 0],
            [48, 12],
            [96, 4],
          ],
          strokeColor: "#1e1e1e",
          strokeWidth: 2,
        },
      },
    ],
  });
}

/** Spinner must be gone once playback has been painting for a couple of seconds. */
async function assertLoadingSceneCleared(
  page: import("@playwright/test").Page
) {
  await assertNewReplayStack(page);
  await page.waitForTimeout(2_000);
  await expect(page.getByText("Loading scene")).toHaveCount(0);
}

test.describe(
  "view whiteboard from notes — new in-frame replay",
  { tag: [TAG.WB_CHROME, TAG.WB_RECORDING] },
  () => {
    test("tutor note link ?surface=replay auto-enters WhiteboardReplayInFrame", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await endSessionOnWorkspace(page, studentId, whiteboardSessionId);

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace?surface=replay`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("wb-session-review-mode")).toHaveAttribute(
        "data-review-surface",
        "replay"
      );
      await assertNewReplayStack(page);
    });

    test("legacy standalone review URL redirects to workspace in-frame replay", async ({
      page,
    }) => {
      test.setTimeout(120_000);

      const prisma = new PrismaClient();
      const { studentId, whiteboardSessionId } = await (async () => {
        try {
          const session = await seedWbLiveSyncSession();
          await prisma.whiteboardSession.update({
            where: { id: session.whiteboardSessionId },
            data: {
              endedAt: new Date(Date.now() - 60_000),
              eventsBlobUrl: "https://pw.local/events-fixture.json",
            },
          });
          return {
            studentId: session.studentId,
            whiteboardSessionId: session.whiteboardSessionId,
          };
        } finally {
          await prisma.$disconnect();
        }
      })();

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}`,
        { waitUntil: "domcontentloaded" }
      );

      await expect(page).toHaveURL(
        new RegExp(
          `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace\\?surface=replay`
        )
      );
      await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
        timeout: 30_000,
      });
    });

    test("parent share note View whiteboard opens WhiteboardReplayInFrame", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

      const { studentId, whiteboardSessionId } = await seedWbLiveSyncSession();
      await endSessionOnWorkspace(page, studentId, whiteboardSessionId);
      await linkEndedWhiteboardToReadyShareNote(studentId, whiteboardSessionId);
      const shareToken = await resolveShareTokenForStudent(studentId);

      // SEC-SHARE-WALL: /s/[token] requires an entitled AccountHolder (or learner) session.
      await loginOwningParentForShare(page.context());

      await page.goto(`/s/${shareToken}`, { waitUntil: "domcontentloaded" });
      await expect(page).not.toHaveURL(/\/account\/login/);
      // Each note card has its own replay-links group. Scope to the link for
      // this ended session so a page of other notes does not trip strict mode.
      const replayLink = page.locator(
        `[data-testid="share-wb-replay-links"] a[href$="/whiteboard/${whiteboardSessionId}"]`
      );
      await expect(replayLink).toBeVisible({ timeout: 30_000 });
      await expect(replayLink).toHaveText("View whiteboard");

      await replayLink.click();

      await expect(page).toHaveURL(
        new RegExp(`/s/${shareToken}/whiteboard/${whiteboardSessionId}`)
      );
      await assertNewReplayStack(page);
    });

    test("Loading scene spinner clears during playback when the log starts with a viewport", async ({
      page,
    }) => {
      test.setTimeout(240_000);

      const { studentId, whiteboardSessionId, adminUserId } =
        await seedWbLiveSyncSession();
      const prisma = new PrismaClient();
      try {
        await prisma.whiteboardSession.update({
          where: { id: whiteboardSessionId },
          data: { endedAt: new Date("2026-10-21T18:30:00.000Z") },
        });
      } finally {
        await prisma.$disconnect();
      }
      await uploadReplayEvents({
        request: page.request,
        adminUserId,
        studentId,
        whiteboardSessionId,
        eventsJson: viewportAtStartEventsJson(),
      });

      await page.goto(
        `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace?surface=replay`,
        { waitUntil: "domcontentloaded" }
      );
      await expect(page.getByTestId("wb-session-review-mode")).toHaveAttribute(
        "data-review-surface",
        "replay",
        { timeout: 30_000 }
      );
      await assertLoadingSceneCleared(page);

      await linkEndedWhiteboardToReadyShareNote(studentId, whiteboardSessionId);
      const shareToken = await resolveShareTokenForStudent(studentId);
      await loginOwningParentForShare(page.context());
      await page.goto(`/s/${shareToken}/whiteboard/${whiteboardSessionId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page).toHaveURL(
        new RegExp(`/s/${shareToken}/whiteboard/${whiteboardSessionId}`)
      );
      await assertLoadingSceneCleared(page);
    });
  }
);
