import { expect, test } from "@playwright/test";

import {
  driveToHardLock,
  HARD_LOCK_THRESHOLD,
  postLearnerLogin,
  readHardLockOracle,
  resetLearnerThrottle,
  seedParentOwnedPinLockoutLearner,
  seedPinLockoutLearner,
  WRONG_PIN,
} from "./learner-pin-lockout.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };
const PARENT_STATE = "tests/integration/.auth/parent.json";

test.describe("P1-ID-1 — learner PIN hard lockout (API contract)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("baseline: correct PIN succeeds before threshold (non-vacuous)", async ({
    request,
  }) => {
    const fx = await seedPinLockoutLearner();
    try {
      const resp = await postLearnerLogin(request, fx.handle, fx.pin);
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(body).toEqual({ next: "session" });
      expect(await readHardLockOracle(fx.credKey)).toBe(false);
    } finally {
      await resetLearnerThrottle(fx.credKey);
    }
  });

  test("lockout engages after threshold failed attempts", async ({ request }) => {
    const fx = await seedPinLockoutLearner();
    try {
      const lockResp = await driveToHardLock(request, fx);
      expect(lockResp.status()).toBe(423);
      const body = await lockResp.json();
      expect(body.error).toBe("account_locked");
      expect(body.message).toMatch(/too many failed attempts/i);
      expect(await readHardLockOracle(fx.credKey)).toBe(true);
    } finally {
      await resetLearnerThrottle(fx.credKey);
    }
  });

  test("correct PIN is denied while hard-locked (security teeth)", async ({
    request,
  }) => {
    const fx = await seedPinLockoutLearner();
    try {
      await driveToHardLock(request, fx);
      expect(await readHardLockOracle(fx.credKey)).toBe(true);

      const resp = await postLearnerLogin(request, fx.handle, fx.pin);
      expect(resp.status()).toBe(423);
      const body = await resp.json();
      expect(body.error).toBe("account_locked");
      expect(body.message).toMatch(/too many failed attempts/i);
    } finally {
      await resetLearnerThrottle(fx.credKey);
    }
  });
});

test.describe("P1-ID-1 — learner PIN hard lockout (login page DOM)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("hard lock surfaces Account locked UI on /students/login", async ({
    page,
    request,
  }) => {
    const fx = await seedPinLockoutLearner();
    try {
      await driveToHardLock(request, fx);

      await page.goto("/students/login");
      const usernameInput = page.getByLabel("Username");
      const pinInput = page.getByLabel("PIN", { exact: true });
      await usernameInput.click();
      await usernameInput.fill(fx.handle);
      await pinInput.click();
      await pinInput.fill(WRONG_PIN);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(page.getByText("Account locked", { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        page.getByText(/too many failed attempts.*parent\/guardian/i)
      ).toBeVisible();
    } finally {
      await resetLearnerThrottle(fx.credKey);
    }
  });
});

test.describe("P1-ID-1 — parent clears hard lock", () => {
  test.use({ storageState: PARENT_STATE });

  test("parent unlock → learner can sign in with correct PIN again", async ({
    page,
    request,
  }) => {
    const fx = await seedParentOwnedPinLockoutLearner();
    try {
      await driveToHardLock(request, fx);
      expect(await readHardLockOracle(fx.credKey)).toBe(true);

      const blocked = await postLearnerLogin(request, fx.handle, fx.pin);
      expect(blocked.status()).toBe(423);

      await page.goto(`/account/children/${fx.learnerProfileId}`);
      await expect(
        page.getByText(/locked due to too many failed sign-in attempts/i)
      ).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Unlock account" }).click();
      await expect(
        page.getByText(/account unlocked.*try signing in again/i)
      ).toBeVisible({ timeout: 15_000 });

      expect(await readHardLockOracle(fx.credKey)).toBe(false);

      const restored = await postLearnerLogin(request, fx.handle, fx.pin);
      expect(restored.status()).toBe(200);
      const body = await restored.json();
      expect(body).toEqual({ next: "session" });
    } finally {
      await resetLearnerThrottle(fx.credKey);
    }
  });
});
