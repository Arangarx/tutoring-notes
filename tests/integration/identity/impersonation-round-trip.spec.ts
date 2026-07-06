import { expect, test } from "@playwright/test";

import {
  ROLE_REFRESH_ADMIN,
  closeOpenImpersonationLogs,
  exitImpersonationViaBanner,
  exitImpersonationViaNavSignOut,
  expectImpersonationBanner,
  expectNoFresh2faChallenge,
  expectSessionIdentity,
  loginHarnessAdminForImpersonation,
  readLatestImpersonationLog,
  seedImpersonationTarget,
  startImpersonationFromDashboard,
} from "./impersonation-round-trip.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("SEC-1 — impersonation round-trip (browser contract)", () => {
  test.use({ storageState: EMPTY_STATE });

  test("admin → impersonate test tutor → banner → exit → admin session without fresh 2FA", async ({
    page,
  }) => {
    const target = await seedImpersonationTarget();
    const adminUserId = await loginHarnessAdminForImpersonation(page);

    try {
      await closeOpenImpersonationLogs(adminUserId, target.targetUserId);

      await startImpersonationFromDashboard(page, target.email);

      await expectSessionIdentity(page, {
        email: target.email,
        isImpersonating: true,
        role: "TUTOR",
      });

      const openLog = await readLatestImpersonationLog(
        adminUserId,
        target.targetUserId
      );
      expect(openLog).not.toBeNull();
      expect(openLog?.endedAt).toBeNull();

      await exitImpersonationViaBanner(page);

      await expect(
        page.getByText(`You are signed in as ${target.email} (test account).`)
      ).not.toBeVisible();
      await expectSessionIdentity(page, {
        email: ROLE_REFRESH_ADMIN.email,
        isImpersonating: false,
        role: "ADMIN",
      });

      const closedLog = await readLatestImpersonationLog(
        adminUserId,
        target.targetUserId
      );
      expect(closedLog?.id).toBe(openLog?.id);
      expect(closedLog?.endedAt).not.toBeNull();
    } finally {
      await closeOpenImpersonationLogs(adminUserId, target.targetUserId);
    }
  });

  test("sign out while impersonating restores admin without full logout or 2FA challenge", async ({
    page,
  }) => {
    const target = await seedImpersonationTarget();
    const adminUserId = await loginHarnessAdminForImpersonation(page);

    try {
      await closeOpenImpersonationLogs(adminUserId, target.targetUserId);
      await startImpersonationFromDashboard(page, target.email);
      await expectImpersonationBanner(page, target.email);

      await exitImpersonationViaNavSignOut(page);

      await expect(page.locator("#email")).not.toBeVisible();
      await expectNoFresh2faChallenge(page);
      await expectSessionIdentity(page, {
        email: ROLE_REFRESH_ADMIN.email,
        isImpersonating: false,
        role: "ADMIN",
      });
    } finally {
      await closeOpenImpersonationLogs(adminUserId, target.targetUserId);
    }
  });
});
