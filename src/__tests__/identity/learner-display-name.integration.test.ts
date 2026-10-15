/**
 * @jest-environment node
 *
 * Display name edits: a second save updates the private tutor roster,
 * an organization roster row keeps its own name, and another family cannot write it.
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

import { db } from "@/lib/db";
import { saveOwnedLearnerDisplayName } from "@/lib/learner-display-name";
import { uniq } from "../helpers/unique-test-token";

afterAll(async () => {
  await db.$disconnect();
});

async function createOwnedProfile(opts?: { accountDisplayName?: string; isSelfLearner?: boolean }) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
  const ah = await db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      displayName: opts?.accountDisplayName,
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: "Maya",
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
  const student = await db.student.create({
    data: {
      name: "Maya",
      adminUserId: tutor.id,
      learnerProfileId: profile.id,
    },
  });
  return { tutor, ah, profile, student };
}

describe("saveOwnedLearnerDisplayName", () => {
  it("updates the private roster on a second save and leaves an organization row unchanged", async () => {
    const fx = await createOwnedProfile();
    const org = await db.organization.create({
      data: {
        name: `Name org ${uniq("org")}`,
        createdByOperatorId: "name-op@test.local",
      },
      select: { id: true },
    });
    const orgStudent = await db.student.create({
      data: {
        name: "Org roster label",
        adminUserId: null,
        organizationId: org.id,
        learnerProfileId: fx.profile.id,
      },
    });

    const first = await saveOwnedLearnerDisplayName({
      accountHolderId: fx.ah.id,
      learnerProfileId: fx.profile.id,
      rawDisplayName: "Maya Rodriguez",
    });
    const second = await saveOwnedLearnerDisplayName({
      accountHolderId: fx.ah.id,
      learnerProfileId: fx.profile.id,
      rawDisplayName: "Maya R. Lopez",
    });

    expect(first).toEqual({ ok: true, displayName: "Maya Rodriguez" });
    expect(second).toEqual({ ok: true, displayName: "Maya R. Lopez" });

    const profile = await db.learnerProfile.findUniqueOrThrow({ where: { id: fx.profile.id } });
    const student = await db.student.findUniqueOrThrow({ where: { id: fx.student.id } });
    const orgRow = await db.student.findUniqueOrThrow({ where: { id: orgStudent.id } });
    expect(profile.displayName).toBe("Maya R. Lopez");
    expect(student.name).toBe("Maya R. Lopez");
    expect(orgRow.name).toBe("Org roster label");
  });

  it("does not let another family change the name", async () => {
    const fx = await createOwnedProfile();
    const stranger = await db.accountHolder.create({
      data: {
        email: `${uniq("stranger")}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });

    const result = await saveOwnedLearnerDisplayName({
      accountHolderId: stranger.id,
      learnerProfileId: fx.profile.id,
      rawDisplayName: "Not their child",
    });

    expect(result).toEqual({ ok: false, error: "forbidden" });
    const profile = await db.learnerProfile.findUniqueOrThrow({ where: { id: fx.profile.id } });
    const student = await db.student.findUniqueOrThrow({ where: { id: fx.student.id } });
    expect(profile.displayName).toBe("Maya");
    expect(student.name).toBe("Maya");
  });

  it("fills an empty self-learner account name once and keeps a name they already had", async () => {
    const empty = await createOwnedProfile({ isSelfLearner: true });
    await saveOwnedLearnerDisplayName({
      accountHolderId: empty.ah.id,
      learnerProfileId: empty.profile.id,
      rawDisplayName: "Ada Lovelace",
    });
    await saveOwnedLearnerDisplayName({
      accountHolderId: empty.ah.id,
      learnerProfileId: empty.profile.id,
      rawDisplayName: "A. Lovelace",
    });
    const filled = await db.accountHolder.findUniqueOrThrow({ where: { id: empty.ah.id } });
    const roster = await db.student.findUniqueOrThrow({ where: { id: empty.student.id } });
    expect(filled.displayName).toBe("Ada Lovelace");
    expect(roster.name).toBe("A. Lovelace");

    const named = await createOwnedProfile({
      isSelfLearner: true,
      accountDisplayName: "Signup Name",
    });
    await saveOwnedLearnerDisplayName({
      accountHolderId: named.ah.id,
      learnerProfileId: named.profile.id,
      rawDisplayName: "Tutor Facing",
    });
    const account = await db.accountHolder.findUniqueOrThrow({ where: { id: named.ah.id } });
    expect(account.displayName).toBe("Signup Name");
  });
});
