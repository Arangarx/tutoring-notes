/**
 * Item 10 — the multi-part drift banner must not render on a real replay.
 *
 * Tutor-plus-student audio is two SessionRecording rows and no concat URL.
 * Concat is unchanged; the banner is presentation-only and must be absent.
 *
 * Run:
 *   npx playwright test tests/integration/wb-replay-no-multipart-banner.spec.ts --project=wb-regression --workers=1
 */

import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import { generateShareToken } from "@/lib/security";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { uploadReplayEvents } from "./wb-replay-harness.helpers";

const RENDERED_BANNER = /multi-?part|multi-?segment|drift|out of sync/i;
const LEARNER_STATE = "tests/integration/.auth/learner.json";

const { assertLocalDatabaseUrlForHarness } = require("../../scripts/wb-regression-local-db.cjs");

test.describe(
  "replay has no multi-part drift banner",
  { tag: [TAG.WB_RECORDING] },
  () => {
    test("tutor-plus-student replay with two segments and no canonical URL hides the drift warning", async ({
      page,
      browser,
    }) => {
      test.setTimeout(180_000);
      assertLocalDatabaseUrlForHarness();

      const session = await seedWbLiveSyncSession();
      const prisma = new PrismaClient();
      const shareToken = generateShareToken();
      try {
        await prisma.whiteboardSession.update({
          where: { id: session.whiteboardSessionId },
          data: {
            endedAt: new Date("2026-10-11T18:30:00.000Z"),
            concatBlobUrl: null,
            concatDurationSeconds: null,
            durationSeconds: 8,
          },
        });
        await prisma.sessionRecording.createMany({
          data: [
            {
              adminUserId: session.adminUserId,
              studentId: session.studentId,
              whiteboardSessionId: session.whiteboardSessionId,
              blobUrl: `https://pw.local/${session.whiteboardSessionId}/tutor.webm`,
              mimeType: "audio/webm",
              sizeBytes: 128,
              durationSeconds: 4,
              orderIndex: 0,
              streamId: "tutor:mic",
            },
            {
              adminUserId: session.adminUserId,
              studentId: session.studentId,
              whiteboardSessionId: session.whiteboardSessionId,
              blobUrl: `https://pw.local/${session.whiteboardSessionId}/student.webm`,
              mimeType: "audio/webm",
              sizeBytes: 128,
              durationSeconds: 4,
              orderIndex: 1,
              streamId: "student:peer-pwstudent:mic",
            },
          ],
        });

        const stored = await prisma.whiteboardSession.findUniqueOrThrow({
          where: { id: session.whiteboardSessionId },
          select: {
            concatBlobUrl: true,
            audioRecordings: {
              select: { streamId: true },
              orderBy: { orderIndex: "asc" },
            },
          },
        });
        expect(stored.concatBlobUrl).toBeNull();
        expect(stored.audioRecordings.map((row) => row.streamId)).toEqual([
          "tutor:mic",
          "student:peer-pwstudent:mic",
        ]);
        await prisma.shareLink.create({
          data: { studentId: session.studentId, token: shareToken },
        });
      } finally {
        await prisma.$disconnect();
      }

      await uploadReplayEvents({
        request: page.request,
        adminUserId: session.adminUserId,
        studentId: session.studentId,
        whiteboardSessionId: session.whiteboardSessionId,
      });

      await page.goto(
        `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace?surface=replay`,
        { waitUntil: "domcontentloaded" }
      );

      const frame = page.getByTestId("wb-replay-in-frame");
      await expect(frame).toBeVisible({ timeout: 60_000 });
      await expect(frame).not.toContainText("Multi-part recording");
      await expect(frame).not.toContainText("timing may drift");
      const tutorBody = await page.locator("body").innerText();
      expect(tutorBody).not.toMatch(RENDERED_BANNER);

      const learner = await browser.newContext({ storageState: LEARNER_STATE });
      try {
        const sharePage = await learner.newPage();
        await sharePage.goto(
          `/s/${shareToken}/whiteboard/${session.whiteboardSessionId}`,
          { waitUntil: "domcontentloaded" }
        );
        const shareFrame = sharePage.getByTestId("wb-replay-in-frame");
        await expect(shareFrame).toBeVisible({ timeout: 60_000 });
        const shareBody = await sharePage.locator("body").innerText();
        expect(shareBody).not.toMatch(RENDERED_BANNER);
      } finally {
        await learner.close();
      }
    });
  }
);
