import {
  type APIRequestContext,
  type APIResponse,
  expect,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { seedParentAccountHolder, TEST_PARENT } from "./identity.helpers";

const { assertLocalDatabaseUrlForHarness } = require("../../../scripts/wb-regression-local-db.cjs");

/** Matches `HARD_LOCK_THRESHOLD` in `src/lib/learner-pin-rate-limit.ts`. */
export const HARD_LOCK_THRESHOLD = 13;

export const WRONG_PIN = "000000";

/** Stable family id for learners owned by TEST_PARENT (parent storageState). */
export const PARENT_LOCKOUT_FAMILY_ID = "pwparentlockfam";

export type PinLockoutFixture = {
  accountHolderId: string;
  learnerProfileId: string;
  familyId: string;
  username: string;
  pin: string;
  handle: string;
  credKey: string;
};

function uniqSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a fresh child_pin_required learner with PIN credentials.
 * Default: isolated parent + family (safe for API-only lockout tests).
 */
export async function seedPinLockoutLearner(opts?: {
  accountHolderId?: string;
  familyId?: string;
}): Promise<PinLockoutFixture> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  const suffix = uniqSuffix();
  const pin = "LockPw!1";

  try {
    let accountHolderId = opts?.accountHolderId;
    let familyId = opts?.familyId;

    if (!accountHolderId) {
      familyId = familyId ?? `pwlckfam${suffix}`;
      const ah = await prisma.accountHolder.create({
        data: {
          email: `pw-lockout-parent-${suffix}@test.local`,
          displayName: "Lockout Test Parent",
          familyId,
          emailVerifiedAt: new Date("2026-01-01"),
        },
        select: { id: true, familyId: true },
      });
      accountHolderId = ah.id;
      familyId = ah.familyId!;
    } else {
      if (!familyId) {
        const ah = await prisma.accountHolder.findUnique({
          where: { id: accountHolderId },
          select: { familyId: true },
        });
        if (!ah?.familyId) {
          familyId = PARENT_LOCKOUT_FAMILY_ID;
          await prisma.accountHolder.update({
            where: { id: accountHolderId },
            data: { familyId },
          });
        } else {
          familyId = ah.familyId;
        }
      }
    }

    const username = `pwlcku${suffix}`;
    const pinHash = await bcrypt.hash(pin, 10);
    const profile = await prisma.learnerProfile.create({
      data: {
        accountHolderId,
        displayName: `Lockout Child ${suffix}`,
        accessMode: "child_pin_required",
      },
      select: { id: true },
    });
    await prisma.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId,
        username,
        secretHash: pinHash,
      },
    });

    const credKey = `${familyId}:${username}`;
    return {
      accountHolderId,
      learnerProfileId: profile.id,
      familyId: familyId!,
      username,
      pin,
      handle: `${username}@${familyId}`,
      credKey,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/** Learner under TEST_PARENT — for parent unlock UI (identity-e2e parent storageState). */
export async function seedParentOwnedPinLockoutLearner(): Promise<PinLockoutFixture> {
  const accountHolderId = await seedParentAccountHolder();
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.accountHolder.update({
      where: { id: accountHolderId },
      data: { familyId: PARENT_LOCKOUT_FAMILY_ID },
    });
  } finally {
    await prisma.$disconnect();
  }
  return seedPinLockoutLearner({
    accountHolderId,
    familyId: PARENT_LOCKOUT_FAMILY_ID,
  });
}

/** Remove soft + hard throttle rows for a credential handle (`familyId:username`). */
export async function resetLearnerThrottle(credKey: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.learnerLoginThrottle.deleteMany({
      where: {
        OR: [
          { scopeKey: `soft:${credKey}` },
          { scopeKey: `hard:${credKey}` },
        ],
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/** Independent DB oracle — durable hard lock row in LearnerLoginThrottle. */
export async function readHardLockOracle(credKey: string): Promise<boolean> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    const row = await prisma.learnerLoginThrottle.findUnique({
      where: { scopeKey: `hard:${credKey}` },
      select: { hardLockedAt: true },
    });
    return row?.hardLockedAt != null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Test harness: clear soft cooldown without resetting failure count so we can
 * drive 13 real HTTP failures without waiting through 30s/5m/15m soft tiers.
 */
export async function clearSoftCooldownForCredKey(credKey: string): Promise<void> {
  assertLocalDatabaseUrlForHarness();
  const prisma = new PrismaClient();
  try {
    await prisma.learnerLoginThrottle.updateMany({
      where: { scopeKey: `soft:${credKey}` },
      data: { cooldownUntil: null },
    });
  } finally {
    await prisma.$disconnect();
  }
}

export async function postLearnerLogin(
  request: APIRequestContext,
  handle: string,
  pin: string
): Promise<APIResponse> {
  return request.post("/api/auth/learner/login", {
    data: { username: handle, pin },
    headers: { "Content-Type": "application/json" },
  });
}

/** Drive exactly HARD_LOCK_THRESHOLD failed attempts via the real login route. */
export async function driveToHardLock(
  request: APIRequestContext,
  fx: PinLockoutFixture
): Promise<APIResponse> {
  let lastResp!: APIResponse;
  for (let attempt = 1; attempt <= HARD_LOCK_THRESHOLD; attempt++) {
    await clearSoftCooldownForCredKey(fx.credKey);
    lastResp = await postLearnerLogin(request, fx.handle, WRONG_PIN);
    if (attempt < HARD_LOCK_THRESHOLD) {
      expect([401, 429]).toContain(lastResp.status());
    }
  }
  return lastResp;
}

export { TEST_PARENT };
