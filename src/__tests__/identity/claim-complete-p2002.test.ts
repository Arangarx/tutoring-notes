/**
 * @jest-environment node
 *
 * Teeth for POST /api/claim/[token]/complete P2002 branch:
 * transaction unique-constraint → 409 already_linked_to_tutor.
 * Independent oracle = response status + error code (not the predicate helper).
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createAccountHolderSession } from "@/lib/account-holder-session";
import { generateRawToken, hashToken, CLAIM_INVITE_TTL_MS } from "@/lib/crypto/session-tokens";
import { POST as completePostHandler } from "@/app/api/claim/[token]/complete/route";
import { uniq } from "../helpers/unique-test-token";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});

afterAll(async () => {
  await db.$disconnect();
});

function prismaP2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

async function createPendingClaimFixture() {
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
    data: { name: "Claim Complete Student", adminUserId: tutor.id },
  });
  const rawToken = await generateRawToken();
  await db.studentClaimInvite.create({
    data: {
      studentId: student.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
    },
  });
  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);
  return { rawToken, ahSessionToken };
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
      body: JSON.stringify({ action: "create_child" }),
    }
  );
  return completePostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

describe("POST /api/claim/[token]/complete — P2002 unique race", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns 409 already_linked_to_tutor when transaction hits P2002", async () => {
    const fx = await createPendingClaimFixture();
    jest.spyOn(db, "$transaction").mockRejectedValueOnce(prismaP2002());

    const res = await postComplete(fx.rawToken, fx.ahSessionToken);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "already_linked_to_tutor" });
  });

  it("does not map a non-P2002 transaction error to already_linked_to_tutor", async () => {
    const fx = await createPendingClaimFixture();
    const boom = Object.assign(new Error("connection refused"), { code: "P1001" });
    jest.spyOn(db, "$transaction").mockRejectedValueOnce(boom);

    await expect(postComplete(fx.rawToken, fx.ahSessionToken)).rejects.toBe(boom);
  });
});
