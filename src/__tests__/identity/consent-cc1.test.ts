/**
 * @jest-environment node
 *
 * CC-1 — assertConsentRecordExists unit/integration tests (T9, record-exists gate).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { db } from "@/lib/db";
import { assertConsentRecordExists, ConsentError } from "@/lib/consent-scope";

let uniqueSuffix = 0;
function uniq(prefix = "cc1") {
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

async function createLearnerProfile(
  accountHolderId: string,
  opts?: { isSelfLearner?: boolean }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createConsentRecord(
  learnerProfileId: string,
  adminUserId: string,
  version: number
) {
  const ah = await db.learnerProfile.findUniqueOrThrow({
    where: { id: learnerProfileId },
    select: { accountHolderId: true },
  });
  return db.consentRecord.create({
    data: {
      learnerProfileId,
      adminUserId,
      version,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.accountHolderId,
      captureMethod: "electronic",
    },
  });
}

afterAll(async () => {
  await db.$disconnect();
});

describe("assertConsentRecordExists", () => {
  it("unclaimed (learnerProfileId null) → throws ConsentError", async () => {
    const tutor = await createTutor();
    await expect(
      assertConsentRecordExists(null, tutor.id)
    ).rejects.toThrow(ConsentError);
    await expect(assertConsentRecordExists(null, tutor.id)).rejects.toMatchObject({
      permission: "consentRecord",
    });
  });

  it("claimed + no ConsentRecord → throws ConsentError", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);

    await expect(
      assertConsentRecordExists(profile.id, tutor.id)
    ).rejects.toThrow(ConsentError);
  });

  it("claimed + ConsentRecord exists → passes", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createConsentRecord(profile.id, tutor.id, 1);

    await expect(
      assertConsentRecordExists(profile.id, tutor.id)
    ).resolves.toBeUndefined();
  });

  it("self-learner + no ConsentRecord → passes (T9 / D-5)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });

    await expect(
      assertConsentRecordExists(profile.id, tutor.id)
    ).resolves.toBeUndefined();
  });
});
