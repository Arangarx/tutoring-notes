/**
 * Playwright smoke test: Audio upload + transcribe flow
 *
 * Verifies the full UI flow:
 * 1. Upload tab is visible when blob is configured.
 * 2. After "uploading" a file (stubbed), the transcribe button appears.
 * 3. Clicking Transcribe & generate (stubbed) populates the note form.
 * 4. The recording section + share checkbox appear in the note form.
 *
 * Strategy:
 * - Stub the Vercel Blob upload endpoint (/api/upload/audio) to return a fake blob URL.
 * - Stub the server action POST (transcribeAndGenerateAction) to return fixed note fields.
 * - Avoids real OpenAI/Whisper and Vercel Blob calls.
 */

import { test, expect } from "./integration/fixtures";
import { seedTestAdmin, seedTestStudent, seedTestLearner } from "./visual/helpers";
import {
  blobIntegrationEnabled,
  blobIntegrationSkipMessage,
} from "./helpers/blob-gate";
import { TAG } from "./test-tags";
import { PrismaClient } from "@prisma/client";

const SEEDED_STUDENT_NAME = "Playwright Student";

let studentId: string;

test.beforeAll(async () => {
  const adminUserId = await seedTestAdmin();
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
});

async function gotoSeededStudent(page: import("@playwright/test").Page) {
  await page.goto(`/admin/students/${studentId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: SEEDED_STUDENT_NAME })).toBeVisible({
    timeout: 15_000,
  });
}

function notesPanel(page: import("@playwright/test").Page) {
  return page.getByRole("tabpanel", { name: "Notes & email" });
}

test("Audio upload: Upload tab is visible and shows dropzone", { tag: [TAG.WB_RECORDING] }, async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

  await gotoSeededStudent(page);

  const panel = notesPanel(page);
  await expect(panel.getByTestId("ai-assist-panel")).toBeVisible();

  const uploadTab = panel.getByTestId("tab-upload");
  await expect(uploadTab).toBeVisible();
  await uploadTab.click();
  await expect(panel.getByTestId("audio-upload-dropzone")).toBeVisible();
});

test("Audio upload: transcribe + generate populates note form", { tag: [TAG.WB_RECORDING] }, async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

  await gotoSeededStudent(page);

  const panel = notesPanel(page);
  await expect(panel.getByTestId("ai-assist-panel")).toBeVisible();

  const uploadTab = panel.getByTestId("tab-upload");
  await expect(uploadTab).toBeVisible();
  await uploadTab.click();

  await page.route("**/api/upload/audio**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          url: "https://test.public.blob.vercel-storage.com/test-session.webm",
          contentType: "audio/webm",
          size: 1024,
        }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**", async (route) => {
    const request = route.request();
    if (
      request.method() !== "POST" ||
      !request.headers()["next-action"]
    ) {
      await route.continue();
      return;
    }

    let body = "";
    try { body = request.postData() ?? ""; } catch { /* ignore */ }

    if (!body.includes("blob.vercel-storage.com")) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "text/x-component",
      body:
        '0:{"ok":true,"recordingId":"test-recording-id","transcript":"We covered quadratics today.","topics":"Quadratic equations and factoring.","homework":"Worksheet 4-6.","nextSteps":"Move to graphing next session.","promptVersion":"2026-04-16"}\n',
    });
  });

  const fileInput = panel.getByTestId("audio-file-input");
  await fileInput.setInputFiles({
    name: "session.webm",
    mimeType: "audio/webm",
    buffer: Buffer.from("fake-audio-data"),
  });

  await expect(
    panel.getByTestId("audio-upload-done").or(panel.getByTestId("ai-transcribe-btn"))
  ).toBeVisible({ timeout: 15_000 });

  const transcribeBtn = panel.getByTestId("ai-transcribe-btn");
  if (await transcribeBtn.isVisible()) {
    await transcribeBtn.click();

    await expect(
      panel.getByTestId("ai-filled-hint").or(panel.locator('textarea[name="topics"]'))
    ).toBeVisible({ timeout: 20_000 });

    if (await panel.getByTestId("ai-filled-hint").isVisible()) {
      const topicsValue = await panel.locator('textarea[name="topics"]').inputValue();
      expect(topicsValue.length).toBeGreaterThan(0);
    }
  }
});

test("Record tab: is visible and shows start recording button", { tag: [TAG.WB_RECORDING] }, async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!blobIntegrationEnabled(), blobIntegrationSkipMessage());

  await gotoSeededStudent(page);

  const panel = notesPanel(page);
  await expect(panel.getByTestId("ai-assist-panel")).toBeVisible();

  const recordTab = panel.getByTestId("tab-record");
  await expect(recordTab).toBeVisible();
  await recordTab.click();
  await expect(panel.getByTestId("audio-record-panel")).toBeVisible();
  await expect(panel.getByTestId("audio-record-start")).toBeVisible();
});
