import { expect, test } from "@playwright/test";

/**
 * Public privacy and terms must state who in an organization can see a learner,
 * and what remains after an account is deleted. They must not claim a retention
 * clock, a fingerprint, or org features this release does not offer.
 */

const ORGANIZATION_SENTENCE =
  "An organization owner, admin, or scheduler can see learners that organization entered, including learners they did not personally teach. The organization enters the learner. A scheduler sees the name, a short brief, and a short reason when a booking is blocked, and does not see parent email, consent choices, or notes. A private tutor still sees only their own students.";

const DELETION_SENTENCE =
  "After an account is deleted, we keep a record of the consent choices that were made: which options were on or off, and when. That record does not include the person’s name or email.";

const CONSENT_SENTENCE =
  "When a parent or a self-learner has finished account setup, consent is recorded in that Mynk account before a live session. A parent records it for a child. A self-learner records it for themselves. A student who has not finished setup does not have that record yet.";

const ABSENT = [
  "24 months",
  "automatically deleted",
  "fingerprint of the account email",
  "self-serve",
  "guest room",
  "cutoff switch",
] as const;

async function pageText(page: import("@playwright/test").Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

for (const path of ["/privacy", "/terms"] as const) {
  test(`${path} states organization access and deletion, and omits unbuilt claims`, async ({
    page,
  }) => {
    await page.goto(path);
    const text = await pageText(page);

    expect(text).toContain(ORGANIZATION_SENTENCE);
    expect(text).toContain(DELETION_SENTENCE);
    expect(text).toContain(CONSENT_SENTENCE);
    expect(text).not.toContain("October 6, 2026");
    if (path === "/privacy") {
      expect(text).toContain("created after this release");
      expect(text).toContain("created before this release");
    }

    for (const phrase of ABSENT) {
      expect(text.toLowerCase()).not.toContain(phrase);
    }
    // The future-automation sentence uses the plural "schedules". A claimed
    // schedule (singular) must not appear.
    expect(text).not.toMatch(/\bretention schedule\b/i);
  });
}
