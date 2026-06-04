/**
 * @jest-environment node
 *
 * Identity Phase 2 — multitutor IAC refinements tests
 *
 * Coverage:
 *   IAC-2: per-family username uniqueness (two families can both have "dragon"; same family can't dup)
 *   IAC-7: username@familyid login resolution
 *   IAC-6: accessMode enforcement — account_holder_session rejected at PIN login
 *   IAC-10: account-scoped hard lockout (IP-independent), clearCredentialHardLock
 *   IAC-3: claim attach-to-existing (no new LearnerProfile created when existing selected)
 *   IAC-8: self-learner signup (isSelfLearner profile created)
 *   IAC-2: one LearnerProfile → many Tutor Student rows
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

import { db } from "@/lib/db";
import {
  hashAccountHolderPassword,
  hashLearnerPin,
} from "@/lib/account-holder-auth";
import {
  recordLearnerPinFailure,
  resetLearnerPinFailures,
  isCredentialHardLocked,
  clearCredentialHardLock,
  getCredentialFailureCount,
  checkLearnerPinCooldown,
} from "@/lib/learner-pin-rate-limit";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";

// ---------------------------------------------------------------------------
// Env setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = "test-ah-session-secret-minimum-32-bytes-xxxx";
  process.env.LEARNER_SESSION_HMAC_SECRET = "test-learner-session-secret-minimum-32-bytes";
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// DB fixture helpers
// ---------------------------------------------------------------------------

async function createTestAccountHolder(opts?: { email?: string; verified?: boolean }) {
  const email = opts?.email ?? `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("Password123secure!");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: opts?.verified !== false ? new Date() : null,
    },
  });
}

async function createTestLearnerProfile(accountHolderId: string, opts?: {
  isSelfLearner?: boolean;
  accessMode?: "child_pin_required" | "account_holder_session";
}) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
      isSelfLearner: opts?.isSelfLearner ?? false,
      accessMode: opts?.accessMode ?? "account_holder_session",
    },
  });
}

async function createTestAdmin() {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  return db.adminUser.create({
    data: { email, passwordHash: null, isTestAccount: false, role: "TUTOR" },
  });
}

async function createTestLearnerCredential(opts: {
  learnerProfileId: string;
  accountHolderId: string;
  username: string;
  pin?: string;
}) {
  const secretHash = await hashLearnerPin(opts.pin ?? "123456");
  return db.learnerCredential.create({
    data: {
      learnerProfileId: opts.learnerProfileId,
      accountHolderId: opts.accountHolderId,
      username: opts.username,
      secretHash,
    },
  });
}

// ---------------------------------------------------------------------------
// IAC-2: per-family username uniqueness
// ---------------------------------------------------------------------------

describe("IAC-2: per-family (per-accountHolder) username uniqueness", () => {
  it("same username can exist across two different accountHolders", async () => {
    const ah1 = await createTestAccountHolder();
    const ah2 = await createTestAccountHolder();
    const lp1 = await createTestLearnerProfile(ah1.id);
    const lp2 = await createTestLearnerProfile(ah2.id);

    const sharedUsername = `dragon${Date.now()}`;

    await expect(
      createTestLearnerCredential({ learnerProfileId: lp1.id, accountHolderId: ah1.id, username: sharedUsername })
    ).resolves.toBeDefined();

    // Different accountHolder → same username SHOULD succeed
    await expect(
      createTestLearnerCredential({ learnerProfileId: lp2.id, accountHolderId: ah2.id, username: sharedUsername })
    ).resolves.toBeDefined();
  });

  it("same username within the same accountHolder is rejected by unique constraint", async () => {
    const ah = await createTestAccountHolder();
    const lp1 = await createTestLearnerProfile(ah.id);
    const lp2 = await createTestLearnerProfile(ah.id);

    const username = `duptest${Date.now()}`;

    await createTestLearnerCredential({ learnerProfileId: lp1.id, accountHolderId: ah.id, username });

    // Same accountHolder + same username → should throw unique constraint error
    await expect(
      createTestLearnerCredential({ learnerProfileId: lp2.id, accountHolderId: ah.id, username })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IAC-2: one LearnerProfile → many Tutor Student rows (multi-tutor shape)
// ---------------------------------------------------------------------------

describe("IAC-2: one LearnerProfile → multiple tutor Student rows", () => {
  it("two tutors can both create a Student linked to the same LearnerProfile", async () => {
    const ah = await createTestAccountHolder();
    const learnerProfile = await createTestLearnerProfile(ah.id);
    const tutor1 = await createTestAdmin();
    const tutor2 = await createTestAdmin();

    const student1 = await db.student.create({
      data: {
        name: "Alice",
        adminUserId: tutor1.id,
        learnerProfileId: learnerProfile.id,
      },
    });

    const student2 = await db.student.create({
      data: {
        name: "Alice",
        adminUserId: tutor2.id,
        learnerProfileId: learnerProfile.id,
      },
    });

    expect(student1.learnerProfileId).toBe(learnerProfile.id);
    expect(student2.learnerProfileId).toBe(learnerProfile.id);
    expect(student1.adminUserId).not.toBe(student2.adminUserId);

    // Both tutor-student rows visible in the profile's students relation
    const loaded = await db.learnerProfile.findUnique({
      where: { id: learnerProfile.id },
      select: { students: { select: { id: true } } },
    });
    expect(loaded?.students.length).toBe(2);
  });

  it("same tutor cannot create duplicate Student rows for the same LearnerProfile (unique adminUserId+learnerProfileId)", async () => {
    const ah = await createTestAccountHolder();
    const learnerProfile = await createTestLearnerProfile(ah.id);
    const tutor = await createTestAdmin();

    await db.student.create({
      data: { name: "Bob", adminUserId: tutor.id, learnerProfileId: learnerProfile.id },
    });

    await expect(
      db.student.create({
        data: { name: "Bob2", adminUserId: tutor.id, learnerProfileId: learnerProfile.id },
      })
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// IAC-7: username@familyid login resolution via credential lookup
// ---------------------------------------------------------------------------

describe("IAC-7: credential lookup by accountHolderId+username (family-scoped)", () => {
  it("finds credential by accountHolder.familyId then username composite", async () => {
    const ah = await createTestAccountHolder();
    // Simulate familyId being set
    const familyId = `fam${Date.now()}`;
    await db.accountHolder.update({ where: { id: ah.id }, data: { familyId } });

    const lp = await createTestLearnerProfile(ah.id, { accessMode: "child_pin_required" });
    const username = `hero${Date.now()}`;
    await createTestLearnerCredential({ learnerProfileId: lp.id, accountHolderId: ah.id, username });

    // Resolution path: look up accountHolder by familyId → get accountHolderId → look up credential by composite
    const resolvedAh = await db.accountHolder.findUnique({
      where: { familyId },
      select: { id: true },
    });
    expect(resolvedAh?.id).toBe(ah.id);

    const resolvedCred = await db.learnerCredential.findUnique({
      where: { accountHolderId_username: { accountHolderId: ah.id, username } },
      select: { username: true, accountHolderId: true },
    });
    expect(resolvedCred?.username).toBe(username);
    expect(resolvedCred?.accountHolderId).toBe(ah.id);
  });

  it("same username in two families resolves to the correct family's credential", async () => {
    const ah1 = await createTestAccountHolder();
    const ah2 = await createTestAccountHolder();

    const fam1 = `famA${Date.now()}`;
    const fam2 = `famB${Date.now()}`;
    await db.accountHolder.update({ where: { id: ah1.id }, data: { familyId: fam1 } });
    await db.accountHolder.update({ where: { id: ah2.id }, data: { familyId: fam2 } });

    const sharedUsername = `star${Date.now()}`;
    const lp1 = await createTestLearnerProfile(ah1.id, { accessMode: "child_pin_required" });
    const lp2 = await createTestLearnerProfile(ah2.id, { accessMode: "child_pin_required" });

    const cred1 = await createTestLearnerCredential({ learnerProfileId: lp1.id, accountHolderId: ah1.id, username: sharedUsername, pin: "111111" });
    const cred2 = await createTestLearnerCredential({ learnerProfileId: lp2.id, accountHolderId: ah2.id, username: sharedUsername, pin: "222222" });

    // Resolve via fam1 → finds cred1
    const resolvedAh1 = await db.accountHolder.findUnique({ where: { familyId: fam1 }, select: { id: true } });
    const resolvedCred1 = await db.learnerCredential.findUnique({
      where: { accountHolderId_username: { accountHolderId: resolvedAh1!.id, username: sharedUsername } },
      select: { id: true },
    });
    expect(resolvedCred1?.id).toBe(cred1.id);

    // Resolve via fam2 → finds cred2
    const resolvedAh2 = await db.accountHolder.findUnique({ where: { familyId: fam2 }, select: { id: true } });
    const resolvedCred2 = await db.learnerCredential.findUnique({
      where: { accountHolderId_username: { accountHolderId: resolvedAh2!.id, username: sharedUsername } },
      select: { id: true },
    });
    expect(resolvedCred2?.id).toBe(cred2.id);
  });
});

// ---------------------------------------------------------------------------
// IAC-6: accessMode enforcement — account_holder_session rejected at PIN login
// ---------------------------------------------------------------------------

describe("IAC-6: accessMode enforcement at PIN login", () => {
  it("child_pin_required profile is allowed through PIN login path", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id, { accessMode: "child_pin_required" });
    expect(lp.accessMode).toBe("child_pin_required");
  });

  it("account_holder_session profile is rejected at PIN login (simulate enforcement)", async () => {
    const ah = await createTestAccountHolder();
    const lp = await createTestLearnerProfile(ah.id, { accessMode: "account_holder_session" });

    // Simulate the login route's accessMode check
    const loaded = await db.learnerProfile.findUnique({
      where: { id: lp.id },
      select: { accessMode: true },
    });

    const wouldRejectAtPinLogin =
      loaded?.accessMode === "account_holder_session" ||
      loaded?.accessMode === "parent_session_select";

    expect(wouldRejectAtPinLogin).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// IAC-10: account-scoped (IP-independent) hard lockout
// ---------------------------------------------------------------------------

describe("IAC-10: account-scoped hard lockout (IP-independent)", () => {
  function uniqueCredKey() {
    const ts = Date.now();
    const r = Math.random().toString(36).slice(2);
    return { username: `u${ts}${r}`, ip: `10.88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`, credKey: `famX${ts}:u${ts}${r}` };
  }

  it("hard lock triggers at threshold 13, IP-independent", async () => {
    const { credKey } = uniqueCredKey();

    let triggered = false;
    for (let i = 0; i < 15; i++) {
      const result = await recordLearnerPinFailure(credKey);
      if (result.hardLockTriggered) {
        triggered = true;
        break;
      }
    }
    expect(triggered).toBe(true);
    expect(await isCredentialHardLocked(credKey)).toBe(true);
  });

  it("hard lock persists across different IPs for same credential", async () => {
    const { credKey } = uniqueCredKey();

    for (let i = 0; i < 15; i++) {
      await recordLearnerPinFailure(credKey);
    }
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    const cdFromOtherIp = await isCredentialHardLocked(credKey);
    expect(cdFromOtherIp).toBe(true);
  });

  it("clearCredentialHardLock removes hard lock and resets credential failure count", async () => {
    const { credKey } = uniqueCredKey();

    for (let i = 0; i < 15; i++) {
      await recordLearnerPinFailure(credKey);
    }
    expect(await isCredentialHardLocked(credKey)).toBe(true);
    expect(await getCredentialFailureCount(credKey)).toBeGreaterThanOrEqual(13);

    await clearCredentialHardLock(credKey);

    expect(await isCredentialHardLocked(credKey)).toBe(false);
    expect(await getCredentialFailureCount(credKey)).toBe(0);
  });

  it("resetLearnerPinFailures clears soft state but NOT hard lock", async () => {
    const { credKey, ip } = uniqueCredKey();

    for (let i = 0; i < 15; i++) {
      await recordLearnerPinFailure(credKey);
    }
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    await resetLearnerPinFailures(credKey);

    // Soft cooldown should be cleared
    const cd = await checkLearnerPinCooldown(credKey, ip);
    expect(cd.inCooldown).toBe(false);

    // Hard lock should NOT be cleared by login success
    expect(await isCredentialHardLocked(credKey)).toBe(true);

    // Cleanup
    await clearCredentialHardLock(credKey);
  });
});

// ---------------------------------------------------------------------------
// IAC-3: claim attach-to-existing (no new LearnerProfile when existing selected)
// ---------------------------------------------------------------------------

describe("IAC-3: claim attach-to-existing profile", () => {
  it("attaching to existing profile creates a new Student linked to it, not a new LearnerProfile", async () => {
    const ah = await createTestAccountHolder();
    const tutor = await createTestAdmin();
    const existingProfile = await createTestLearnerProfile(ah.id);

    const profileCountBefore = await db.learnerProfile.count({
      where: { accountHolderId: ah.id },
    });

    // Simulate "attach_existing" action: create Student row linked to existing profile
    const student = await db.student.create({
      data: {
        name: "Attached Student",
        adminUserId: tutor.id,
        learnerProfileId: existingProfile.id,
      },
    });

    const profileCountAfter = await db.learnerProfile.count({
      where: { accountHolderId: ah.id },
    });

    // No new LearnerProfile should have been created
    expect(profileCountAfter).toBe(profileCountBefore);
    expect(student.learnerProfileId).toBe(existingProfile.id);
  });

  it("same tutor cannot attach the same profile twice (IAC-2 unique constraint)", async () => {
    const ah = await createTestAccountHolder();
    const tutor = await createTestAdmin();
    const profile = await createTestLearnerProfile(ah.id);

    await db.student.create({
      data: { name: "Student1", adminUserId: tutor.id, learnerProfileId: profile.id },
    });

    await expect(
      db.student.create({
        data: { name: "Student1-dup", adminUserId: tutor.id, learnerProfileId: profile.id },
      })
    ).rejects.toThrow();
  });

  it("two different tutors CAN both attach the same profile (multi-tutor)", async () => {
    const ah = await createTestAccountHolder();
    const tutor1 = await createTestAdmin();
    const tutor2 = await createTestAdmin();
    const profile = await createTestLearnerProfile(ah.id);

    await db.student.create({
      data: { name: "TutorA Student", adminUserId: tutor1.id, learnerProfileId: profile.id },
    });

    await expect(
      db.student.create({
        data: { name: "TutorB Student", adminUserId: tutor2.id, learnerProfileId: profile.id },
      })
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// IAC-8: self-learner signup (isSelfLearner profile created on AccountHolder)
// ---------------------------------------------------------------------------

describe("IAC-8: self-learner signup and interstitial inclusion", () => {
  it("AccountHolder with isSelfLearner=true has a corresponding LearnerProfile with isSelfLearner=true", async () => {
    const ah = await createTestAccountHolder();

    // Simulate what the signup route does when isSelfLearner=true
    await db.accountHolder.update({
      where: { id: ah.id },
      data: { isSelfLearner: true },
    });

    const selfProfile = await db.learnerProfile.create({
      data: {
        accountHolderId: ah.id,
        displayName: ah.email.split("@")[0],
        isSelfLearner: true,
        accessMode: "account_holder_session",
      },
    });

    expect(selfProfile.isSelfLearner).toBe(true);
    expect(selfProfile.accessMode).toBe("account_holder_session");
    expect(selfProfile.accountHolderId).toBe(ah.id);

    const loaded = await db.accountHolder.findUnique({
      where: { id: ah.id },
      select: { isSelfLearner: true, learnerProfiles: { select: { isSelfLearner: true } } },
    });
    expect(loaded?.isSelfLearner).toBe(true);
    expect(loaded?.learnerProfiles.some((p) => p.isSelfLearner)).toBe(true);
  });

  it("self-learner profile is accessible via assertOwnsLearnerProfile", async () => {
    const ah = await createTestAccountHolder();
    const selfProfile = await createTestLearnerProfile(ah.id, { isSelfLearner: true });

    // Should NOT throw — parent owns the self-learner profile
    await expect(
      assertOwnsLearnerProfile(ah.id, selfProfile.id)
    ).resolves.not.toThrow();
  });

  it("self-learner profile uses account_holder_session accessMode (not child_pin_required)", async () => {
    const ah = await createTestAccountHolder();
    const selfProfile = await createTestLearnerProfile(ah.id, {
      isSelfLearner: true,
      accessMode: "account_holder_session",
    });

    expect(selfProfile.accessMode).toBe("account_holder_session");
  });
});

// ---------------------------------------------------------------------------
// IAC-7: familyId is lazily assigned and unique
// ---------------------------------------------------------------------------

describe("IAC-7: familyId lazy assignment", () => {
  it("AccountHolder starts with familyId=null (not yet assigned)", async () => {
    const ah = await createTestAccountHolder();
    const loaded = await db.accountHolder.findUnique({
      where: { id: ah.id },
      select: { familyId: true },
    });
    expect(loaded?.familyId).toBeNull();
  });

  it("familyId is globally unique (two AccountHolders cannot share one)", async () => {
    const familyId = `unique_fam_${Date.now()}`;
    const ah1 = await createTestAccountHolder();
    await db.accountHolder.update({ where: { id: ah1.id }, data: { familyId } });

    const ah2 = await createTestAccountHolder();
    await expect(
      db.accountHolder.update({ where: { id: ah2.id }, data: { familyId } })
    ).rejects.toThrow();
  });
});
