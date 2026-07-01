/**
 * @jest-environment node
 *
 * CC-2 consent_decline API — claim setup route integration tests
 *
 * Coverage:
 *   T5 — consent_decline writes all-off ConsentRecord v1; second decline → v2
 *   Self-learner decline → 200 { skipped: true }, no record
 *   H-1 — P2002 on create → 409 consent_already_saved (consent + consent_decline)
 *
 * DB: uses tutoring_notes_test via jest.global-setup.ts (db push on run).
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
import { POST as setupPostHandler } from "@/app/api/claim/[token]/setup/route";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});

afterAll(async () => {
  await db.$disconnect();
});

let uniqueSuffix = 0;
function uniq(prefix = "cc2") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
}

async function createAccountHolder(opts?: { isSelfLearner?: boolean }) {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createClaimedInviteFixture(opts?: { isSelfLearner?: boolean }) {
  const tutor = await createTutor();
  const ah = await createAccountHolder({ isSelfLearner: opts?.isSelfLearner });
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
    data: {
      accountHolderId: ah.id,
      displayName: student.name,
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
  await db.student.update({
    where: { id: student.id },
    data: { learnerProfileId: profile.id },
  });
  await db.studentClaimInvite.update({
    where: { id: invite.id },
    data: {
      claimedAt: new Date(),
      claimedByAccountHolderId: ah.id,
    },
  });

  const { rawToken: ahSessionToken } = await createAccountHolderSession(ah.id);

  return {
    tutor,
    ah,
    student,
    profile,
    rawToken,
    ahSessionToken,
    adminUserId: tutor.id,
    learnerProfileId: profile.id,
  };
}

async function postSetup(
  rawToken: string,
  ahSessionToken: string,
  body: Record<string, unknown>
) {
  const req = new NextRequest(
    new URL(`https://localhost/api/claim/${rawToken}/setup`, "https://localhost"),
    {
      method: "POST",
      headers: {
        cookie: `mynk_ah_session=${ahSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
  return setupPostHandler(req, { params: Promise.resolve({ token: rawToken }) });
}

function prismaP2002(): Error & { code: string } {
  return Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
}

describe("CC-2 consent_decline API (T5)", () => {
  it("writes all-off ConsentRecord v1 for claimed non-self learner", async () => {
    const fx = await createClaimedInviteFixture();

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent_decline",
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, version: 1 });

    const record = await db.consentRecord.findFirst({
      where: {
        learnerProfileId: fx.learnerProfileId,
        adminUserId: fx.adminUserId,
      },
      orderBy: { version: "desc" },
    });
    expect(record).not.toBeNull();
    expect(record!.version).toBe(1);
    expect(record!.allowLiveSession).toBe(false);
    expect(record!.allowAudioRecording).toBe(false);
    expect(record!.allowWhiteboardRecording).toBe(false);
    expect(record!.allowNoteSending).toBe(false);
    expect(record!.setByAccountHolderId).toBe(fx.ah.id);
    expect(record!.captureMethod).toBe("electronic");
  });

  it("increments version on a follow-on decline (v2 all-off)", async () => {
    const fx = await createClaimedInviteFixture();

    const res1 = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent_decline",
    });
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ ok: true, version: 1 });

    const res2 = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent_decline",
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ ok: true, version: 2 });

    const records = await db.consentRecord.findMany({
      where: {
        learnerProfileId: fx.learnerProfileId,
        adminUserId: fx.adminUserId,
      },
      orderBy: { version: "asc" },
    });
    expect(records).toHaveLength(2);
    expect(records[0].version).toBe(1);
    expect(records[1].version).toBe(2);
    for (const r of records) {
      expect(r.allowLiveSession).toBe(false);
      expect(r.allowAudioRecording).toBe(false);
      expect(r.allowWhiteboardRecording).toBe(false);
      expect(r.allowNoteSending).toBe(false);
    }
  });
});

describe("CC-2 consent_decline — self-learner exemption (D-5)", () => {
  it("returns 200 { skipped: true } and writes no ConsentRecord", async () => {
    const fx = await createClaimedInviteFixture({ isSelfLearner: true });

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent_decline",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });

    const count = await db.consentRecord.count({
      where: {
        learnerProfileId: fx.learnerProfileId,
        adminUserId: fx.adminUserId,
      },
    });
    expect(count).toBe(0);
  });
});

describe("H-1 — P2002 version race → 409 consent_already_saved", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("consent action returns 409 on P2002 create collision", async () => {
    const fx = await createClaimedInviteFixture();
    jest
      .spyOn(db.consentRecord, "create")
      .mockRejectedValueOnce(prismaP2002());

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent",
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "consent_already_saved" });
  });

  it("consent_decline action returns 409 on P2002 create collision", async () => {
    const fx = await createClaimedInviteFixture();
    jest
      .spyOn(db.consentRecord, "create")
      .mockRejectedValueOnce(prismaP2002());

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent_decline",
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "consent_already_saved" });
  });
});
