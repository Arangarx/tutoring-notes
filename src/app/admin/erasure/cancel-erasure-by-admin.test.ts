/**
 * @jest-environment node
 *
 * E5b — cancelErasureByAdminAction tests.
 */

import { db } from "@/lib/db";

const ADMIN_ID = "00000000-0000-4000-8000-00000000e5b0";

let uniqueSuffix = 0;
function uniq(prefix = "ers-e5b") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

afterAll(async () => {
  await db.$disconnect();
});

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      passwordHash: "not-used",
      displayName: "Cancel Parent",
      emailVerifiedAt: new Date(),
      familyId: `fam_${uniq()}`,
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Cancel Child",
      accessMode: "child_pin_required",
    },
  });
}

async function createErasureJob(
  scopeKind: "learner_profile" | "account_holder",
  scopeId: string,
  status: "requested" | "blobs_purging" | "completed" = "requested"
) {
  return db.erasureJob.create({
    data: {
      scopeKind,
      scopeId,
      status,
      requestedByPrincipal: `admin:${ADMIN_ID}`,
      purgeEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

function mockAssertIsAdmin() {
  jest.doMock("@/lib/impersonation", () => ({
    assertIsAdmin: jest.fn().mockResolvedValue({
      adminId: ADMIN_ID,
      email: "admin@example.com",
    }),
    ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ImpersonationForbiddenError";
      }
    },
  }));
}

function mockAssertIsAdminRejected() {
  jest.doMock("@/lib/impersonation", () => ({
    assertIsAdmin: jest.fn().mockRejectedValue(
      Object.assign(new Error("Only ADMIN-role accounts can impersonate."), {
        name: "ImpersonationForbiddenError",
      })
    ),
    ImpersonationForbiddenError: class ImpersonationForbiddenError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "ImpersonationForbiddenError";
      }
    },
  }));
}

describe("cancelErasureByAdminAction", () => {
  it("rejects non-ADMIN principal", async () => {
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const job = await createErasureJob("learner_profile", lp.id);

    jest.resetModules();
    mockAssertIsAdminRejected();

    const { cancelErasureByAdminAction } = await import("./actions");
    const result = await cancelErasureByAdminAction(job.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ADMIN/i);
    }

    const refreshed = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(refreshed!.status).toBe("requested");
  });

  it("cancels a requested job and restores tombstone state", async () => {
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    await db.learnerProfile.update({
      where: { id: lp.id },
      data: { tombstonedAt: new Date() },
    });
    await db.learnerCredential.create({
      data: {
        learnerProfileId: lp.id,
        accountHolderId: ah.id,
        username: `cancel_${uniq()}`,
        secretHash: "not-used",
        disabled: true,
      },
    });
    const job = await createErasureJob("learner_profile", lp.id);

    jest.resetModules();
    mockAssertIsAdmin();

    const { cancelErasureByAdminAction } = await import("./actions");
    const result = await cancelErasureByAdminAction(job.id);

    expect(result).toEqual({ ok: true, status: "canceled" });

    const refreshed = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(refreshed!.status).toBe("canceled");
    expect(refreshed!.canceledAt).not.toBeNull();

    const lpAfter = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(lpAfter!.tombstonedAt).toBeNull();

    const cred = await db.learnerCredential.findFirst({
      where: { learnerProfileId: lp.id },
    });
    expect(cred!.disabled).toBe(false);
  });

  it("rejects cancel for non-requested job", async () => {
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const job = await createErasureJob("learner_profile", lp.id, "blobs_purging");

    jest.resetModules();
    mockAssertIsAdmin();

    const { cancelErasureByAdminAction } = await import("./actions");
    const result = await cancelErasureByAdminAction(job.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Cannot cancel/);
    }

    const refreshed = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(refreshed!.status).toBe("blobs_purging");
  });
});
