import { expect, type Page } from "@playwright/test";

export const OPEN_SESSIONS_DISCLOSURE_TESTID = "student-open-sessions-disclosure";
export const ENDED_NEEDS_REVIEW_DISCLOSURE_TESTID =
  "student-ended-needs-review-disclosure";

/**
 * Expand a collapsed student-detail session disclosure.
 * Clicks only while aria-expanded is not true, so a later call does not collapse it.
 */
export async function expandStudentSessionDisclosure(page: Page, testId: string) {
  const trigger = page.getByTestId(testId);
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
}
