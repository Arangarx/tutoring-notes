/**
 * @jest-environment node
 *
 * LEAK-1 role matrix. Oracles are seeded appointment ids and learner names.
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
import { loadInstructorTaughtSessions } from "@/lib/org-learner";
import {
  listOrganizationBookingChoices,
  listScheduledSessionsForOrganization,
} from "@/app/admin/schedule/actions";
import { uniq } from "../helpers/unique-test-token";

type OrgList = (
  organizationId: string,
  learnerId?: string
) => ReturnType<typeof listScheduledSessionsForOrganization>;

const listOrg = listScheduledSessionsForOrganization as OrgList;

function mockSession(email: string, id: string) {
  mockGetServerSession.mockResolvedValue({
    user: { email, id, name: email, isImpersonating: false },
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

async function seedAdmin(label: string) {
  return db.adminUser.create({
    data: {
      email: `${uniq(label)}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
      displayName: label,
      isTestAccount: false,
    },
  });
}

async function seedOrg() {
  const owner = await seedAdmin("owner");
  const org = await db.organization.create({
    data: {
      name: `Org ${uniq("org")}`,
      status: "active",
      timezone: "America/Denver",
      createdByOperatorId: "org-operator@example.com",
      members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
    },
  });
  return { org, owner };
}

async function seedMember(
  organizationId: string,
  roles: Array<"owner" | "admin" | "scheduler" | "instructor">,
  opts?: { removedAt?: Date | null }
) {
  const admin = await seedAdmin(roles.join("-"));
  await db.organizationMember.create({
    data: {
      organizationId,
      adminUserId: admin.id,
      roles,
      removedAt: opts?.removedAt ?? null,
    },
  });
  return admin;
}

async function seedLearner(
  organizationId: string,
  createdByAdminUserId: string,
  givenName: string,
  familyName: string
) {
  const parentEmail = `${uniq("parent-secret")}@example.com`;
  const brief = `brief-secret-${uniq("brief")}`;
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: `${givenName} ${familyName}`,
      isSelfLearner: false,
    },
  });
  const student = await db.student.create({
    data: {
      name: `${givenName} ${familyName}`,
      adminUserId: null,
      organizationId,
      learnerProfileId: profile.id,
      parentEmail,
    },
  });
  await db.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId,
      givenName,
      familyName,
      brief,
      createdByAdminUserId,
    },
  });
  await db.consentRecord.create({
    data: {
      learnerProfileId: profile.id,
      adminUserId: null,
      organizationId,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.id,
      captureMethod: "electronic",
    },
  });
  return { student, parentEmail, brief, fullName: `${givenName} ${familyName}` };
}

async function seedTaughtSession(adminUserId: string, studentId: string) {
  return db.whiteboardSession.create({
    data: {
      adminUserId,
      studentId,
      consentAcknowledged: true,
      eventsBlobUrl: "https://blob.example.com/taught-events.json",
      sessionPhase: "ACTIVE",
    },
  });
}

async function seedAppointment(adminUserId: string, studentId: string, subject: string) {
  return db.scheduledSession.create({
    data: {
      adminUserId,
      studentId,
      date: new Date("2026-10-20T00:00:00.000Z"),
      startTime: "16:00",
      endTime: "17:00",
      startAt: new Date("2026-10-20T22:00:00.000Z"),
      endAt: new Date("2026-10-20T23:00:00.000Z"),
      plannedDurationMinutes: 60,
      subject,
    },
  });
}

async function seedPair() {
  const { org, owner } = await seedOrg();
  const instructor = await seedMember(org.id, ["instructor"]);
  const other = await seedMember(org.id, ["instructor"]);
  const admin = await seedMember(org.id, ["admin"]);
  const scheduler = await seedMember(org.id, ["scheduler"]);
  const both = await seedMember(org.id, ["instructor", "scheduler"]);
  const removed = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
  const learnerA = await seedLearner(org.id, owner.id, "Zada", uniq("quin"));
  const learnerB = await seedLearner(org.id, owner.id, "Zeba", uniq("quinn"));
  const appointmentA = await seedAppointment(instructor.id, learnerA.student.id, "Algebra");
  const appointmentB = await seedAppointment(other.id, learnerB.student.id, "Geometry");
  return {
    org,
    owner,
    instructor,
    other,
    admin,
    scheduler,
    both,
    removed,
    learnerA,
    learnerB,
    appointmentA,
    appointmentB,
  };
}

describe("listScheduledSessionsForOrganization role matrix", () => {
  it("owner, admin, scheduler, and instructor-plus-scheduler see both appointments", async () => {
    const seeded = await seedPair();
    for (const actor of [seeded.owner, seeded.admin, seeded.scheduler, seeded.both]) {
      mockSession(actor.email, actor.id);
      const rows = await listOrg(seeded.org.id);
      const ids = rows.map((row) => row.id).sort();
      expect(ids).toEqual([seeded.appointmentA.id, seeded.appointmentB.id].sort());
    }
  });

  it("an instructor sees only the appointment they teach", async () => {
    const seeded = await seedPair();
    mockSession(seeded.instructor.email, seeded.instructor.id);
    const findMany = jest.spyOn(db.scheduledSession, "findMany");
    const rows = await listOrg(seeded.org.id);
    expect(rows.map((row) => row.id)).toEqual([seeded.appointmentA.id]);
    expect(rows.map((row) => row.learnerName)).toEqual([seeded.learnerA.fullName]);
    expect(JSON.stringify(rows)).not.toContain(seeded.learnerB.fullName);
    expect(JSON.stringify(rows)).not.toContain(seeded.learnerA.parentEmail);
    expect(JSON.stringify(rows)).not.toContain(seeded.learnerA.brief);
    expect(JSON.stringify(rows)).not.toContain(seeded.learnerB.parentEmail);
    const selectBlob = JSON.stringify(findMany.mock.calls.map((call) => call[0]));
    expect(selectBlob).not.toContain("parentEmail");
    expect(selectBlob).not.toContain("brief");
    expect(selectBlob).not.toContain("consentRecord");
    expect(selectBlob).not.toContain("allowLiveSession");
  });

  it("an instructor filter for a learner in another org matches an unknown id", async () => {
    const seeded = await seedPair();
    const otherOrg = await seedOrg();
    const foreign = await seedLearner(otherOrg.org.id, otherOrg.owner.id, "Zora", uniq("quo"));
    await seedAppointment(seeded.instructor.id, foreign.student.id, "Foreign algebra");
    mockSession(seeded.instructor.email, seeded.instructor.id);
    const foreignRows = await listOrg(seeded.org.id, foreign.student.id);
    const missingRows = await listOrg(seeded.org.id, `missing-${uniq("learner")}`);
    expect(foreignRows).toEqual([]);
    expect(missingRows).toEqual([]);
    expect(foreignRows).toEqual(missingRows);
    expect(JSON.stringify(foreignRows)).not.toContain(foreign.fullName);
    expect(JSON.stringify(foreignRows)).not.toContain(foreign.parentEmail);
  });

  it("an instructor learner filter yields nothing for an unbooked id and an unknown id", async () => {
    const seeded = await seedPair();
    mockSession(seeded.instructor.email, seeded.instructor.id);
    const unbooked = await listOrg(seeded.org.id, seeded.learnerB.student.id);
    expect(unbooked).toEqual([]);
    const missing = await listOrg(seeded.org.id, `missing-${uniq("learner")}`);
    expect(missing).toEqual([]);
    const own = await listOrg(seeded.org.id, seeded.learnerA.student.id);
    expect(own.map((row) => row.id)).toEqual([seeded.appointmentA.id]);
  });

  it("a staff member still sees both appointments when a learner id is present", async () => {
    const seeded = await seedPair();
    mockSession(seeded.scheduler.email, seeded.scheduler.id);
    const rows = await listOrg(seeded.org.id, `missing-${uniq("learner")}`);
    expect(rows.map((row) => row.id).sort()).toEqual(
      [seeded.appointmentA.id, seeded.appointmentB.id].sort()
    );
  });

  it("another org's member and a removed member are not found", async () => {
    const seeded = await seedPair();
    const strangerOrg = await seedOrg();
    mockSession(strangerOrg.owner.email, strangerOrg.owner.id);
    await expect(listOrg(seeded.org.id)).rejects.toThrow("NEXT_NOT_FOUND");

    mockSession(seeded.removed.email, seeded.removed.id);
    await expect(listOrg(seeded.org.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("an instructor cannot load every learner as booking choices", async () => {
    const seeded = await seedPair();
    mockSession(seeded.instructor.email, seeded.instructor.id);
    await expect(listOrganizationBookingChoices(seeded.org.id)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("logs the instructor list with the org prefix and no invite token", async () => {
    const seeded = await seedPair();
    const lines: string[] = [];
    jest.spyOn(console, "log").mockImplementation((line?: unknown) => {
      lines.push(String(line));
    });
    mockSession(seeded.instructor.email, seeded.instructor.id);
    await listOrg(seeded.org.id);
    const line = lines.find((entry) => entry.includes("action=appointment_list"));
    expect(line).toContain(`[org] org=${seeded.org.id}`);
    expect(line).toContain("scope=instructor");
    expect(line).toContain(`actor=${seeded.instructor.id}`);
    expect(line ?? "").not.toMatch(/token=/);
    expect(line ?? "").not.toContain(seeded.learnerA.parentEmail);
  });
});

describe("loadInstructorTaughtSessions", () => {
  it("groups only the sessions this instructor taught", async () => {
    const seeded = await seedPair();
    const sessionA = await seedTaughtSession(seeded.instructor.id, seeded.learnerA.student.id);
    const sessionB = await seedTaughtSession(seeded.other.id, seeded.learnerB.student.id);
    mockSession(seeded.instructor.email, seeded.instructor.id);

    const groups = await loadInstructorTaughtSessions(seeded.org.id);
    expect(groups).toEqual([
      {
        studentId: seeded.learnerA.student.id,
        fullName: seeded.learnerA.fullName,
        sessions: [
          {
            sessionId: sessionA.id,
            noteCount: 0,
            replayAvailable: true,
            audioAvailable: false,
            transcriptAvailable: false,
          },
        ],
      },
    ]);
    expect(JSON.stringify(groups)).not.toContain(sessionB.id);
    expect(JSON.stringify(groups)).not.toContain(seeded.learnerB.fullName);
    expect(JSON.stringify(groups)).not.toContain(seeded.learnerA.parentEmail);

    expect(await loadInstructorTaughtSessions(seeded.org.id, seeded.learnerB.student.id)).toEqual(
      []
    );
    expect(
      await loadInstructorTaughtSessions(seeded.org.id, `missing-${uniq("learner")}`)
    ).toEqual([]);
  });
});
