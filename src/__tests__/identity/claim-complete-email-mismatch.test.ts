/**
 * @jest-environment node
 *
 * Claim complete rejects signed-in AccountHolder when student.parentEmail
 * does not match (interim oracle until StudentClaimInvite.intendedEmail column).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { POST as completePostHandler } from "@/app/api/claim/[token]/complete/route";
import { uniq } from "../helpers/unique-test-token";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(() => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});

afterAll(async () => {
  await db.$disconnect();
});

async function seedPendingInvite(parentEmail: string) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
  const ah = await db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  const student = await db.student.create({
    data: {
      name: parentEmail,
      parentEmail,
      adminUserId: tutor.id,
    },
  });
  const rawToken = generateRawToken();
  await db.studentClaimInvite.create({
    data: {
      studentId: student.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
    },
  });
  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);
  return { rawToken, ahSessionToken, studentId: student.id };
}

async function postComplete(rawToken: string, ahSessionToken: string) {
  const req = new NextRequest(
    new URL(`https://localhost/api/claim/${rawToken}/complete`, "https://localhost"),
    {
      method: "POST",
      headers: {
        cookie: `mynk_ah_session=${ahSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "connect_self" }),
    }
  );
  return completePostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

describe("POST /api/claim/[token]/complete — invite email match", () => {
  it("returns 403 invite_email_mismatch and does not link student", async () => {
    const intended = `${uniq("intended")}@example.com`;
    const fx = await seedPendingInvite(intended);

    const res = await postComplete(fx.rawToken, fx.ahSessionToken);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "invite_email_mismatch" });

    const student = await db.student.findUniqueOrThrow({ where: { id: fx.studentId } });
    expect(student.learnerProfileId).toBeNull();
  });
});
