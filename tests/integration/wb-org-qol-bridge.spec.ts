/**
 * feat/org-qol Wave B — schedule bridge UI + join paths.
 */

import type { Browser } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { TAG } from "../test-tags";
import {
  seedBridgeScheduledSession,
  seedOrgBookedFamilyAppointment,
} from "./wb-org-qol-bridge.helpers";
import {
  seedParentAccountHolder,
  seedParentConsentFixture,
} from "./identity/identity.helpers";
import {
  drawTestStrokeOnRole,
  insertGraphOnRole,
  pointerReachesGraphHost,
  addGraphExpressionViaUI,
  readGraphElementState,
  waitForElementOnPeer,
  waitForGraphExpressions,
  waitForTutorStudentConnected,
  waitForWbE2eBridge,
  startSessionAsTutor,
  seedWbLiveSyncSession,
} from "./whiteboard-live-sync.helpers";
import {
  seedOpenWhiteboardSession,
  seedTestAdmin,
  seedTestLearner,
  seedTestStudent,
} from "../visual/helpers";
import { expectReasonUnderControl } from "./entry-reason.helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";
const LEARNER_STATE = "tests/integration/.auth/learner.json";

/**
 * The only reason codes a family may be sent (org-ux-pass-plan § 3, W4 family audience).
 * Written by hand from that spec, not imported from the code under test: every other
 * reason (org suspended, instructor removed, erasure, unclaimed) is internal state.
 */
const FAMILY_SAFE_REASONS = new Set<string>([
  "consent_missing_parent",
  "consent_missing_self",
  "live_off",
  "not_yet",
  "unknown",
]);

function reasonCodesIn(body: string, kind: "attributes" | "payload"): string[] {
  if (kind === "attributes") {
    return [...body.matchAll(/data-entry-reason="([^"]*)"/g)].map((match) => match[1] ?? "");
  }
  return [
    ...body.matchAll(/"reason"\s*:\s*"([^"]*)"/g),
    ...body.matchAll(/\\"reason\\"\s*:\s*\\"([^\\"]*)\\"/g),
  ].map((match) => match[1] ?? "");
}

function assertFamilyReasonAllowList(
  label: string,
  body: string,
  kind: "attributes" | "payload"
) {
  const codes = reasonCodesIn(body, kind);
  expect(codes.length, `${label} includes at least one entry reason`).toBeGreaterThan(0);
  for (const code of codes) {
    expect(FAMILY_SAFE_REASONS.has(code), `${label} reason "${code}" is family-safe`).toBe(true);
  }
}

/**
 * One Open room per appointment on the student page (W4): the next appointment's
 * button is the main control and is not repeated in the upcoming list. The page-level
 * locator is unique, so a second copy would fail this click with a strict-mode error.
 */
async function clickOpenScheduledRoom(
  tutorPage: import("@playwright/test").Page,
  scheduledSessionId: string
) {
  await tutorPage.getByTestId(`open-scheduled-room-${scheduledSessionId}`).click();
}

/**
 * Saves the schedule dialog and closes it. The shared test admin may hold
 * other late sessions, so a successful save can leave the dialog open with
 * the overlap warning instead of closing it.
 */
async function saveScheduleDialog(page: import("@playwright/test").Page) {
  const dialog = page.getByRole("dialog");
  const saveError = page.getByTestId("schedule-save-error");
  await page.getByTestId("schedule-save-session").click();
  await expect
    .poll(
      async () =>
        (await dialog.isHidden()) ||
        (await page.getByTestId("schedule-overlap-warning").isVisible()) ||
        (await saveError.isVisible()),
      { timeout: 30_000 }
    )
    .toBe(true);
  await expect(saveError).toHaveCount(0);
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
}

/**
 * Camera + mic permission for contexts opened beside the project browser.
 * Fake media devices are launch args on the wb-regression project, not
 * fields of BrowserContextOptions (those are ignored).
 */
const WB_LIVE_CONTEXT = {
  permissions: ["microphone", "camera"] as ("microphone" | "camera")[],
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
        ...WB_LIVE_CONTEXT,
      });
      const studentContext = await browser.newContext({
        storageState: LEARNER_STATE,
        viewport: { width: 1280, height: 640 },
        ...WB_LIVE_CONTEXT,
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
        ...WB_LIVE_CONTEXT,
      });
      const parentContext = await browser.newContext({
        storageState: PARENT_STATE,
        viewport: { width: 1280, height: 640 },
        ...WB_LIVE_CONTEXT,
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
        ...WB_LIVE_CONTEXT,
      });
      const tutorContext = await browser.newContext({
        storageState: "tests/integration/.auth/tutor.json",
        viewport: { width: 1280, height: 1200 },
        ...WB_LIVE_CONTEXT,
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

  // Online sessions off (Andrew 2026-10-29, Decision 5): the parent's "Allow online
  // sessions" switch governs ONLINE only. Two independent tests, one per audience, so
  // each half can be proven red on its own.
  async function seedOnlineOffAppointment() {
    await seedParentAccountHolder();
    const adminUserId = await seedTestAdmin();
    const fx = await seedParentConsentFixture({ adminUserId });
    const prisma = new PrismaClient();
    try {
      await prisma.consentRecord.create({
        data: {
          learnerProfileId: fx.learnerProfileId,
          adminUserId: fx.adminUserId,
          version: 1,
          allowLiveSession: false,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: true,
          setByAccountHolderId: fx.accountHolderId,
          captureMethod: "electronic",
        },
      });
    } finally {
      await prisma.$disconnect();
    }
    const sched = await seedBridgeScheduledSession({
      adminUserId: fx.adminUserId,
      studentId: fx.studentId,
      learnerProfileId: fx.learnerProfileId,
      accountHolderId: fx.accountHolderId,
      startsInMs: 5 * 60_000,
    });
    return { fx, sched };
  }

  test.describe("Online sessions off: the family's Join is refused", () => {
    test.use({ storageState: PARENT_STATE });
    test(
      "online sessions off: the family's Join is disabled and says why",
      { tag: [TAG.WB_CHROME] },
      async ({ page }) => {
        const { sched } = await seedOnlineOffAppointment();
        await page.goto("/account/dashboard", { waitUntil: "domcontentloaded" });
        const row = page.getByTestId(`upcoming-session-row-${sched.scheduledSessionId}`);
        const joinBtn = row.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
        await expect(joinBtn).toBeVisible({ timeout: 15_000 });
        await expect(joinBtn).toBeDisabled();
        await expect(joinBtn).toHaveAttribute("type", "button");
        // Join is an online entry: it stays off, and the family is told why.
        await expectReasonUnderControl(
          joinBtn,
          row.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`),
          "Live sessions are off in privacy settings."
        );
        await expect(page).toHaveURL(/\/account\/dashboard/);
      }
    );
  });

  test.describe("Online sessions off: the tutor can still open the room in person", () => {
    test.use({ storageState: "tests/integration/.auth/tutor.json" });
    test(
      "online sessions off: the tutor's Open room stays available for in person, with the reason under it",
      { tag: [TAG.WB_CHROME] },
      async ({ page }) => {
        const { fx, sched } = await seedOnlineOffAppointment();
        await page.goto(`/admin/students/${fx.studentId}`, { waitUntil: "domcontentloaded" });
        const openBtns = page.getByTestId(`open-scheduled-room-${sched.scheduledSessionId}`);
        await expect(openBtns.first()).toBeVisible({ timeout: 15_000 });
        // Online sessions off blocks ONLINE only: Open room is a live submit control
        // (in person is allowed) and the reason sits under it. One per appointment.
        await expect(openBtns).toHaveCount(1);
        await expect(openBtns.first()).toBeEnabled();
        await expect(openBtns.first()).toHaveAttribute("type", "submit");
        await expect(
          page.getByTestId(`open-scheduled-room-reason-${sched.scheduledSessionId}`)
        ).toContainText("You can still open the room in person.");
      }
    );
  });

  test.describe("Join disabled outside window", () => {
    test.use({ storageState: PARENT_STATE });
    test(
      "Join disabled outside window",
      { tag: [TAG.WB_CHROME] },
      async ({ page }) => {
      await seedParentAccountHolder();
      const adminUserId = await seedTestAdmin();
      const fx = await seedParentConsentFixture({ adminUserId });
      await seedConsentRecord(fx.learnerProfileId, fx.adminUserId, fx.accountHolderId);
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
      await expectReasonUnderControl(
        joinBtn,
        page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`),
        "Join opens 15 minutes before the start."
      );
      }
    );

    test(
      "Join with no privacy preferences on file tells the family to finish them, even inside the window",
      { tag: [TAG.ORG, TAG.WB_CHROME] },
      async ({ page }) => {
        await seedParentAccountHolder();
        const adminUserId = await seedTestAdmin();
        const fx = await seedParentConsentFixture({ adminUserId });
        const sched = await seedBridgeScheduledSession({
          adminUserId: fx.adminUserId,
          studentId: fx.studentId,
          learnerProfileId: fx.learnerProfileId,
          accountHolderId: fx.accountHolderId,
          startsInMs: 5 * 60_000,
        });
        await page.goto("/account/dashboard");
        const joinBtn = page.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
        await expect(joinBtn).toBeDisabled({ timeout: 15_000 });
        await expect(
          page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`)
        ).toHaveAttribute("data-entry-reason", "consent_missing_parent");
        await expect(
          page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`)
        ).toContainText("Finish privacy preferences for");
      }
    );

    test(
      "no privacy record and outside the Join window: the family sees the consent reason, not 'Join opens'",
      { tag: [TAG.ORG, TAG.WB_CHROME] },
      async ({ page }) => {
        await seedParentAccountHolder();
        const adminUserId = await seedTestAdmin();
        const fx = await seedParentConsentFixture({ adminUserId });
        // No consent record, and the appointment is 2 hours away (window closed).
        const sched = await seedBridgeScheduledSession({
          adminUserId: fx.adminUserId,
          studentId: fx.studentId,
          learnerProfileId: fx.learnerProfileId,
          accountHolderId: fx.accountHolderId,
          startsInMs: 2 * 60 * 60_000,
        });
        await page.goto("/account/dashboard");
        const joinBtn = page.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
        await expect(joinBtn).toBeDisabled({ timeout: 15_000 });
        const reason = page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`);
        // A family that must act (finish privacy preferences) is told that, not "wait".
        await expect(reason).toHaveText(`Finish privacy preferences for ${fx.learnerName} to join.`);
        await expect(reason).not.toContainText("Join opens");
      }
    );

    // The org-internal state behind a blocked appointment (suspended org, removed
    // instructor) is the org's business. A family sees one generic line, and the
    // reason code is not shipped to their browser (HTML, attributes, or the RSC payload).
    for (const scenario of [
      { name: "the organization is suspended", orgStatus: "suspended", instructorRemoved: false },
      { name: "the instructor was removed", orgStatus: "active", instructorRemoved: true },
    ] as const) {
      test(
        `org-booked appointment where ${scenario.name}: the family sees the generic line and no org-internal reason is sent`,
        { tag: [TAG.ORG, TAG.WB_CHROME] },
        async ({ page }) => {
          const accountHolderId = await seedParentAccountHolder();
          const fx = await seedOrgBookedFamilyAppointment({
            accountHolderId,
            orgStatus: scenario.orgStatus,
            instructorRemoved: scenario.instructorRemoved,
          });

          const response = await page.goto("/account/dashboard", {
            waitUntil: "domcontentloaded",
          });
          const row = page.getByTestId(`upcoming-session-row-${fx.scheduledSessionId}`);
          const joinBtn = row.getByTestId(`join-scheduled-session-${fx.scheduledSessionId}`);
          await expect(joinBtn).toBeDisabled({ timeout: 15_000 });
          await expect(
            row.getByTestId(`join-scheduled-reason-${fx.scheduledSessionId}`)
          ).toHaveText("This session isn't available right now.");

          // Everything the server sent: the navigation HTML (it embeds the RSC payload),
          // the rendered DOM, and a direct RSC fetch of the same page.
          const navigationText = (await response?.text()) ?? "";
          const domHtml = await page.content();
          const rsc = await page.request.get("/account/dashboard", { headers: { RSC: "1" } });
          const rscText = await rsc.text();
          expect(navigationText.length, "navigation response captured").toBeGreaterThan(1_000);
          expect(rscText, "RSC response carries this appointment").toContain(fx.scheduledSessionId);
          // Allow-list: every reason code a family receives is in the W4 family set
          // (`FAMILY_SAFE_REASONS`, hand-written above). Org name and instructor name never ship.
          assertFamilyReasonAllowList("DOM", domHtml, "attributes");
          assertFamilyReasonAllowList("navigation response", navigationText, "payload");
          assertFamilyReasonAllowList("RSC response", rscText, "payload");
          for (const [label, body] of [
            ["navigation response", navigationText],
            ["DOM", domHtml],
            ["RSC response", rscText],
          ] as const) {
            expect(body, `${label} must not contain the org name`).not.toContain(fx.organizationName);
            expect(body, `${label} must not contain the instructor name`).not.toContain(
              fx.instructorName
            );
          }
        }
      );
    }

    test(
      "Join turns on by itself when the window opens, and the reason line goes away",
      { tag: [TAG.ORG, TAG.WB_CHROME] },
      async ({ page }) => {
        await seedParentAccountHolder();
        const adminUserId = await seedTestAdmin();
        const fx = await seedParentConsentFixture({ adminUserId });
        await seedConsentRecord(fx.learnerProfileId, fx.adminUserId, fx.accountHolderId);
        const sched = await seedBridgeScheduledSession({
          adminUserId: fx.adminUserId,
          studentId: fx.studentId,
          learnerProfileId: fx.learnerProfileId,
          accountHolderId: fx.accountHolderId,
          startsInMs: 2 * 60 * 60_000,
        });
        // Install a controllable clock before the page loads, then jump past the open time.
        await page.clock.install({ time: new Date() });
        await page.goto("/account/dashboard");
        const joinBtn = page.getByTestId(`join-scheduled-session-${sched.scheduledSessionId}`);
        await expect(joinBtn).toBeDisabled({ timeout: 15_000 });
        await expect(
          page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`)
        ).toBeVisible();

        await page.clock.fastForward(105 * 60_000); // 1h45m: inside the 15-minute window
        await expect(joinBtn).toBeEnabled();
        await expect(
          page.getByTestId(`join-scheduled-reason-${sched.scheduledSessionId}`)
        ).toHaveCount(0);
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

        const pointerReachesGraph = (x: number, y: number) =>
          pointerReachesGraphHost(tutorPage, x, y);

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
      const studentName = `Midnight ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const seedPrisma = new PrismaClient();
      let studentId: string;
      try {
        const student = await seedPrisma.student.create({
          data: {
            name: studentName,
            adminUserId,
            parentEmail: "parent@test.local",
          },
          select: { id: true },
        });
        studentId = student.id;
      } finally {
        await seedPrisma.$disconnect();
      }
      await page.goto("/admin/schedule");
      await page.getByTestId("schedule-new-session").first().click();
      await page.locator("#schedule-student").click();
      await page.getByRole("option", { name: studentName, exact: true }).click();
      await expect(page.locator("#schedule-student")).toContainText(studentName);
      await page.locator("#schedule-duration").click();
      await page.getByRole("option", { name: /90 min/ }).click();
      await page.locator("#schedule-start").fill("23:30");
      await expect(page.locator("#schedule-end")).toHaveValue("01:00");
      const subject = `Midnight PW ${Date.now()}`;
      await page.locator("#schedule-subject").fill(subject);
      await saveScheduleDialog(page);

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

  test(
    "Long session confirm — a span over four hours asks before saving",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      const adminUserId = await seedTestAdmin();
      const studentName = `LongSpan ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const prisma = new PrismaClient();
      try {
        const { id: studentId } = await prisma.student.create({
          data: { name: studentName, adminUserId, parentEmail: "parent@test.local" },
          select: { id: true },
        });
        const subject = `Long span PW ${Date.now()}`;
        await page.goto("/admin/schedule");
        await page.getByTestId("schedule-new-session").first().click();
        await page.locator("#schedule-student").click();
        await page.getByRole("option", { name: studentName, exact: true }).click();
        await page.locator("#schedule-start").fill("10:00");
        await page.locator("#schedule-end").fill("09:00");
        await page.locator("#schedule-subject").fill(subject);

        const confirm = page.getByTestId("schedule-long-session-confirm");
        await page.getByTestId("schedule-save-session").click();
        await expect(confirm).toBeVisible();
        await expect(confirm).toContainText("23 hours, ending the next day");

        await page.getByTestId("schedule-long-session-back").click();
        await expect(confirm).toBeHidden();
        await expect(page.getByTestId("schedule-create-form")).toBeVisible();
        expect(
          await prisma.scheduledSession.count({ where: { adminUserId, studentId, subject } })
        ).toBe(0);

        await page.getByTestId("schedule-save-session").click();
        await page.getByTestId("schedule-long-session-save").click();
        await expect
          .poll(async () => {
            const row = await prisma.scheduledSession.findFirst({
              where: { adminUserId, studentId, subject },
              select: { startAt: true, endAt: true },
            });
            return row?.startAt && row.endAt
              ? row.endAt.getTime() - row.startAt.getTime()
              : null;
          })
          .toBe(23 * 60 * 60_000);
      } finally {
        await prisma.$disconnect();
      }
    }
  );

  test(
    "Midnight schedule edit — a saved same-day session can be edited to cross midnight",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      test.setTimeout(120_000);
      const adminUserId = await seedTestAdmin();
      const studentName = `MidnightEdit ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const seedPrisma = new PrismaClient();
      let studentId: string;
      try {
        const student = await seedPrisma.student.create({
          data: { name: studentName, adminUserId, parentEmail: "parent@test.local" },
          select: { id: true },
        });
        studentId = student.id;
      } finally {
        await seedPrisma.$disconnect();
      }
      const subject = `Midnight edit PW ${Date.now()}`;
      await page.goto("/admin/schedule");
      await page.getByTestId("schedule-new-session").first().click();
      await page.locator("#schedule-student").click();
      await page.getByRole("option", { name: studentName, exact: true }).click();
      await page.locator("#schedule-duration").click();
      await page.getByRole("option", { name: /60 min/ }).click();
      await page.locator("#schedule-start").fill("22:00");
      await expect(page.locator("#schedule-end")).toHaveValue("23:00");
      await page.locator("#schedule-subject").fill(subject);
      await saveScheduleDialog(page);

      const item = page.getByTestId("schedule-session-item").filter({ hasText: subject });
      await item.getByTestId("schedule-edit-session").click();
      await expect(page.getByTestId("schedule-edit-form")).toBeVisible();
      await page.locator("#schedule-duration").click();
      await page.getByRole("option", { name: /90 min/ }).click();
      await page.locator("#schedule-start").fill("23:00");
      await expect(page.locator("#schedule-end")).toHaveValue("00:30");
      await saveScheduleDialog(page);

      const prisma = new PrismaClient();
      try {
        await expect
          .poll(async () => {
            const row = await prisma.scheduledSession.findFirst({
              where: { adminUserId, studentId, subject },
              select: { startAt: true, endAt: true },
            });
            return row?.startAt && row.endAt
              ? row.endAt.getTime() - row.startAt.getTime()
              : null;
          })
          .toBe(90 * 60_000);
      } finally {
        await prisma.$disconnect();
      }
    }
  );
});

/**
 * A refused Start tells the tutor the same sentence the disabled control shows for that
 * learner's situation (self-learner / parent-held / unclaimed), and only parent-held and
 * unclaimed learners get the "Parent account" hint. Real browser, real server action: the
 * session is seeded PENDING straight into the database (the create path would refuse first),
 * the tutor presses the waiting-room Start in person, the server refuses. Expected strings
 * are the W4 copy spec's, written by hand.
 */
test.describe(
  "refused waiting-room Start names the learner's situation",
  { tag: [TAG.WB_PRESENCE, TAG.WB_CHROME] },
  () => {
    test.use({ storageState: "tests/integration/.auth/tutor.json" });

    type Situation = "self-learner" | "parent-held" | "unclaimed";

    async function seedPendingWithoutConsent(situation: Situation) {
      const adminUserId = await seedTestAdmin();
      const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const learnerName = `Refused ${situation.replace("-", " ")} ${suffix}`;
      const prisma = new PrismaClient();
      try {
        let learnerProfileId: string | null = null;
        if (situation !== "unclaimed") {
          const holder = await prisma.accountHolder.create({
            data: {
              email: `pw-refused-${suffix}@test.local`,
              emailVerifiedAt: new Date("2026-01-01"),
              isSelfLearner: situation === "self-learner",
            },
            select: { id: true },
          });
          const profile = await prisma.learnerProfile.create({
            data: {
              accountHolderId: holder.id,
              displayName: learnerName,
              isSelfLearner: situation === "self-learner",
            },
            select: { id: true },
          });
          learnerProfileId = profile.id;
        }
        const student = await prisma.student.create({
          data: { name: learnerName, adminUserId, learnerProfileId, parentEmail: "parent@test.local" },
          select: { id: true },
        });
        const whiteboardSessionId = await seedOpenWhiteboardSession({
          adminUserId,
          studentId: student.id,
          sessionPhase: "PENDING",
          sessionMode: "IN_PERSON",
        });
        return { studentId: student.id, whiteboardSessionId, learnerName };
      } finally {
        await prisma.$disconnect();
      }
    }

    const CASES: { situation: Situation; line: (name: string) => string; parentHint: boolean }[] = [
      {
        situation: "self-learner",
        line: (name) => `${name} hasn't finished privacy preferences yet.`,
        parentHint: false,
      },
      {
        situation: "parent-held",
        line: () => "The parent hasn't finished privacy preferences yet.",
        parentHint: true,
      },
      {
        situation: "unclaimed",
        line: (name) => `${name} hasn't connected their Mynk account yet.`,
        parentHint: true,
      },
    ];

    for (const { situation, line, parentHint } of CASES) {
      test(`${situation}: the refusal reads the learner's own line`, async ({ page }) => {
        test.setTimeout(120_000);
        const { studentId, whiteboardSessionId, learnerName } =
          await seedPendingWithoutConsent(situation);

        await page.goto(`/admin/students/${studentId}/whiteboard/${whiteboardSessionId}/workspace`, {
          waitUntil: "domcontentloaded",
        });
        await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible({ timeout: 90_000 });
        // Hydrated: a click before hydration is lost, and no refusal would ever show.
        await waitForWbE2eBridge(page, "tutor");
        const start = page.getByTestId("wb-start-session");
        await expect(start).toBeEnabled({ timeout: 30_000 });
        await start.click();

        const error = page.getByTestId("wb-waiting-start-error");
        await expect(error).toBeVisible({ timeout: 30_000 });
        await expect(error).toContainText(line(learnerName));
        if (parentHint) {
          await expect(error).toContainText("Parent account section");
        } else {
          await expect(error).not.toContainText("Parent account");
          await expect(error).not.toContainText("The parent hasn't");
        }
        // Enforcement is unchanged: still in the waiting room, session not activated.
        await expect(page.getByTestId("wb-waiting-overlay")).toBeVisible();
        const prisma = new PrismaClient();
        try {
          const row = await prisma.whiteboardSession.findUniqueOrThrow({
            where: { id: whiteboardSessionId },
            select: { sessionPhase: true },
          });
          expect(row.sessionPhase).toBe("PENDING");
        } finally {
          await prisma.$disconnect();
        }
      });
    }
  }
);