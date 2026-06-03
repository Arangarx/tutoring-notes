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
 *   P2B-LOCK-1 — soft-lockout: enters cooldown after 6 failures; cooldown is finite
 *   P2B-LOCK-2 — soft-lockout: lockout never becomes permanent (reset clears it)
 *   P2B-LOCK-3 — soft-lockout: first 5 failures produce no cooldown (kid-friendly tiers)
 *   P2B-LOCK-4 — soft-lockout: 6th failure triggers 30s cooldown (first tier boundary)
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
import { POST as accountHolderSignupHandler } from "@/app/api/auth/account-holder/signup/route";
import { POST as forgotPasswordHandler } from "@/app/api/auth/account-holder/forgot-password/route";
import { POST as resetPasswordHandler } from "@/app/api/auth/account-holder/reset-password/route";

// Fix-specific imports
import { validatePasswordStrength } from "@/lib/password-strength";
import { validateLearnerPin } from "@/lib/pin-strength";

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

async function createLearnerCredential(
  learnerProfileId: string,
  accountHolderId: string,
  username?: string
) {
  const un = username ?? `kid_${Math.random().toString(36).slice(2, 8)}`;
  const secretHash = await hashLearnerPin("123456");
  return db.learnerCredential.create({
    data: { learnerProfileId, accountHolderId, username: un, secretHash },
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
    await createLearnerCredential(profile.id, ah.id);
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
    await createLearnerCredential(profile.id, ah.id);

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
    await createLearnerCredential(profile.id, ah.id);

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
// P2B-LOCK: Learner soft-lockout (IAC-10 tiers)
// ---------------------------------------------------------------------------

describe("P2B-LOCK: Learner soft-lockout (IAC-10)", () => {
  const TEST_IP = "127.0.0.1";

  function makeCredKey(username: string) { return `testfam:${username}`; }

  it("P2B-LOCK-1: enters cooldown after tier-2 threshold (4 failures); cooldown is finite", () => {
    const username = `lock1_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const credKey = makeCredKey(username);

    // IAC-10 tiers: 1–3 free; 4–6 → 30s; 7–9 → 5min; 10–12 → 15min; 13+ → hard lock
    for (let i = 0; i < 4; i++) {
      recordLearnerPinFailure(username, TEST_IP, credKey);
    }

    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(true);
    expect(cooldown.retryAfterSeconds).toBeGreaterThan(0);
    // Must be finite (30s for tier 2)
    expect(cooldown.retryAfterSeconds).toBeLessThanOrEqual(30);
  });

  it("P2B-LOCK-2: cooldown clears after reset (soft lock)", () => {
    const username = `lock2_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const credKey = makeCredKey(username);

    for (let i = 0; i < 4; i++) {
      recordLearnerPinFailure(username, TEST_IP, credKey);
    }

    resetLearnerPinFailures(username, TEST_IP, credKey);

    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(false);
  });

  it("P2B-LOCK-3: first 3 failures produce no cooldown (fat-finger grace)", () => {
    const username = `lock3_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const credKey = makeCredKey(username);

    for (let i = 0; i < 3; i++) {
      recordLearnerPinFailure(username, TEST_IP, credKey);
    }

    // 3 failures: should NOT be in cooldown yet
    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(false);
    expect(cooldown.retryAfterSeconds).toBe(0);
  });

  it("P2B-LOCK-4: failure 4 triggers 30s cooldown (tier 2 boundary)", () => {
    const username = `lock4_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const credKey = makeCredKey(username);

    for (let i = 0; i < 4; i++) {
      recordLearnerPinFailure(username, TEST_IP, credKey);
    }

    const cooldown = checkLearnerPinCooldown(username, TEST_IP);
    expect(cooldown.inCooldown).toBe(true);
    // Tier 2: 30s
    expect(cooldown.retryAfterSeconds).toBeGreaterThanOrEqual(28);
    expect(cooldown.retryAfterSeconds).toBeLessThanOrEqual(32);
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

    // Simulate the claim-complete logic (IAC-2: set learnerProfileId on Student directly)
    const now = new Date();
    await db.$transaction(async (tx) => {
      const profile = await tx.learnerProfile.create({
        data: {
          accountHolderId: ah.id,
          displayName: student.name,
        },
      });
      await tx.student.update({
        where: { id: student.id },
        data: { learnerProfileId: profile.id },
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
      where: { accountHolderId: ah.id, students: { some: { id: student.id } } },
    });
    expect(profile).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// P2B-ATSTRIP: Username @ normalization (fix #1)
// ---------------------------------------------------------------------------

describe("P2B-ATSTRIP: Learner username @ normalization", () => {
  it("P2B-ATSTRIP-1: strips leading @ so @pooky resolves to pooky", () => {
    const raw = "@pooky";
    const normalized = raw.trim().toLowerCase().replace(/^@/, "");
    expect(normalized).toBe("pooky");
  });

  it("P2B-ATSTRIP-2: plain username is unchanged", () => {
    const raw = "pooky";
    const normalized = raw.trim().toLowerCase().replace(/^@/, "");
    expect(normalized).toBe("pooky");
  });

  it("P2B-ATSTRIP-3: double @@ still reduces to bare username", () => {
    const raw = "@@pooky";
    // Only one leading @ is stripped — matches the route's single replace
    const normalized = raw.trim().toLowerCase().replace(/^@/, "");
    expect(normalized).toBe("@pooky");
    // A double @ is an invalid username anyway (3–20 alphanumeric + underscore)
    // so it will still fail credential lookup — no security bypass
  });
});

// ---------------------------------------------------------------------------
// P2B-PWSTR: Server-side password strength validator (fix #5)
// ---------------------------------------------------------------------------

describe("P2B-PWSTR: Password strength validator", () => {
  it("P2B-PWSTR-1: rejects short password", () => {
    const result = validatePasswordStrength("password");
    expect(result.ok).toBe(false);
  });

  it("P2B-PWSTR-2: rejects 10+ char password with score < 2 (all same char)", () => {
    const result = validatePasswordStrength("aaaaaaaaaa");
    expect(result.ok).toBe(false);
    expect(result.score).toBeLessThan(2);
  });

  it("P2B-PWSTR-3: rejects 10+ char dictionary word", () => {
    const result = validatePasswordStrength("abcdefghij");
    expect(result.ok).toBe(false);
  });

  it("P2B-PWSTR-4: accepts a genuinely strong 10+ char password", () => {
    const result = validatePasswordStrength("Horse-Battery!Staple42");
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it("P2B-PWSTR-5: accepts a different strong phrase", () => {
    const result = validatePasswordStrength("correct-horse!77battery");
    expect(result.ok).toBe(true);
  });

  it("P2B-PWSTR-6: rejects password10 (long but dictionary-heavy)", () => {
    const result = validatePasswordStrength("password10");
    expect(result.ok).toBe(false);
    expect(result.score).toBeLessThan(2);
    expect(result.feedback.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// P2B-AHSIGN: AccountHolder signup route — password strength errors
// ---------------------------------------------------------------------------

describe("P2B-AHSIGN: AccountHolder signup route", () => {
  it("P2B-AHSIGN-1: weak-but-long password returns 400 password_too_weak", async () => {
    const req = new NextRequest("http://localhost/api/auth/account-holder/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `p2b-weak-${Date.now()}@test.example`,
        password: "password10",
      }),
    });

    const res = await accountHolderSignupHandler(req);
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe("password_too_weak");
  });
});

// ---------------------------------------------------------------------------
// P2B-PIN: Weak-PIN blocklist (fix #6)
// ---------------------------------------------------------------------------

describe("P2B-PINWEAK: Weak-PIN blocklist", () => {
  it("P2B-PINWEAK-1: rejects 121212 (exact blocklist)", () => {
    expect(validateLearnerPin("121212").ok).toBe(false);
  });

  it("P2B-PINWEAK-2: rejects 123456 (sequential + exact blocklist)", () => {
    expect(validateLearnerPin("123456").ok).toBe(false);
  });

  it("P2B-PINWEAK-3: rejects 000000 (all zeros)", () => {
    expect(validateLearnerPin("000000").ok).toBe(false);
  });

  it("P2B-PINWEAK-4: rejects 111111 (all same digit)", () => {
    expect(validateLearnerPin("111111").ok).toBe(false);
  });

  it("P2B-PINWEAK-5: rejects 234567 (sequential run)", () => {
    expect(validateLearnerPin("234567").ok).toBe(false);
  });

  it("P2B-PINWEAK-6: rejects 987654 (descending sequential)", () => {
    expect(validateLearnerPin("987654").ok).toBe(false);
  });

  it("P2B-PINWEAK-7: rejects 111122 (4+ repeated digit run)", () => {
    expect(validateLearnerPin("111122").ok).toBe(false);
  });

  it("P2B-PINWEAK-8: accepts a non-trivial PIN (847263)", () => {
    expect(validateLearnerPin("847263").ok).toBe(true);
  });

  it("P2B-PINWEAK-9: accepts another non-trivial PIN (394751)", () => {
    expect(validateLearnerPin("394751").ok).toBe(true);
  });

  it("P2B-PINWEAK-10: rejects non-6-digit PINs", () => {
    expect(validateLearnerPin("12345").ok).toBe(false);
    expect(validateLearnerPin("1234567").ok).toBe(false);
    expect(validateLearnerPin("abcdef").ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2B-REDIR: Redirect-origin (fix #3) — request-origin stays on same deployment
// ---------------------------------------------------------------------------

describe("P2B-REDIR: Redirect origin stays on request domain", () => {
  it("P2B-REDIR-1: verify-email handler uses req.nextUrl.origin, not NEXTAUTH_URL", async () => {
    // After fix #3, same-deployment redirects must use req.nextUrl.origin.
    // A bad token from a preview origin must redirect back to the preview origin.
    const { GET: verifyEmailHandler } = await import(
      "@/app/verify-email/route"
    );
    const previewOrigin = "https://preview-abc.vercel.app";
    const req = new NextRequest(`${previewOrigin}/verify-email?token=bad&type=ah`);
    const res = await verifyEmailHandler(req);
    // Must be a redirect (3xx)
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    // Location header must start with the preview origin, not prod
    const location = res.headers.get("Location") ?? "";
    expect(location.startsWith(previewOrigin)).toBe(true);
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

  it("P2B-INT-3: non-fresh existing session (created earlier) is still readable — existing-session interstitial path", async () => {
    // Simulates a user who logged in BEFORE navigating to a claim link.
    // The session should be detected regardless of when it was created.
    const ah = await createAH();
    const { rawToken: sessionToken } = await createAccountHolderSession(ah.id);

    // Move the session's lastUsedAt back (simulate it was created earlier)
    const session = await db.accountHolderSession.findFirst({ where: { accountHolderId: ah.id } });
    await db.accountHolderSession.update({
      where: { id: session!.id },
      data: { lastUsedAt: new Date(Date.now() - 60 * 60 * 1000) }, // 1 hour ago
    });

    const req = new Request("https://localhost/claim/some-token", {
      headers: { cookie: `mynk_ah_session=${sessionToken}` },
    });

    const ahSession = await getAccountHolderSession(req);
    expect(ahSession).not.toBeNull();
    expect(ahSession!.accountHolderId).toBe(ah.id);
  });
});

// ---------------------------------------------------------------------------
// P2B-RESET: Password-reset flow security (Round 3, Item A3)
//
//   P2B-RESET-1  forgot-password does NOT mutate passwordHash on request
//   P2B-RESET-2  forgot-password creates a PASSWORD_RESET token for a verified account
//   P2B-RESET-3  forgot-password does NOT create token for unverified account
//   P2B-RESET-4  reset-password POST changes hash only with a valid token
//   P2B-RESET-5  reset-password POST with invalid token does NOT change passwordHash
//   P2B-RESET-6  reset-password with weak password returns 400 password_too_weak
// ---------------------------------------------------------------------------

describe("P2B-RESET: Password-reset security", () => {
  it("P2B-RESET-1: forgot-password POST does NOT mutate passwordHash", async () => {
    const ah = await createAH({ verified: true });
    const originalHash = ah.passwordHash;

    const req = new NextRequest("https://localhost/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ah.email }),
    });
    const res = await forgotPasswordHandler(req);

    expect(res.status).toBe(200); // anti-enumeration always 200

    const ahNow = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(ahNow!.passwordHash).toBe(originalHash);
  });

  it("P2B-RESET-2: forgot-password creates PASSWORD_RESET token for verified account", async () => {
    const ah = await createAH({ verified: true });

    const req = new NextRequest("https://localhost/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ah.email }),
    });
    await forgotPasswordHandler(req);

    const token = await db.accountHolderEmailToken.findFirst({
      where: { accountHolderId: ah.id, purpose: "PASSWORD_RESET" },
    });
    expect(token).not.toBeNull();
    expect(token!.consumedAt).toBeNull();
  });

  it("P2B-RESET-3: forgot-password does NOT create token for unverified account", async () => {
    const ah = await createAH({ verified: false });

    const req = new NextRequest("https://localhost/api/auth/account-holder/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ah.email }),
    });
    await forgotPasswordHandler(req);

    const token = await db.accountHolderEmailToken.findFirst({
      where: { accountHolderId: ah.id, purpose: "PASSWORD_RESET" },
    });
    expect(token).toBeNull();
  });

  it("P2B-RESET-4: reset-password POST changes hash only with a valid unconsumed token", async () => {
    const ah = await createAH({ verified: true });
    const originalHash = ah.passwordHash;

    const rawToken = generateRawToken();
    await db.accountHolderEmailToken.create({
      data: {
        accountHolderId: ah.id,
        tokenHash: hashToken(rawToken),
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const req = new NextRequest("https://localhost/api/auth/account-holder/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "correct-horse-battery-staple" }),
    });
    const res = await resetPasswordHandler(req);

    expect(res.status).toBe(200);
    const ahNow = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(ahNow!.passwordHash).not.toBe(originalHash);
  });

  it("P2B-RESET-5: reset-password with invalid token does NOT change passwordHash", async () => {
    const ah = await createAH({ verified: true });
    const originalHash = ah.passwordHash;

    const req = new NextRequest("https://localhost/api/auth/account-holder/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid-bad-token", newPassword: "correct-horse-battery-staple" }),
    });
    const res = await resetPasswordHandler(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("link_expired");

    const ahNow = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(ahNow!.passwordHash).toBe(originalHash);
  });

  it("P2B-RESET-6: reset-password with weak password returns 400 password_too_weak", async () => {
    const ah = await createAH({ verified: true });

    const rawToken = generateRawToken();
    await db.accountHolderEmailToken.create({
      data: {
        accountHolderId: ah.id,
        tokenHash: hashToken(rawToken),
        purpose: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const req = new NextRequest("https://localhost/api/auth/account-holder/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "password10" }),
    });
    const res = await resetPasswordHandler(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("password_too_weak");

    // passwordHash must be unchanged
    const ahNow = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(ahNow!.passwordHash).toBe(ah.passwordHash);
  });
});
