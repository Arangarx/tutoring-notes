/**
 * @jest-environment node
 *
 * Consent wave C1 (docs/handoff/consent-wave-plan.md § 2.1, F5): the one read of "every ConsentRecord for a
 * learner, newest per owner" lives in consent-scope.ts as `readLatestConsentPerOwner`, and child-consent.ts
 * keeps today's AND across owners on top of it.
 *
 * Oracles are literals typed here: the expected rows and the expected AND are written from the rule
 * ("one latest record per tutor and per organization; ceiling = AND across owners"), not read back from
 * the module under test. The `readChildConsentFacing` arm is a CHARACTERIZATION: it is green on the
 * pre-move code and must stay green after (behavior-preserving; C7, not C1, changes the display).
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

import { db } from "@/lib/db";
import { readChildConsentFacing } from "@/lib/child-consent";
import { readLatestConsentPerOwner } from "@/lib/consent-scope";
import { uniq } from "../helpers/unique-test-token";

afterAll(async () => {
  await db.$disconnect();
});

type Toggles = {
  allowLiveSession: boolean;
  allowAudioRecording: boolean;
  allowWhiteboardRecording: boolean;
  allowNoteSending: boolean;
};

const ALL_ON: Toggles = {
  allowLiveSession: true,
  allowAudioRecording: true,
  allowWhiteboardRecording: true,
  allowNoteSending: true,
};

async function seedLearner() {
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: "Per owner", isSelfLearner: false },
  });
  const tutorA = await db.adminUser.create({ data: { email: `${uniq("ta")}@example.com`, role: "TUTOR" } });
  const tutorB = await db.adminUser.create({ data: { email: `${uniq("tb")}@example.com`, role: "TUTOR" } });
  const org = await db.organization.create({
    data: { name: uniq("org"), createdByOperatorId: "operator@example.com", status: "active" },
  });
  return { ah, profile, tutorA, tutorB, org };
}

async function writeRecord(args: {
  profileId: string;
  holderId: string;
  owner: { adminUserId: string } | { organizationId: string };
  version: number;
  toggles?: Partial<Toggles>;
}) {
  return db.consentRecord.create({
    data: {
      learnerProfileId: args.profileId,
      setByAccountHolderId: args.holderId,
      captureMethod: "electronic",
      version: args.version,
      adminUserId: "adminUserId" in args.owner ? args.owner.adminUserId : null,
      organizationId: "organizationId" in args.owner ? args.owner.organizationId : null,
      ...ALL_ON,
      ...args.toggles,
    },
  });
}

describe("readLatestConsentPerOwner", () => {
  it("returns exactly one row per tutor and per organization: the highest version of each", async () => {
    const { ah, profile, tutorA, tutorB, org } = await seedLearner();
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorA.id }, version: 1, toggles: { allowAudioRecording: false } });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorA.id }, version: 2, toggles: { allowAudioRecording: true, allowNoteSending: false } });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorB.id }, version: 1 });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { organizationId: org.id }, version: 1, toggles: { allowLiveSession: false } });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { organizationId: org.id }, version: 2, toggles: { allowLiveSession: true, allowWhiteboardRecording: false } });

    const rows = await readLatestConsentPerOwner(profile.id);

    expect(rows).toHaveLength(3);
    const a = rows.find((r) => r.adminUserId === tutorA.id);
    const b = rows.find((r) => r.adminUserId === tutorB.id);
    const o = rows.find((r) => r.organizationId === org.id);
    expect(a).toMatchObject({ version: 2, organizationId: null, allowAudioRecording: true, allowNoteSending: false });
    expect(b).toMatchObject({ version: 1, organizationId: null, ...ALL_ON });
    expect(o).toMatchObject({ version: 2, adminUserId: null, allowLiveSession: true, allowWhiteboardRecording: false });
  });

  it("returns [] for a learner with no record, and never another learner's rows", async () => {
    const mine = await seedLearner();
    const other = await seedLearner();
    await writeRecord({ profileId: other.profile.id, holderId: other.ah.id, owner: { adminUserId: other.tutorA.id }, version: 1 });

    expect(await readLatestConsentPerOwner(mine.profile.id)).toEqual([]);
  });
});

describe("readChildConsentFacing across owners (characterization, behavior-preserving)", () => {
  it("ceiling is the AND of the latest record of every owner; older versions do not count", async () => {
    const { ah, profile, tutorA, tutorB, org } = await seedLearner();
    // Tutor A's v1 is the only record that turns audio off, and it is superseded: must not count.
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorA.id }, version: 1, toggles: { allowAudioRecording: false } });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorA.id }, version: 2 });
    // Tutor B latest turns notes off, the org latest turns whiteboard off.
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { adminUserId: tutorB.id }, version: 1, toggles: { allowNoteSending: false } });
    await writeRecord({ profileId: profile.id, holderId: ah.id, owner: { organizationId: org.id }, version: 1, toggles: { allowWhiteboardRecording: false } });

    const facing = await readChildConsentFacing(profile.id);

    expect(facing.ceiling).toEqual({
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: false,
      allowNoteSending: false,
    });
    expect(facing.effective).toEqual(facing.ceiling);
  });

  it("no record at all: every switch is off", async () => {
    const { profile } = await seedLearner();
    const facing = await readChildConsentFacing(profile.id);
    expect(facing.ceiling).toEqual({
      allowLiveSession: false,
      allowAudioRecording: false,
      allowWhiteboardRecording: false,
      allowNoteSending: false,
    });
  });
});
