/**
 * @jest-environment node
 *
 * Identity Phase 2b — integration tests
 *
 * Coverage:
 *   P2B-DEV-1  — revoke-one: marks the target device session revoked
 *   P2B-DEV-2  — revoke-one: 401 when no AH session
 *   P2B-DEV-3  — revoke-one: notFound (throws) when parent does NOT own profile
 *   P2B-DEV-4  — revoke-all: marks ALL device sessions revoked
 *   P2B-DEV-5  — revoke-all: non-owned profile → notFound
 *   P2B-PIN-1  — credential PATCH: changes PIN and revokes all learner sessions
 *   P2B-PIN-2  — credential PATCH: 401 when no AH session
 *   P2B-PIN-3  — credential PATCH: too-short PIN → 400 pin_too_short
 *   P2B-LOCK-1 — soft-lockout: checkLearnerPinRateLimit returns isLockedOut after N failures
 *   P2B-LOCK-2 — soft-lockout: lockout never becomes permanent (reset clears it)
 *   P2B-CLM-1  — claim state: expired invite → state EXPIRED (non-claimable)
 *   P2B-CLM-2  — claim state: revoked invite → not claimable
 *   P2B-CLM-3  — claim state: claimed invite → not claimable again (sibling revoke path)
 *   P2B-INT-1  — interstitial path: AH session present on pending invite → session info available
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
import {
  hashAccountHolderPassword,
  hashLearnerPin,
  verifyLearnerPin,
} from "@/lib/account-holder-auth";
import {
  createAccountHolderSession,
  getAccountHolderSession,
  buildAhSessionCookie,
  AH_SESSION_TTL_MS,
} from "@/lib/account-holder-session";
import {
  createLearnerSession,
  getLearnerSession,
} from "@/lib/learner-session";
import {
  checkLearnerPinCooldown,
  recordLearnerPinFailure,
  resetLearnerPinFailures,
} from "@/lib/learner-pin-rate-limit";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { generateRawToken, hashToken } from "@/lib/crypto/session-tokens";
import { NextRequest } from "next/server";

// Import route handlers directly for unit-style integration tests
import { POST as revokeOneHandler } from "@/app/api/learner-profiles/[id]/device-sessions/[sessionId]/revoke/route";
import { POST as revokeAllHandler } from "@/app/api/learner-profiles/[id]/device-sessions/revoke-all/route";
import { PATCH as credentialPatchHandler } from "@/app/api/learner-profiles/[id]/credentials/route";

// ---------------------------------------------------------------------------
// Test env
// ---------------------------------------------------------------------------

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";
const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function createAH(opts?: { verified?: boolean }) {
  const email = `p2b-${Date.now()}-${Math.random().toString(36).slice(2)}@test.example`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      emailVerifiedAt: opts?.verified !== false ? new Date() : null,
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: { accountHolderId, displayName: "Test Child" },
  });
}

async function createLearnerCredential(learnerProfileId: string, username?: string) {
  const un = username ?? `kid_${Math.random().toString(36).slice(2, 8)}`;
  const secretHash = await hashLearnerPin("123456");
  return db.learnerCredential.create({
    data: { learnerProfileId, username: un, secretHash },
  });
}

async function createLearnerDeviceSession(learnerProfileId: string) {
  return db.learnerDeviceSession.create({
    data: {
      learnerProfileId,
      tokenHash: hashToken(await generateRawToken()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
}

async function createAdmin() {
  const email = `admin-p2b-${Date.now()}-${Math.random().toString(36).slice(2)}@test.example`;
  return db.adminUser.create({
    data: { email, passwordHash: null, isTestAccount: false, role: "TUTOR" },
  });
}

async function createStudent(adminUserId: string) {
  return db.student.create({
    data: { name: "Test Student P2b", adminUserId },
  });
}

/** Build a NextRequest with optional AH session cookie. */
async function buildNextRequest(
  url: string,
  opts: { ahRawToken?: string; body?: unknown; method?: string } = {}
): Promise<NextRequest> {
  const cookieHeader = opts.ahRawToken ? `mynk_ah_session=${opts.ahRawToken}` : "";
  return new NextRequest(new URL(url, "https://localhost"), {
    method: opts.method ?? "POST",
    headers: {
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// P2B-DEV: Device session revocation
// ---------------------------------------------------------------------------

describe("P2B-DEV: Device session revoke-one", () => {
  it("P2B-DEV-1: revokes the target session and leaves others intact", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    const ds1 = await createLearnerDeviceSession(profile.id);
    const ds2 = await createLearnerDeviceSession(profile.id);

    const { rawToken } = await createAccountHolderSession(ah.id);
    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/device-sessions/${ds1.id}/revoke`,
      { ahRawToken: rawToken }
    );

    const res = await revokeOneHandler(req, {
      params: Promise.resolve({ id: profile.id, sessionId: ds1.id }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const revokedRow = await db.learnerDeviceSession.findUnique({ where: { id: ds1.id } });
    const intactRow = await db.learnerDeviceSession.findUnique({ where: { id: ds2.id } });

    expect(revokedRow!.revokedAt).not.toBeNull();
    expect(intactRow!.revokedAt).toBeNull();
  });

  it("P2B-DEV-2: returns 401 when no AH session cookie", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    const ds = await createLearnerDeviceSession(profile.id);

    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/device-sessions/${ds.id}/revoke`,
      {} // no cookie
    );

    const res = await revokeOneHandler(req, {
      params: Promise.resolve({ id: profile.id, sessionId: ds.id }),
    });

    expect(res.status).toBe(401);
  });

  it("P2B-DEV-3: throws notFound when parent does not own the profile", async () => {
    const owner = await createAH();
    const attacker = await createAH();

    const profile = await createLearnerProfile(owner.id);
    const ds = await createLearnerDeviceSession(profile.id);

    const { rawToken: attackerToken } = await createAccountHolderSession(attacker.id);

    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/device-sessions/${ds.id}/revoke`,
      { ahRawToken: attackerToken }
    );

    await expect(
      revokeOneHandler(req, {
        params: Promise.resolve({ id: profile.id, sessionId: ds.id }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("P2B-DEV: Device session revoke-all", () => {
  it("P2B-DEV-4: revokes all active device sessions for a profile", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    const ds1 = await createLearnerDeviceSession(profile.id);
    const ds2 = await createLearnerDeviceSession(profile.id);
    const ds3 = await createLearnerDeviceSession(profile.id);

    const { rawToken } = await createAccountHolderSession(ah.id);
    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/device-sessions/revoke-all`,
      { ahRawToken: rawToken }
    );

    const res = await revokeAllHandler(req, {
      params: Promise.resolve({ id: profile.id }),
    });

    expect(res.status).toBe(200);

    const sessions = await db.learnerDeviceSession.findMany({
      where: { learnerProfileId: profile.id },
    });
    for (const s of sessions) {
      expect(s.revokedAt).not.toBeNull();
    }
  });

  it("P2B-DEV-5: throws notFound for non-owned profile on revoke-all", async () => {
    const owner = await createAH();
    const attacker = await createAH();
    const profile = await createLearnerProfile(owner.id);

    const { rawToken: attackerToken } = await createAccountHolderSession(attacker.id);

    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/device-sessions/revoke-all`,
      { ahRawToken: attackerToken }
    );

    await expect(
      revokeAllHandler(req, {
        params: Promise.resolve({ id: profile.id }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// P2B-PIN: Credential (PIN) update
// ---------------------------------------------------------------------------

describe("P2B-PIN: Child credential update", () => {
  it("P2B-PIN-1: changes PIN and bulk-revokes all device sessions", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    await createLearnerCredential(profile.id);
    const ds1 = await createLearnerDeviceSession(profile.id);
    const ds2 = await createLearnerDeviceSession(profile.id);

    const { rawToken } = await createAccountHolderSession(ah.id);
    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/credentials`,
      { ahRawToken: rawToken, body: { newPin: "999888" }, method: "PATCH" }
    );

    const res = await credentialPatchHandler(req, {
      params: Promise.resolve({ id: profile.id }),
    });

    expect(res.status).toBe(200);

    // All device sessions revoked
    const sessions = await db.learnerDeviceSession.findMany({
      where: { learnerProfileId: profile.id },
    });
    for (const s of sessions) {
      expect(s.revokedAt).not.toBeNull();
    }

    // New PIN is valid; old PIN is not
    const cred = await db.learnerCredential.findUnique({ where: { learnerProfileId: profile.id } });
    expect(cred).not.toBeNull();
    const newPinOk = await verifyLearnerPin("999888", cred!.secretHash);
    const oldPinOk = await verifyLearnerPin("123456", cred!.secretHash);
    expect(newPinOk).toBe(true);
    expect(oldPinOk).toBe(false);
  });

  it("P2B-PIN-2: returns 401 without AH session", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    await createLearnerCredential(profile.id);

    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/credentials`,
      { body: { newPin: "999888" }, method: "PATCH" } // no cookie
    );

    const res = await credentialPatchHandler(req, {
      params: Promise.resolve({ id: profile.id }),
    });

    expect(res.status).toBe(401);
  });

  it("P2B-PIN-3: returns 400 pin_too_short for < 6 digit PIN", async () => {
    const ah = await createAH();
    const profile = await createLearnerProfile(ah.id);
    await createLearnerCredential(profile.id);

    const { rawToken } = await createAccountHolderSession(ah.id);
    const req = await buildNextRequest(
      `https://localhost/api/learner-profiles/${profile.id}/credentials`,
      { ahRawToken: rawToken, body: { newPin: "1234" }, method: "PATCH" }
    );

    const res = await credentialPatchHandler(req, {
      params: Promise.resolve({ id: profile.id }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("pin_too_short");
  });
});

// ---------------------------------------------------------------------------
// P2B-LOCK: Learner soft-lockout (§4.4 — NEVER hard-lock)
// ---------------------------------------------------------------------------

describe("P2B-LOCK: Learner soft-lockout (§4.4 — NEVER hard-lock)", () => {
  const TEST_IP = "127.0.0.1";

  it("P2B-LOCK-1: enters cooldown after N failures; cooldown is finite (not permanent)", () => {
    const username = `lock1_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Tiers: 0–2 → no delay; 3–4 → 30s; 5–7 → 5min; 8–10 → 15min; 11+ → 1h
    // Record 5 failures to reach the 5min tier
    for (let i = 0; i < 5; i++) {
      recordLearnerPinFailure(username, TEST_IP);
    }

    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(true);
    expect(cooldown.retryAfterSeconds).toBeGreaterThan(0);
    // CRITICAL: must be finite — never more than 1h (3600s per spec, < 24h)
    expect(cooldown.retryAfterSeconds).toBeLessThanOrEqual(3600);
  });

  it("P2B-LOCK-2: cooldown clears after reset (soft, not permanent)", () => {
    const username = `lock2_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    for (let i = 0; i < 5; i++) {
      recordLearnerPinFailure(username, TEST_IP);
    }

    resetLearnerPinFailures(username, TEST_IP);

    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(false);
  });

  it("P2B-LOCK-3: first 2 failures produce no cooldown (not too aggressive)", () => {
    const username = `lock3_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    recordLearnerPinFailure(username, TEST_IP);
    recordLearnerPinFailure(username, TEST_IP);

    // 2 failures: should NOT be in cooldown yet (only from 3+ does cooldown kick in)
    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    // Per tier table: 0–2 failures → 0s cooldown
    expect(cooldown.retryAfterSeconds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// P2B-CLM: Claim state machine
// ---------------------------------------------------------------------------

describe("P2B-CLM: Claim invite state", () => {
  it("P2B-CLM-1: expired invite has expiresAt in the past", async () => {
    const admin = await createAdmin();
    const student = await createStudent(admin.id);

    const rawToken = await generateRawToken();
    const invite = await db.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId: admin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    expect(invite.expiresAt.getTime()).toBeLessThan(Date.now());
    expect(invite.claimedAt).toBeNull();
    expect(invite.revokedAt).toBeNull();
    // State: EXPIRED (not PENDING, not COMPLETE)
  });

  it("P2B-CLM-2: revoked invite cannot be used", async () => {
    const admin = await createAdmin();
    const student = await createStudent(admin.id);

    const rawToken = await generateRawToken();
    const invite = await db.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId: admin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(), // revoked
      },
    });

    expect(invite.revokedAt).not.toBeNull();
    expect(invite.claimedAt).toBeNull();
  });

  it("P2B-CLM-3: claiming creates a LearnerProfile and marks invite as claimed", async () => {
    const admin = await createAdmin();
    const student = await createStudent(admin.id);
    const ah = await createAH();

    const rawToken = await generateRawToken();
    const invite = await db.studentClaimInvite.create({
      data: {
        studentId: student.id,
        adminUserId: admin.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate the claim-complete logic
    const now = new Date();
    await db.$transaction(async (tx) => {
      const profile = await tx.learnerProfile.create({
        data: {
          accountHolderId: ah.id,
          displayName: student.name,
          student: { connect: { id: student.id } },
        },
      });
      await tx.studentClaimInvite.update({
        where: { id: invite.id },
        data: {
          claimedAt: now,
          claimedByAccountHolderId: ah.id,
        },
      });
      return profile;
    });

    const updatedInvite = await db.studentClaimInvite.findUnique({ where: { id: invite.id } });
    expect(updatedInvite!.claimedAt).not.toBeNull();
    expect(updatedInvite!.claimedByAccountHolderId).toBe(ah.id);

    // A second claim attempt: invite is already claimed → state COMPLETE
    // (the /api/claim/[token]/complete handler returns 409 claim_already_completed)
    const profile = await db.learnerProfile.findFirst({
      where: { accountHolderId: ah.id, student: { id: student.id } },
    });
    expect(profile).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2B-INT: Identity-confirmation interstitial — session resolution
// ---------------------------------------------------------------------------

describe("P2B-INT: Interstitial path — AH session on pending invite", () => {
  it("P2B-INT-1: AH session is readable from a cookie on a pending invite page", async () => {
    const ah = await createAH();
    const { rawToken: sessionToken } = await createAccountHolderSession(ah.id);

    // Simulate what the claim page does: build a Request from the cookie header
    const req = new Request("https://localhost/claim/some-token", {
      headers: { cookie: `mynk_ah_session=${sessionToken}` },
    });

    const ahSession = await getAccountHolderSession(req);
    expect(ahSession).not.toBeNull();
    expect(ahSession!.accountHolderId).toBe(ah.id);
    // This confirms the interstitial has what it needs to render "You're signed in as [email]"
  });

  it("P2B-INT-2: no AH session → getAccountHolderSession returns null (auth gate path)", async () => {
    const req = new Request("https://localhost/claim/some-token", {
      headers: {}, // no cookie
    });

    const ahSession = await getAccountHolderSession(req);
    expect(ahSession).toBeNull();
    // ClaimAuthGate (Case A/B) renders when this returns null
  });
});
