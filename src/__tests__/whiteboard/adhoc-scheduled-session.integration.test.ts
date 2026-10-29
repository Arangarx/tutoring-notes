/**
 * @jest-environment node
 *
 * An ad-hoc whiteboard start for a personal student must write one
 * ScheduledSession and point the whiteboard row at it, so the parent and
 * child upcoming lists (which only read ScheduledSession) show it immediately.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts. Blob put is mocked.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(async (path: string) => ({
    url: `https://blob.vercel-storage.com/${path}-adhoc`,
    pathname: path,
    contentType: "application/json",
    contentDisposition: "",
    downloadUrl: path,
  })),
}));

const requireStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn(async () => undefined);

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ConsentError } from "@/lib/consent-scope";
import { utcBoundsFromWallClock } from "@/lib/calendar/scheduled-session-datetime";
import { createWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { uniq } from "../helpers/unique-test-token";

const prevKey = process.env.TOTP_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
});
afterAll(async () => {
  if (prevKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
  else process.env.TOTP_ENCRYPTION_KEY = prevKey;
  await db.$disconnect();
});

/**
 * Wall clock in the tutor's stored zone. Intl, not the writer's HH:MM constants.
 * Postgres DATE is UTC midnight, so the calendar day is read with UTC accessors.
 */
function wallClockInZone(instant: Date, timeZone: string): { date: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = value("hour") === "24" ? "00" : value("hour");
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hhmm: `${hour}:${value("minute")}`,
  };
}

function storedCalendarDay(date: Date): string {
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("adhoc-tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      tutorTimezone: "America/Denver",
    },
  });
}

async function seedClaimedChild(input: {
  adminUserId: string | null;
  organizationId?: string;
  /** Acting tutor the start gate looks up. Null leaves no tutor consent row. */
  consentForAdminUserId: string | null;
  /** Organization consent row. Used when the student is organization-owned. */
  consentForOrganizationId?: string | null;
}) {
  const ah = await db.accountHolder.create({
    data: {
      email: `${uniq("adhoc-ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
  const profile = await db.learnerProfile.create({
    data: {
      accountHolderId: ah.id,
      displayName: "Ad hoc child",
      isSelfLearner: false,
    },
  });
  const student = await db.student.create({
    data: {
      name: "Ad hoc child",
      adminUserId: input.adminUserId,
      organizationId: input.organizationId ?? null,
      learnerProfileId: profile.id,
    },
  });
  if (input.consentForOrganizationId) {
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: null,
        organizationId: input.consentForOrganizationId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
  } else if (input.consentForAdminUserId) {
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        adminUserId: input.consentForAdminUserId,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
  }
  return student;
}

async function seedPersonalStudent(consent: boolean) {
  const tutor = await seedTutor();
  const student = await seedClaimedChild({
    adminUserId: tutor.id,
    consentForAdminUserId: consent ? tutor.id : null,
  });
  return { tutor, student };
}

/**
 * Pending org, or an active org the acting tutor does not belong to.
 * Consent exists so the denial is admission, not a missing consent row.
 */
async function seedDeniedOrgStudent(kind: "pending" | "non-member") {
  const tutor = await seedTutor();
  const org = await db.organization.create({
    data: {
      name: `Ad hoc org ${uniq("org")}`,
      status: kind === "pending" ? "pending" : "active",
      createdByOperatorId: "adhoc-op@example.com",
    },
  });
  if (kind === "pending") {
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        adminUserId: tutor.id,
        roles: ["instructor"],
      },
    });
  }
  const student = await seedClaimedChild({
    adminUserId: null,
    organizationId: org.id,
    consentForAdminUserId: null,
    consentForOrganizationId: org.id,
  });
  return { tutor, student };
}

/**
 * Organization owns the student (`organizationId` set, `adminUserId` null).
 * Consent is the organization row, which is what the start gate reads, so a
 * whiteboard row exists and its `scheduledSessionId` can be checked.
 *
 * Opening that room also requires an active organization and an admitted
 * instructor (`orgInstructorAdmitted`). This fixture is that instructor.
 * A pending org with no membership is a denial, not this scenario.
 */
async function seedOrgOwnedStudent() {
  const tutor = await seedTutor();
  const org = await db.organization.create({
    data: {
      name: `Ad hoc org ${uniq("org")}`,
      status: "active",
      createdByOperatorId: "adhoc-op@example.com",
    },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      adminUserId: tutor.id,
      roles: ["instructor"],
    },
  });
  const student = await seedClaimedChild({
    adminUserId: null,
    organizationId: org.id,
    consentForAdminUserId: null,
    consentForOrganizationId: org.id,
  });
  return { tutor, student, org };
}

function actAs(tutor: { id: string; email: string }) {
  requireStudentScopeMock.mockResolvedValue({
    kind: "admin",
    adminId: tutor.id,
    email: tutor.email,
  });
}

describe("createWhiteboardSession ad-hoc appointment", () => {
  it("writes a ScheduledSession for a personal student and links the whiteboard row", async () => {
    const { tutor, student } = await seedPersonalStudent(true);
    actAs(tutor);

    const before = Date.now();
    await expect(createWhiteboardSession(student.id)).rejects.toThrow(/NEXT_REDIRECT/);
    const after = Date.now();

    const appointments = await db.scheduledSession.findMany({
      where: { studentId: student.id },
    });
    expect(appointments).toHaveLength(1);
    const appointment = appointments[0]!;
    expect(appointment.adminUserId).toBe(tutor.id);
    expect(appointment.startAt).toBeTruthy();
    expect(appointment.endAt).toBeTruthy();
    const startMs = appointment.startAt!.getTime();
    const endMs = appointment.endAt!.getTime();
    expect(startMs).toBeGreaterThanOrEqual(before - 5_000);
    expect(startMs).toBeLessThanOrEqual(after + 5_000);
    expect(endMs - startMs).toBeGreaterThanOrEqual(59 * 60_000);
    expect(endMs - startMs).toBeLessThanOrEqual(61 * 60_000);
    expect(appointment.plannedDurationMinutes).toBe(60);
    expect(appointment.subject).toBe("Tutoring session.");
    expect(appointment.notes).toBe("");

    // date / startTime / endTime are the Denver wall clock of the stored instants.
    // Blank strings or an empty calendar day fail this; the times are not fixtures.
    expect(tutor.tutorTimezone).toBe("America/Denver");
    const zone = tutor.tutorTimezone!;
    const startWall = wallClockInZone(appointment.startAt!, zone);
    const endWall = wallClockInZone(appointment.endAt!, zone);
    expect(appointment.startTime).not.toBe("");
    expect(appointment.endTime).not.toBe("");
    expect(storedCalendarDay(appointment.date)).toBe(startWall.date);
    expect(appointment.startTime).toBe(startWall.hhmm);
    expect(appointment.endTime).toBe(endWall.hhmm);
    const bounds = utcBoundsFromWallClock(
      appointment.date,
      appointment.startTime,
      appointment.endTime,
      null,
      zone
    );
    expect(Math.abs(bounds.startAt.getTime() - startMs)).toBeLessThan(60_000);
    expect(Math.abs(bounds.endAt.getTime() - endMs)).toBeLessThan(60_000);

    const whiteboard = await db.whiteboardSession.findFirst({
      where: { studentId: student.id },
      select: { scheduledSessionId: true },
    });
    expect(whiteboard?.scheduledSessionId).toBe(appointment.id);
    expect(assertOwnsStudentMock).toHaveBeenCalledWith(student.id);
  });

  it("does not write a ScheduledSession for an organization-owned student", async () => {
    const { tutor, student } = await seedOrgOwnedStudent();
    const owned = await db.student.findUnique({
      where: { id: student.id },
      select: { adminUserId: true, organizationId: true },
    });
    expect(owned?.adminUserId).toBeNull();
    expect(owned?.organizationId).toBeTruthy();
    actAs(tutor);

    const before = await db.scheduledSession.count({ where: { studentId: student.id } });
    await expect(createWhiteboardSession(student.id)).rejects.toThrow(/NEXT_REDIRECT/);

    const appointments = await db.scheduledSession.findMany({
      where: { studentId: student.id },
    });
    expect(appointments).toHaveLength(before);
    expect(appointments).toHaveLength(0);

    const whiteboard = await db.whiteboardSession.findFirst({
      where: { studentId: student.id },
      select: { id: true, scheduledSessionId: true },
    });
    expect(whiteboard).not.toBeNull();
    expect(whiteboard?.scheduledSessionId).toBeNull();
  });

  it("rejects createWhiteboardSession for a pending organization", async () => {
    const { tutor, student } = await seedDeniedOrgStudent("pending");
    actAs(tutor);

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      "ORG_ADMISSION_DENIED",
    );
    expect(
      await db.whiteboardSession.count({ where: { studentId: student.id } }),
    ).toBe(0);
  });

  it("rejects createWhiteboardSession when the tutor is not an organization member", async () => {
    const { tutor, student } = await seedDeniedOrgStudent("non-member");
    actAs(tutor);

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      "ORG_ADMISSION_DENIED",
    );
    expect(
      await db.whiteboardSession.count({ where: { studentId: student.id } }),
    ).toBe(0);
  });

  it("deletes the ad-hoc ScheduledSession when session create throws for missing consent", async () => {
    const { tutor, student } = await seedPersonalStudent(false);
    actAs(tutor);

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(ConsentError);

    const appointments = await db.scheduledSession.findMany({
      where: { studentId: student.id },
    });
    expect(appointments).toHaveLength(0);
    const whiteboard = await db.whiteboardSession.findFirst({
      where: { studentId: student.id },
      select: { id: true },
    });
    expect(whiteboard).toBeNull();
  });
});
