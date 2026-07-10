import { expect, test } from "@playwright/test";

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
});
