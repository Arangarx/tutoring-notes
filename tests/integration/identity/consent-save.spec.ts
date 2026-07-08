import { expect, test } from "@playwright/test";

import {
  readLatestConsentRecord,
  seedClaimInvite,
  seedParentAccountHolder,
  seedParentConsentFixture,
} from "./identity.helpers";

test.describe("CC-1/CC-2 claim-setup consent persistence", () => {
  test("CC-1: Save preferences writes ConsentRecord v1 with parent-selected flags", async ({
    page,
  }) => {
    const accountHolderId = await seedParentAccountHolder();
    const invite = await seedClaimInvite({ accountHolderId });

    const before = await readLatestConsentRecord(
      invite.learnerProfileId,
      invite.adminUserId
    );
    expect(before).toBeNull();

    await page.goto(`/claim/${invite.rawToken}/setup`);
    await expect(page.getByTestId("consent-toggle-allowLiveSession")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("consent-toggle-allowLiveSession").click();
    await page.getByTestId("consent-toggle-allowAudioRecording").click();
    await page.getByTestId("consent-save-btn").click();

    await expect(page.getByTestId("consent-saved-indicator")).toBeVisible({
      timeout: 15_000,
    });

    const record = await readLatestConsentRecord(
      invite.learnerProfileId,
      invite.adminUserId
    );
    expect(record).not.toBeNull();
    expect(record!.version).toBe(1);
    expect(record!.allowLiveSession).toBe(true);
    expect(record!.allowAudioRecording).toBe(true);
    expect(record!.allowWhiteboardRecording).toBe(false);
    expect(record!.allowNoteSending).toBe(false);
    expect(record!.setByAccountHolderId).toBe(accountHolderId);
    expect(record!.captureMethod).toBe("electronic");
  });

  test("CC-2: Decline writes all-off ConsentRecord v1 (mandatory choice to exit)", async ({
    page,
  }) => {
    const accountHolderId = await seedParentAccountHolder();
    const invite = await seedClaimInvite({ accountHolderId });

    await page.goto(`/claim/${invite.rawToken}/setup`);
    await expect(page.getByTestId("consent-decline-btn")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("consent-decline-btn").click();
    await page.getByTestId("consent-decline-confirm-btn").click();

    await expect(page.getByTestId("consent-saved-indicator")).toBeVisible({
      timeout: 15_000,
    });

    const record = await readLatestConsentRecord(
      invite.learnerProfileId,
      invite.adminUserId
    );
    expect(record).not.toBeNull();
    expect(record!.version).toBe(1);
    expect(record!.allowLiveSession).toBe(false);
    expect(record!.allowAudioRecording).toBe(false);
    expect(record!.allowWhiteboardRecording).toBe(false);
    expect(record!.allowNoteSending).toBe(false);
    expect(record!.setByAccountHolderId).toBe(accountHolderId);
    expect(record!.captureMethod).toBe("electronic");
  });
});

test.describe("Parent per-child consent page persistence", () => {
  test("Save privacy preferences persists toggles (DB + reload UI)", async ({
    page,
  }) => {
    const accountHolderId = await seedParentAccountHolder();
    const fixture = await seedParentConsentFixture({ accountHolderId });

    const before = await readLatestConsentRecord(
      fixture.learnerProfileId,
      fixture.adminUserId
    );
    expect(before).toBeNull();

    await page.goto(`/account/children/${fixture.learnerProfileId}/consent`);
    await expect(
      page.getByTestId(
        `parent-consent-toggle-${fixture.adminUserId}-allowLiveSession`
      )
    ).toBeVisible({ timeout: 15_000 });

    const liveToggle = page.getByTestId(
      `parent-consent-toggle-${fixture.adminUserId}-allowLiveSession`
    );
    await expect(liveToggle).not.toBeChecked();
    await liveToggle.click();
    await expect(liveToggle).toBeChecked();

    await page.getByTestId("parent-consent-save-btn").click();
    await expect(page.getByTestId("parent-consent-saved-alert")).toBeVisible({
      timeout: 15_000,
    });

    const record = await readLatestConsentRecord(
      fixture.learnerProfileId,
      fixture.adminUserId
    );
    expect(record).not.toBeNull();
    expect(record!.version).toBe(1);
    expect(record!.allowLiveSession).toBe(true);
    expect(record!.allowAudioRecording).toBe(false);
    expect(record!.allowWhiteboardRecording).toBe(false);
    expect(record!.allowNoteSending).toBe(false);
    expect(record!.setByAccountHolderId).toBe(accountHolderId);
    expect(record!.captureMethod).toBe("electronic");

    await page.reload();
    await expect(
      page.getByTestId(
        `parent-consent-toggle-${fixture.adminUserId}-allowLiveSession`
      )
    ).toBeChecked({ timeout: 15_000 });
  });
});
