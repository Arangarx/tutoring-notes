import { expect, test } from "@playwright/test";

import {
  cancelErasure,
  readErasureJobOracle,
  readLearnerErasureOracle,
  requestErasureForLearner,
  seedErasureFamilyFixture,
  seedShareErasureFixture,
} from "./erasure.helpers";

const ERASURE_ADMIN_STATE = "tests/integration/.auth/erasure-admin.json";
const TUTOR_STATE = "tests/integration/.auth/tutor.json";

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

test.describe("Admin erasure UI — request and cancel", () => {
  test.use({ storageState: ERASURE_ADMIN_STATE });

  test("admin request → grace state (UI + DB oracle)", async ({ page }) => {
    const fixture = await seedErasureFamilyFixture();

    await page.goto("/admin/erasure");
    await expect(page.getByTestId("erasure-submit-btn")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByTestId("erasure-target-input").fill(fixture.learnerProfileId);
    await page
      .getByTestId("erasure-confirm-input")
      .fill(fixture.learnerDisplayName);
    await page.getByTestId("erasure-submit-btn").click();

    const success = page.getByTestId("erasure-success-status");
    await expect(success).toBeVisible({ timeout: 15_000 });
    await expect(success).toContainText(/Job ID:/);

    const successText = await success.textContent();
    const jobIdMatch = successText?.match(/Job ID:\s*([0-9a-f-]{36})/i);
    expect(jobIdMatch).toBeTruthy();
    const jobId = jobIdMatch![1];

    const job = await readErasureJobOracle(jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe("requested");
    expect(job!.requestedByPrincipal).toBe(
      `admin:${fixture.erasureAdminUserId}`
    );
    const purgeDelta = job!.purgeEligibleAt.getTime() - Date.now();
    expect(purgeDelta).toBeGreaterThan(GRACE_MS - 60_000);
    expect(purgeDelta).toBeLessThan(GRACE_MS + 60_000);

    const learner = await readLearnerErasureOracle(
      fixture.learnerProfileId,
      fixture.studentId
    );
    expect(learner.tombstonedAt).not.toBeNull();
    expect(learner.credentialDisabled).toBe(true);
    expect(learner.studentErasedAt).toBeNull();
  });

  test("admin cancel → restore (UI + DB oracle)", async ({ page }) => {
    const fixture = await seedErasureFamilyFixture();
    const { jobId } = await requestErasureForLearner({
      adminUserId: fixture.erasureAdminUserId,
      learnerProfileId: fixture.learnerProfileId,
      confirmPhrase: fixture.learnerDisplayName,
    });

    await page.goto("/admin/erasure");
    await expect(page.getByTestId(`erasure-job-row-${jobId}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`erasure-job-status-${jobId}`)).toHaveText(
      /Grace period/
    );

    await page.getByTestId(`erasure-job-cancel-${jobId}`).click();
    await page.getByTestId("erasure-cancel-dialog-confirm").click();

    await expect(page.getByTestId(`erasure-job-status-${jobId}`)).toHaveText(
      /Canceled/,
      { timeout: 15_000 }
    );

    const job = await readErasureJobOracle(jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe("canceled");
    expect(job!.canceledAt).not.toBeNull();

    const learner = await readLearnerErasureOracle(
      fixture.learnerProfileId,
      fixture.studentId
    );
    expect(learner.tombstonedAt).toBeNull();
    expect(learner.credentialDisabled).toBe(false);
  });
});

test.describe("Tutor content-route erasure guard", () => {
  test.use({ storageState: TUTOR_STATE });

  test("whiteboard replay 404 during grace, loads after cancel", async ({
    page,
  }) => {
    const fixture = await seedShareErasureFixture();
    const path = `/admin/students/${fixture.studentId}/whiteboard/${fixture.sessionId}`;

    const { jobId } = await requestErasureForLearner({
      adminUserId: fixture.erasureAdminUserId,
      learnerProfileId: fixture.learnerProfileId,
      confirmPhrase: fixture.learnerDisplayName,
    });

    const blocked = await page.goto(path);
    expect(blocked?.status()).toBe(404);

    await cancelErasure(jobId);

    const restored = await page.goto(path);
    expect(restored?.status()).not.toBe(404);
  });
});

test.describe("Family share-link erasure denial", () => {
  test("share pages + APIs 404 during grace, restore after cancel", async ({
    page,
    request,
  }) => {
    const fixture = await seedShareErasureFixture();
    const { jobId } = await requestErasureForLearner({
      adminUserId: fixture.erasureAdminUserId,
      learnerProfileId: fixture.learnerProfileId,
      confirmPhrase: fixture.learnerDisplayName,
    });

    const sharePages = [
      `/s/${fixture.shareToken}`,
      `/s/${fixture.shareToken}/all`,
      `/s/${fixture.shareToken}/whiteboard/${fixture.sessionId}`,
    ];

    for (const sharePath of sharePages) {
      const resp = await page.goto(sharePath);
      expect(resp?.status(), sharePath).toBe(404);
    }

    const apiPaths = [
      `/api/whiteboard/${fixture.sessionId}/public-events?token=${fixture.shareToken}`,
      `/api/whiteboard/${fixture.sessionId}/public-snapshot?token=${fixture.shareToken}`,
      `/api/audio/${fixture.recordingId}?token=${fixture.shareToken}`,
    ];

    for (const apiPath of apiPaths) {
      const apiResp = await request.get(apiPath);
      expect(apiResp.status(), apiPath).toBe(404);
      if (apiResp.headers()["content-type"]?.includes("application/json")) {
        const body = await apiResp.json();
        expect(body).toEqual({ error: "Not found." });
      }
    }

    await cancelErasure(jobId);

    const restoredPage = await page.goto(sharePages[0]!);
    expect(restoredPage?.status()).toBe(200);

    const restoredApi = await request.get(apiPaths[0]!);
    expect(restoredApi.status()).toBe(200);
  });
});
