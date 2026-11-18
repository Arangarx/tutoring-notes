/**
 * Silent session notes. A TutorNote that finished `done` with the empty
 * structured note (no speech left after silence drops) tells the tutor why
 * the form is blank. A done note that has content does not.
 *
 * Run:
 *   npx playwright test tests/integration/wb-notes-silent-empty.spec.ts --project=wb-regression
 */

import { PrismaClient } from "@prisma/client";
import { test, expect } from "./fixtures";
import { seedWbLiveSyncSession } from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";
import { EMPTY_STRUCTURED_NOTE } from "../../src/lib/note-content";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");
applyWbRegressionLocalDatabaseEnv();

const NO_SPEECH =
  "No speech was detected in this recording, so no notes were drafted. You can write notes yourself.";
const NO_LESSON =
  "No lesson content was found in this recording, so no notes were drafted. You can write notes yourself.";

const SPOKEN_TOPICS = "Quadratics and factoring";

async function seedEndedNote(note: { status: string; content: string | null }) {
  const session = await seedWbLiveSyncSession();
  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.update({
      where: { id: session.whiteboardSessionId },
      data: { endedAt: new Date() },
    });
    await prisma.tutorNote.create({
      data: {
        sessionId: session.whiteboardSessionId,
        status: note.status,
        content: note.content,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  return session;
}

async function openReview(
  page: import("@playwright/test").Page,
  studentId: string,
  whiteboardSessionId: string
) {
  await page.goto(
    `/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(page.getByTestId("wb-session-review-mode")).toBeVisible({
    timeout: 90_000,
  });
  // The review shell paints before the notes payload returns.
  await expect(page.getByTestId("tutor-notes-section")).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("silent empty session notes", { tag: [TAG.WB_RECORDING] }, () => {
  test("done empty note says no speech was detected; a done note with content does not", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const silent = await seedEndedNote({
      status: "done",
      content: JSON.stringify(EMPTY_STRUCTURED_NOTE),
    });
    await openReview(page, silent.studentId, silent.whiteboardSessionId);
    await expect(page.getByText(NO_SPEECH)).toBeVisible();
    await expect(page.getByText(NO_LESSON)).toHaveCount(0);
    await expect(page.getByTestId("wb-save-note")).toBeDisabled();

    const spoken = await seedEndedNote({
      status: "done",
      content: JSON.stringify({
        ...EMPTY_STRUCTURED_NOTE,
        topics: SPOKEN_TOPICS,
        assessment: "Can solve by factoring",
        nextSteps: "Practice set 4",
      }),
    });
    await openReview(page, spoken.studentId, spoken.whiteboardSessionId);
    await expect(page.getByText(NO_SPEECH)).toHaveCount(0);
    await expect(page.getByText(NO_LESSON)).toHaveCount(0);
    await expect(page.locator("#wb-note-topics")).toHaveValue(SPOKEN_TOPICS);
  });

  test("an abstained note (speech existed) shows the no-lesson copy, not the no-speech copy", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    const session = await seedEndedNote({
      status: "done",
      content: JSON.stringify(EMPTY_STRUCTURED_NOTE),
    });
    const prisma = new PrismaClient();
    try {
      await prisma.transcriptChunk.create({
        data: {
          sessionId: session.whiteboardSessionId,
          chunkBlobUrl: `https://example.invalid/abstain-${session.whiteboardSessionId}.webm`,
          recordingTimeOffsetMs: 0,
          transcript:
            "Can we move Thursday from 3 to 4:30? I'll send your mom the calendar invite.",
          status: "done",
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await openReview(page, session.studentId, session.whiteboardSessionId);
    await expect(page.getByTestId("tutor-notes-no-lesson")).toHaveText(NO_LESSON);
    await expect(page.getByText(NO_SPEECH)).toHaveCount(0);
    await expect(page.getByTestId("wb-save-note")).toBeDisabled();
  });
});
