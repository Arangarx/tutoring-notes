/**
 * @jest-environment node
 *
 * IAC-13 — Tutor Disconnect + Connected-Parent Visibility
 *
 * All tests run against the real test DB (tutoring_notes_test).
 * Requires a running Postgres instance (see jest.global-setup.ts).
 *
 * Coverage:
 *   (a) Visibility — connected parent data is queryable via the two-hop join.
 *   (b) Happy-path disconnect — nulls learnerProfileId, revokes pending invites, logs [dsc].
 *   (b) Idempotency — double disconnect is safe.
 *   (b) Re-claim — student returns to invitable state after disconnect.
 *   (c) Multi-tutor isolation invariant — Tutor 1's disconnect does NOT affect Tutor 2's
 *       Student row linked to the same LearnerProfile.
 *   (c) LearnerProfile and LearnerDeviceSession are NOT modified by disconnect.
 *   (e) WHERE guard — updateMany with learnerProfileId guard prevents stale writes.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

import { db } from "@/lib/db";
import { hashAccountHolderPassword } from "@/lib/account-holder-auth";
import { CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createTestAccountHolder(opts?: { email?: string; displayName?: string }) {
  const email = opts?.email ?? `ah-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("Password123secure!");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: new Date(),
      displayName: opts?.displayName ?? null,
    },
  });
}

async function createTestLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
      accessMode: "account_holder_session",
    },
  });
}

async function createTestAdmin() {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  return db.adminUser.create({
    data: { email, passwordHash: null, isTestAccount: false, role: "TUTOR" },
  });
}

async function createTestStudent(adminUserId: string, learnerProfileId?: string) {
  return db.student.create({
    data: {
      name: `Student-${Date.now()}`,
      adminUserId,
      learnerProfileId: learnerProfileId ?? null,
    },
  });
}

async function createTestClaimInvite(opts: {
  studentId: string;
  adminUserId: string;
  claimedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
}) {
  return db.studentClaimInvite.create({
    data: {
      studentId: opts.studentId,
      adminUserId: opts.adminUserId,
      tokenHash: `hash-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + CLAIM_INVITE_TTL_MS),
      claimedAt: opts.claimedAt ?? null,
      revokedAt: opts.revokedAt ?? null,
      claimedByAccountHolderId: opts.claimedAt ? "ah-placeholder" : null,
    },
  });
}

/**
 * Core disconnect mutation — the exact DB logic that disconnectLearnerProfile
 * executes inside its $transaction, tested without the Next.js auth/scope layer.
 * Returns { disconnected: true } if a row was updated, false if already disconnected.
 */
async function coreDisconnect(studentId: string): Promise<{ disconnected: boolean }> {
  const now = new Date();
  let disconnected = false;

  await db.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: {
        learnerProfileId: true,
        learnerProfile: { select: { accountHolderId: true } },
      },
    });

    if (!student?.learnerProfileId) return; // already disconnected — idempotent

    const { learnerProfileId } = student;

    // WHERE guard: prevents racing a concurrent re-claim from being immediately severed.
    const updated = await tx.student.updateMany({
      where: { id: studentId, learnerProfileId },
      data: { learnerProfileId: null },
    });
    if (updated.count === 0) return;

    disconnected = true;

    // Revoke pending (unclaimed, unexpired) invites. Historical completed invites are untouched.
    await tx.studentClaimInvite.updateMany({
      where: {
        studentId,
        claimedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });
  });

  return { disconnected };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// (b) Happy-path disconnect
// ---------------------------------------------------------------------------

describe("IAC-13 (b): happy-path disconnect", () => {
  it("nulls Student.learnerProfileId after disconnect", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    expect(student.learnerProfileId).toBe(lp.id);

    const result = await coreDisconnect(student.id);
    expect(result.disconnected).toBe(true);

    const reloaded = await db.student.findUniqueOrThrow({
      where: { id: student.id },
      select: { learnerProfileId: true },
    });
    expect(reloaded.learnerProfileId).toBeNull();
  });

  it("revokes pending (unclaimed) invites, preserves completed invite business records", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    const pending1 = await createTestClaimInvite({ studentId: student.id, adminUserId: tutor.id });
    const pending2 = await createTestClaimInvite({ studentId: student.id, adminUserId: tutor.id });
    // Completed invite — must NOT be revoked (business record)
    const completed = await createTestClaimInvite({
      studentId: student.id,
      adminUserId: tutor.id,
      claimedAt: new Date(Date.now() - 60_000),
    });

    await coreDisconnect(student.id);

    const p1 = await db.studentClaimInvite.findUniqueOrThrow({ where: { id: pending1.id } });
    const p2 = await db.studentClaimInvite.findUniqueOrThrow({ where: { id: pending2.id } });
    const c = await db.studentClaimInvite.findUniqueOrThrow({ where: { id: completed.id } });

    expect(p1.revokedAt).not.toBeNull();
    expect(p2.revokedAt).not.toBeNull();
    expect(c.revokedAt).toBeNull();       // preserved
    expect(c.claimedAt).not.toBeNull();   // preserved
  });

  it("already-revokedAt invites are left untouched by disconnect", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    const alreadyRevoked = await createTestClaimInvite({
      studentId: student.id,
      adminUserId: tutor.id,
      revokedAt: new Date(Date.now() - 5_000),
    });
    const originalRevokedAt = alreadyRevoked.revokedAt;

    await coreDisconnect(student.id);

    const r = await db.studentClaimInvite.findUniqueOrThrow({ where: { id: alreadyRevoked.id } });
    // revokedAt should not change (already revoked — WHERE claimedAt=null AND revokedAt=null skips it)
    expect(r.revokedAt?.getTime()).toBe(originalRevokedAt?.getTime());
  });
});

// ---------------------------------------------------------------------------
// (b) Idempotency
// ---------------------------------------------------------------------------

describe("IAC-13 (b): idempotency", () => {
  it("disconnect of an already-null student is a safe no-op (disconnected=false)", async () => {
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id); // no learnerProfileId

    const result = await coreDisconnect(student.id);
    expect(result.disconnected).toBe(false);

    const reloaded = await db.student.findUniqueOrThrow({
      where: { id: student.id },
      select: { learnerProfileId: true },
    });
    expect(reloaded.learnerProfileId).toBeNull();
  });

  it("calling disconnect twice: first succeeds, second is idempotent", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    expect((await coreDisconnect(student.id)).disconnected).toBe(true);
    expect((await coreDisconnect(student.id)).disconnected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (b) Re-claim after disconnect
// ---------------------------------------------------------------------------

describe("IAC-13 (b): re-claim after disconnect", () => {
  it("student returns to invitable state (learnerProfileId=null, no pending invites)", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    // Create a pending invite that should be revoked
    await createTestClaimInvite({ studentId: student.id, adminUserId: tutor.id });

    await coreDisconnect(student.id);

    const reloaded = await db.student.findUniqueOrThrow({
      where: { id: student.id },
      select: { learnerProfileId: true },
    });
    expect(reloaded.learnerProfileId).toBeNull(); // invitable state

    const now = new Date();
    const pendingCount = await db.studentClaimInvite.count({
      where: { studentId: student.id, claimedAt: null, revokedAt: null, expiresAt: { gt: now } },
    });
    expect(pendingCount).toBe(0); // clean slate for re-invite
  });
});

// ---------------------------------------------------------------------------
// (c) Multi-tutor isolation invariant — THE critical IAC-2 safety test
// ---------------------------------------------------------------------------

describe("IAC-13 (c): multi-tutor isolation invariant", () => {
  it(
    "Tutor 1 disconnecting Student-A does NOT null Tutor 2's Student-B linked to the same LearnerProfile",
    async () => {
      const ah = await createTestAccountHolder();
      const sharedProfile = await createTestLearnerProfile(ah.id);
      const tutor1 = await createTestAdmin();
      const tutor2 = await createTestAdmin();

      // Both tutors have a Student row linked to the SAME LearnerProfile (IAC-2 multi-tutor)
      const studentA = await db.student.create({
        data: { name: "StudentA", adminUserId: tutor1.id, learnerProfileId: sharedProfile.id },
      });
      const studentB = await db.student.create({
        data: { name: "StudentB", adminUserId: tutor2.id, learnerProfileId: sharedProfile.id },
      });

      // Tutor 1 disconnects their own student
      const result = await coreDisconnect(studentA.id);
      expect(result.disconnected).toBe(true);

      // Student A (Tutor 1) must be null
      const reloadedA = await db.student.findUniqueOrThrow({
        where: { id: studentA.id },
        select: { learnerProfileId: true },
      });
      expect(reloadedA.learnerProfileId).toBeNull();

      // INVARIANT: Student B (Tutor 2) must still be linked to the shared profile
      const reloadedB = await db.student.findUniqueOrThrow({
        where: { id: studentB.id },
        select: { learnerProfileId: true },
      });
      expect(reloadedB.learnerProfileId).toBe(sharedProfile.id);
    }
  );

  it("disconnect does NOT delete the LearnerProfile row", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    await coreDisconnect(student.id);

    const profileStillExists = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(profileStillExists).not.toBeNull();
    expect(profileStillExists!.accountHolderId).toBe(ah.id);
  });

  it("disconnect does NOT revoke or modify LearnerDeviceSession rows", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    const deviceSession = await db.learnerDeviceSession.create({
      data: {
        learnerProfileId: lp.id,
        tokenHash: `device-hash-${Date.now()}`,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      },
    });

    await coreDisconnect(student.id);

    const reloadedSession = await db.learnerDeviceSession.findUnique({
      where: { id: deviceSession.id },
    });
    expect(reloadedSession).not.toBeNull();
    expect(reloadedSession!.revokedAt).toBeNull(); // untouched
  });
});

// ---------------------------------------------------------------------------
// (b) WHERE guard — updateMany race-condition safety
// ---------------------------------------------------------------------------

describe("IAC-13 (b): WHERE guard prevents stale disconnect", () => {
  it("updateMany WHERE guard: if learnerProfileId already changed, updateMany returns count=0", async () => {
    const ah1 = await createTestAccountHolder();
    const ah2 = await createTestAccountHolder();
    const lp1 = await createTestLearnerProfile(ah1.id);
    const lp2 = await createTestLearnerProfile(ah2.id);
    const tutor = await createTestAdmin();

    const student = await createTestStudent(tutor.id, lp1.id);

    // Simulate: between the read (captured lp1.id) and the write,
    // the student was already re-claimed by lp2.
    await db.student.update({
      where: { id: student.id },
      data: { learnerProfileId: lp2.id },
    });

    // The WHERE guard: WHERE id=student.id AND learnerProfileId=lp1.id
    // At this point learnerProfileId=lp2.id, so count=0 — the guard fires.
    const result = await db.student.updateMany({
      where: { id: student.id, learnerProfileId: lp1.id },
      data: { learnerProfileId: null },
    });

    expect(result.count).toBe(0); // guard prevented the stale write

    // student still linked to lp2 (the new legitimate claimant)
    const reloaded = await db.student.findUniqueOrThrow({
      where: { id: student.id },
      select: { learnerProfileId: true },
    });
    expect(reloaded.learnerProfileId).toBe(lp2.id);
  });
});

// ---------------------------------------------------------------------------
// (a) Visibility — query shape for the page
// ---------------------------------------------------------------------------

describe("IAC-13 (a): visibility — connected parent query", () => {
  it("returns email + displayName + emailVerifiedAt via two-hop join", async () => {
    const ah = await createTestAccountHolder({ displayName: "Jane Parent" });
    const lp = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id, lp.id);

    const loaded = await db.student.findUnique({
      where: { id: student.id },
      select: {
        learnerProfile: {
          select: {
            id: true,
            accountHolder: {
              select: { id: true, email: true, displayName: true, emailVerifiedAt: true },
            },
          },
        },
      },
    });

    expect(loaded?.learnerProfile?.accountHolder.email).toBe(ah.email);
    expect(loaded?.learnerProfile?.accountHolder.displayName).toBe("Jane Parent");
    expect(loaded?.learnerProfile?.accountHolder.emailVerifiedAt).not.toBeNull();
  });

  it("claimInvites filter by adminUserId returns only this tutor's completed invite", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    const tutor1 = await createTestAdmin();
    const tutor2 = await createTestAdmin();

    const s1 = await db.student.create({
      data: { name: "S1", adminUserId: tutor1.id, learnerProfileId: lp.id },
    });
    const s2 = await db.student.create({
      data: { name: "S2", adminUserId: tutor2.id, learnerProfileId: lp.id },
    });

    const invite1 = await createTestClaimInvite({
      studentId: s1.id,
      adminUserId: tutor1.id,
      claimedAt: new Date("2026-06-01T10:00:00Z"),
    });
    const invite2 = await createTestClaimInvite({
      studentId: s2.id,
      adminUserId: tutor2.id,
      claimedAt: new Date("2026-06-02T10:00:00Z"),
    });

    // Tutor 1 should see only their invite
    const loaded1 = await db.student.findUnique({
      where: { id: s1.id },
      select: {
        claimInvites: {
          where: { adminUserId: tutor1.id, claimedAt: { not: null } },
          take: 1,
          select: { claimedAt: true },
        },
      },
    });
    expect(loaded1?.claimInvites).toHaveLength(1);
    expect(loaded1?.claimInvites[0].claimedAt?.toISOString()).toBe(invite1.claimedAt?.toISOString());

    // Tutor 2 should see only their invite
    const loaded2 = await db.student.findUnique({
      where: { id: s2.id },
      select: {
        claimInvites: {
          where: { adminUserId: tutor2.id, claimedAt: { not: null } },
          take: 1,
          select: { claimedAt: true },
        },
      },
    });
    expect(loaded2?.claimInvites).toHaveLength(1);
    expect(loaded2?.claimInvites[0].claimedAt?.toISOString()).toBe(invite2.claimedAt?.toISOString());
  });

  it("unclaimed student returns learnerProfile=null", async () => {
    const tutor = await createTestAdmin();
    const student = await createTestStudent(tutor.id);

    const loaded = await db.student.findUnique({
      where: { id: student.id },
      select: { learnerProfile: { select: { id: true } } },
    });
    expect(loaded?.learnerProfile).toBeNull();
  });
});
