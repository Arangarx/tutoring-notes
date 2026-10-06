/**
 * feat/org-qol — live cursor, ghost viewport, in-app chat (SMOKE-POST-1/2 family).
 */

import type { Browser } from "@playwright/test";
import { test, expect } from "./fixtures";
import fs from "node:fs";
import path from "node:path";
import {
  seedWbLiveSyncSession,
  waitForWbE2eBridge,
  waitForTutorStudentConnected,
  readEncryptionKeyFromHash,
  loginLearnerInContext,
} from "./whiteboard-live-sync.helpers";
import { TAG } from "../test-tags";

async function openTutorAndStudent(
  browser: Browser,
  session: Awaited<ReturnType<typeof seedWbLiveSyncSession>>
) {
  const tutorContext = await browser.newContext({
    storageState: "tests/integration/.auth/tutor.json",
    viewport: { width: 1280, height: 1200 },
  });
  const learnerAuthFile = path.join(
    process.cwd(),
    "tests",
    "integration",
    ".auth",
    "learner.json"
  );
  const learnerStorageState = fs.existsSync(learnerAuthFile)
    ? learnerAuthFile
    : undefined;
  const studentContext = await browser.newContext({
    viewport: { width: 1280, height: 640 },
    ...(learnerStorageState ? { storageState: learnerStorageState } : {}),
  });
  if (!learnerStorageState) {
    await loginLearnerInContext(
      studentContext,
      session.learnerHandle,
      session.learnerPin
    );
  }
  const tutorPage = await tutorContext.newPage();
  await tutorPage.goto(
    `/admin/students/${session.studentId}/whiteboard/${session.whiteboardSessionId}/workspace`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(tutorPage, "tutor");

  const encryptionKey = await readEncryptionKeyFromHash(tutorPage);
  const studentPage = await studentContext.newPage();
  await studentPage.goto(
    `/join/${session.whiteboardSessionId}#k=${encryptionKey}`,
    { waitUntil: "domcontentloaded" }
  );
  await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
    timeout: 90_000,
  });
  await waitForWbE2eBridge(studentPage, "student");
  await waitForTutorStudentConnected(tutorPage);

  return {
    tutorPage,
    studentPage,
    async close() {
      await tutorContext.close();
      await studentContext.close();
    },
  };
}

test.describe("org QoL presence", { tag: [TAG.WB_PRESENCE, TAG.WB_SYNC] }, () => {
  test("in-app chat — collapsed until opened; message reaches peer", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage.getByTestId("wb-session-chat-toggle").click();
      await expect(peers.tutorPage.getByTestId("wb-session-chat-panel")).toBeVisible();
      const msg = `pw-chat-${Date.now()}`;
      await peers.tutorPage.getByTestId("wb-session-chat-input").fill(msg);
      await peers.tutorPage.getByTestId("wb-session-chat-panel").getByRole("button", { name: "Send" }).click();

      await peers.studentPage.getByTestId("wb-session-chat-toggle").click();
      await expect(peers.studentPage.getByTestId("wb-session-chat-panel")).toContainText(msg, {
        timeout: 15_000,
      });
    } finally {
      await peers.close();
    }
  });

  test("ghost viewport — tutor pan shows student-view rect on student canvas", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.tutorPage.evaluate(() => {
        const bridge = (
          window as Window & {
            __TN_WB_E2E__?: Record<string, { setViewport?: (x: number, y: number, z?: number) => void }>;
          }
        ).__TN_WB_E2E__?.tutor;
        bridge?.setViewport?.(120, 80, 1.2);
      });
      await peers.tutorPage.waitForTimeout(800);

      await expect(peers.studentPage.getByTestId("wb-ghost-viewport-rect")).toBeVisible({
        timeout: 20_000,
      });
      const box = await peers.studentPage.getByTestId("wb-ghost-viewport-rect").boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(40);
      expect(box!.height).toBeGreaterThan(40);
      await expect(peers.studentPage.getByTestId("wb-ghost-viewport-label")).toContainText(
        "Tutor view"
      );
    } finally {
      await peers.close();
    }
  });

  test("live cursor — student pointer shows collaborator on tutor canvas", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const session = await seedWbLiveSyncSession();
    const peers = await openTutorAndStudent(browser, session);
    try {
      await peers.studentPage.getByRole("button", { name: "Pencil (P)" }).click();
      const canvas = peers.studentPage
        .locator('[data-testid="student-whiteboard-canvas-mount"] canvas')
        .first();
      const box = await canvas.boundingBox();
      if (!box) throw new Error("no canvas box");
      await peers.studentPage.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
      await peers.studentPage.waitForTimeout(300);

      await expect
        .poll(
          async () =>
            peers.tutorPage.evaluate(() => {
              const bridge = (
                window as Window & {
                  __TN_WB_E2E__?: Record<string, { collaboratorPeerIds?: () => string[] }>;
                }
              ).__TN_WB_E2E__?.tutor;
              return bridge?.collaboratorPeerIds?.().length ?? 0;
            }),
          { timeout: 15_000 }
        )
        .toBeGreaterThan(0);
    } finally {
      await peers.close();
    }
  });
});
