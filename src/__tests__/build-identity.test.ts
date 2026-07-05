/**
 * Build identity — Vercel SHA resolution + preview badge delegation.
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

const FULL_SHA = "abcdef1234567890abcdef1234567890abcdef12";

describe("getBuildIdentity()", () => {
  it("returns Vercel SHA (full + short) when VERCEL_GIT_COMMIT_SHA is set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;
    process.env.VERCEL_GIT_COMMIT_REF = "feat/wb-wave5-polish";
    process.env.VERCEL_ENV = "preview";

    const { getBuildIdentity } = await import("@/lib/build-identity");

    expect(getBuildIdentity()).toEqual({
      sha: FULL_SHA,
      shortSha: "abcdef1",
      branch: "feat/wb-wave5-polish",
      vercelEnv: "preview",
    });
  });

  it('falls back to "development" when VERCEL_GIT_COMMIT_SHA is unset', async () => {
    const { getBuildIdentity } = await import("@/lib/build-identity");

    expect(getBuildIdentity()).toEqual({
      sha: "development",
      shortSha: "development",
      branch: null,
      vercelEnv: undefined,
    });
  });

  it("returns a real sha on production deployments", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;
    process.env.VERCEL_GIT_COMMIT_REF = "master";

    const { getBuildIdentity } = await import("@/lib/build-identity");

    expect(getBuildIdentity().sha).toBe(FULL_SHA);
    expect(getBuildIdentity().shortSha).toBe("abcdef1");
    expect(getBuildIdentity().vercelEnv).toBe("production");
  });
});

describe("getPreviewBranchBadgeData()", () => {
  it("returns null when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns null when VERCEL_ENV is unset (local dev)", async () => {
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns null when VERCEL_ENV=development", async () => {
    process.env.VERCEL_ENV = "development";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });

  it("returns branch + 7-char SHA when VERCEL_ENV=preview", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "feat/preview-branch-badge";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toEqual({
      branch: "feat/preview-branch-badge",
      shortSha: "abcdef1",
    });
  });

  it("returns null when VERCEL_ENV=preview but branch or SHA is missing", async () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = FULL_SHA;

    const { getPreviewBranchBadgeData } = await import("@/lib/preview-branch-badge");

    expect(getPreviewBranchBadgeData()).toBeNull();
  });
});
