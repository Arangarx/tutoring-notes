/**
 * @jest-environment node
 *
 * BLOCKER B — LearnerCredential.disabled fail-closed learner login.
 *
 * Coverage:
 *   LPR-DIS-1 — disabled=true → invalid_credentials (no enumeration)
 *   LPR-DIS-2 — disabled=false + correct PIN → success
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

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hashAccountHolderPassword, hashLearnerPin } from "@/lib/account-holder-auth";
import { POST as learnerLoginPost } from "@/app/api/auth/learner/login/route";
import { LEARNER_SESSION_COOKIE } from "@/lib/learner-session";

const TEST_HMAC_SECRET_LEARNER = "test-learner-session-secret-minimum-32-bytes";

beforeAll(() => {
  process.env.LEARNER_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_LEARNER;
});

afterAll(async () => {
  await db.$disconnect();
});

async function createAccountHolder(familyId: string) {
  const email = `lpr-dis-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const passwordHash = await hashAccountHolderPassword("password123");
  return db.accountHolder.create({
    data: {
      email,
      passwordHash,
      displayName: "Disabled Login Parent",
      emailVerifiedAt: new Date(),
      familyId,
    },
  });
}

async function createLearnerWithCredential(
  accountHolderId: string,
  username: string,
  opts?: { disabled?: boolean }
) {
  const lp = await db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Disabled Login Child",
      accessMode: "child_pin_required",
    },
  });
  const secretHash = await hashLearnerPin("654321");
  await db.learnerCredential.create({
    data: {
      learnerProfileId: lp.id,
      accountHolderId,
      username,
      secretHash,
      disabled: opts?.disabled ?? false,
    },
  });
  return { lp, username };
}

function buildLoginRequest(handle: string, pin: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/learner/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: handle, pin }),
  });
}

describe("learner login — LearnerCredential.disabled", () => {
  it("rejects disabled credential with invalid_credentials (indistinguishable from wrong PIN)", async () => {
    const familyId = `fam_dis_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder(familyId);
    await createLearnerWithCredential(ah.id, username, { disabled: true });

    const res = await learnerLoginPost(
      buildLoginRequest(`${username}@${familyId}`, "654321")
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_credentials");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("allows login when disabled=false and PIN is correct", async () => {
    const familyId = `fam_ok_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const username = `kid_${Math.random().toString(36).slice(2, 8)}`;
    const ah = await createAccountHolder(familyId);
    const { lp } = await createLearnerWithCredential(ah.id, username, { disabled: false });

    const res = await learnerLoginPost(
      buildLoginRequest(`${username}@${familyId}`, "654321")
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { next: string };
    expect(body.next).toBe("session");
    expect(res.headers.get("set-cookie")).toMatch(new RegExp(`${LEARNER_SESSION_COOKIE}=`));

    const sessions = await db.learnerDeviceSession.count({
      where: { learnerProfileId: lp.id, revokedAt: null },
    });
    expect(sessions).toBeGreaterThanOrEqual(1);
  });
});
