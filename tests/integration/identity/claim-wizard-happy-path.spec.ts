import { expect, test } from "@playwright/test";

import { postLearnerLogin } from "./learner-pin-lockout.helpers";
import {
  ensureParentForClaimWizard,
  readClaimWizardOracle,
  readLearnerCredentialOracle,
  seedUnclaimedClaimInvite,
} from "./claim-wizard.helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";

/** Valid 6-digit PIN — not in weak-pattern blocklist. */
const CHILD_PIN = "847291";

test.describe("P2-ID-1 — claim wizard happy path", () => {
  test.use({ storageState: PARENT_STATE });

  test("interstitial → add-child → consent → credentials → learner can sign in", async ({
    page,
    request,
  }) => {
    const accountHolderId = await ensureParentForClaimWizard();
    const invite = await seedUnclaimedClaimInvite();

    const before = await readClaimWizardOracle(invite.inviteId, invite.studentId);
    expect(before.inviteClaimed).toBe(false);
    expect(before.studentLearnerProfileId).toBeNull();

    await page.goto(`/claim/${invite.rawToken}`);
    await expect(page.getByTestId("claim-interstitial")).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("radio", { name: "Add a new child" }).check();
    await page.getByRole("button", { name: "Connect learner" }).click();

    await page.waitForURL(
      (url) => url.pathname === `/claim/${invite.rawToken}/setup`,
      { timeout: 15_000 }
    );
    await expect(
      page.getByText(/Account connected!/i)
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(new RegExp(`${invite.studentName} is now linked`, "i"))
    ).toBeVisible();

    const afterClaim = await readClaimWizardOracle(invite.inviteId, invite.studentId);
    expect(afterClaim.inviteClaimed).toBe(true);
    expect(afterClaim.claimedByAccountHolderId).toBe(accountHolderId);
    expect(afterClaim.studentLearnerProfileId).not.toBeNull();
    expect(afterClaim.learnerProfileAccountHolderId).toBe(accountHolderId);

    const learnerProfileId = afterClaim.studentLearnerProfileId!;

    await expect(page.getByTestId("consent-decline-btn")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("consent-decline-btn").click();
    await page.getByTestId("consent-decline-confirm-btn").click();
    await expect(page.getByTestId("consent-saved-indicator")).toBeVisible({
      timeout: 15_000,
    });

    const username = `pwclmu${Date.now().toString(36).slice(-6)}`;
    await page.getByLabel(`Username for ${invite.studentName}`).fill(username);
    await page.getByLabel(`PIN for ${invite.studentName}`).click();
    await page.getByLabel(`PIN for ${invite.studentName}`).fill(CHILD_PIN);
    await page.getByLabel("Confirm PIN").click();
    await page.getByLabel("Confirm PIN").fill(CHILD_PIN);
    await page.getByRole("button", { name: "Set up login" }).click();

    await expect(
      page.getByText(new RegExp(`Login set up for ${invite.studentName}`, "i"))
    ).toBeVisible({ timeout: 15_000 });

    const cred = await readLearnerCredentialOracle(learnerProfileId);
    expect(cred).not.toBeNull();
    expect(cred!.username).toBe(username.toLowerCase());

    const loginResp = await postLearnerLogin(request, cred!.handle, CHILD_PIN);
    expect(loginResp.status()).toBe(200);
    const body = await loginResp.json();
    expect(body).toEqual({ next: "session" });
  });
});
