const { expandTags, tagsForPaths } = require("../../scripts/wb-test-select.cjs");

describe("wb-test-select student session disclosures", () => {
  it("maps the disclosure and both roster lists to @wb-chrome", () => {
    const files = [
      "src/components/admin/StudentSessionDisclosures.tsx",
      "src/app/admin/students/[id]/whiteboard/ActiveWhiteboardSessionsList.tsx",
      "src/app/admin/students/[id]/whiteboard/EndedUnsavedSessionsList.tsx",
    ];
    for (const file of files) {
      expect(tagsForPaths([file])).toEqual(expect.arrayContaining(["@wb-chrome"]));
    }
  });
});

describe("wb-test-select org paths", () => {
  it("maps organization surfaces to @org", () => {
    const files = [
      "src/components/org/OrgSchedulePanel.tsx",
      "src/lib/org-scope.ts",
      "src/lib/org-learner.ts",
      "src/app/admin/organization/[id]/page.tsx",
      "src/app/admin/orgs/page.tsx",
      "src/lib/scheduling/upcoming-sessions.ts",
      "src/app/admin/schedule/actions.ts",
      "src/app/admin/students/page.tsx",
      "src/components/admin/StudentsRoster.tsx",
    ];
    for (const file of files) {
      expect(tagsForPaths([file])).toEqual(expect.arrayContaining(["@org"]));
    }
  });

  it("expands @org to the booking join adjacency @wb-presence", () => {
    expect(expandTags(["@org"])).toEqual(expect.arrayContaining(["@org", "@wb-presence"]));
  });
});

describe("wb-test-select session review transcript", () => {
  it("maps SessionReviewMode and the review transcript spec to @wb-recording and @wb-chrome", () => {
    const files = [
      "src/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/SessionReviewMode.tsx",
      "tests/integration/wb-session-review-transcript.spec.ts",
    ];
    for (const file of files) {
      expect(tagsForPaths([file]).sort()).toEqual(["@wb-chrome", "@wb-recording"]);
    }
  });
});
