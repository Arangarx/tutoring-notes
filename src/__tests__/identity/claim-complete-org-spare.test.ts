/**
 * @jest-environment node
 *
 * Organization claim spare close, including the P2002 fallback.
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

async function seedSpareClaim() {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const org = await db.organization.create({
    data: {
      name: `Spare org ${uniq("org")}`,
      createdByOperatorId: "spare-op@test.local",
    },
    select: { id: true },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: "Ada", isSelfLearner: false },
    select: { id: true },
  });
  const linked = await db.student.create({
    data: {
      name: "Ada",
      adminUserId: null,
      organizationId: org.id,
      learnerProfileId: profile.id,
    },
    select: { id: true },
  });
  const spare = await db.student.create({
    data: { name: "Ada spare", adminUserId: null, organizationId: org.id },
    select: { id: true },
  });
  const rawToken = await generateRawToken();
  await db.studentClaimInvite.create({
    data: {
      studentId: spare.id,
      adminUserId: tutor.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + CLAIM_INVITE_TTL_MS),
    },
  });
  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);
  return { rawToken, ahSessionToken, orgId: org.id, profileId: profile.id, linkedId: linked.id, spareId: spare.id };
}

async function postComplete(
  rawToken: string,
  ahSessionToken: string,
  learnerProfileId: string
) {
  const req = new NextRequest(
    new URL(`https://localhost/api/claim/${rawToken}/complete`, "https://localhost"),
    {
      method: "POST",
      headers: {
        cookie: `mynk_ah_session=${ahSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "attach_existing", learnerProfileId }),
    }
  );
  return completePostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

describe("organization claim spare close", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("deletes the spare when that child is already linked to the organization", async () => {
    const fx = await seedSpareClaim();
    const res = await postComplete(fx.rawToken, fx.ahSessionToken, fx.profileId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; error?: string; learnerProfileId?: string };
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
    expect(body.learnerProfileId).toBe(fx.profileId);
    expect(await db.student.findUnique({ where: { id: fx.spareId } })).toBeNull();
    const links = await db.student.findMany({
      where: { organizationId: fx.orgId, learnerProfileId: fx.profileId },
      select: { id: true },
    });
    expect(links.map((row) => row.id)).toEqual([fx.linkedId]);
  });

  it("P2002 fallback still closes the spare when the in-transaction lookup misses", async () => {
    const fx = await seedSpareClaim();
    jest.spyOn(db, "$transaction").mockImplementation(async (fn: unknown) => {
      if (typeof fn !== "function") {
        throw new Error("expected a transaction callback");
      }
      return (fn as (tx: unknown) => Promise<unknown>)({
        learnerProfile: db.learnerProfile,
        accountHolder: db.accountHolder,
        studentClaimInvite: db.studentClaimInvite,
        student: {
          findFirst: async (args: { where?: { NOT?: unknown } }) => {
            if (args?.where?.NOT) return null;
            return db.student.findFirst(args as never);
          },
          updateMany: async () => {
            throw prismaP2002();
          },
          delete: db.student.delete.bind(db.student),
        },
      });
    });

    const res = await postComplete(fx.rawToken, fx.ahSessionToken, fx.profileId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; error?: string; setupPath?: string };
    expect(body.ok).toBe(true);
    expect(body.error).toBeUndefined();
    expect(body.setupPath).toBe(`/account/children/${fx.profileId}`);
    expect(await db.student.findUnique({ where: { id: fx.spareId } })).toBeNull();
    expect(await db.student.findUnique({ where: { id: fx.linkedId } })).not.toBeNull();
  });
});
