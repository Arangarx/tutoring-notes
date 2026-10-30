/**
 * @jest-environment node
 *
 * Stage 4 booking calls the existing schedule bridge.
 * Oracles are database rows and the two appointment instants.
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

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(async (path: string) => ({
    url: `https://blob.vercel-storage.com/${path}-org-booking`,
  })),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {}),
}));

import { db } from "@/lib/db";
import { buildIcsEventSummary } from "@/lib/calendar/ics-feed";
import {
  createScheduledSession,
  listScheduledSessionsForTutor,
  updateScheduledSession,
} from "@/app/admin/schedule/actions";
import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { getOrCreateWhiteboardForSchedule } from "@/lib/whiteboard/schedule-bridge";
import { uniq } from "../helpers/unique-test-token";

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

async function seedAdmin(
  label: string,
  approvalStatus: "APPROVED" | "WAITLISTED" = "APPROVED"
) {
  return db.adminUser.create({
    data: {
      email: `${uniq(label)}@example.com`,
      role: "TUTOR",
      approvalStatus,
      emailVerifiedAt: new Date("2026-01-01"),
      displayName: label,
      isTestAccount: false,
    },
  });
}

async function seedOrg(status: "active" | "pending" | "suspended" = "active") {
  const owner = await seedAdmin("owner");
  const org = await db.organization.create({
    data: {
      name: `Org ${uniq("org")}`,
      status,
      timezone: "America/Denver",
      createdByOperatorId: "org-operator@example.com",
      members: { create: [{ adminUserId: owner.id, roles: ["owner"] }] },
    },
  });
  return { org, owner };
}

async function seedOrgLearner(organizationId: string, createdByAdminUserId: string) {
  const ah = await db.accountHolder.create({
    data: { email: `${uniq("ah")}@example.com`, emailVerifiedAt: new Date() },
  });
  const profile = await db.learnerProfile.create({
    data: { accountHolderId: ah.id, displayName: "Mary Ann Lee", isSelfLearner: false },
  });
  const student = await db.student.create({
    data: {
      name: "Mary Ann Lee",
      adminUserId: null,
      organizationId,
      learnerProfileId: profile.id,
      parentEmail: `${uniq("parent")}@example.com`,
    },
  });
  await db.organizationLearner.create({
    data: {
      studentId: student.id,
      organizationId,
      givenName: "Mary Ann",
      familyName: "Lee",
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
  return { student, profile, ah };
}

async function seedMember(
  organizationId: string,
  roles: Array<"owner" | "admin" | "scheduler" | "instructor">,
  opts?: { removedAt?: Date | null; approvalStatus?: "APPROVED" | "WAITLISTED" }
) {
  const admin = await seedAdmin(roles.join("-"), opts?.approvalStatus ?? "APPROVED");
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

async function seedAppointment(input: {
  adminUserId: string;
  studentId: string;
  startAt: Date;
  endAt: Date;
  startTime?: string;
  endTime?: string;
}) {
  return db.scheduledSession.create({
    data: {
      adminUserId: input.adminUserId,
      studentId: input.studentId,
      date: new Date("2026-10-20T00:00:00.000Z"),
      startTime: input.startTime ?? "16:00",
      endTime: input.endTime ?? "17:00",
      startAt: input.startAt,
      endAt: input.endAt,
      plannedDurationMinutes: 60,
      subject: "Algebra",
    },
  });
}

describe("org schedule bridge", () => {
  it("an approved instructor on an active org opens one session and no personal student", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const sched = await seedAppointment({
      adminUserId: instructor.id,
      studentId: student.id,
      startAt: new Date("2026-10-20T22:00:00.000Z"),
      endAt: new Date("2026-10-20T23:00:00.000Z"),
    });

    const result = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: instructor.id },
      "rid-org-ok"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("bridge refused");
    const sessions = await db.whiteboardSession.findMany({
      where: { scheduledSessionId: sched.id },
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.adminUserId).toBe(instructor.id);
    expect(sessions[0]?.studentId).toBe(student.id);
    expect(await db.student.count({ where: { adminUserId: instructor.id } })).toBe(0);
  });

  it.each([
    ["pending org", "pending" as const, null, "APPROVED" as const, ["instructor"] as const],
    ["suspended org", "suspended" as const, null, "APPROVED" as const, ["instructor"] as const],
  ])("no whiteboard row when the org is %s", async (_label, status) => {
    const { org, owner } = await seedOrg(status);
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const sched = await seedAppointment({
      adminUserId: instructor.id,
      studentId: student.id,
      startAt: new Date("2026-10-20T22:00:00.000Z"),
      endAt: new Date("2026-10-20T23:00:00.000Z"),
    });
    const warn = jest.spyOn(console, "warn");
    const result = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: instructor.id },
      "rid-org-deny"
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("reason=org_admission"))).toBe(true);
  });

  it("no whiteboard row when the instructor was removed, is unapproved, or is only a scheduler", async () => {
    const { org, owner } = await seedOrg("active");
    const { student } = await seedOrgLearner(org.id, owner.id);
    const removed = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const unapproved = await seedMember(org.id, ["instructor"], { approvalStatus: "WAITLISTED" });
    const scheduler = await seedMember(org.id, ["scheduler"]);
    for (const caller of [removed, unapproved, scheduler]) {
      const sched = await seedAppointment({
        adminUserId: caller.id,
        studentId: student.id,
        startAt: new Date("2026-10-21T22:00:00.000Z"),
        endAt: new Date("2026-10-21T23:00:00.000Z"),
      });
      const warn = jest.spyOn(console, "warn");
      const result = await getOrCreateWhiteboardForSchedule(
        sched.id,
        { kind: "tutor", adminUserId: caller.id },
        "rid-org-member-deny"
      );
      expect(result).toEqual({ ok: false, reason: "not_found" });
      expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes("reason=org_admission"))).toBe(true);
    }
  });

  it("a personal student owned by someone else is still not found", async () => {
    const tutor = await seedAdmin("personal-tutor");
    const other = await seedAdmin("other-tutor");
    const student = await db.student.create({
      data: { name: "Personal Kid", adminUserId: tutor.id },
    });
    const sched = await seedAppointment({
      adminUserId: other.id,
      studentId: student.id,
      startAt: new Date("2026-10-20T22:00:00.000Z"),
      endAt: new Date("2026-10-20T23:00:00.000Z"),
    });
    const result = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: other.id },
      "rid-personal-mismatch"
    );
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(await db.whiteboardSession.count({ where: { scheduledSessionId: sched.id } })).toBe(0);
  });

  it("start does not activate a PENDING session while the org is pending", async () => {
    const { org, owner } = await seedOrg("pending");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    mockSession(instructor.email, instructor.id);
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/events.json",
        sessionPhase: "PENDING",
      },
    });
    const updateMany = jest.spyOn(db.whiteboardSession, "updateMany");
    await startWhiteboardSession(session.id);
    const calls = await Promise.all(updateMany.mock.results.map((result) => result.value));
    const flipped = calls.reduce((sum, result) => sum + (result?.count ?? 0), 0);
    expect(flipped).toBe(0);
    const row = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.sessionPhase).toBe("PENDING");
  });
});

describe("org appointment writes", () => {
  it("rejects a zero-length session (end clock equal to start) and inserts nothing", async () => {
    const tutor = await seedAdmin("clock-tutor");
    const student = await db.student.create({
      data: { name: "Clock Student", adminUserId: tutor.id },
    });
    mockSession(tutor.email, tutor.id);
    await expect(
      createScheduledSession({
        studentId: student.id,
        date: "2026-10-20",
        startTime: "16:00",
        endTime: "16:00",
        plannedDurationMinutes: 60,
        subject: "Algebra",
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await db.scheduledSession.count({ where: { studentId: student.id } })).toBe(0);
  });

  it("saves a session that crosses midnight, ending on the next day (Tyson packet item 16)", async () => {
    const tutor = await seedAdmin("midnight-tutor");
    const student = await db.student.create({
      data: { name: "Midnight Student", adminUserId: tutor.id },
    });
    mockSession(tutor.email, tutor.id);
    const created = await createScheduledSession({
      studentId: student.id,
      date: "2026-10-20",
      startTime: "23:30",
      endTime: "01:00",
      plannedDurationMinutes: 90,
      subject: "Late",
      clientTimeZone: "UTC",
    });
    const row = await db.scheduledSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.startAt!.toISOString()).toBe("2026-10-20T23:30:00.000Z");
    expect(row.endAt!.toISOString()).toBe("2026-10-21T01:00:00.000Z");
  });

  it("edits an existing same-day session to cross midnight", async () => {
    const tutor = await seedAdmin("midnight-edit-tutor");
    const student = await db.student.create({
      data: { name: "Midnight Edit Student", adminUserId: tutor.id },
    });
    mockSession(tutor.email, tutor.id);
    const created = await createScheduledSession({
      studentId: student.id,
      date: "2026-10-20",
      startTime: "22:00",
      endTime: "23:00",
      plannedDurationMinutes: 60,
      subject: "Late",
      clientTimeZone: "UTC",
    });
    await updateScheduledSession(created.id, {
      studentId: student.id,
      date: "2026-10-20",
      startTime: "23:00",
      endTime: "00:30",
      plannedDurationMinutes: 90,
      subject: "Late",
      clientTimeZone: "UTC",
    });
    const row = await db.scheduledSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.startAt!.toISOString()).toBe("2026-10-20T23:00:00.000Z");
    expect(row.endAt!.toISOString()).toBe("2026-10-21T00:30:00.000Z");
  });

  it("warns on overlapping instants, still inserts, and does not warn when the next start equals the previous end", async () => {
    const tutor = await seedAdmin("overlap-tutor");
    const student = await db.student.create({
      data: { name: "Overlap Student", adminUserId: tutor.id },
    });
    mockSession(tutor.email, tutor.id);
    const first = await createScheduledSession({
      studentId: student.id,
      date: "2026-10-20",
      startTime: "16:00",
      endTime: "17:00",
      plannedDurationMinutes: 60,
      subject: "Algebra",
      clientTimeZone: "UTC",
    });
    const overlap = await createScheduledSession({
      studentId: student.id,
      date: "2026-10-20",
      startTime: "16:30",
      endTime: "17:00",
      plannedDurationMinutes: 60,
      subject: "Geometry",
      clientTimeZone: "UTC",
    });
    const rows = await db.scheduledSession.findMany({
      where: { studentId: student.id },
      orderBy: { startAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    const [earlier, later] = rows;
    expect(later!.startAt!.getTime()).toBeLessThan(earlier!.endAt!.getTime());
    expect(overlap.overlapWarning).toEqual(expect.any(String));
    expect(first.overlapWarning ?? null).toBeNull();

    const touching = await createScheduledSession({
      studentId: student.id,
      date: "2026-10-20",
      startTime: "17:00",
      endTime: "18:00",
      plannedDurationMinutes: 60,
      subject: "Next",
      clientTimeZone: "UTC",
    });
    const touchRow = await db.scheduledSession.findUniqueOrThrow({ where: { id: touching.id } });
    expect(touchRow.startAt!.getTime()).toBe(earlier!.endAt!.getTime());
    expect(touching.overlapWarning ?? null).toBeNull();
    expect(await db.scheduledSession.count({ where: { studentId: student.id } })).toBe(3);
  });

  it("lists an org appointment on the assigned instructor's schedule, and the org list does", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const scheduler = await seedMember(org.id, ["scheduler"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const personal = await db.student.create({
      data: { name: "Personal Only", adminUserId: instructor.id },
    });
    mockSession(scheduler.email, scheduler.id);
    const created = await createScheduledSession({
      studentId: student.id,
      instructorAdminUserId: instructor.id,
      date: "2026-10-22",
      startTime: "16:00",
      endTime: "17:00",
      plannedDurationMinutes: 60,
      subject: "Algebra",
    });
    const stored = await db.scheduledSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.adminUserId).toBe(instructor.id);
    expect(stored.studentId).toBe(student.id);
    expect(await db.student.count({ where: { adminUserId: instructor.id, id: { not: personal.id } } })).toBe(0);

    mockSession(instructor.email, instructor.id);
    await createScheduledSession({
      studentId: personal.id,
      date: "2026-10-23",
      startTime: "10:00",
      endTime: "11:00",
      plannedDurationMinutes: 60,
      subject: "Personal",
      clientTimeZone: "UTC",
    });
    const tutorList = await listScheduledSessionsForTutor({
      connected: false,
      reconnectRequired: false,
    });
    // W3 (Andrew decision 3): the assigned instructor's Schedule lists the org appointment.
    const personalRow = await db.scheduledSession.findFirstOrThrow({
      where: { studentId: personal.id },
    });
    expect(tutorList.map((row) => row.id).sort()).toEqual([created.id, personalRow.id].sort());
    expect(tutorList.find((row) => row.id === created.id)?.source.kind).toBe("org");
    mockSession(scheduler.email, scheduler.id);
    const { listScheduledSessionsForOrganization } = await import("@/app/admin/schedule/actions");
    const orgList = await listScheduledSessionsForOrganization(org.id);
    expect(orgList.map((row) => row.id)).toContain(created.id);
    expect(orgList.find((row) => row.id === created.id)?.learnerName).toBe("Mary Ann Lee");

    await updateScheduledSession(created.id, {
      studentId: student.id,
      instructorAdminUserId: instructor.id,
      date: "2026-10-24",
      startTime: "11:00",
      endTime: "12:00",
      plannedDurationMinutes: 60,
      subject: "Changed",
    });
    const changed = await db.scheduledSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(changed.subject).toBe("Changed");
    expect(changed.adminUserId).toBe(instructor.id);
  });
});

describe("org calendar title", () => {
  it("uses the given name and the family-name initial", () => {
    const summary = buildIcsEventSummary({
      name: "Mary Ann Lee",
      organizationLearner: { givenName: "Mary Ann", familyName: "Lee" },
    });
    expect(summary).toContain("Mary Ann L.");
  });
});
