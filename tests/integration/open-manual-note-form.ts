import { expect, type Page } from "@playwright/test";

/** Add note reveals the manual form. The paste panel is already on the page. */
export async function openManualNoteForm(page: Page): Promise<void> {
  const add = page.getByRole("button", { name: "Add note" });
  const topics = page.getByTestId("new-note-form").locator("#note-topics");
  await expect(async () => {
    if ((await add.getAttribute("aria-expanded")) !== "true") {
      await add.click();
    }
    await expect(topics).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}
