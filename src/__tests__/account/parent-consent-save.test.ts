/**
 * @jest-environment node
 *
 * B2 Step 6 — saveParentConsentAction integration tests.
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

jest.mock("@/lib/server-session", () => ({
  getAccountHolderSessionFromHeaders: jest.fn(),
  requireAccountHolderSession: jest.fn(),
  hasAccountHolderSessionCookie: jest.fn(),
  getLearnerSessionFromHeaders: jest.fn(),
  hasLearnerSessionCookie: jest.fn(),
}));

jest.mock("@/lib/consent-write", () => {
  const actual = jest.requireActual<typeof import("@/lib/consent-write")>(
    "@/lib/consent-write"
  );
  return {
    ...actual,
    createVersionedConsentRecord: jest.fn(actual.createVersionedConsentRecord),
  };
});

import { db } from "@/lib/db";
import { saveParentConsentAction } from "@/app/account/children/[id]/consent/actions";
import { getAccountHolderSessionFromHeaders } from "@/lib/server-session";
import {
  ConsentAlreadySavedError,
  createVersionedConsentRecord,
} from "@/lib/consent-write";
import { uniq } from "../helpers/unique-test-token";


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

async function createStudent(adminUserId: string, learnerProfileId: string) {
  return db.student.create({
    data: { name: "Test Student", adminUserId, learnerProfileId },
  });
}

const defaultRestrictions = {
  restrictAudioRecording: false,
  restrictWhiteboardRecording: false,
  restrictNoteSending: false,
};

afterAll(async () => {
  await db.$disconnect();
});

describe("saveParentConsentAction", () => {
  it("creates versioned ConsentRecord rows and upserts ConsentRestriction", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });

    const result = await saveParentConsentAction(profile.id, {
      tutors: [
        {
          adminUserId: tutor.id,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: {
        restrictAudioRecording: true,
        restrictWhiteboardRecording: false,
        restrictNoteSending: false,
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tutorVersions?.[tutor.id]).toBe(1);

    const record = await db.consentRecord.findFirst({
      where: { learnerProfileId: profile.id, adminUserId: tutor.id },
      orderBy: { version: "desc" },
    });
    expect(record).toMatchObject({
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: false,
      allowNoteSending: false,
      setByAccountHolderId: ah.id,
    });

    const restriction = await db.consentRestriction.findUnique({
      where: { learnerProfileId: profile.id },
    });
    expect(restriction?.restrictAudioRecording).toBe(true);
  });

  it("increments ConsentRecord version on subsequent saves", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValue({
      accountHolderId: ah.id,
    });

    const input = {
      tutors: [
        {
          adminUserId: tutor.id,
          allowLiveSession: false,
          allowAudioRecording: false,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultRestrictions,
    };

    const first = await saveParentConsentAction(profile.id, input);
    expect(first.tutorVersions?.[tutor.id]).toBe(1);

    const second = await saveParentConsentAction(profile.id, {
      ...input,
      tutors: [{ ...input.tutors[0], allowLiveSession: true }],
    });
    expect(second.tutorVersions?.[tutor.id]).toBe(2);

    const latest = await db.consentRecord.findFirst({
      where: { learnerProfileId: profile.id, adminUserId: tutor.id },
      orderBy: { version: "desc" },
    });
    expect(latest?.version).toBe(2);
    expect(latest?.allowLiveSession).toBe(true);
  });

  it("returns unauthorized when no session exists", async () => {
    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce(null);

    const result = await saveParentConsentAction("learner-1", {
      tutors: [
        {
          adminUserId: "tutor-1",
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultRestrictions,
    });

    expect(result).toEqual({ ok: false, error: "unauthorized" });
  });

  it("denies parent B saving consent for parent A's learner", async () => {
    const tutor = await createTutor();
    const ahA = await createAccountHolder();
    const ahB = await createAccountHolder();
    const profile = await createLearnerProfile(ahA.id);
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ahB.id,
    });

    await expect(
      saveParentConsentAction(profile.id, {
        tutors: [
          {
            adminUserId: tutor.id,
            allowLiveSession: true,
            allowAudioRecording: true,
            allowWhiteboardRecording: false,
            allowNoteSending: false,
          },
        ],
        restrictions: defaultRestrictions,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("rejects tutor ids not linked to the learner", async () => {
    const tutor = await createTutor();
    const otherTutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });

    const result = await saveParentConsentAction(profile.id, {
      tutors: [
        {
          adminUserId: otherTutor.id,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultRestrictions,
    });

    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects self-learner profiles", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });

    const result = await saveParentConsentAction(profile.id, {
      tutors: [
        {
          adminUserId: tutor.id,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultRestrictions,
    });

    expect(result).toEqual({ ok: false, error: "self_learner" });

    const count = await db.consentRecord.count({
      where: { learnerProfileId: profile.id },
    });
    expect(count).toBe(0);
  });

  it("returns consent_already_saved on P2002 version race", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createStudent(tutor.id, profile.id);

    (getAccountHolderSessionFromHeaders as jest.Mock).mockResolvedValueOnce({
      accountHolderId: ah.id,
    });

    (createVersionedConsentRecord as jest.Mock).mockRejectedValueOnce(
      new ConsentAlreadySavedError()
    );

    const result = await saveParentConsentAction(profile.id, {
      tutors: [
        {
          adminUserId: tutor.id,
          allowLiveSession: true,
          allowAudioRecording: true,
          allowWhiteboardRecording: false,
          allowNoteSending: false,
        },
      ],
      restrictions: defaultRestrictions,
    });

    expect(result).toEqual({ ok: false, error: "consent_already_saved" });
  });
});
