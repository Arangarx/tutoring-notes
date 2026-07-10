/**
 * CC-3 — claim setup: credential-skip + attach_existing escape.
 *
 * Bug class: "Set up later" was gated on consent being complete (regression from CC-2 7a85d0a),
 * and the attach_existing "Go to dashboard" link was invisible until a hard reload after consent.
 *
 * Test 1: consent done → "Set up later" → dashboard navigation; DB has NO LearnerCredential.
 * Test 2: attach_existing (credential pre-set) → consent Save → "Go to dashboard" visible
 *   WITHOUT reload → navigation succeeds; exactly one LearnerCredential remains in DB.
 *
 * Project: identity-e2e (parent storageState, no relay needed).
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  ensureParentForClaimWizard,
  seedUnclaimedClaimInvite,
  readLearnerCredentialOracle,
} from "./claim-wizard.helpers";
import { seedClaimInvite, seedParentAccountHolder } from "./identity.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

const PARENT_STATE = "tests/integration/.auth/parent.json";

/** Read exact credential count for a learnerProfileId — DB oracle. */
async function countLearnerCredentials(learnerProfileId: string): Promise<number> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    return await prisma.learnerCredential.count({ where: { learnerProfileId } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe("CC-3 — claim setup: credential skip + attach_existing escape", () => {
  test.use({ storageState: PARENT_STATE });

  test(
    "consent done → Set up later → dashboard; DB has NO LearnerCredential",
    async ({ page }) => {
      const accountHolderId = await ensureParentForClaimWizard();
      const invite = await seedUnclaimedClaimInvite();

      // Complete the claim wizard step (interstitial → add new child → setup page)
      await page.goto(`/claim/${invite.rawToken}`);
      await expect(page.getByTestId("claim-interstitial")).toBeVisible({ timeout: 15_000 });
      await page.getByRole("radio", { name: "Add a new child" }).check();
      await page.getByRole("button", { name: "Connect learner" }).click();
      await page.waitForURL(
        (url) => url.pathname === `/claim/${invite.rawToken}/setup`,
        { timeout: 15_000 }
      );

      // Verify consent form is present and make a consent choice (consent is mandatory)
      await expect(page.getByTestId("consent-save-btn")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("consent-save-btn").click();
      await expect(page.getByTestId("consent-saved-indicator")).toBeVisible({ timeout: 15_000 });

      // "Set up later" link must now be visible (decoupled from consent gate)
      const skipLink = page.getByTestId("skip-credential-link");
      await expect(skipLink).toBeVisible({ timeout: 8_000 });

      // Clicking it navigates to dashboard
      await skipLink.click();
      await page.waitForURL((url) => url.pathname.startsWith("/account/dashboard"), {
        timeout: 15_000,
      });

      // DB oracle: no LearnerCredential was created
      const { studentLearnerProfileId } = await (async () => {
        assertLocalDatabaseUrlForHarness();
        const prisma = new PrismaClient();
        try {
          const student = await prisma.student.findFirst({
            where: { name: invite.studentName },
            select: { learnerProfileId: true },
            orderBy: { createdAt: "desc" },
          });
          return { studentLearnerProfileId: student?.learnerProfileId ?? null };
        } finally {
          await prisma.$disconnect();
        }
      })();
      expect(studentLearnerProfileId).not.toBeNull();
      const credCount = await countLearnerCredentials(studentLearnerProfileId!);
      expect(credCount).toBe(0);
    }
  );

  test(
    "attach_existing: consent Save → Continue to dashboard visible WITHOUT reload; still exactly one credential",
    async ({ page }) => {
      const { seedClaimedInviteWithCredential } = await import("./claim-wizard.helpers");

      const accountHolderId = await seedParentAccountHolder();
      const fixture = await seedClaimedInviteWithCredential({ accountHolderId });

      // Verify pre-condition: exactly one credential before the test
      const credCountBefore = await countLearnerCredentials(fixture.learnerProfileId);
      expect(credCountBefore).toBe(1);

      // Navigate directly to the setup page (invite already claimed)
      await page.goto(`/claim/${fixture.rawToken}/setup`);
      await expect(page.getByText(/Account connected!/i)).toBeVisible({ timeout: 15_000 });

      // Credential panel shows "already set up" message
      await expect(page.getByText(/login is already (configured|set up)/i)).toBeVisible({
        timeout: 8_000,
      });

      // "Go to dashboard" in credential panel must NOT be visible yet (consent not done)
      await expect(
        page.getByTestId("credential-existing-dashboard-link")
      ).not.toBeVisible();

      // Complete consent
      await expect(page.getByTestId("consent-save-btn")).toBeVisible({ timeout: 15_000 });
      await page.getByTestId("consent-save-btn").click();
      await expect(page.getByTestId("consent-saved-indicator")).toBeVisible({ timeout: 15_000 });

      // After consent saved → "Finish — go to dashboard" link must appear in consent saved state
      // without needing a manual reload (router.refresh() fires automatically)
      const consentDashLink = page.getByTestId("consent-saved-dashboard-link");
      await expect(consentDashLink).toBeVisible({ timeout: 8_000 });

      // After router.refresh() re-renders the page, the credential panel's dashboard link also appears
      const credDashLink = page.getByTestId("credential-existing-dashboard-link");
      await expect(credDashLink).toBeVisible({ timeout: 10_000 });

      // Navigate via the credential panel link
      await credDashLink.click();
      await page.waitForURL((url) => url.pathname.startsWith("/account/dashboard"), {
        timeout: 15_000,
      });

      // DB oracle: still exactly one credential (no duplicate was created)
      const credCountAfter = await countLearnerCredentials(fixture.learnerProfileId);
      expect(credCountAfter).toBe(1);
    }
  );
});
