/**
 * @jest-environment node
 *
 * J1. `tutorAppointmentsWhere` decides which appointments one tutor sees.
 * Each case seeds its own world and lists the ids the predicate returns.
 * Oracles are the seeded appointment ids.
 */
import { db } from "@/lib/db";
import { isOrgOwnedStudent, tutorAppointmentsWhere } from "@/lib/scheduling/tutor-appointments";
import {
  seedAdmin,
  seedAppointment,
  seedMember,
  seedOrg,
  seedOrgLearner,
  seedPersonalStudent,
} from "../helpers/org-seed";
import { uniq } from "../helpers/unique-test-token";

type World = {
  viewerId: string;
  /** Appointments the viewer must see. */
  included: string[];
  /** Appointments that exist in the database and must not be listed. */
  excluded: string[];
};

const FUTURE = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
const PAST = () => new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

/** The viewer's own private appointment. It proves a case is not passing by returning nothing. */
async function seedControl(viewerId: string): Promise<string> {
  const student = await seedPersonalStudent(viewerId, `Control ${uniq("kid")}`);
  return (await seedAppointment({ adminUserId: viewerId, studentId: student.id, subject: "Control" })).id;
}

async function listedIds(viewerId: string): Promise<string[]> {
  const rows = await db.scheduledSession.findMany({
    where: tutorAppointmentsWhere(viewerId),
    select: { id: true },
  });
  return rows.map((row) => row.id).sort();
}

const INCLUDED_CASES: Array<[string, () => Promise<World>]> = [
  [
    "own private student",
    async () => {
      const viewer = await seedAdmin("solo-tutor");
      const student = await seedPersonalStudent(viewer.id, "Pat Private");
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: student.id });
      return { viewerId: viewer.id, included: [row.id], excluded: [] };
    },
  ],
  [
    "an org appointment assigned to an instructor-only member",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"]);
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [row.id], excluded: [] };
    },
  ],
  [
    "an org appointment assigned to an owner who is also an instructor",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["owner", "instructor"]);
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [row.id], excluded: [] };
    },
  ],
  [
    "an org appointment while the organization is suspended",
    async () => {
      const { org, owner } = await seedOrg("suspended");
      const viewer = await seedMember(org.id, ["instructor"]);
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [row.id], excluded: [] };
    },
  ],
  [
    "an org appointment after the member was removed and then reactivated",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
      await db.organizationMember.update({
        where: {
          organizationId_adminUserId: { organizationId: org.id, adminUserId: viewer.id },
        },
        data: { removedAt: null },
      });
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [row.id], excluded: [] };
    },
  ],
];

const EXCLUDED_CASES: Array<[string, () => Promise<World>]> = [
  [
    "another instructor's org appointment",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"]);
      const other = await seedMember(org.id, ["instructor"]);
      const learner = await seedOrgLearner(org.id, owner.id);
      const theirs = await seedAppointment({ adminUserId: other.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [theirs.id] };
    },
  ],
  [
    "a removed member's past appointment",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
      const learner = await seedOrgLearner(org.id, owner.id);
      const past = await seedAppointment({
        adminUserId: viewer.id,
        studentId: learner.student.id,
        startAt: PAST(),
      });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [past.id] };
    },
  ],
  [
    "a removed member's live-protected future appointment",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
      const learner = await seedOrgLearner(org.id, owner.id);
      const future = await seedAppointment({
        adminUserId: viewer.id,
        studentId: learner.student.id,
        startAt: FUTURE(),
      });
      await db.whiteboardSession.create({
        data: {
          adminUserId: viewer.id,
          studentId: learner.student.id,
          scheduledSessionId: future.id,
          consentAcknowledged: true,
          eventsBlobUrl: "https://blob.example.com/j1-live.json",
          sessionPhase: "ACTIVE",
        },
      });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [future.id] };
    },
  ],
  [
    "an org appointment after the instructor role was dropped (scheduler only)",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["scheduler"]);
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "an org appointment while the member is waitlisted",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"], { approvalStatus: "WAITLISTED" });
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "an org appointment while the member is a test account",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedMember(org.id, ["instructor"], { isTestAccount: true });
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "a corrupt seed: an org appointment on a tutor with no membership at all",
    async () => {
      const { org, owner } = await seedOrg();
      const viewer = await seedAdmin("stranger");
      const learner = await seedOrgLearner(org.id, owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "an env-only student whose owner fields are both null",
    async () => {
      const viewer = await seedAdmin("env-viewer");
      const student = await db.student.create({
        data: { name: `Env ${uniq("kid")}`, adminUserId: null, organizationId: null },
      });
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "a private row on another tutor's student",
    async () => {
      const viewer = await seedAdmin("viewer");
      const other = await seedAdmin("other-tutor");
      const student = await seedPersonalStudent(other.id, "Their Kid");
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
  [
    "a learner of an organization where the tutor is not a member",
    async () => {
      const home = await seedOrg();
      const foreign = await seedOrg();
      const viewer = await seedMember(home.org.id, ["instructor"]);
      const learner = await seedOrgLearner(foreign.org.id, foreign.owner.id);
      const row = await seedAppointment({ adminUserId: viewer.id, studentId: learner.student.id });
      return { viewerId: viewer.id, included: [await seedControl(viewer.id)], excluded: [row.id] };
    },
  ],
];

describe("J1 tutorAppointmentsWhere matrix", () => {
  it.each(INCLUDED_CASES)("lists %s", async (_label, build) => {
    const world = await build();
    expect(await listedIds(world.viewerId)).toEqual([...world.included].sort());
  });

  it.each(EXCLUDED_CASES)("does not list %s", async (_label, build) => {
    const world = await build();
    const ids = await listedIds(world.viewerId);
    for (const id of world.excluded) expect(ids).not.toContain(id);
    expect(ids).toEqual([...world.included].sort());
  });
});

describe("J1 isOrgOwnedStudent", () => {
  it.each([
    [{ adminUserId: null, organizationId: "org-1" }, true],
    [{ adminUserId: "tutor-1", organizationId: null }, false],
    [{ adminUserId: null, organizationId: null }, false],
    [{ adminUserId: "tutor-1", organizationId: "org-1" }, false],
  ])("%j is org-owned: %s", (student, expected) => {
    expect(isOrgOwnedStudent(student)).toBe(expected);
  });
});
