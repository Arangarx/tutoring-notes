/**
 * @jest-environment node
 *
 * CC-2 consent API — claim setup route happy-path integration tests
 *
 * Coverage:
 *   consent action writes ConsentRecord v1 with parent-selected flags
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
import { uniq } from "../helpers/unique-test-token";

const TEST_HMAC_SECRET_AH = "test-ah-session-secret-minimum-32-bytes-xxxx";

beforeAll(async () => {
  process.env.AH_SESSION_HMAC_SECRET = TEST_HMAC_SECRET_AH;
});

afterAll(async () => {
  await db.$disconnect();
});


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

describe("CC-2 consent API — happy path", () => {
  it("writes ConsentRecord v1 with parent-selected flags for claimed minor", async () => {
    const fx = await createClaimedInviteFixture();

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent",
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1 });

    const record = await db.consentRecord.findFirst({
      where: {
        learnerProfileId: fx.learnerProfileId,
        adminUserId: fx.adminUserId,
      },
      orderBy: { version: "desc" },
    });
    expect(record).not.toBeNull();
    expect(record!.version).toBe(1);
    expect(record!.allowLiveSession).toBe(true);
    expect(record!.allowAudioRecording).toBe(true);
    expect(record!.allowWhiteboardRecording).toBe(true);
    expect(record!.allowNoteSending).toBe(true);
    expect(record!.setByAccountHolderId).toBe(fx.ah.id);
    expect(record!.captureMethod).toBe("electronic");
  });

  it("persists toggled-off flags when parent declines optional permissions", async () => {
    const fx = await createClaimedInviteFixture();

    const res = await postSetup(fx.rawToken, fx.ahSessionToken, {
      action: "consent",
      allowLiveSession: true,
      allowAudioRecording: false,
      allowWhiteboardRecording: true,
      allowNoteSending: false,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: 1 });

    const record = await db.consentRecord.findFirst({
      where: {
        learnerProfileId: fx.learnerProfileId,
        adminUserId: fx.adminUserId,
      },
    });
    expect(record).not.toBeNull();
    expect(record!.allowLiveSession).toBe(true);
    expect(record!.allowAudioRecording).toBe(false);
    expect(record!.allowWhiteboardRecording).toBe(true);
    expect(record!.allowNoteSending).toBe(false);
    expect(record!.setByAccountHolderId).toBe(fx.ah.id);
  });
});
