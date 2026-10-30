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
      "src/components/LinkRow.tsx",
      "tests/integration/wb-org-link-row.spec.ts",
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

describe("wb-test-select consent matrix (@wb-consent)", () => {
  it("maps the consent modules, C0 test infra and consent specs to @wb-consent", () => {
    const files = [
      "src/lib/consent-scope.ts",
      "src/lib/session-capabilities.ts",
      "src/lib/org/schedule-bridge.ts",
      "src/lib/whiteboard/stale-session-stamp.ts",
      "src/lib/test-seams.ts",
      "src/lib/blob-list.ts",
      "src/lib/blob-harness.ts",
      "src/app/api/test/seams/route.ts",
      "src/app/api/test/blob/state/route.ts",
      "src/app/api/cron/session-cleanup/route.ts",
      "src/app/api/whiteboard/[sessionId]/join-timer/route.ts",
      "tests/helpers/consent-harness.ts",
      "tests/helpers/get-user-media-spy.ts",
      "tests/helpers/consent-db-oracle.ts",
      "tests/helpers/relay-probe.ts",
      "tests/integration/wb-consent-matrix.spec.ts",
      "tests/integration/consent-entry.spec.ts",
      "tests/integration/wb-consent-harness-selftest.spec.ts",
    ];
    for (const file of files) {
      expect(tagsForPaths([file])).toEqual(expect.arrayContaining(["@wb-consent"]));
    }
  });

  it("does not tag unrelated whiteboard files as @wb-consent", () => {
    expect(tagsForPaths(["src/components/whiteboard/chrome/WbModifierHints.tsx"])).not.toContain(
      "@wb-consent"
    );
  });

  it("expands @wb-consent to recording, presence and sync adjacency", () => {
    expect(expandTags(["@wb-consent"])).toEqual(
      expect.arrayContaining(["@wb-consent", "@wb-recording", "@wb-presence", "@wb-sync"])
    );
  });
});
