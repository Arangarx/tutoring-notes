/**
 * GET /api/version — public deploy metadata (no-store).
 */

beforeEach(() => {
  jest.resetModules();
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

afterEach(() => {
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

describe("GET /api/version", () => {
  it("returns sha + shortSha with Cache-Control: no-store", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";

    const { GET } = await import("@/app/api/version/route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      sha: "abcdef1234567890abcdef1234567890abcdef12",
      shortSha: "abcdef1",
    });
    expect(res.headers.get("Cache-Control")).toBe("no-store, max-age=0");
  });

  it('falls back to development sha when VERCEL_GIT_COMMIT_SHA is unset', async () => {
    const { GET } = await import("@/app/api/version/route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      sha: "development",
      shortSha: "development",
    });
  });
});
