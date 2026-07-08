import { test, expect } from "../visual/fixtures";
import {
  seedTestAdmin,
  seedTestStudent,
  seedTestLearner,
  loginAsTestAdmin,
  seedOpenWhiteboardSession,
} from "../visual/helpers";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "../helpers/blob-gate";
import { TAG } from "../test-tags";
import { PrismaClient } from "@prisma/client";

const { applyWbRegressionLocalDatabaseEnv } = require("../../scripts/wb-regression-local-db.cjs");

/**
 * Whiteboard Playwright smoke (WHITEBOARD-STATUS §1.12).
 *
 * 1) **Workspace mount** — DB-seeded open session → tutor workspace loads Excalidraw.
 *    No Vercel Blob required (matches CI / fresh sqlite).
 *
 * 2) **Create session → workspace** — full `createWhiteboardSession` path including Blob put.
 *    Skips when blob harness is off and no real Blob token is configured.
 */

let adminUserId: string;
let studentId: string;

async function seedClaimedStudentWithConsent(): Promise<void> {
  adminUserId = await seedTestAdmin();
  const seed = await seedTestStudent(adminUserId);
  studentId = seed.studentId;
  const { learnerProfileId } = await seedTestLearner(adminUserId, studentId);

  const prisma = new PrismaClient();
  try {
    const accountHolder = await prisma.learnerProfile.findUnique({
      where: { id: learnerProfileId },
      select: { accountHolderId: true },
    });
    if (!accountHolder) {
      throw new Error(`LearnerProfile not found: ${learnerProfileId}`);
    }
    await prisma.consentRecord.upsert({
      where: {
        learnerProfileId_adminUserId_version: {
          learnerProfileId,
          adminUserId,
          version: 1,
        },
      },
      create: {
        learnerProfileId,
        adminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: accountHolder.accountHolderId,
        captureMethod: "electronic",
      },
      update: {
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.beforeAll(async () => {
  await seedClaimedStudentWithConsent();
});

test("whiteboard workspace — Excalidraw mount (seeded open session)", async ({
  guardedPage,
}) => {
  test.setTimeout(120_000);

  const seededWorkspaceSessionId = await seedOpenWhiteboardSession({
    adminUserId,
    studentId,
  });

  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto(
    `/admin/students/${studentId}/whiteboard/${seededWorkspaceSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );

  await expect(guardedPage).toHaveURL(
    /\/admin\/students\/.+\/whiteboard\/.+\/workspace$/,
    { timeout: 30_000 }
  );

  await expect(
    guardedPage.getByTestId("tutor-whiteboard-canvas-mount")
  ).toBeVisible({ timeout: 90_000 });

  await expect(guardedPage.getByTestId("wb-tutor-page-strip")).toBeVisible();
});

test("whiteboard — createWhiteboardSession starts session (needs BLOB)", { tag: [TAG.WB_RECORDING] }, async ({
  guardedPage,
}) => {
  test.setTimeout(120_000);

  test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

  applyWbRegressionLocalDatabaseEnv();

  const prisma = new PrismaClient();
  try {
    await prisma.whiteboardSession.updateMany({
      where: { studentId, endedAt: null },
      data: { endedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }

  await loginAsTestAdmin(guardedPage);
  await guardedPage.goto(`/admin/students/${studentId}`, {
    waitUntil: "domcontentloaded",
  });

  const startBtn = guardedPage.getByTestId("start-whiteboard-session-btn").first();
  await expect(startBtn).toBeEnabled();
  await startBtn.scrollIntoViewIfNeeded();
  // Client component must hydrate before server-action onClick fires.
  await guardedPage.waitForFunction(() => {
    const el = document.querySelector(
      "[data-testid='start-whiteboard-session-btn']"
    );
    if (!el) return false;
    return Object.keys(el).some(
      (k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps")
    );
  });

  // RW-6: createWhiteboardSession still redirect()s to workspace after the row
  // is durable; wait for hydration so the server-action onClick actually fires.
  await Promise.all([
    guardedPage.waitForURL(/\/whiteboard\/[^/]+\/workspace$/, {
      timeout: 45_000,
    }),
    startBtn.click(),
  ]);

  await expect(
    guardedPage.getByTestId("tutor-whiteboard-canvas-mount")
  ).toBeVisible({ timeout: 90_000 });
});
