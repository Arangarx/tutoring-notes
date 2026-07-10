/**
 * @jest-environment node
 *
 * ER-4/ER-5 — proves cancelErasureByAdminAction invokes cancelErasureJob (not a dead button).
 * Integration restore semantics live in cancel-erasure-by-admin.test.ts.
 */

const cancelErasureJobMock = jest.fn();

jest.mock("@/lib/impersonation", () => ({
  assertIsAdmin: jest.fn().mockResolvedValue({
    adminId: "00000000-0000-4000-8000-00000000e5b0",
    email: "admin@example.com",
  }),
  ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {},
}));

jest.mock("@/lib/erasure/process-erasure-job", () => ({
  cancelErasureJob: (...args: unknown[]) => cancelErasureJobMock(...args),
}));

describe("cancelErasureByAdminAction — cancelErasureJob wiring", () => {
  beforeEach(() => {
    cancelErasureJobMock.mockReset();
    jest.resetModules();
  });

  it("invokes cancelErasureJob with the job id and returns canceled status", async () => {
    const jobId = "33333333-3333-4333-8333-333333333333";
    cancelErasureJobMock.mockResolvedValue({ status: "canceled" });

    const { cancelErasureByAdminAction } = await import("./actions");
    const result = await cancelErasureByAdminAction(jobId);

    expect(cancelErasureJobMock).toHaveBeenCalledTimes(1);
    expect(cancelErasureJobMock).toHaveBeenCalledWith(jobId);
    expect(result).toEqual({ ok: true, status: "canceled" });
  });

  it("surfaces cancelErasureJob rejection to the client", async () => {
    cancelErasureJobMock.mockRejectedValue(
      new Error('Cannot cancel ErasureJob in status "blobs_purging"')
    );

    const { cancelErasureByAdminAction } = await import("./actions");
    const result = await cancelErasureByAdminAction("job-fail");

    expect(cancelErasureJobMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Cannot cancel/);
    }
  });
});
