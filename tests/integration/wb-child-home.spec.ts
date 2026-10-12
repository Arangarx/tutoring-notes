/**
 * Child home on /join: own ended-session note + replay, empty upcoming copy,
 * a PIN change that still leaves the parent reset in place, and consent the
 * child can tighten but only a parent can restore.
 */

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { TAG } from "../test-tags";
import { TEST_PARENT, seedParentAccountHolder } from "./identity/identity.helpers";
import { loginLearnerInContext } from "./whiteboard-live-sync.helpers";
import { readHarnessMailUrl } from "@/lib/playwright-harness-mail";

const CURRENT_PIN = "482916";
const NEXT_PIN = "159357";
const WRONG_PIN = "739184";
const PARENT_RESET_PIN = "999888";

function suffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function seedChildLogin(opts: {
  accountHolderId: string;
  familyId: string;
  displayName: string;
  withEndedNote?: { topics: string };
}) {
  const prisma = new PrismaClient();
  const id = suffix();
  const username = `ch${id}`.replace(/[^a-z0-9]/g, "").slice(0, 12);
  try {
    const tutor = await prisma.adminUser.create({
      data: {
        email: `pw-child-home-tutor-${id}@test.local`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
        emailVerifiedAt: new Date("2026-01-01"),
      },
      select: { id: true },
    });
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId: opts.accountHolderId,
        displayName: opts.displayName,
        accessMode: "child_pin_required",
        isSelfLearner: false,
      },
      select: { id: true },
    });
    const student = await prisma.student.create({
      data: {
        name: opts.displayName,
        adminUserId: tutor.id,
        learnerProfileId: profile.id,
      },
      select: { id: true },
    });
    await prisma.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: opts.accountHolderId,
        username,
        secretHash: await bcrypt.hash(CURRENT_PIN, 10),
      },
    });
    await prisma.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: tutor.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: opts.accountHolderId,
        captureMethod: "electronic",
      },
    });

    let noteTopics: string | null = null;
    let whiteboardSessionId: string | null = null;
    if (opts.withEndedNote) {
      noteTopics = opts.withEndedNote.topics;
      const note = await prisma.sessionNote.create({
        data: {
          studentId: student.id,
          date: new Date("2026-06-01T00:00:00Z"),
          topics: noteTopics,
          homework: "",
          assessment: "",
          nextSteps: "",
          linksJson: "[]",
          status: "READY",
        },
        select: { id: true },
      });
      const session = await prisma.whiteboardSession.create({
        data: {
          adminUserId: tutor.id,
          studentId: student.id,
          noteId: note.id,
          endedAt: new Date("2026-06-01T01:00:00Z"),
          eventsBlobUrl: "https://example.invalid/child-home-events.json",
        },
        select: { id: true },
      });
      whiteboardSessionId = session.id;
      await prisma.shareLink.create({
        data: {
          studentId: student.id,
          token: `child-home-${id}`,
        },
      });
    }

    return {
      learnerProfileId: profile.id,
      handle: `${username}@${opts.familyId}`,
      noteTopics,
      whiteboardSessionId,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function familyIdFor(accountHolderId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const parent = await prisma.accountHolder.findUniqueOrThrow({
      where: { id: accountHolderId },
      select: { familyId: true },
    });
    if (parent.familyId) return parent.familyId;
    const familyId = `chfam${suffix()}`.replace(/[^a-z0-9]/g, "").slice(0, 16);
    await prisma.accountHolder.update({
      where: { id: accountHolderId },
      data: { familyId },
    });
    return familyId;
  } finally {
    await prisma.$disconnect();
  }
}

const PARENT_RESTORED = "Your parent turned this back on.";

function consentRow(page: Page, testId: string) {
  return page.getByTestId(testId).locator("xpath=ancestor::div[contains(@class,'rounded-[10px]')][1]");
}

test.describe("child home on /join", { tag: [TAG.WB_PRESENCE] }, () => {
  test("shows the child's ended note and replay, and says nothing is scheduled when upcoming is empty", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const ownTopics = `Child home note ${id}`;
    const own = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Home child ${id}`,
      withEndedNote: { topics: ownTopics },
    });
    const otherTopics = `Other child note ${id}`;
    const other = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Other child ${id}`,
      withEndedNote: { topics: otherTopics },
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, own.handle, CURRENT_PIN);
      const page = await context.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });

      await expect(page).toHaveURL(/\/join\/?$/);
      await expect(page.locator(`[data-note-id]`).filter({ hasText: ownTopics })).toBeVisible({
        timeout: 15_000,
      });
      const replay = page.getByRole("link", { name: "Watch the whiteboard recording" });
      await expect(replay).toBeVisible();
      await expect(replay).toHaveAttribute(
        "href",
        new RegExp(`/whiteboard/${own.whiteboardSessionId}$`)
      );
      await expect(page.getByTestId("upcoming-sessions-card")).toBeVisible();
      await expect(page.getByTestId("upcoming-sessions-empty")).toHaveText(
        "No upcoming sessions scheduled."
      );
      await expect(page.getByText(otherTopics)).toHaveCount(0);
    } finally {
      await context.close();
    }

    const otherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(otherContext, other.handle, CURRENT_PIN);
      const page = await otherContext.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(otherTopics)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(ownTopics)).toHaveCount(0);
    } finally {
      await otherContext.close();
    }
  });

  test("PIN change requires the current PIN, rejects a wrong one, and the parent can still reset", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName: `Pin child ${id}`,
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(context, child.handle, CURRENT_PIN);
      const page = await context.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.getByRole("button", { name: "Change PIN" }).click();
      await expect(page.getByTestId("child-current-pin")).toBeVisible();

      await page.getByTestId("child-current-pin").fill(WRONG_PIN);
      await page.getByTestId("child-new-pin").fill(NEXT_PIN);
      await page.getByTestId("child-confirm-pin").fill(NEXT_PIN);
      await page.getByTestId("child-pin-submit").click();
      await expect(page.getByTestId("child-pin-error")).toBeVisible({ timeout: 15_000 });

      await page.getByTestId("child-current-pin").fill(CURRENT_PIN);
      await page.getByTestId("child-new-pin").fill(NEXT_PIN);
      await page.getByTestId("child-confirm-pin").fill(NEXT_PIN);
      await page.getByTestId("child-pin-submit").click();
      await expect(page.getByTestId("child-pin-saved")).toBeVisible({ timeout: 15_000 });

      const mailed = readHarnessMailUrl("account-holder", TEST_PARENT.email);
      expect(mailed).toContain(`/account/children/${child.learnerProfileId}`);
    } finally {
      await context.close();
    }

    const parentContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const reset = await parentContext.request.patch(
        `/api/learner-profiles/${child.learnerProfileId}/credentials`,
        { data: { newPin: PARENT_RESET_PIN } }
      );
      expect(reset.ok()).toBe(true);
    } finally {
      await parentContext.close();
    }

    const relogin = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(relogin, child.handle, PARENT_RESET_PIN);
      const page = await relogin.newPage();
      await page.goto("/join", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(`Pin child ${id}`)).toBeVisible({ timeout: 15_000 });
    } finally {
      await relogin.close();
    }
  });

  test("child audio stays off until a parent restores it, and a parent-only limit does not say the parent turned it back on", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const accountHolderId = await seedParentAccountHolder();
    const familyId = await familyIdFor(accountHolderId);
    const id = suffix();
    const displayName = `Consent child ${id}`;
    const child = await seedChildLogin({
      accountHolderId,
      familyId,
      displayName,
    });
    const audioSwitch = "child-consent-child-allowAudioRecording";

    const childContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(childContext, child.handle, CURRENT_PIN);
      const childPage = await childContext.newPage();
      await childPage.goto("/join", { waitUntil: "domcontentloaded" });
      await childPage.waitForLoadState("networkidle", { timeout: 15_000 });
      const audio = childPage.getByTestId(audioSwitch);
      await expect(audio).toBeChecked({ timeout: 15_000 });
      await audio.click();
      await expect(audio).not.toBeChecked({ timeout: 15_000 });

      await childPage.reload({ waitUntil: "domcontentloaded" });
      await childPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(childPage.getByTestId(audioSwitch)).not.toBeChecked({ timeout: 15_000 });

      await childPage.getByTestId(audioSwitch).click();
      await expect(childPage.getByText("Only a parent can turn this back on.")).toBeVisible({
        timeout: 15_000,
      });
      await expect(childPage.getByTestId(audioSwitch)).not.toBeChecked();
    } finally {
      await childContext.close();
    }

    const parentContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const parentPage = await parentContext.newPage();
      await parentPage.goto(`/account/children/${child.learnerProfileId}/consent`, {
        waitUntil: "domcontentloaded",
      });
      await parentPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(parentPage.getByText(`${displayName} turned these off`)).toBeVisible({
        timeout: 15_000,
      });
      const restore = parentPage.getByTestId("parent-restore-consent-child-off-allowAudioRecording");
      await expect(restore).toBeVisible();
      await expect(restore).not.toBeChecked();
      await restore.click();
      await parentPage.getByTestId("parent-consent-save-btn").click();
      await expect(parentPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await parentContext.close();
    }

    const restoredContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(restoredContext, child.handle, CURRENT_PIN);
      const restoredPage = await restoredContext.newPage();
      await restoredPage.goto("/join", { waitUntil: "domcontentloaded" });
      await restoredPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(restoredPage.getByTestId(audioSwitch)).toBeChecked({ timeout: 15_000 });
      await expect(restoredPage.getByText(PARENT_RESTORED)).toHaveCount(1);
      await expect(consentRow(restoredPage, audioSwitch).getByText(PARENT_RESTORED)).toBeVisible();
      await expect(
        consentRow(restoredPage, "child-consent-child-allowLiveSession").getByText(PARENT_RESTORED)
      ).toHaveCount(0);
      await expect(
        consentRow(restoredPage, "child-consent-child-allowWhiteboardRecording").getByText(
          PARENT_RESTORED
        )
      ).toHaveCount(0);
      await expect(
        consentRow(restoredPage, "child-consent-child-allowNoteSending").getByText(PARENT_RESTORED)
      ).toHaveCount(0);
    } finally {
      await restoredContext.close();
    }

    const limitContext = await browser.newContext({
      storageState: "tests/integration/.auth/parent.json",
      viewport: { width: 1280, height: 900 },
    });
    try {
      const limitPage = await limitContext.newPage();
      await limitPage.goto(`/account/children/${child.learnerProfileId}/consent`, {
        waitUntil: "domcontentloaded",
      });
      await limitPage.waitForLoadState("networkidle", { timeout: 15_000 });
      const alwaysOff = limitPage.getByRole("checkbox", { name: "Always block audio recording" });
      await expect(alwaysOff).toBeVisible({ timeout: 15_000 });
      await alwaysOff.check();
      await limitPage.getByTestId("parent-consent-save-btn").click();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
      await alwaysOff.uncheck();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toHaveCount(0);
      await limitPage.getByTestId("parent-consent-save-btn").click();
      await expect(limitPage.getByTestId("parent-consent-saved-alert")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await limitContext.close();
    }

    const clearedContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
      await loginLearnerInContext(clearedContext, child.handle, CURRENT_PIN);
      const clearedPage = await clearedContext.newPage();
      await clearedPage.goto("/join", { waitUntil: "domcontentloaded" });
      await clearedPage.waitForLoadState("networkidle", { timeout: 15_000 });
      await expect(clearedPage.getByTestId(audioSwitch)).toBeChecked({ timeout: 15_000 });
      await expect(clearedPage.getByText(PARENT_RESTORED)).toHaveCount(0);
    } finally {
      await clearedContext.close();
    }
  });
});
