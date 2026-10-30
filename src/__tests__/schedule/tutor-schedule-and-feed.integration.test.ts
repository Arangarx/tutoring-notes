/**
 * @jest-environment node
 *
 * W3. The instructor Schedule and the ICS feed list the same appointments.
 * J2 org rows in my list, J3 ICS parity, J4 ICS body, J5 instructor write block,
 * J8 reassign, J9 member removed, J10 personal picker.
 * Oracles are seeded ids and strings.
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
  put: jest.fn(async (path: string) => ({ url: `https://blob.vercel-storage.com/${path}-w3` })),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {}),
}));
jest.mock("@/lib/calendar/google-calendar-write", () => ({
  beforeScheduledSessionDeleted: jest.fn(async () => undefined),
  afterScheduledSessionCreated: jest.fn(async () => undefined),
  afterScheduledSessionUpdated: jest.fn(async () => undefined),
}));

import { db } from "@/lib/db";
import { buildIcsCalendarBody } from "@/lib/calendar/ics-feed";
import { loadIcsFeedSessionsForAdmin } from "@/lib/calendar/load-ics-feed-sessions";
import { removeOrgMember } from "@/lib/org-scope";
import {
  deleteScheduledSession,
  listScheduleStudentOptions,
  listScheduledSessionsForTutor,
  updateScheduledSession,
} from "@/app/admin/schedule/actions";
import {
  seedAppointment,
  seedMember,
  seedOrg,
  seedOrgLearner,
  seedPersonalStudent,
} from "../helpers/org-seed";
import { uniq } from "../helpers/unique-test-token";

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

async function scheduleIds(admin: { email: string; id: string }): Promise<string[]> {
  mockSession(admin);
  return (await listScheduledSessionsForTutor(NO_GOOGLE)).map((row) => row.id).sort();
}

async function feedIds(adminUserId: string): Promise<string[]> {
  return (await loadIcsFeedSessionsForAdmin(adminUserId)).map((row) => row.id).sort();
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe("J2 org rows in my Schedule list", () => {
  it("lists my org appointments with source, the full name, and nothing private", async () => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, ["instructor"], { label: "Ida Instructor" });
    const other = await seedMember(org.id, ["instructor"], { label: "Otto Rival" });
    const mine = await seedOrgLearner(org.id, owner.id, { givenName: "Mary Ann", familyName: "Lee" });
    const noConsent = await seedOrgLearner(
      org.id,
      owner.id,
      { givenName: "Cora", familyName: "Nocon" },
      { allowLiveSession: false }
    );
    const theirs = await seedOrgLearner(org.id, owner.id, { givenName: "Zeba", familyName: "Quinn" });
    const personalStudent = await seedPersonalStudent(me.id, "Pat Personal");
    const orgRow = await seedAppointment({ adminUserId: me.id, studentId: mine.student.id, subject: "Algebra" });
    const noConsentRow = await seedAppointment({
      adminUserId: me.id,
      studentId: noConsent.student.id,
      subject: "Reading",
    });
    const personalRow = await seedAppointment({
      adminUserId: me.id,
      studentId: personalStudent.id,
      subject: "Chemistry",
    });
    await seedAppointment({ adminUserId: other.id, studentId: theirs.student.id, subject: "Geometry" });

    mockSession(me);
    const rows = await listScheduledSessionsForTutor(NO_GOOGLE);

    expect(rows.map((row) => row.id).sort()).toEqual(
      [orgRow.id, noConsentRow.id, personalRow.id].sort()
    );
    const org1 = rows.find((row) => row.id === orgRow.id);
    expect(org1?.source).toEqual({
      kind: "org",
      organizationId: org.id,
      organizationName: org.name,
    });
    expect(org1?.studentName).toBe("Mary Ann Lee");
    expect(org1?.entry).toEqual({ online: { allowed: true }, inPerson: { allowed: true } });
    // Online sessions off: online refused with the reason, in person still reachable.
    expect(rows.find((row) => row.id === noConsentRow.id)?.entry).toEqual({
      online: { allowed: false, reason: "live_off" },
      inPerson: { allowed: true },
    });
    // Personal rows start from the student page, so they carry no entry state.
    expect(rows.find((row) => row.id === personalRow.id)?.entry).toBeUndefined();
    expect(rows.find((row) => row.id === personalRow.id)?.source).toEqual({ kind: "personal" });

    const blob = JSON.stringify(rows);
    for (const secret of [
      mine.parentEmail,
      mine.brief,
      noConsent.parentEmail,
      theirs.fullName,
      theirs.parentEmail,
      theirs.brief,
      "Otto Rival",
    ]) {
      expect(blob).not.toContain(secret);
    }
  });
});

describe("J3 ICS feed and Schedule list the same appointments", () => {
  it("agree for a live member, and both drop a removed member's org rows", async () => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, ["instructor"]);
    const other = await seedMember(org.id, ["instructor"]);
    const gone = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const learner = await seedOrgLearner(org.id, owner.id);
    const personalStudent = await seedPersonalStudent(me.id, "Pat Private");
    const goneKid = await seedPersonalStudent(gone.id, "Gone Private");
    const envStudent = await db.student.create({
      data: { name: `Env ${uniq("kid")}`, adminUserId: null, organizationId: null },
    });

    const mineOrg = await seedAppointment({ adminUserId: me.id, studentId: learner.student.id });
    const minePrivate = await seedAppointment({ adminUserId: me.id, studentId: personalStudent.id });
    await seedAppointment({ adminUserId: other.id, studentId: learner.student.id });
    await seedAppointment({ adminUserId: me.id, studentId: envStudent.id });
    const gonePast = await seedAppointment({
      adminUserId: gone.id,
      studentId: learner.student.id,
      startAt: new Date(Date.now() - 3 * DAY_MS),
    });
    const goneFuture = await seedAppointment({
      adminUserId: gone.id,
      studentId: learner.student.id,
      startAt: new Date(Date.now() + 3 * DAY_MS),
    });
    const gonePrivate = await seedAppointment({ adminUserId: gone.id, studentId: goneKid.id });

    const expectedMe = [mineOrg.id, minePrivate.id].sort();
    expect(await scheduleIds(me)).toEqual(expectedMe);
    expect(await feedIds(me.id)).toEqual(expectedMe);

    expect(await scheduleIds(gone)).toEqual([gonePrivate.id]);
    expect(await feedIds(gone.id)).toEqual([gonePrivate.id]);
    for (const id of [gonePast.id, goneFuture.id]) {
      expect(await feedIds(gone.id)).not.toContain(id);
    }
  });
});

describe("J4 ICS body for org appointments", () => {
  it("titles with given name and family initial and carries no private field", async () => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, ["instructor"]);
    const gone = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const learner = await seedOrgLearner(org.id, owner.id, { givenName: "Mary Ann", familyName: "Lee" });
    const mine = await seedAppointment({ adminUserId: me.id, studentId: learner.student.id });
    const goneRow = await seedAppointment({ adminUserId: gone.id, studentId: learner.student.id });

    const body = buildIcsCalendarBody(await loadIcsFeedSessionsForAdmin(me.id), "America/Denver");
    expect(body).toContain(`UID:${mine.id}@usemynk.com`);
    expect(body).toContain("SUMMARY:Tutoring — Mary Ann L.");
    expect(body).not.toContain(learner.parentEmail);
    expect(body).not.toContain(learner.brief);
    expect(body).not.toMatch(/\bLee\b/);

    const goneBody = buildIcsCalendarBody(await loadIcsFeedSessionsForAdmin(gone.id), "America/Denver");
    expect(goneBody).not.toContain(`UID:${goneRow.id}@usemynk.com`);
    expect(goneBody).not.toContain("Mary Ann");
  });
});

describe("J5 an instructor-only member cannot write an org appointment", () => {
  it("update and delete are not found, and the row is unchanged", async () => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, ["instructor"]);
    const learner = await seedOrgLearner(org.id, owner.id);
    const row = await seedAppointment({ adminUserId: me.id, studentId: learner.student.id, subject: "Algebra" });
    mockSession(me);

    await expect(
      updateScheduledSession(row.id, {
        studentId: learner.student.id,
        instructorAdminUserId: me.id,
        date: "2026-10-24",
        startTime: "11:00",
        endTime: "12:00",
        plannedDurationMinutes: 60,
        subject: "Hijacked",
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(deleteScheduledSession(row.id)).rejects.toThrow("NEXT_NOT_FOUND");

    const after = await db.scheduledSession.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.subject).toBe("Algebra");
    expect(after.adminUserId).toBe(me.id);
    expect(after.startAt?.toISOString()).toBe(row.startAt?.toISOString());
  });
});

describe("J8 reassigning an appointment moves it between instructors", () => {
  it("leaves A's list and feed, and joins B's", async () => {
    const { org, owner } = await seedOrg();
    const a = await seedMember(org.id, ["instructor"], { label: "Ada" });
    const b = await seedMember(org.id, ["instructor"], { label: "Bea" });
    const scheduler = await seedMember(org.id, ["scheduler"]);
    const learner = await seedOrgLearner(org.id, owner.id);
    const row = await seedAppointment({ adminUserId: a.id, studentId: learner.student.id });

    expect(await scheduleIds(a)).toEqual([row.id]);
    expect(await feedIds(a.id)).toEqual([row.id]);
    expect(await scheduleIds(b)).toEqual([]);

    mockSession(scheduler);
    await updateScheduledSession(row.id, {
      studentId: learner.student.id,
      instructorAdminUserId: b.id,
      date: "2026-10-24",
      startTime: "11:00",
      endTime: "12:00",
      plannedDurationMinutes: 60,
      subject: "Algebra",
    });
    expect((await db.scheduledSession.findUniqueOrThrow({ where: { id: row.id } })).adminUserId).toBe(b.id);

    expect(await scheduleIds(a)).toEqual([]);
    expect(await feedIds(a.id)).toEqual([]);
    expect(await scheduleIds(b)).toEqual([row.id]);
    expect(await feedIds(b.id)).toEqual([row.id]);
  });
});

describe("J9 a removed member loses org appointments from Schedule and feed", () => {
  it("keeps the live-protected and past rows in the database but shows neither", async () => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, ["instructor"]);
    const learner = await seedOrgLearner(org.id, owner.id);
    const personalStudent = await seedPersonalStudent(me.id, "Pat Private");
    const control = await seedAppointment({ adminUserId: me.id, studentId: personalStudent.id });
    const past = await seedAppointment({
      adminUserId: me.id,
      studentId: learner.student.id,
      startAt: new Date(Date.now() - 3 * DAY_MS),
    });
    const plainFuture = await seedAppointment({
      adminUserId: me.id,
      studentId: learner.student.id,
      startAt: new Date(Date.now() + 3 * DAY_MS),
    });
    const liveFuture = await seedAppointment({
      adminUserId: me.id,
      studentId: learner.student.id,
      startAt: new Date(Date.now() + 4 * DAY_MS),
    });
    await db.whiteboardSession.create({
      data: {
        adminUserId: me.id,
        studentId: learner.student.id,
        scheduledSessionId: liveFuture.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/j9-live.json",
        sessionPhase: "ACTIVE",
      },
    });

    expect(await scheduleIds(me)).toEqual(
      [control.id, past.id, plainFuture.id, liveFuture.id].sort()
    );

    mockSession(owner);
    await removeOrgMember(org.id, me.id, "finish");

    expect(await db.scheduledSession.count({ where: { id: plainFuture.id } })).toBe(0);
    expect(await db.scheduledSession.count({ where: { id: { in: [past.id, liveFuture.id] } } })).toBe(2);

    expect(await scheduleIds(me)).toEqual([control.id]);
    expect(await feedIds(me.id)).toEqual([control.id]);
  });
});

describe("J10 the personal booking picker never lists an org learner", () => {
  it.each([
    ["an instructor-only member", ["instructor"] as const],
    ["an owner who is also an instructor", ["owner", "instructor"] as const],
  ])("for %s", async (_label, roles) => {
    const { org, owner } = await seedOrg();
    const me = await seedMember(org.id, [...roles]);
    const learner = await seedOrgLearner(org.id, owner.id, { givenName: "Orla", familyName: "Orgkid" });
    const personalStudent = await seedPersonalStudent(me.id, "Pat Personal");
    await seedAppointment({ adminUserId: me.id, studentId: learner.student.id });

    mockSession(me);
    const options = await listScheduleStudentOptions();
    expect(options.map((option) => option.id)).toEqual([personalStudent.id]);
    expect(JSON.stringify(options)).not.toContain("Orla");
    expect(JSON.stringify(options)).not.toContain(learner.student.id);
  });
});
