import {
  isSelfLearnerPendingInvite,
  rosterPendingDisplayLabel,
} from "@/lib/roster-invite-target";

describe("roster invite target helpers", () => {
  it("detects self-learner pending invite when name matches parentEmail", () => {
    expect(
      isSelfLearnerPendingInvite({
        name: "Adult@Example.com",
        parentEmail: "adult@example.com",
        learnerProfileId: null,
      })
    ).toBe(true);
  });

  it("shows parentEmail on roster while self invite pending", () => {
    expect(
      rosterPendingDisplayLabel({
        name: "adult@example.com",
        parentEmail: "adult@example.com",
        learnerProfileId: null,
      })
    ).toBe("adult@example.com");
  });

  it("shows child identifier while child invite pending", () => {
    expect(
      rosterPendingDisplayLabel({
        name: "dragon@mortensen",
        parentEmail: "parent@example.com",
        learnerProfileId: null,
      })
    ).toBe("dragon@mortensen");
  });
});
