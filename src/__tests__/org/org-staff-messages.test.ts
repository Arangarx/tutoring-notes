/**
 * Staff-facing sentences. The expected copy is the product requirement,
 * written here, not taken from a shared sentence table.
 */
import { orgStaffErrorSentence } from "@/lib/org-staff-messages";

describe("orgStaffErrorSentence", () => {
  test("names the daily claim-email cap, a brief that is too long, and a learner who is already connected", () => {
    expect(orgStaffErrorSentence("claim_email_cap")).toBe(
      "This organization has reached its claim email limit for today."
    );
    expect(orgStaffErrorSentence("brief_too_long")).toBe("The brief is too long.");
    expect(orgStaffErrorSentence("already_connected")).toBe(
      "This learner is already connected."
    );
  });
});
