import { expect, test } from "@playwright/test";

import {
  deleteAdminUser,
  expectAdminDashboard,
  expectTutorWorkspaceLanding,
  expectUnauthenticatedAdminRedirect,
  expireJwtRoleRefreshThrottle,
  loginEphemeralAdminWith2fa,
  loginHarnessAdmin,
  resolveRoleRefreshAdminId,
  seedEphemeralAdminForDeletion,
  updateAdminUserRole,
} from "./jwt-role-refresh.helpers";

const EMPTY_STATE = { cookies: [] as [], origins: [] as [] };

test.describe("P2-ID-3 — JWT role-refresh in browser", () => {
  test.use({ storageState: EMPTY_STATE });

  test("ADMIN demoted to TUTOR: refresh corrects session routing to tutor workspace", async ({
    page,
  }) => {
    const adminUserId = await resolveRoleRefreshAdminId();

    try {
      await updateAdminUserRole(adminUserId, "ADMIN");
      await loginHarnessAdmin(page);
      await expectAdminDashboard(page);

      await updateAdminUserRole(adminUserId, "TUTOR");
      await expireJwtRoleRefreshThrottle(page.context());

      await page.goto("/admin");
      await expectTutorWorkspaceLanding(page);
    } finally {
      await updateAdminUserRole(adminUserId, "ADMIN");
    }
  });

  test("account deleted: refresh fail-closed invalidates session (redirect to login)", async ({
    page,
  }) => {
    const ephemeral = await seedEphemeralAdminForDeletion();

    await loginEphemeralAdminWith2fa(page, ephemeral);
    await expectAdminDashboard(page);

    await deleteAdminUser(ephemeral.adminUserId);
    await expireJwtRoleRefreshThrottle(page.context());

    await page.goto("/admin");
    await expectUnauthenticatedAdminRedirect(page);

    const sessionResp = await page.request.get("/api/auth/session");
    expect(sessionResp.ok()).toBe(true);
    const sessionBody = await sessionResp.json();
    expect(sessionBody.user?.id).toBeFalsy();
  });
});
