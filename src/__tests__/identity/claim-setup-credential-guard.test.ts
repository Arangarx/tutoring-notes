/**
 * @jest-environment node
 *
 * Guard: POST /api/claim/[token]/setup action=credentials
 *   → 409 credential_already_exists when a LearnerCredential already exists for this profile.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  redirect: jest.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { POST as setupPostHandler } from "@/app/api/claim/[token]/setup/route";
import { uniq } from "../helpers/unique-test-token";

/** Short unique username that passes the 3–20 char alphanumeric+underscore validator. */
function shortUser(): string { return `u${Date.now().toString(36).slice(-9)}`; }

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});

afterAll(async () => {
  await db.$disconnect();
});

async function createClaimedInviteFixture(opts?: { withCredential?: boolean }) {
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
    data: { name: "Test Student", adminUserId: tutor.id },
  });
  const rawToken = await generateRawToken();
  const invite = await db.studentClaimInvite.create({
    data: {
      studentId: student.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
    },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: student.name },
  });
  await db.student.update({ where: { id: student.id }, data: { learnerProfileId: profile.id } });
  await db.studentClaimInvite.update({
    where: { id: invite.id },
    data: { claimedAt: new Date(), claimedByAccountHolderId: ah.id },
  });

  if (opts?.withCredential) {
    await db.learnerCredential.create({
      data: {
        learnerProfileId: profile.id,
        accountHolderId: ah.id,
        username: uniq("existing"),
        secretHash: "hash",
      },
    });
  }

  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);
  return { rawToken, ahSessionToken, ah, learnerProfileId: profile.id };
}

async function postCredentials(
  rawToken: string,
  ahSessionToken: string,
  body: Record<string, unknown>
) {
  const req = new NextRequest(
    new URL(`https://localhost/api/claim/${rawToken}/setup`, "https://localhost"),
    {
      method: "POST",
      headers: { cookie: `mynk_ah_session=${ahSessionToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return setupPostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

describe("Credential guard — credential_already_exists 409", () => {
  it("returns 409 credential_already_exists when profile already has a credential", async () => {
    const fx = await createClaimedInviteFixture({ withCredential: true });

    const res = await postCredentials(fx.rawToken, fx.ahSessionToken, {
      action: "credentials",
      username: shortUser(),
      pin: "847291",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "credential_already_exists" });

    // Still exactly one credential on the profile
    const count = await db.learnerCredential.count({
      where: { learnerProfileId: fx.learnerProfileId },
    });
    expect(count).toBe(1);
  });

  it("creates credential normally when none exists yet", async () => {
    const fx = await createClaimedInviteFixture({ withCredential: false });

    const res = await postCredentials(fx.rawToken, fx.ahSessionToken, {
      action: "credentials",
      username: shortUser(),
      pin: "847291",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.loginHandle).toBe("string");

    const count = await db.learnerCredential.count({
      where: { learnerProfileId: fx.learnerProfileId },
    });
    expect(count).toBe(1);
  });
});
