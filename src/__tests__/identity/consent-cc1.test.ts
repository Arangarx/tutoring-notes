/**
 * @jest-environment node
 *
 * CC-1 — the record-exists gate, now answered by the ONE entry rule (`sessionEntryState`) over the loader's
 * inputs (consent wave C5 deleted the second, separate existence check). Same cases, same
 * oracles (spec: no record means no entry; a record's audio switch does not matter; an organization-owned
 * learner is read from the organization's row), asserted through `loadSessionEntryState`.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { decisionReason } from "@/lib/scheduling/session-entry";
import { loadSessionEntryState } from "@/lib/scheduling/session-entry-loader";
import { uniq } from "../helpers/unique-test-token";

async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
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
  version: number,
  overrides: { allowAudioRecording?: boolean } = {}
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
      allowAudioRecording: overrides.allowAudioRecording ?? true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.accountHolderId,
      captureMethod: "electronic",
    },
  });
}

/** The entry state for a tutor-owned student row with this learner (an unclaimed student has no learnerProfileId). */
function privateEntry(tutorId: string, learnerProfileId: string | null, isSelfLearner = false) {
  return loadSessionEntryState({
    studentId: randomUUID(),
    adminUserId: tutorId,
    student: {
      adminUserId: tutorId,
      organizationId: null,
      learnerProfileId,
      learnerProfile: learnerProfileId ? { isSelfLearner } : null,
    },
  });
}

afterAll(async () => {
  await db.$disconnect();
});

describe("record-exists gate through the entry rule", () => {
  it("unclaimed (learnerProfileId null): refused in both modes as unclaimed", async () => {
    const tutor = await createTutor();
    const state = await privateEntry(tutor.id, null);
    expect(decisionReason(state.online)).toBe("unclaimed");
    expect(decisionReason(state.inPerson)).toBe("unclaimed");
  });

  it("claimed + no ConsentRecord: refused in both modes (parent has not finished preferences)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);

    const state = await privateEntry(tutor.id, profile.id);
    expect(decisionReason(state.online)).toBe("consent_missing_parent");
    expect(decisionReason(state.inPerson)).toBe("consent_missing_parent");
  });

  it("claimed + ConsentRecord exists: both modes allowed", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    await createConsentRecord(profile.id, tutor.id, 1);

    const state = await privateEntry(tutor.id, profile.id);
    expect(state.online).toEqual({ allowed: true });
    expect(state.inPerson).toEqual({ allowed: true });
  });

  it("self-learner + no ConsentRecord: refused in both modes with the self-learner reason", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });

    const state = await privateEntry(tutor.id, profile.id, true);
    expect(decisionReason(state.online)).toBe("consent_missing_self");
    expect(decisionReason(state.inPerson)).toBe("consent_missing_self");
  });

  it("self-learner with a record, even when audio is off, is allowed (only the online switch decides entry)", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    await createConsentRecord(profile.id, tutor.id, 1, { allowAudioRecording: false });

    const state = await privateEntry(tutor.id, profile.id, true);
    expect(state.online).toEqual({ allowed: true });
    expect(state.inPerson).toEqual({ allowed: true });
  });

  it("org-owned self-learner is read from the organization's consent row", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const org = await db.organization.create({
      data: { name: uniq("org-exists"), createdByOperatorId: tutor.id, status: "active" },
    });
    const student = await db.student.create({
      data: {
        name: "Org exists",
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
      },
    });
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: null,
        organizationId: org.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: false,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });

    // The record is the organization's (adminUserId null), not the tutor's: reading it proves the owner comes
    // from the Student row. Admission is not what this asserts, so the instructor is admitted.
    await db.organizationMember.create({
      data: { organizationId: org.id, adminUserId: tutor.id, roles: ["instructor"] },
    });
    const state = await loadSessionEntryState({
      studentId: student.id,
      adminUserId: tutor.id,
      student: {
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: profile.id,
        learnerProfile: { isSelfLearner: true },
      },
    });
    expect(state.online).toEqual({ allowed: true });
    expect(state.inPerson).toEqual({ allowed: true });
  });
});
