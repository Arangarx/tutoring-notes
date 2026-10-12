/**
 * @jest-environment node
 *
 * Stage 5 removal and suspension. Oracles are database rows and the notes page.
 * The resolver's mode string is not the oracle.
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
    url: `https://blob.vercel-storage.com/${path}-org-stage5`,
  })),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  deleteBlob: jest.fn(async () => {}),
}));

const mockBeforeScheduledSessionDeleted = jest.fn(async () => undefined);
jest.mock("@/lib/calendar/google-calendar-write", () => ({
  beforeScheduledSessionDeleted: (...args: unknown[]) =>
    mockBeforeScheduledSessionDeleted(...args),
  afterScheduledSessionCreated: jest.fn(async () => undefined),
  afterScheduledSessionUpdated: jest.fn(async () => undefined),
}));

import { renderToStaticMarkup } from "react-dom/server";
import { db } from "@/lib/db";
import { removeOrgMember } from "@/lib/org-scope";
import { orgForceEndDeadline } from "@/lib/org-session-access";
import { endWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { saveSessionNotesAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { startWhiteboardSession } from "@/app/admin/students/[id]/whiteboard/actions";
import { getOrCreateWhiteboardForSchedule } from "@/lib/whiteboard/schedule-bridge";
import { listScheduledSessionsForOrganization } from "@/app/admin/schedule/actions";
import { uniq } from "../helpers/unique-test-token";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

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
  jest.spyOn(console, "error").mockImplementation(() => {});
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

async function seedOrg(
  status: "active" | "pending" | "suspended" = "active",
  timezone = "America/Denver"
) {
  const owner = await seedAdmin("owner");
  const org = await db.organization.create({
    data: {
      name: `Org ${uniq("org")}`,
      status,
      timezone,
      statusChangedAt: new Date(),
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
  return { student, profile };
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

async function seedTaughtSession(input: {
  adminUserId: string;
  studentId: string;
  endedAt: Date | null;
  topics?: string;
  phase?: "PENDING" | "ACTIVE";
  scheduledSessionId?: string;
}) {
  const note = await db.sessionNote.create({
    data: {
      studentId: input.studentId,
      date: new Date("2026-10-01T00:00:00.000Z"),
      topics: input.topics ?? "Fractions on the board",
      homework: "",
      assessment: "Steady",
      nextSteps: "Practice",
      linksJson: "[]",
      status: "DRAFT",
    },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: input.adminUserId,
      studentId: input.studentId,
      consentAcknowledged: true,
      eventsBlobUrl: "https://blob.vercel-storage.com/events.json",
      sessionPhase: input.phase ?? "ACTIVE",
      endedAt: input.endedAt,
      noteId: note.id,
      scheduledSessionId: input.scheduledSessionId,
      activatedAt: input.phase === "PENDING" ? null : new Date(),
    },
  });
  return { session, note };
}

/** One minute after storedAt is still inside the ten-minute floor, so it is before the deadline. */
function normalEndInsideLetItFinish(now = Date.now()): { storedAt: Date; endedAt: Date } {
  const storedAt = new Date(now - 2 * MINUTE_MS);
  const endedAt = new Date(storedAt.getTime() + MINUTE_MS);
  return { storedAt, endedAt };
}

async function seedExistingSegment(input: {
  adminUserId: string;
  studentId: string;
  whiteboardSessionId: string;
}) {
  const blobUrl = `https://blob.vercel-storage.com/${uniq("kept")}.webm`;
  await db.sessionRecording.create({
    data: {
      adminUserId: input.adminUserId,
      studentId: input.studentId,
      whiteboardSessionId: input.whiteboardSessionId,
      blobUrl,
      mimeType: "audio/webm",
      sizeBytes: 800,
      orderIndex: 0,
      streamId: "tutor-mic",
    },
  });
  return blobUrl;
}

async function expectSecondEndRejected(sessionId: string, noteId: string) {
  const beforeNote = await db.sessionNote.findUniqueOrThrow({ where: { id: noteId } });
  const beforeRecordings = await db.sessionRecording.findMany({
    where: { whiteboardSessionId: sessionId },
    orderBy: { id: "asc" },
  });
  const beforeSession = await db.whiteboardSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { endedAt: true, eventsBlobUrl: true },
  });
  await expect(
    endWhiteboardSession(sessionId, "https://blob.vercel-storage.com/second-end-events.json", {
      segments: [
        {
          blobUrl: `https://blob.vercel-storage.com/${uniq("second")}.webm`,
          mimeType: "audio/webm",
          sizeBytes: 1200,
          audioStartedAtMs: 0,
          streamId: "tutor-mic",
          segmentId: uniq("segment"),
          durationSeconds: 2,
        },
      ],
    })
  ).rejects.toThrow("This whiteboard session has already ended.");
  const afterNote = await db.sessionNote.findUniqueOrThrow({ where: { id: noteId } });
  expect(afterNote).toEqual(beforeNote);
  const afterRecordings = await db.sessionRecording.findMany({
    where: { whiteboardSessionId: sessionId },
    orderBy: { id: "asc" },
  });
  expect(afterRecordings).toEqual(beforeRecordings);
  const afterSession = await db.whiteboardSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { endedAt: true, eventsBlobUrl: true },
  });
  expect(afterSession.endedAt?.toISOString()).toBe(beforeSession.endedAt?.toISOString());
  expect(afterSession.eventsBlobUrl).toBe(beforeSession.eventsBlobUrl);
}

async function notesPageHtml(studentId: string): Promise<string> {
  const { default: StudentNotesPage } = await import(
    "@/app/admin/students/[id]/notes/page"
  );
  try {
    const element = await StudentNotesPage({
      params: Promise.resolve({ id: studentId }),
      searchParams: Promise.resolve({}),
    });
    return renderToStaticMarkup(element);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_NOT_FOUND") return "NOT_FOUND";
    throw err;
  }
}

describe("removed instructor notes window", () => {
  it("inside 7 days of endedAt the notes page is visible and save moves DRAFT to READY", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const endedAt = new Date(Date.now() - SEVEN_DAYS_MS + MINUTE_MS);
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt,
      topics: "Inside the seven days",
    });
    mockSession(instructor.email, instructor.id);

    const html = await notesPageHtml(student.id);
    expect(html).toContain("Inside the seven days");
    expect(html).not.toBe("NOT_FOUND");

    const saved = await saveSessionNotesAction(session.id, {
      topics: "Inside the seven days",
      assessment: "Steady",
      nextSteps: "Practice",
      links: "",
    });
    expect(saved.ok).toBe(true);
    const row = await db.sessionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.status).toBe("READY");
  });

  it("one minute past 7 days the note stays visible and status stays DRAFT", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const endedAt = new Date(Date.now() - SEVEN_DAYS_MS - MINUTE_MS);
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt,
      topics: "Past the seven days",
    });
    mockSession(instructor.email, instructor.id);

    const html = await notesPageHtml(student.id);
    expect(html).toContain("Past the seven days");
    expect(html).toContain("DRAFT");

    await saveSessionNotesAction(session.id, {
      topics: "Past the seven days",
      assessment: "Changed",
      nextSteps: "Nope",
      links: "",
    });
    const row = await db.sessionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.status).toBe("DRAFT");
  });
});

describe("let it finish and the first later read", () => {
  it("before the deadline endWhiteboardSession succeeds and a new room is still not_found", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"], {
      removedAt: new Date(),
    });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
    });
    const sched = await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-10-20T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        startAt: new Date("2026-10-20T22:00:00.000Z"),
        endAt: new Date("2026-10-20T23:00:00.000Z"),
        plannedDurationMinutes: 60,
        subject: "Algebra",
      },
    });
    mockSession(instructor.email, instructor.id);

    const ended = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/final-events.json"
    );
    expect(ended.endedAt).toEqual(expect.any(String));
    const row = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(row.endedAt).not.toBeNull();

    const room = await getOrCreateWhiteboardForSchedule(
      sched.id,
      { kind: "tutor", adminUserId: instructor.id },
      "rid-stage5-new-room"
    );
    expect(room).toEqual({ ok: false, reason: "not_found" });
  });

  it("the first server touch after the deadline sets endedAt once and an unread row stays open", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"], {
      removedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
    });
    const unread = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
      topics: "Nobody opens this",
    });
    mockSession(instructor.email, instructor.id);

    const { GET } = await import("@/app/api/whiteboard/[sessionId]/timer-anchor/route");
    const first = await GET(new Request("http://localhost/api/whiteboard/timer-anchor"), {
      params: Promise.resolve({ sessionId: session.id }),
    });
    expect(first.status).toBe(200);
    const afterFirst = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(afterFirst.endedAt).not.toBeNull();
    const stamped = afterFirst.endedAt!.toISOString();

    const second = await GET(new Request("http://localhost/api/whiteboard/timer-anchor"), {
      params: Promise.resolve({ sessionId: session.id }),
    });
    expect(second.status).toBe(200);
    const afterSecond = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(afterSecond.endedAt!.toISOString()).toBe(stamped);

    const stillOpen = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: unread.session.id },
    });
    expect(stillOpen.endedAt).toBeNull();
  });
});

describe("suspended org open session", () => {
  it("Start updates nothing and the open session can still be ended before the deadline", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    await db.organization.update({
      where: { id: org.id },
      data: { status: "suspended", statusChangedAt: new Date() },
    });
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
      phase: "PENDING",
    });
    mockSession(instructor.email, instructor.id);
    const updateMany = jest.spyOn(db.whiteboardSession, "updateMany");
    await startWhiteboardSession(session.id);
    const calls = await Promise.all(updateMany.mock.results.map((result) => result.value));
    const flipped = calls.reduce(
      (sum, result) => sum + ((result as { count?: number } | undefined)?.count ?? 0),
      0
    );
    expect(flipped).toBe(0);
    const pending = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(pending.sessionPhase).toBe("PENDING");

    await db.whiteboardSession.update({
      where: { id: session.id },
      data: { sessionPhase: "ACTIVE", activatedAt: new Date() },
    });
    const ended = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/suspended-end.json"
    );
    expect(ended.endedAt).toEqual(expect.any(String));
  });
});

describe("deadline math", () => {
  it("uses the clock hour, a 10 minute floor, a half-hour zone, and a DST day, and does not take now", async () => {
    const access = await import("@/lib/org-session-access");
    const deadline = access.orgForceEndDeadline as
      | ((storedAt: Date, timeZone: string) => Date)
      | undefined;
    expect(typeof deadline).toBe("function");
    if (!deadline) return;
    expect(deadline.length).toBe(2);

    const hour = deadline(new Date("2026-01-15T17:20:00.000Z"), "America/Denver");
    expect(hour.toISOString()).toBe("2026-01-15T18:00:00.000Z");

    const fiveLeft = deadline(new Date("2026-01-15T17:55:00.000Z"), "America/Denver");
    expect(fiveLeft.toISOString()).toBe("2026-01-15T18:05:00.000Z");

    const kolkata = deadline(new Date("2026-06-15T04:50:00.000Z"), "Asia/Kolkata");
    expect(kolkata.toISOString()).toBe("2026-06-15T05:30:00.000Z");

    const kolkataFloor = deadline(new Date("2026-06-15T05:25:00.000Z"), "Asia/Kolkata");
    expect(kolkataFloor.toISOString()).toBe("2026-06-15T05:35:00.000Z");

    const dst = deadline(new Date("2026-03-08T08:30:00.000Z"), "America/Denver");
    expect(dst.toISOString()).toBe("2026-03-08T09:00:00.000Z");

    const again = deadline(new Date("2026-01-15T17:20:00.000Z"), "America/Denver");
    expect(again.toISOString()).toBe(hour.toISOString());
  });
});

describe("access that stays denied, and personal students", () => {
  it("a personal student of a removed instructor still saves READY", async () => {
    const { org } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: new Date() });
    const student = await db.student.create({
      data: { name: "Personal Kid", adminUserId: instructor.id },
    });
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: new Date(),
      topics: "Personal fractions",
    });
    mockSession(instructor.email, instructor.id);
    const saved = await saveSessionNotesAction(session.id, {
      topics: "Personal fractions",
      assessment: "Good",
      nextSteps: "More",
      links: "",
    });
    expect(saved.ok).toBe(true);
    const row = await db.sessionNote.findUniqueOrThrow({ where: { id: note.id } });
    expect(row.status).toBe("READY");
  });

  it("another org, a scheduler who did not teach it, and an unapproved member are not found", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: new Date(),
      topics: "Taught by the instructor",
    });
    const scheduler = await seedMember(org.id, ["scheduler"]);
    const unapproved = await seedMember(org.id, ["instructor"], {
      approvalStatus: "WAITLISTED",
    });
    const other = await seedOrg("active");
    const outsider = await seedMember(other.org.id, ["instructor"]);

    mockSession(outsider.email, outsider.id);
    expect(await notesPageHtml(student.id)).toBe("NOT_FOUND");

    mockSession(scheduler.email, scheduler.id);
    expect(await notesPageHtml(student.id)).toBe("NOT_FOUND");

    mockSession(unapproved.email, unapproved.id);
    expect(await notesPageHtml(student.id)).toBe("NOT_FOUND");
  });
});

describe("appointments", () => {
  it("removes future appointments, calls the Google delete helper, and keeps the past row and the open session", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const future = await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-12-01T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject: "Future",
        googleEventId: "google-event-future",
      },
    });
    const past = await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-01-01T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        startAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject: "Past",
      },
    });
    const openAppointment = await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-12-02T00:00:00.000Z"),
        startTime: "18:00",
        endTime: "19:00",
        startAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject: "Open",
      },
    });
    await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
      scheduledSessionId: openAppointment.id,
    });
    mockSession(owner.email, owner.id);
    mockBeforeScheduledSessionDeleted.mockClear();

    await removeOrgMember(org.id, instructor.id);

    expect(await db.scheduledSession.findUnique({ where: { id: future.id } })).toBeNull();
    expect(mockBeforeScheduledSessionDeleted).toHaveBeenCalledWith(
      instructor.id,
      future.id,
      "google-event-future",
      null
    );
    expect(await db.scheduledSession.findUnique({ where: { id: past.id } })).not.toBeNull();
    expect(
      await db.scheduledSession.findUnique({ where: { id: openAppointment.id } })
    ).not.toBeNull();
    const member = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_adminUserId: {
          organizationId: org.id,
          adminUserId: instructor.id,
        },
      },
    });
    expect(member.removedAt).not.toBeNull();
  });

  it("a suspended org labels the upcoming row unavailable and does not delete it", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const upcoming = await db.scheduledSession.create({
      data: {
        adminUserId: instructor.id,
        studentId: student.id,
        date: new Date("2026-12-01T00:00:00.000Z"),
        startTime: "16:00",
        endTime: "17:00",
        startAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        endAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
        plannedDurationMinutes: 60,
        subject: "Still booked",
      },
    });
    await db.organization.update({
      where: { id: org.id },
      data: { status: "suspended", statusChangedAt: new Date() },
    });
    mockSession(owner.email, owner.id);
    const rows = await listScheduledSessionsForOrganization(org.id);
    const row = rows.find((item) => item.id === upcoming.id);
    expect(row?.availability).toBe("unavailable");
    expect(await db.scheduledSession.findUnique({ where: { id: upcoming.id } })).not.toBeNull();
  });
});

describe("org-forced end still accepts a segment inside the upload window", () => {
  it("a segment row lands after endedAt was already set", async () => {
    const { org, owner } = await seedOrg("active");
    const forcedAt = new Date(Date.now() - 60 * 1000);
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: forcedAt });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: forcedAt,
    });
    mockSession(instructor.email, instructor.id);
    const blobUrl = `https://blob.vercel-storage.com/${uniq("seg")}.webm`;
    const result = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/late-events.json",
      {
        segments: [
          {
            blobUrl,
            mimeType: "audio/webm",
            sizeBytes: 1200,
            audioStartedAtMs: 0,
            streamId: "tutor-mic",
            segmentId: uniq("segment"),
            durationSeconds: 2,
          },
        ],
      }
    );
    expect(result.registeredSegments).toBe(1);
    const recording = await db.sessionRecording.findFirst({
      where: { whiteboardSessionId: session.id, blobUrl },
    });
    expect(recording).not.toBeNull();
    const ended = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(ended.endedAt?.toISOString()).toBe(session.endedAt?.toISOString() ?? ended.endedAt?.toISOString());
    expect(ended.eventsBlobUrl).toBe("https://blob.vercel-storage.com/late-events.json");
  });

  it("a segment row lands when endedAt equals the suspension instant", async () => {
    const { org, owner } = await seedOrg("active");
    const forcedAt = new Date(Date.now() - 60 * 1000);
    const instructor = await seedMember(org.id, ["instructor"]);
    await db.organization.update({
      where: { id: org.id },
      data: { status: "suspended", statusChangedAt: forcedAt },
    });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: forcedAt,
    });
    mockSession(instructor.email, instructor.id);
    const blobUrl = `https://blob.vercel-storage.com/${uniq("seg")}.webm`;
    const result = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/suspended-late-events.json",
      {
        segments: [
          {
            blobUrl,
            mimeType: "audio/webm",
            sizeBytes: 1200,
            audioStartedAtMs: 0,
            streamId: "tutor-mic",
            segmentId: uniq("segment"),
            durationSeconds: 2,
          },
        ],
      }
    );
    expect(result.registeredSegments).toBe(1);
    const recording = await db.sessionRecording.findFirst({
      where: { whiteboardSessionId: session.id, blobUrl },
    });
    expect(recording).not.toBeNull();
    const ended = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(ended.endedAt?.toISOString()).toBe(forcedAt.toISOString());
    expect(ended.eventsBlobUrl).toBe("https://blob.vercel-storage.com/suspended-late-events.json");
  });

  it("a segment row lands when the lazy stamp is inside the upload window", async () => {
    const { org, owner } = await seedOrg("active");
    const storedAt = new Date(Date.now() - 3 * 60 * MINUTE_MS);
    const endedAt = new Date(Date.now() - MINUTE_MS);
    const deadline = orgForceEndDeadline(storedAt, "America/Denver");
    expect(endedAt.getTime()).toBeGreaterThanOrEqual(deadline.getTime());
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: storedAt });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt,
    });
    mockSession(instructor.email, instructor.id);
    const blobUrl = `https://blob.vercel-storage.com/${uniq("lazy")}.webm`;
    const result = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/lazy-late-events.json",
      {
        segments: [
          {
            blobUrl,
            mimeType: "audio/webm",
            sizeBytes: 900,
            audioStartedAtMs: 0,
            streamId: "tutor-mic",
            segmentId: uniq("segment"),
            durationSeconds: 2,
          },
        ],
      }
    );
    expect(result.registeredSegments).toBe(1);
    const recording = await db.sessionRecording.findFirst({
      where: { whiteboardSessionId: session.id, blobUrl },
    });
    expect(recording).not.toBeNull();
    const ended = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(ended.endedAt?.toISOString()).toBe(endedAt.toISOString());
  });

  it("End it now writes one instant on removedAt and endedAt and a segment still lands", async () => {
    const { org, owner } = await seedOrg("active");
    const instructor = await seedMember(org.id, ["instructor"]);
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: null,
    });
    mockSession(owner.email, owner.id);
    await removeOrgMember(org.id, instructor.id, "now");
    const member = await db.organizationMember.findUniqueOrThrow({
      where: {
        organizationId_adminUserId: {
          organizationId: org.id,
          adminUserId: instructor.id,
        },
      },
    });
    const stamped = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(stamped.endedAt).not.toBeNull();
    expect(member.removedAt).not.toBeNull();
    expect(stamped.endedAt!.getTime()).toBe(member.removedAt!.getTime());

    mockSession(instructor.email, instructor.id);
    const blobUrl = `https://blob.vercel-storage.com/${uniq("now")}.webm`;
    const result = await endWhiteboardSession(
      session.id,
      "https://blob.vercel-storage.com/end-it-now-events.json",
      {
        segments: [
          {
            blobUrl,
            mimeType: "audio/webm",
            sizeBytes: 1100,
            audioStartedAtMs: 0,
            streamId: "tutor-mic",
            segmentId: uniq("segment"),
            durationSeconds: 2,
          },
        ],
      }
    );
    expect(result.registeredSegments).toBe(1);
    const recording = await db.sessionRecording.findFirst({
      where: { whiteboardSessionId: session.id, blobUrl },
    });
    expect(recording).not.toBeNull();
    const ended = await db.whiteboardSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(ended.endedAt!.getTime()).toBe(member.removedAt!.getTime());
  });
});

describe("a normal end inside Let it finish does not accept a second End", () => {
  it("a removed tutor who already ended inside the window is already-ended", async () => {
    const { org, owner } = await seedOrg("active");
    const { storedAt, endedAt } = normalEndInsideLetItFinish();
    const deadline = orgForceEndDeadline(storedAt, "America/Denver");
    expect(endedAt.getTime()).toBeGreaterThan(storedAt.getTime());
    expect(endedAt.getTime()).toBeLessThan(deadline.getTime());
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: storedAt });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt,
    });
    await seedExistingSegment({
      adminUserId: instructor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
    });
    mockSession(instructor.email, instructor.id);
    await expectSecondEndRejected(session.id, note.id);
  });

  it("a tutor in a suspended org who already ended inside the window is already-ended", async () => {
    const { org, owner } = await seedOrg("active");
    const { storedAt, endedAt } = normalEndInsideLetItFinish();
    const deadline = orgForceEndDeadline(storedAt, "America/Denver");
    expect(endedAt.getTime()).toBeGreaterThan(storedAt.getTime());
    expect(endedAt.getTime()).toBeLessThan(deadline.getTime());
    const instructor = await seedMember(org.id, ["instructor"]);
    await db.organization.update({
      where: { id: org.id },
      data: { status: "suspended", statusChangedAt: storedAt },
    });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt,
    });
    await seedExistingSegment({
      adminUserId: instructor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
    });
    mockSession(instructor.email, instructor.id);
    await expectSecondEndRejected(session.id, note.id);
  });

  it("a forced end older than 15 minutes rejects a second End", async () => {
    const { org, owner } = await seedOrg("active");
    const forcedAt = new Date(Date.now() - 16 * MINUTE_MS);
    const instructor = await seedMember(org.id, ["instructor"], { removedAt: forcedAt });
    const { student } = await seedOrgLearner(org.id, owner.id);
    const { session, note } = await seedTaughtSession({
      adminUserId: instructor.id,
      studentId: student.id,
      endedAt: forcedAt,
    });
    await seedExistingSegment({
      adminUserId: instructor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
    });
    mockSession(instructor.email, instructor.id);
    await expectSecondEndRejected(session.id, note.id);
  });
});
