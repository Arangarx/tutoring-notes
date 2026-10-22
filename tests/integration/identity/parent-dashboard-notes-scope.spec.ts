import { expect, test } from "@playwright/test";

import { TAG } from "../../test-tags";
import { seedParentAccountHolder } from "./identity.helpers";
import {
  readLearnerOwnershipOracle,
  readSessionNoteOracle,
  seedOtherFamilyChildWithNote,
  seedParentChildWithNote,
} from "./parent-dashboard-notes-scope.helpers";

const PARENT_STATE = "tests/integration/.auth/parent.json";

test.describe("P2-ID-2 — parent dashboard + child-notes scoping", () => {
  test.use({ storageState: PARENT_STATE });

  test("parent sees own child on dashboard and session note on child notes page", async ({
    page,
  }) => {
    const accountHolderId = await seedParentAccountHolder();
    const owned = await seedParentChildWithNote({ accountHolderId });

    const ownership = await readLearnerOwnershipOracle(owned.learnerProfileId);
    expect(ownership.accountHolderId).toBe(accountHolderId);
    expect(ownership.tombstonedAt).toBeNull();

    const noteOracle = await readSessionNoteOracle(owned.noteId);
    expect(noteOracle.status).toBe("READY");
    expect(noteOracle.topics).toBe(owned.noteTopics);
    expect(noteOracle.studentId).toBe(owned.studentId);

    await page.goto("/account/dashboard");
    await expect(page.getByText("Family account")).toBeVisible({
      timeout: 15_000,
    });

    const joinCallout = page.getByTestId("parent-join-gap-callout");
    await expect(joinCallout).toBeVisible();
    await expect(joinCallout).toContainText(
      "You can join live sessions for your child"
    );
    await expect(joinCallout).toContainText("You do not need their PIN");
    await expect(joinCallout).not.toContainText(
      "Live sessions need the child's own login"
    );

    const childRow = page.getByRole("listitem").filter({ hasText: owned.childName });
    await expect(childRow).toBeVisible();
    await childRow.getByRole("link", { name: "Manage" }).click();

    await page.waitForURL(
      (url) => url.pathname === `/account/children/${owned.learnerProfileId}`,
      { timeout: 15_000 }
    );
    await expect(
      page.getByRole("heading", { name: owned.childName })
    ).toBeVisible();

    await page.getByRole("link", { name: "Session notes" }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === `/account/children/${owned.learnerProfileId}/notes`,
      { timeout: 15_000 }
    );

    await expect(page.locator(`[data-note-id="${owned.noteId}"]`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(owned.noteTopics)).toBeVisible();
    await expect(page.getByText("Topics covered")).toBeVisible();
  });

  test("parent is scoped out of other family's child and notes (404 + absent UI)", async ({
    page,
  }) => {
    const accountHolderId = await seedParentAccountHolder();
    const owned = await seedParentChildWithNote({ accountHolderId });
    const other = await seedOtherFamilyChildWithNote();

    expect(other.accountHolderId).not.toBe(accountHolderId);

    const otherOwnership = await readLearnerOwnershipOracle(
      other.learnerProfileId
    );
    expect(otherOwnership.accountHolderId).toBe(other.accountHolderId);

    await page.goto("/account/dashboard");
    await expect(page.getByText(owned.childName)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(other.childName)).not.toBeVisible();
    await expect(page.getByText(other.noteTopics)).not.toBeVisible();

    const childResp = await page.goto(
      `/account/children/${other.learnerProfileId}`
    );
    expect(childResp?.status()).toBe(404);
    await expect(page.getByText(other.childName)).not.toBeVisible();
    await expect(page.getByText(other.noteTopics)).not.toBeVisible();

    const notesResp = await page.goto(
      `/account/children/${other.learnerProfileId}/notes`
    );
    expect(notesResp?.status()).toBe(404);
    await expect(page.locator(`[data-note-id="${other.noteId}"]`)).toHaveCount(
      0
    );
    await expect(page.getByText(other.noteTopics)).not.toBeVisible();

    const ownNotesResp = await page.goto(
      `/account/children/${owned.learnerProfileId}/notes`
    );
    expect(ownNotesResp?.status()).toBe(200);
    await expect(page.locator(`[data-note-id="${owned.noteId}"]`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(owned.noteTopics)).toBeVisible();
  });

  test(
    "parent saves a display name on the profile tab and it survives reload",
    { tag: [TAG.WB_CHROME] },
    async ({ page }) => {
      const accountHolderId = await seedParentAccountHolder();
      const owned = await seedParentChildWithNote({ accountHolderId });
      const nextName = `Renamed ${owned.childName}`.slice(0, 80);

      await page.goto(`/account/children/${owned.learnerProfileId}`);
      await expect(page.getByRole("link", { name: "Profile" })).toHaveAttribute(
        "aria-current",
        "page"
      );
      // The Profile section title. The page h1 is the learner's current name.
      await expect(
        page.locator('[data-slot="card-title"]').filter({ hasText: /^Display name$/ })
      ).toBeVisible({ timeout: 15_000 });

      const input = page.getByLabel("Display name");
      await expect(input).toHaveAttribute("maxlength", "80");
      await expect(
        page.getByRole("button", { name: "Save display name" })
      ).toBeVisible();

      await input.fill(nextName);
      await page.getByRole("button", { name: "Save display name" }).click();
      await expect(page.getByTestId("display-name-saved")).toBeVisible({
        timeout: 15_000,
      });

      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(nextName);
      await expect(page.getByLabel("Display name")).toHaveValue(nextName);
    }
  );
});
