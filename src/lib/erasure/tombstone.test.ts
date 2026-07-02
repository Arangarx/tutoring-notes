/**
 * @jest-environment node
 *
 * E2 erasure tombstone primitives — unit/integration tests.
 *
 * Coverage:
 *   T-new-H (B-7) — PasswordResetToken swept by original email before AH redaction
 *   AH post-state — redacted email, null passwordHash, sessions revoked, throttles swept
 *   LP post-state — redacted displayName, credential deleted, device sessions revoked
 *   Idempotency — second call does not throw; end-state unchanged
 *   Read-gate — assertOwnsLearnerProfile denies tombstoned profile
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

import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import {
  createAccountHolderSession,
  revokeAllAccountHolderSessions,
} from "@/lib/account-holder-session";
import { createLearnerSession } from "@/lib/learner-session";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import {
  generateRawResetToken,
  hashResetToken,
} from "@/lib/password-reset";
import { generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import {
  tombstoneAccountHolder,
  tombstoneLearnerProfile,
} from "@/lib/erasure/tombstone";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";
const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createTestAccountHolder(opts?: {
  email?: string;
  familyId?: string | null;
}) {
  const email =
    opts?.email ??
    `ers-ah-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      displayName: "Parent Test",
      emailVerifiedAt: new Date(),
      familyId: opts?.familyId ?? null,
    },
  });
}

async function createTestLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Child Test",
      accessMode: "child_pin_required",
    },
  });
}

async function createTestLearnerCredential(
  learnerProfileId: string,
  accountHolderId: string,
  username: string
) {
  const secretHash = await hashLearnerPin("123456");
  return db.learnerCredential.create({
    data: { learnerProfileId, accountHolderId, username, secretHash },
  });
}

async function createTestLearnerDeviceSession(learnerProfileId: string) {
  return db.learnerDeviceSession.create({
    data: {
      learnerProfileId,
      tokenHash: hashToken(generateRawToken()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
}

async function runInTransaction<T>(fn: (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => Promise<T>): Promise<T> {
  return db.$transaction(fn);
}

// ---------------------------------------------------------------------------
// not_found — must throw (BLOCKER I)
// ---------------------------------------------------------------------------

describe("tombstone not_found", () => {
  it("tombstoneAccountHolder throws ErasureTombstoneTargetNotFound for missing id", async () => {
    const missingId = "00000000-0000-4000-8000-00000000dead";

    await expect(
      runInTransaction(async (tx) => {
        await tombstoneAccountHolder(tx, missingId);
      })
    ).rejects.toThrow(`ErasureTombstoneTargetNotFound: account_holder ${missingId}`);
  });

  it("tombstoneLearnerProfile throws ErasureTombstoneTargetNotFound for missing id", async () => {
    const missingId = "00000000-0000-4000-8000-00000000beef";

    await expect(
      runInTransaction(async (tx) => {
        await tombstoneLearnerProfile(tx, missingId);
      })
    ).rejects.toThrow(`ErasureTombstoneTargetNotFound: learner_profile ${missingId}`);
  });
});

// ---------------------------------------------------------------------------
// T-new-H (B-7): PasswordResetToken deleted by original email before redaction
// ---------------------------------------------------------------------------

describe("T-new-H (B-7): PasswordResetToken sweep ordering", () => {
  it("deletes PasswordResetToken keyed by original email; token would survive if redaction ran first", async () => {
    const originalEmail = `ers-b7-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const ah = await createTestAccountHolder({ email: originalEmail });
    await createAccountHolderSession(ah.id);

    const rawToken = generateRawResetToken();
    await db.passwordResetToken.create({
      data: {
        email: originalEmail.trim().toLowerCase(),
        tokenHash: hashResetToken(rawToken),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await runInTransaction(async (tx) => {
      await tombstoneAccountHolder(tx, ah.id);
    });

    const remainingTokens = await db.passwordResetToken.findMany({
      where: { email: originalEmail.trim().toLowerCase() },
    });
    expect(remainingTokens).toHaveLength(0);

    const updatedAh = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(updatedAh!.email).toMatch(/@erased\.invalid$/);
    expect(updatedAh!.email).not.toBe(originalEmail);
  });

  it("sweeps AuthThrottle ah-login row and LearnerLoginThrottle soft/hard rows before redaction", async () => {
    const originalEmail = `ers-throttle-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const familyId = `fam_ers_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;

    const ah = await createTestAccountHolder({ email: originalEmail, familyId });
    const lp = await createTestLearnerProfile(ah.id);
    await createTestLearnerCredential(lp.id, ah.id, username);

    const normalizedEmail = originalEmail.trim().toLowerCase();
    const credKey = `${familyId}:${username}`;

    await db.authThrottle.create({
      data: {
        scopeKey: `ah-login:${normalizedEmail}`,
        kind: "ah-login",
        requestCount: 3,
        windowResetAt: new Date(Date.now() + 60_000),
      },
    });
    await db.learnerLoginThrottle.create({
      data: {
        scopeKey: `soft:${credKey}`,
        kind: "soft",
        failureCount: 2,
      },
    });
    await db.learnerLoginThrottle.create({
      data: {
        scopeKey: `hard:${credKey}`,
        kind: "hard",
        failureCount: 13,
        hardLockedAt: new Date(),
      },
    });

    await runInTransaction(async (tx) => {
      await tombstoneAccountHolder(tx, ah.id);
    });

    expect(
      await db.authThrottle.findUnique({ where: { scopeKey: `ah-login:${normalizedEmail}` } })
    ).toBeNull();
    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `soft:${credKey}` } })
    ).toBeNull();
    expect(
      await db.learnerLoginThrottle.findUnique({ where: { scopeKey: `hard:${credKey}` } })
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AccountHolder post-state
// ---------------------------------------------------------------------------

describe("tombstoneAccountHolder post-state", () => {
  it("redacts AH fields and revokes all active sessions", async () => {
    const ah = await createTestAccountHolder({ familyId: `fam_${Date.now()}` });
    const s1 = await createAccountHolderSession(ah.id);
    const s2 = await createAccountHolderSession(ah.id);

    await runInTransaction(async (tx) => {
      await tombstoneAccountHolder(tx, ah.id);
    });

    const updated = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(updated!.email).toMatch(/@erased\.invalid$/);
    expect(updated!.passwordHash).toBeNull();
    expect(updated!.displayName).toBe("Deleted account");
    expect(updated!.familyId).toBeNull();
    expect(updated!.tombstonedAt).not.toBeNull();

    const row1 = await db.accountHolderSession.findUnique({ where: { id: s1.sessionId } });
    const row2 = await db.accountHolderSession.findUnique({ where: { id: s2.sessionId } });
    expect(row1!.revokedAt).not.toBeNull();
    expect(row2!.revokedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// LearnerProfile post-state
// ---------------------------------------------------------------------------

describe("tombstoneLearnerProfile post-state", () => {
  it("redacts LP, deletes credential, and revokes device sessions", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    await createTestLearnerCredential(lp.id, ah.id, `u_${Math.random().toString(36).slice(2, 8)}`);
    const ds1 = await createTestLearnerDeviceSession(lp.id);
    const ds2 = await createTestLearnerDeviceSession(lp.id);

    const { rawToken } = await createLearnerSession(lp.id, null);
    expect(rawToken).toBeDefined();

    await runInTransaction(async (tx) => {
      await tombstoneLearnerProfile(tx, lp.id);
    });

    const updated = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(updated!.displayName).toBe("Deleted learner");
    expect(updated!.tombstonedAt).not.toBeNull();

    const credCount = await db.learnerCredential.count({
      where: { learnerProfileId: lp.id },
    });
    expect(credCount).toBe(0);

    const dsRow1 = await db.learnerDeviceSession.findUnique({ where: { id: ds1.id } });
    const dsRow2 = await db.learnerDeviceSession.findUnique({ where: { id: ds2.id } });
    expect(dsRow1!.revokedAt).not.toBeNull();
    expect(dsRow2!.revokedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("tombstone idempotency", () => {
  it("tombstoneAccountHolder: second call does not throw and preserves end-state", async () => {
    const ah = await createTestAccountHolder();
    await createAccountHolderSession(ah.id);

    await runInTransaction(async (tx) => {
      await tombstoneAccountHolder(tx, ah.id);
    });
    const afterFirst = await db.accountHolder.findUnique({ where: { id: ah.id } });

    await expect(
      runInTransaction(async (tx) => {
        await tombstoneAccountHolder(tx, ah.id);
      })
    ).resolves.toBeUndefined();

    const afterSecond = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(afterSecond!.email).toBe(afterFirst!.email);
    expect(afterSecond!.displayName).toBe("Deleted account");
    expect(afterSecond!.tombstonedAt).not.toBeNull();
  });

  it("tombstoneLearnerProfile: second call does not throw and preserves end-state", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);
    await createTestLearnerCredential(lp.id, ah.id, `u_${Math.random().toString(36).slice(2, 8)}`);

    await runInTransaction(async (tx) => {
      await tombstoneLearnerProfile(tx, lp.id);
    });
    const afterFirst = await db.learnerProfile.findUnique({ where: { id: lp.id } });

    await expect(
      runInTransaction(async (tx) => {
        await tombstoneLearnerProfile(tx, lp.id);
      })
    ).resolves.toBeUndefined();

    const afterSecond = await db.learnerProfile.findUnique({ where: { id: lp.id } });
    expect(afterSecond!.displayName).toBe(afterFirst!.displayName);
    expect(afterSecond!.tombstonedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Read-gate spot-check (test 8)
// ---------------------------------------------------------------------------

describe("tombstone read-gate", () => {
  it("assertOwnsLearnerProfile denies access to tombstoned profile", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id);

    await runInTransaction(async (tx) => {
      await tombstoneLearnerProfile(tx, lp.id);
    });

    await expect(assertOwnsLearnerProfile(ah.id, lp.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Tx-aware session helpers (backward compat)
// ---------------------------------------------------------------------------

describe("revokeAllAccountHolderSessions tx-awareness", () => {
  it("default client revokes sessions outside a transaction (existing callers unaffected)", async () => {
    const ah = await createTestAccountHolder();
    await createAccountHolderSession(ah.id);
    const count = await revokeAllAccountHolderSessions(ah.id);
    expect(count).toBe(1);
  });
});
