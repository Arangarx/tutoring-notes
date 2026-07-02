/**
 * @jest-environment node
 *
 * E5a — admin-only erasure request + worker batch tests.
 *
 * Coverage:
 *   T-new-I (B-8) — duplicate request returns same jobId
 *   Admin role — non-admin rejected via action wrapper
 *   Confirmation — wrong confirmPhrase rejected
 *   Full-family ordering — AH + child LPs tombstoned, throttles swept
 *   Per-learner throttle sweep — soft/hard rows deleted before LP tombstone
 *   purgeEligibleAt ≈ now + 7 days; status requested
 *   Worker batch — grace-gated vs eligible jobs
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const mockDeleteBlob = jest.fn();

jest.mock("@vercel/blob", () => ({
  list: jest.fn().mockResolvedValue({ blobs: [] }),
}));

jest.mock("@/lib/blob", () => ({
  ...jest.requireActual("@/lib/blob"),
  deleteBlob: (...args: unknown[]) => mockDeleteBlob(...args),
  fetchPrivateBlobBytes: jest.fn().mockResolvedValue(null),
}));

import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import {
  requestErasureByAdmin,
  ErasureRequestError,
} from "@/lib/erasure/request-erasure-by-admin";
import { processErasureBatch } from "@/lib/erasure/process-erasure-batch";
import { verifyErasureWorkerAuth } from "@/lib/erasure/erasure-worker-auth";
import { GET as processRouteGet } from "@/app/api/internal/erasure/process/route";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";
const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

let uniqueSuffix = 0;
function uniq(prefix = "ers-e5a") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

const ADMIN_ID = "00000000-0000-4000-8000-00000000e5a0";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => {
  mockDeleteBlob.mockReset();
  mockDeleteBlob.mockResolvedValue(undefined);
});

async function createAdminUser(role: "ADMIN" | "TUTOR" = "ADMIN") {
  return db.adminUser.create({
    data: {
      email: `${uniq("admin")}@example.com`,
      role,
    },
  });
}

async function createAccountHolder(opts?: {
  email?: string;
  familyId?: string | null;
  displayName?: string;
}) {
  const email = opts?.email ?? `${uniq("ah")}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      displayName: opts?.displayName ?? "Parent Test",
      emailVerifiedAt: new Date(),
      familyId: opts?.familyId ?? `fam_${uniq()}`,
    },
  });
}

async function createLearnerProfile(
  accountHolderId: string,
  opts?: { displayName?: string; isTestFixture?: boolean }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: opts?.displayName ?? "Child Test",
      accessMode: "child_pin_required",
      isTestFixture: opts?.isTestFixture ?? false,
    },
  });
}

async function createLearnerCredential(
  learnerProfileId: string,
  accountHolderId: string,
  username: string
) {
  const secretHash = await hashLearnerPin("123456");
  return db.learnerCredential.create({
    data: { learnerProfileId, accountHolderId, username, secretHash },
  });
}

// ---------------------------------------------------------------------------
// T-new-I (B-8)
// ---------------------------------------------------------------------------

describe("T-new-I (B-8): idempotent erasure job per scope", () => {
  it("two sequential requests return the same jobId and create one row", async () => {
    const ah = await createAccountHolder({ displayName: "Family Alpha" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Kid Alpha" });

    const first = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "Kid Alpha"
    );
    const second = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "DELETE"
    );

    expect(second.jobId).toBe(first.jobId);

    const jobs = await db.erasureJob.findMany({
      where: { scopeKind: "learner_profile", scopeId: lp.id },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.status).toBe("requested");
  });
});

// ---------------------------------------------------------------------------
// Confirmation
// ---------------------------------------------------------------------------

describe("confirmation phrase enforcement", () => {
  it("rejects wrong confirmPhrase without creating job or tombstone", async () => {
    const ah = await createAccountHolder({ displayName: "Confirm Parent" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Confirm Child" });

    await expect(
      requestErasureByAdmin(
        ADMIN_ID,
        { kind: "learner_profile", learnerProfileId: lp.id },
        "WRONG"
      )
    ).rejects.toThrow(ErasureRequestError);

    const jobs = await db.erasureJob.count({
      where: { scopeId: lp.id },
    });
    expect(jobs).toBe(0);

    const profile = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(profile!.tombstonedAt).toBeNull();
  });

  it("accepts exact display name or DELETE", async () => {
    const ah = await createAccountHolder({ displayName: "Delete Family" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Delete Child" });

    const byName = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "Delete Child"
    );
    expect(byName.jobId).toBeTruthy();

    const ah2 = await createAccountHolder({ displayName: "DELETE Family" });
    const byDelete = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "account_holder", accountHolderId: ah2.id },
      "DELETE"
    );
    expect(byDelete.jobId).toBeTruthy();
  });

  it("DELETE confirm against non-existent target throws and creates no job", async () => {
    const missingLpId = "00000000-0000-4000-8000-00000000e5b1";
    const missingAhId = "00000000-0000-4000-8000-00000000e5b2";

    await expect(
      requestErasureByAdmin(
        ADMIN_ID,
        { kind: "learner_profile", learnerProfileId: missingLpId },
        "DELETE"
      )
    ).rejects.toThrow(ErasureRequestError);

    await expect(
      requestErasureByAdmin(
        ADMIN_ID,
        { kind: "account_holder", accountHolderId: missingAhId },
        "DELETE"
      )
    ).rejects.toThrow(ErasureRequestError);

    expect(
      await db.erasureJob.count({
        where: { scopeId: { in: [missingLpId, missingAhId] } },
      })
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Grace + job shape
// ---------------------------------------------------------------------------

describe("job creation shape", () => {
  it("sets status=requested and purgeEligibleAt ≈ now + 7 days", async () => {
    const ah = await createAccountHolder({ displayName: "Grace Parent" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Grace Child" });

    const before = Date.now();
    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "Grace Child"
    );
    const after = Date.now();

    const job = await db.erasureJob.findUnique({ where: { id: jobId } });
    expect(job!.status).toBe("requested");
    expect(job!.requestedByPrincipal).toBe(`admin:${ADMIN_ID}`);

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const eligibleMs = job!.purgeEligibleAt.getTime();
    expect(eligibleMs).toBeGreaterThanOrEqual(before + sevenDaysMs - 5_000);
    expect(eligibleMs).toBeLessThanOrEqual(after + sevenDaysMs + 5_000);
  });
});

// ---------------------------------------------------------------------------
// Full-family ordering
// ---------------------------------------------------------------------------

describe("full-family erasure ordering", () => {
  it("tombstones AH then child LPs, deletes credentials, sweeps family throttles", async () => {
    const familyId = `fam_${uniq()}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder({
      familyId,
      displayName: "Full Family Parent",
    });
    const lp1 = await createLearnerProfile(ah.id, { displayName: "Child One" });
    const lp2 = await createLearnerProfile(ah.id, { displayName: "Child Two" });
    await createLearnerCredential(lp1.id, ah.id, username);
    await createLearnerCredential(lp2.id, ah.id, `other_${username}`);
    await createAccountHolderSession(ah.id);

    const credKey = `${familyId}:${username}`;
    await db.learnerLoginThrottle.create({
      data: { scopeKey: `soft:${credKey}`, kind: "soft", failureCount: 1 },
    });
    await db.learnerLoginThrottle.create({
      data: { scopeKey: `hard:${credKey}`, kind: "hard", failureCount: 13, hardLockedAt: new Date() },
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "account_holder", accountHolderId: ah.id },
      "Full Family Parent"
    );

    const updatedAh = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(updatedAh!.tombstonedAt).not.toBeNull();
    expect(updatedAh!.displayName).toBe("Deleted account");

    for (const lpId of [lp1.id, lp2.id]) {
      const lp = await db.learnerProfile.findUnique({ where: { id: lpId } });
      expect(lp!.tombstonedAt).not.toBeNull();
      expect(lp!.displayName).toBe("Deleted learner");
      const creds = await db.learnerCredential.count({
        where: { learnerProfileId: lpId },
      });
      expect(creds).toBe(0);
    }

    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `soft:${credKey}` } })
    ).toBeNull();
    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `hard:${credKey}` } })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-learner throttle sweep (flag ii)
// ---------------------------------------------------------------------------

describe("per-learner throttle sweep before LP tombstone", () => {
  it("deletes soft/hard throttle rows for the learner username", async () => {
    const familyId = `fam_${uniq()}`;
    const username = `solo_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder({ familyId, displayName: "Solo Parent" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Solo Child" });
    await createLearnerCredential(lp.id, ah.id, username);

    const credKey = `${familyId}:${username}`;
    await db.learnerLoginThrottle.create({
      data: { scopeKey: `soft:${credKey}`, kind: "soft", failureCount: 2 },
    });
    await db.learnerLoginThrottle.create({
      data: { scopeKey: `hard:${credKey}`, kind: "hard", failureCount: 13, hardLockedAt: new Date() },
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "Solo Child"
    );

    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `soft:${credKey}` } })
    ).toBeNull();
    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `hard:${credKey}` } })
    ).toBeNull();

    const updatedAh = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(updatedAh!.tombstonedAt).toBeNull();
    expect(updatedAh!.familyId).toBe(familyId);
  });
});

// ---------------------------------------------------------------------------
// Admin action wrapper — role gate
// ---------------------------------------------------------------------------

describe("requestErasureByAdminAction admin role gate", () => {
  it("rejects non-ADMIN principal without job or tombstone", async () => {
    const tutor = await createAdminUser("TUTOR");
    const ah = await createAccountHolder({ displayName: "Role Parent" });
    const lp = await createLearnerProfile(ah.id, { displayName: "Role Child" });

    jest.resetModules();
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

    const { requestErasureByAdminAction } = await import(
      "@/app/admin/erasure/actions"
    );

    const result = await requestErasureByAdminAction(
      { kind: "learner_profile", learnerProfileId: lp.id },
      "Role Child"
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ADMIN/i);
    }

    expect(
      await db.erasureJob.count({ where: { scopeId: lp.id } })
    ).toBe(0);

    const profile = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(profile!.tombstonedAt).toBeNull();

    void tutor;
  });
});

// ---------------------------------------------------------------------------
// Worker batch + route
// ---------------------------------------------------------------------------

describe("erasure worker batch", () => {
  it("leaves grace-gated requested jobs unchanged", async () => {
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);

    const job = await db.erasureJob.create({
      data: {
        scopeKind: "learner_profile",
        scopeId: lp.id,
        status: "requested",
        requestedByPrincipal: `admin:${ADMIN_ID}`,
        purgeEligibleAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const result = await processErasureBatch();
    expect(result.jobIds).not.toContain(job.id);

    const refreshed = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(refreshed!.status).toBe("requested");
  });

  it("advances eligible requested jobs past grace", async () => {
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);

    const job = await db.erasureJob.create({
      data: {
        scopeKind: "learner_profile",
        scopeId: lp.id,
        status: "requested",
        requestedByPrincipal: `admin:${ADMIN_ID}`,
        purgeEligibleAt: new Date(Date.now() - 60_000),
      },
    });

    const result = await processErasureBatch();
    expect(result.jobIds).toContain(job.id);

    const refreshed = await db.erasureJob.findUnique({ where: { id: job.id } });
    expect(refreshed!.status).toBe("completed");
  });
});

describe("POST /api/internal/erasure/process auth + dispatch", () => {
  const originalErasureSecret = process.env.ERASURE_WORKER_SECRET;
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.ERASURE_WORKER_SECRET = originalErasureSecret;
    process.env.CRON_SECRET = originalCronSecret;
  });

  it("rejects unauthenticated requests", async () => {
    process.env.ERASURE_WORKER_SECRET = "test-erasure-secret";
    process.env.CRON_SECRET = "test-cron-secret";

    const res = await processRouteGet(new Request("http://localhost/api/internal/erasure/process"));
    expect(res.status).toBe(401);
  });

  it("processes batch when ERASURE_WORKER_SECRET bearer matches", async () => {
    process.env.ERASURE_WORKER_SECRET = "test-erasure-secret-e5a";
    process.env.CRON_SECRET = undefined;

    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    await db.erasureJob.create({
      data: {
        scopeKind: "learner_profile",
        scopeId: lp.id,
        status: "requested",
        requestedByPrincipal: `admin:${ADMIN_ID}`,
        purgeEligibleAt: new Date(Date.now() - 60_000),
      },
    });

    const req = new Request("http://localhost/api/internal/erasure/process", {
      headers: { authorization: "Bearer test-erasure-secret-e5a" },
    });
    const res = await processRouteGet(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; processed: number };
    expect(body.ok).toBe(true);
    expect(body.processed).toBeGreaterThanOrEqual(1);
  });

  it("verifyErasureWorkerAuth accepts CRON_SECRET bearer", () => {
    process.env.ERASURE_WORKER_SECRET = undefined;
    process.env.CRON_SECRET = "cron-only-secret";

    const ok = verifyErasureWorkerAuth(
      new Request("http://localhost", {
        headers: { authorization: "Bearer cron-only-secret" },
      })
    );
    expect(ok).toBe(true);
  });
});
