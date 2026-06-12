/**
 * @jest-environment node
 *
 * Parent-create-learner — unit + integration tests
 *
 * Coverage:
 *   - createChildLearnerAction: ownership isolation (parent A cannot create on parent B)
 *   - createChildLearnerAction: creates tutor-less LearnerProfile owned by session holder
 *   - POST /api/learner-profiles/[id]/credentials: ownership assertion (A cannot set up B's credential)
 *   - POST /api/learner-profiles/[id]/credentials: PIN validation reused from claim flow
 *   - POST /api/learner-profiles/[id]/credentials: username validation
 *   - POST /api/learner-profiles/[id]/credentials: familyId lazily assigned on credential creation
 *   - assertOwnsLearnerProfile: parent A cannot access parent B's learner profile
 *
 * DB: uses tutoring_notes_test via jest.global-setup.ts (db push on run).
 * Mocks: next/navigation.notFound throws "NEXT_NOT_FOUND".
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

// next/cache revalidatePath is a no-op in tests
jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

// server-session: mock getAccountHolderSessionFromHeaders to return a
// controlled session so createChildLearnerAction can be tested without
// real cookie infrastructure in the test process.
jest.mock("@/lib/server-session", () => ({
  getAccountHolderSessionFromHeaders: jest.fn(),
  requireAccountHolderSession: jest.fn(),
  hasAccountHolderSessionCookie: jest.fn(),
  getLearnerSessionFromHeaders: jest.fn(),
  hasLearnerSessionCookie: jest.fn(),
}));

import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { assertOwnsLearnerProfile } from "@/lib/learner-profile-scope";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { createChildLearnerAction } from "@/app/account/dashboard/actions";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import { POST as credentialsPost } from "@/app/api/learner-profiles/[id]/credentials/route";
import {
  validateLearnerPin,
  validateLearnerUsername,
} from "@/lib/learner-credential-validation";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
  process.env.LEARNER_SESSION_HMAC_SECRET =
    "test-learner-session-secret-minimum-32-bytes";
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTestAccountHolder(emailSuffix?: string) {
  const email = `pcl-test-${Date.now()}-${emailSuffix ?? Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("Password123!");
  return db.accountHolder.create({
    data: { email, passwordHash, emailVerifiedAt: new Date() },
  });
}

async function createTestLearnerProfile(
  accountHolderId: string,
  opts?: { tombstoned?: boolean; displayName?: string }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: opts?.displayName ?? "Test Learner",
      isSelfLearner: false,
      accessMode: "account_holder_session",
      tombstonedAt: opts?.tombstoned ? new Date() : null,
    },
  });
}

/** Build a NextRequest with a signed AH session cookie. */
async function buildAuthRequest(accountHolderId: string): Promise<NextRequest> {
  const { rawToken } = await createAccountHolderSession(accountHolderId);
  return new NextRequest("https://localhost/api/test", {
    headers: { cookie: `mynk_ah_session=${rawToken}` },
  });
}

// ---------------------------------------------------------------------------
// createChildLearnerAction — ownership isolation
// ---------------------------------------------------------------------------

describe("createChildLearnerAction — ownership", () => {
  it("creates a LearnerProfile owned exclusively by the session AccountHolder", async () => {
    const ah = await createTestAccountHolder("owner");

    // Inject session for the server action
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });

    const result = await createChildLearnerAction("Sam");
    expect(result.ok).toBe(true);
    expect(result.learnerProfileId).toBeDefined();

    const profile = await db.learnerProfile.findUnique({
      where: { id: result.learnerProfileId! },
    });
    expect(profile).not.toBeNull();
    expect(profile!.accountHolderId).toBe(ah.id);
    expect(profile!.displayName).toBe("Sam");
    expect(profile!.isSelfLearner).toBe(false);
    expect(profile!.accessMode).toBe("account_holder_session");
    // No Student rows — tutor-less by design
  });

  it("parent A cannot create a learner on parent B's account — session is scoped to A", async () => {
    const ahA = await createTestAccountHolder("ahA");
    const ahB = await createTestAccountHolder("ahB");

    // Even if parent B's id were somehow passed, the action only uses the session holder.
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ahA.id,
    });

    const result = await createChildLearnerAction("Hacker");
    expect(result.ok).toBe(true);

    const profile = await db.learnerProfile.findUnique({
      where: { id: result.learnerProfileId! },
    });
    // Profile is owned by A, not B — B cannot access it.
    expect(profile!.accountHolderId).toBe(ahA.id);
    expect(profile!.accountHolderId).not.toBe(ahB.id);
  });

  it("returns unauthorized when no session exists", async () => {
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce(null);
    const result = await createChildLearnerAction("Ghost");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("unauthorized");
  });

  it("rejects blank display names", async () => {
    const ah = await createTestAccountHolder("blank-name");
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });
    const result = await createChildLearnerAction("   ");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_name");
  });
});

// ---------------------------------------------------------------------------
// assertOwnsLearnerProfile — cross-tenant isolation
// ---------------------------------------------------------------------------

describe("assertOwnsLearnerProfile — cross-tenant", () => {
  it("throws NEXT_NOT_FOUND when parent A tries to access parent B's learner", async () => {
    const ahA = await createTestAccountHolder("owns-a");
    const ahB = await createTestAccountHolder("owns-b");
    const profileB = await createTestLearnerProfile(ahB.id);

    await expect(
      assertOwnsLearnerProfile(ahA.id, profileB.id)
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns the profile when the correct owner requests it", async () => {
    const ah = await createTestAccountHolder("correct-owner");
    const profile = await createTestLearnerProfile(ah.id);

    const result = await assertOwnsLearnerProfile(ah.id, profile.id);
    expect(result.id).toBe(profile.id);
  });

  it("throws NEXT_NOT_FOUND for tombstoned profile", async () => {
    const ah = await createTestAccountHolder("tombstone-check");
    const profile = await createTestLearnerProfile(ah.id, { tombstoned: true });

    await expect(
      assertOwnsLearnerProfile(ah.id, profile.id)
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Shared learner credential validators (claim + parent-create parity)
// ---------------------------------------------------------------------------

describe("learner credential validation — shared module", () => {
  it("rejects blocklisted weak PIN 123456", () => {
    const result = validateLearnerPin("123456");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too easy to guess/i);
  });

  it("rejects username with spaces (smoke P2: no spaces)", () => {
    const result = validateLearnerUsername("no spaces");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/3–20 characters/i);
  });

  it("accepts valid username alex1 and PIN 847263", () => {
    expect(validateLearnerUsername("alex1").ok).toBe(true);
    expect(validateLearnerPin("847263").ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/learner-profiles/[id]/credentials — ownership + validation
// ---------------------------------------------------------------------------

describe("POST /api/learner-profiles/[id]/credentials", () => {
  it("rejects unauthenticated requests (401)", async () => {
    const ah = await createTestAccountHolder("unauth-cred");
    const profile = await createTestLearnerProfile(ah.id);
    const req = new NextRequest("https://localhost/api/learner-profiles/test/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "sam123", pin: "847261" }),
    });

    const res = await credentialsPost(req, { params: Promise.resolve({ id: profile.id }) });
    expect(res.status).toBe(401);
  });

  it("rejects cross-tenant credential setup (notFound via assertOwns)", async () => {
    const ahA = await createTestAccountHolder("cred-cross-a");
    const ahB = await createTestAccountHolder("cred-cross-b");
    const profileB = await createTestLearnerProfile(ahB.id);

    const req = await buildAuthRequest(ahA.id);
    const bodyReq = new NextRequest(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ username: "sam123", pin: "847261" }),
    });

    // assertOwnsLearnerProfile calls notFound() → throws NEXT_NOT_FOUND in test.
    await expect(
      credentialsPost(bodyReq, { params: Promise.resolve({ id: profileB.id }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects invalid username no spaces (400, smoke P2)", async () => {
    const ah = await createTestAccountHolder("cred-bad-uname");
    const profile = await createTestLearnerProfile(ah.id);
    const req = await buildAuthRequest(ah.id);
    const bodyReq = new NextRequest(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ username: "no spaces", pin: "847263" }),
    });

    const res = await credentialsPost(bodyReq, { params: Promise.resolve({ id: profile.id }) });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string; message?: string };
    expect(data.error).toBe("invalid_username");
    expect(data.message).toMatch(/3–20 characters/i);
  });

  it("rejects weak PIN 123456 (400, smoke P1)", async () => {
    const ah = await createTestAccountHolder("cred-weak-pin");
    const profile = await createTestLearnerProfile(ah.id);
    const req = await buildAuthRequest(ah.id);
    const bodyReq = new NextRequest(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ username: "alex1", pin: "123456" }),
    });

    const res = await credentialsPost(bodyReq, { params: Promise.resolve({ id: profile.id }) });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string; message?: string };
    expect(data.error).toBe("pin_too_weak");
    expect(data.message).toMatch(/too easy to guess/i);
  });

  it("creates credential successfully, sets accessMode=child_pin_required, assigns familyId", async () => {
    const ah = await createTestAccountHolder("cred-success");
    const profile = await createTestLearnerProfile(ah.id, { displayName: "Jordan" });
    const req = await buildAuthRequest(ah.id);
    const bodyReq = new NextRequest(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ username: "alex1", pin: "847263" }),
    });

    const res = await credentialsPost(bodyReq, { params: Promise.resolve({ id: profile.id }) });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean; familyId: string; loginHandle: string };
    expect(data.ok).toBe(true);
    expect(data.familyId).toBeDefined();
    expect(data.loginHandle).toBe(`alex1@${data.familyId}`);

    // DB state: accessMode updated, credential row created.
    const updatedProfile = await db.learnerProfile.findUnique({ where: { id: profile.id } });
    expect(updatedProfile!.accessMode).toBe("child_pin_required");

    const cred = await db.learnerCredential.findUnique({ where: { learnerProfileId: profile.id } });
    expect(cred).not.toBeNull();
    expect(cred!.username).toBe("alex1");
    expect(cred!.accountHolderId).toBe(ah.id);

    // AccountHolder has a familyId assigned.
    const ahUpdated = await db.accountHolder.findUnique({ where: { id: ah.id } });
    expect(ahUpdated!.familyId).toBeDefined();
  });

  it("rejects duplicate credential creation for same learner (409)", async () => {
    const ah = await createTestAccountHolder("cred-dup");
    const profile = await createTestLearnerProfile(ah.id);

    // Create credential directly in DB (simulates already-set-up learner).
    const secretHash = await hashLearnerPin("847261");
    await db.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: ah.id,
        username: "existinguser",
        secretHash,
      },
    });

    const req = await buildAuthRequest(ah.id);
    const bodyReq = new NextRequest(req.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({ username: "newuser", pin: "847261" }),
    });

    const res = await credentialsPost(bodyReq, { params: Promise.resolve({ id: profile.id }) });
    expect(res.status).toBe(409);
    const data = await res.json() as { error: string };
    expect(data.error).toBe("credential_already_exists");
  });
});

// ---------------------------------------------------------------------------
// Child notes page: tutor-less empty state (unit — logic only)
// ---------------------------------------------------------------------------

describe("child notes: tutor-less learner has no students", () => {
  it("a parent-created learner has zero Student rows", async () => {
    const ah = await createTestAccountHolder("notes-tutor-less");
    const profile = await createTestLearnerProfile(ah.id);

    const students = await db.student.findMany({
      where: { learnerProfileId: profile.id },
    });
    // No tutor connection → zero Student rows → notes page shows "no tutor yet" copy.
    expect(students).toHaveLength(0);
  });
});
