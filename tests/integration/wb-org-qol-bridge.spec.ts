/**
 * feat/org-qol Wave B — schedule bridge UI + join paths.
 */

import type { Browser } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  seedBridgeScheduledSession,
} from "./wb-org-qol-bridge.helpers";
import {
  seedParentAccountHolder,
  seedParentConsentFixture,
} from "./identity/identity.helpers";
import {
  drawTestStrokeOnRole,
  insertGraphOnRole,
  addGraphExpressionViaUI,
  readGraphElementState,
  waitForElementOnPeer,
  waitForGraphExpressions,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
  startSessionAsTutor,
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import { seedTestAdmin, seedTestLearner, seedTestStudent } from "../visual/helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";
const LEARNER_STATE = "tests/integration/.auth/learner.json";

/** Desktop student detail renders duplicate mobile+desktop panels — target the visible tabpanel. */
async function clickOpenScheduledRoom(
  tutorPage: import("@playwright/test").Page,
  scheduledSessionId: string
) {
  await tutorPage
    .getByRole("tabpanel", { name: "Whiteboard" })
    .getByTestId(`open-scheduled-room-${scheduledSessionId}`)
    .click();
}

/** LIVE waiting-room Start requires fake media (matches wb-regression project). */
const WB_LIVE_BROWSER = {
  permissions: ["microphone", "camera"] as const,
  launchOptions: {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  },
};

async function seedConsentRecord(
  learnerProfileId: string,
  adminUserId: string,
  accountHolderId: string
) {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.consentRecord.findFirst({
      where: { learnerProfileId, adminUserId },
      orderBy: { version: "desc" },
    });
    if (existing) return existing;
    return prisma.consentRecord.create({
      data: {
        learnerProfileId,
        adminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: accountHolderId,
        captureMethod: "electronic",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function seedConsentAndParticipant(
  whiteboardSessionId: string,
  learnerProfileId: string,
  adminUserId: string,
  accountHolderId: string
) {
  const prisma = new PrismaClient();
  try {
    const consentRec = await seedConsentRecord(
      learnerProfileId,
      adminUserId,
      accountHolderId
    );
    await prisma.sessionParticipant.upsert({
      where: {
        whiteboardSessionId_learnerProfileId: {
          whiteboardSessionId,
          learnerProfileId,
        },
      },
      create: { whiteboardSessionId, learnerProfileId },
      update: { leftAt: null },
    });
    await prisma.sessionConsentSnapshot.upsert({
      where: { whiteboardSessionId },
      create: {
        whiteboardSessionId,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        consentRecordId: consentRec.id,
        consentRecordVersion: consentRec.version,
      },
      update: {
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        consentRecordId: consentRec.id,
        consentRecordVersion: consentRec.version,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("org QoL schedule bridge", () => {
  test(
    "Server-key join with no link",
    { tag: [TAG.WB_SYNC, TAG.WB_PRESENCE] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      const { learnerProfileId, accountHolderId } = await seedTestLearner(
        adminUserId,
        studentId
      );
      await seedConsentRecord(learnerProfileId, adminUserId, accountHolderId);
      const sched = await seedBridgeScheduledSession({
        adminUserId,
        studentId,
        learnerProfileId,
        accountHolderId,
        startsInMs: 5 * 60_000,
      });

      const tutorContext = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 1200 },
        ...WB_LIVE_BROWSER,
      });
      const studentContext = await browser.newContext({
        storageState: LEARNER_STATE,
        viewport: { width: 1280, height: 640 },
        ...WB_LIVE_BROWSER,
      });
      const tutorPage = await tutorContext.newPage();
      const studentPage = await studentContext.newPage();
      try {
        await tutorPage.goto(`/admin/students/${studentId}`, {
          waitUntil: "domcontentloaded",
        });
        await clickOpenScheduledRoom(tutorPage, sched.scheduledSessionId);
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        const wbsMatch = tutorPage.url().match(/whiteboard\/([^/]+)\/workspace/);
        expect(wbsMatch?.[1]).toBeTruthy();
        const wbsId = wbsMatch![1]!;

        await studentPage.goto(`/join/${wbsId}`, { waitUntil: "domcontentloaded" });
        await expect(studentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(tutorPage, "tutor");
        await waitForWbE2eBridge(studentPage, "student");
        await waitForTutorStudentConnected(tutorPage);
        await startSessionAsTutor(tutorPage);
        await expect(studentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
          timeout: 60_000,
        });

        await drawTestStrokeOnRole(tutorPage, "tutor", "pw-bridge-stroke", 10, 10, 120, 80);
        await expect
          .poll(async () => {
            const els = await studentPage.evaluate(() => {
              const bridge = (
                window as Window & {
                  __TN_WB_E2E__?: Record<string, { getElements?: () => { id: string }[] }>;
                }
              ).__TN_WB_E2E__?.student;
              return bridge?.getElements?.().some((e) => e.id === "pw-bridge-stroke") ?? false;
            });
            return els;
          })
          .toBe(true);
      } finally {
        await tutorContext.close();
        await studentContext.close();
      }
    }
  );

  test(
    "Parent joins as child",
    { tag: [TAG.WB_PRESENCE] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      await seedParentAccountHolder();
      const adminUserId = await seedTestAdmin();
      const fx = await seedParentConsentFixture({ adminUserId });
      await seedConsentRecord(
        fx.learnerProfileId,
        fx.adminUserId,
        fx.accountHolderId
      );
      const sched = await seedBridgeScheduledSession({
        adminUserId: fx.adminUserId,
        studentId: fx.studentId,
        learnerProfileId: fx.learnerProfileId,
        accountHolderId: fx.accountHolderId,
        startsInMs: 5 * 60_000,
      });

      const tutorContext = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 1200 },
        ...WB_LIVE_BROWSER,
      });
      const parentContext = await browser.newContext({
        storageState: PARENT_STATE,
        viewport: { width: 1280, height: 640 },
        ...WB_LIVE_BROWSER,
      });
      const tutorPage = await tutorContext.newPage();
      const parentPage = await parentContext.newPage();
      try {
        await tutorPage.goto(`/admin/students/${fx.studentId}`, {
          waitUntil: "domcontentloaded",
        });
        await clickOpenScheduledRoom(tutorPage, sched.scheduledSessionId);
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(tutorPage, "tutor");
        const wbsId = tutorPage.url().match(/whiteboard\/([^/]+)\/workspace/)?.[1]!;

        await parentPage.goto(`/join/${wbsId}`, { waitUntil: "domcontentloaded" });
        await expect(parentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        await waitForWbE2eBridge(parentPage, "student");
        await waitForTutorStudentConnected(tutorPage);
        await startSessionAsTutor(tutorPage);
        await expect(parentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
          timeout: 60_000,
        });
      } finally {
        await tutorContext.close();
        await parentContext.close();
      }
    }
  );

  test.describe("Another family's parent is refused", () => {
    test.use({ storageState: PARENT_STATE });
    test(
      "Another family's parent is refused",
      { tag: [TAG.WB_PRESENCE] },
      async ({ page }) => {
      await seedParentAccountHolder();
      const session = await seedWbLiveSyncSession();
      await page.goto(`/join/${session.whiteboardSessionId}`);
      await page.waitForURL(
        (url) => url.pathname === "/account/not-my-session",
        { timeout: 15_000 }
      );
      }
    );
  });

  test(
    "Dashboard Join opens the room",
    { tag: [TAG.WB_SYNC, TAG.WB_PRESENCE] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      await seedParentAccountHolder();
      const adminUserId = await seedTestAdmin();
      const fx = await seedParentConsentFixture({ adminUserId });
      await seedConsentRecord(
        fx.learnerProfileId,
        fx.adminUserId,
        fx.accountHolderId
      );
      const sched = await seedBridgeScheduledSession({
        adminUserId: fx.adminUserId,
        studentId: fx.studentId,
        learnerProfileId: fx.learnerProfileId,
        accountHolderId: fx.accountHolderId,
        startsInMs: 5 * 60_000,
      });

      const parentContext = await browser.newContext({
        storageState: PARENT_STATE,
        viewport: { width: 1280, height: 800 },
        ...WB_LIVE_BROWSER,
      });
      const tutorContext = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 1200 },
        ...WB_LIVE_BROWSER,
      });
      const parentPage = await parentContext.newPage();
      const tutorPage = await tutorContext.newPage();
      try {
        await parentPage.goto("/account/dashboard", { waitUntil: "domcontentloaded" });
        await parentPage.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`).click();
        await parentPage.waitForURL(/\/join\/[^/]+$/, { timeout: 90_000 });
        await expect(parentPage.getByTestId("student-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        const parentWbs = new URL(parentPage.url()).pathname.split("/").pop()!;

        await tutorPage.goto(`/admin/students/${fx.studentId}`, {
          waitUntil: "domcontentloaded",
        });
        await clickOpenScheduledRoom(tutorPage, sched.scheduledSessionId);
        await expect(tutorPage.getByTestId("tutor-whiteboard-canvas-mount")).toBeVisible({
          timeout: 90_000,
        });
        const tutorWbs = tutorPage.url().match(/whiteboard\/([^/]+)\/workspace/)?.[1];
        expect(tutorWbs).toBe(parentWbs);

        await waitForWbE2eBridge(tutorPage, "tutor");
        await waitForWbE2eBridge(parentPage, "student");
        await waitForTutorStudentConnected(tutorPage);
        await startSessionAsTutor(tutorPage);
        await expect(parentPage.getByTestId("wb-waiting-overlay")).not.toBeVisible({
          timeout: 60_000,
        });
        await drawTestStrokeOnRole(tutorPage, "tutor", "pw-dash-join-stroke", 20, 20, 100, 90);
        await expect
          .poll(async () =>
            parentPage.evaluate(() => {
              const bridge = (
                window as Window & {
                  __TN_WB_E2E__?: Record<string, { getElements?: () => { id: string }[] }>;
                }
              ).__TN_WB_E2E__?.student;
              return (
                bridge?.getElements?.().some((e) => e.id === "pw-dash-join-stroke") ?? false
              );
            })
          )
          .toBe(true);
      } finally {
        await parentContext.close();
        await tutorContext.close();
      }
    }
  );

  test.describe("Join disabled outside window", () => {
    test.use({ storageState: PARENT_STATE });
    test(
      "Join disabled outside window",
      { tag: [TAG.WB_CHROME] },
      async ({ page }) => {
      await seedParentAccountHolder();
      const adminUserId = await seedTestAdmin();
      const fx = await seedParentConsentFixture({ adminUserId });
      const sched = await seedBridgeScheduledSession({
        adminUserId: fx.adminUserId,
        studentId: fx.studentId,
        learnerProfileId: fx.learnerProfileId,
        accountHolderId: fx.accountHolderId,
        startsInMs: 2 * 60 * 60_000,
      });
      await page.goto("/account/dashboard");
      const joinBtn = page.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
      await expect(joinBtn).toBeVisible({ timeout: 15_000 });
      await expect(joinBtn).toBeDisabled();
      }
    );
  });

  test(
    "Graph stays interactive after an edit",
    { tag: [TAG.WB_GRAPH, TAG.WB_SYNC] },
    async ({ browser }) => {
      test.setTimeout(240_000);
      const session = await seedWbLiveSyncSession();
      const { openTutorAndStudent } = await import("./whiteboard-live-sync.helpers");
      const peers = await openTutorAndStudent(browser, session);
      try {
        const { tutorPage, studentPage } = peers;

        const graphId = await insertGraphOnRole(tutorPage, "tutor", session, []);
        await waitForElementOnPeer(studentPage, "student", graphId, 30_000);

        // Oracle: what the browser would deliver a click at (x, y) to — the graph or the canvas over it.
        const pointerReachesGraph = (x: number, y: number) =>
          tutorPage.evaluate(
            ([px, py]) =>
              !!document
                .elementFromPoint(px, py)
                ?.closest('[data-testid="wb-graph-embed-host"]'),
            [x, y] as const
          );

        const host = tutorPage.getByTestId("wb-graph-embed-host").first();
        await expect(host).toBeVisible({ timeout: 30_000 });
        const hostBox = await host.boundingBox();
        const mountBox = await tutorPage.getByTestId("tutor-whiteboard-canvas-mount").boundingBox();
        expect(hostBox, "graph host bounding box").not.toBeNull();
        expect(mountBox, "canvas mount bounding box").not.toBeNull();
        await tutorPage.mouse.click(mountBox!.x + 80, mountBox!.y + 80);
        // Inside the center third, clear of the axes (graph lines take the pointer).
        const cx = hostBox!.x + hostBox!.width / 2 + hostBox!.width * 0.08;
        const cy = hostBox!.y + hostBox!.height / 2 - hostBox!.height * 0.08;
        // Idle: the canvas holds the pointer so a drag moves the box.
        expect(await pointerReachesGraph(cx, cy)).toBe(false);

        // One click in the center hands the pointer to the graph.
        await tutorPage.mouse.move(cx - 4, cy);
        await tutorPage.mouse.move(cx, cy);
        await tutorPage.mouse.click(cx, cy);
        await expect.poll(() => pointerReachesGraph(cx, cy), { timeout: 10_000 }).toBe(true);

        await addGraphExpressionViaUI(studentPage, "sin(x)");
        await waitForGraphExpressions(tutorPage, "tutor", graphId, ["sin(x)"]);

        // The peer's edit replaced the element; the graph still holds the pointer.
        await tutorPage.waitForTimeout(1_000);
        expect(await pointerReachesGraph(cx, cy)).toBe(true);
        await expect(tutorPage.getByText("Click to interact")).toHaveCount(0);
      } finally {
        await peers.close();
      }
    }
  );

  test(
    "Midnight schedule",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      const adminUserId = await seedTestAdmin();
      const { studentId } = await seedTestStudent(adminUserId);
      await page.goto("/admin/schedule");
      await page.getByTestId("schedule-new-session").first().click();
      await page.locator("#schedule-student").click();
      await page.getByRole("option", { name: "Playwright Student" }).click();
      await page.locator("#schedule-duration").click();
      await page.getByRole("option", { name: /90 min/ }).click();
      await page.locator("#schedule-start").fill("23:30");
      await expect(page.locator("#schedule-end")).toHaveValue("01:00");
      const subject = `Midnight PW ${Date.now()}`;
      await page.locator("#schedule-subject").fill(subject);
      await page.getByTestId("schedule-save-session").click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });

      const prisma = new PrismaClient();
      let row = null as Awaited<
        ReturnType<PrismaClient["scheduledSession"]["findFirst"]>
      >;
      await expect
        .poll(async () => {
          row = await prisma.scheduledSession.findFirst({
            where: { adminUserId, studentId, subject },
          });
          return row?.id ?? null;
        })
        .not.toBeNull();
      await prisma.$disconnect();
      expect(row?.startAt && row.endAt).toBeTruthy();
      expect(row!.endAt!.getTime() - row!.startAt!.getTime()).toBe(90 * 60_000);
    }
  );
});
