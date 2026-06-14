/**
 * Preview branch badge — production guard tests.
 *
 * The badge must be physically impossible to render on production:
 * getPreviewBranchBadgeData() returns null unless VERCEL_ENV === 'preview'.
 */

beforeEach(() => {
  jest.resetModules();
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_REF;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_REF;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe("getPreviewBranchBadgeData()", () => {
  it("returns null when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns null when VERCEL_ENV is unset (local dev)", async () => {
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns null when VERCEL_ENV=development", async () => {
    process.env.VERCEL_ENV = "development";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns branch + 7-char SHA when VERCEL_ENV=preview", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toEqual({
      branch: "feat/preview-branch-badge",
      shortSha: "abcdef1",
    });
  });

  it("returns null when VERCEL_ENV=preview but branch or SHA is missing", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });
});
