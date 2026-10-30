/**
 * @jest-environment node
 *
 * W3 parity tests.
 * J6 one membership rule: the shared fragment, `orgInstructorAdmitted`, and the
 *    booking choices all agree with a hand-written truth table.
 * J7 the organization tab and the Schedule list the same appointments for one org.
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

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

const mockGetServerSession = jest.fn();
jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));
jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { activeOrgInstructorMemberWhere } from "@/lib/org-appointment-scope";
import { orgInstructorAdmitted } from "@/lib/org-scope";
import {
  listOrganizationBookingChoices,
  listScheduledSessionsForOrganization,
  listScheduledSessionsForTutor,
} from "@/app/admin/schedule/actions";
import {
  seedAdmin,
  seedAppointment,
  seedMember,
  seedOrg,
  seedOrgLearner,
} from "../helpers/org-seed";

const NO_GOOGLE = { connected: false, reconnectRequired: false };

function mockSession(admin: { email: string; id: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: admin.email, id: admin.id, name: admin.email, isImpersonating: false },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

beforeEach(() => {
  mockGetServerSession.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

type Candidate = { id: string };

/** Hand-written truth table. `true` = may take an appointment in an active organization. */
const TRUTH: Array<[string, boolean, (orgId: string) => Promise<Candidate>]> = [
  ["an approved instructor", true, (orgId) => seedMember(orgId, ["instructor"])],
  ["an owner who is also an instructor", true, (orgId) => seedMember(orgId, ["owner", "instructor"])],
  ["an admin who is also an instructor", true, (orgId) => seedMember(orgId, ["admin", "instructor"])],
  [
    "an instructor who was removed",
    false,
    (orgId) => seedMember(orgId, ["instructor"], { removedAt: new Date() }),
  ],
  ["a scheduler without the instructor role", false, (orgId) => seedMember(orgId, ["scheduler"])],
  ["an owner without the instructor role", false, (orgId) => seedMember(orgId, ["owner"])],
  [
    "a waitlisted instructor",
    false,
    (orgId) => seedMember(orgId, ["instructor"], { approvalStatus: "WAITLISTED" }),
  ],
  [
    "a rejected instructor",
    false,
    (orgId) => seedMember(orgId, ["instructor"], { approvalStatus: "REJECTED" }),
  ],
  [
    "a test-account instructor",
    false,
    (orgId) => seedMember(orgId, ["instructor"], { isTestAccount: true }),
  ],
  ["a tutor who is not a member", false, () => seedAdmin("outsider")],
  [
    "an instructor of a different organization only",
    false,
    async () => {
      const elsewhere = await seedOrg();
      return seedMember(elsewhere.org.id, ["instructor"]);
    },
  ],
];

describe("J6 one membership rule", () => {
  it.each(TRUTH)("%s: expected %s", async (_label, expected, build) => {
    const { org, owner } = await seedOrg("active");
    const candidate = await build(org.id);

    const fragment =
      (await db.organizationMember.count({
        where: { organizationId: org.id, ...activeOrgInstructorMemberWhere(candidate.id) },
      })) > 0;
    const admitted = await orgInstructorAdmitted(db, org.id, candidate.id);
    mockSession(owner);
    const choices = await listOrganizationBookingChoices(org.id);
    const inChoices = choices.instructors.some((instructor) => instructor.id === candidate.id);

    expect({ fragment, admitted, inChoices }).toEqual({
      fragment: expected,
      admitted: expected,
      inChoices: expected,
    });
  });

  it("without the id, the fragment matches every active instructor and no one else", async () => {
    const { org } = await seedOrg("active");
    const good = await seedMember(org.id, ["instructor"]);
    await seedMember(org.id, ["scheduler"]);
    await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const rows = await db.organizationMember.findMany({
      where: { organizationId: org.id, ...activeOrgInstructorMemberWhere() },
      select: { adminUserId: true },
    });
    expect(rows.map((row) => row.adminUserId)).toEqual([good.id]);
  });

  it("admission refuses an empty member id instead of matching every instructor", async () => {
    const { org } = await seedOrg("active");
    await seedMember(org.id, ["instructor"]);
    expect(await orgInstructorAdmitted(db, org.id, "")).toBe(false);
  });

  it.each(["pending", "suspended"] as const)(
    "admission still refuses a valid instructor while the organization is %s",
    async (status) => {
      const { org } = await seedOrg(status);
      const instructor = await seedMember(org.id, ["instructor"]);
      expect(await orgInstructorAdmitted(db, org.id, instructor.id)).toBe(false);
    }
  );
});

describe("J7 organization tab and Schedule agree for one organization", () => {
  it("an instructor-only member sees the same org X appointments in both", async () => {
    const x = await seedOrg();
    const y = await seedOrg();
    const me = await seedMember(x.org.id, ["instructor"]);
    await db.organizationMember.create({
      data: { organizationId: y.org.id, adminUserId: me.id, roles: ["instructor"] },
    });
    const rival = await seedMember(x.org.id, ["instructor"]);
    const learnerOne = await seedOrgLearner(x.org.id, x.owner.id, { givenName: "Ana", familyName: "Xone" });
    const learnerTwo = await seedOrgLearner(x.org.id, x.owner.id, { givenName: "Ben", familyName: "Xtwo" });
    const learnerY = await seedOrgLearner(y.org.id, y.owner.id, { givenName: "Cy", familyName: "Yone" });
    const learnerRival = await seedOrgLearner(x.org.id, x.owner.id, { givenName: "Di", familyName: "Xrival" });
    const one = await seedAppointment({ adminUserId: me.id, studentId: learnerOne.student.id });
    const two = await seedAppointment({ adminUserId: me.id, studentId: learnerTwo.student.id });
    const inY = await seedAppointment({ adminUserId: me.id, studentId: learnerY.student.id });
    await seedAppointment({ adminUserId: rival.id, studentId: learnerRival.student.id });

    mockSession(me);
    const orgTab = (await listScheduledSessionsForOrganization(x.org.id)).map((row) => row.id).sort();
    const schedule = await listScheduledSessionsForTutor(NO_GOOGLE);
    const scheduleForX = schedule
      .filter((row) => row.source.kind === "org" && row.source.organizationId === x.org.id)
      .map((row) => row.id)
      .sort();

    expect(orgTab).toEqual([one.id, two.id].sort());
    expect(scheduleForX).toEqual(orgTab);
    expect(schedule.map((row) => row.id)).toContain(inY.id);
    expect(orgTab).not.toContain(inY.id);
  });
});
