/**
 * @jest-environment node
 *
 * deleteWhiteboardSessionAndDataAction must refuse while the student is
 * erasure-suspended, before any row is removed. Oracle: the session, its
 * note, and its recording still exist. A non-erased session the tutor owns
 * is removed, including those rows.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
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
  revalidatePath: jest.fn(),
}));

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { deleteWhiteboardSessionAndDataAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { uniq } from "../helpers/unique-test-token";

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: tutor.email },
  });
}

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
      emailVerifiedAt: new Date("2026-01-01"),
    },
  });
}

async function seedOwnedSession(adminUserId: string, erased: boolean) {
  const student = await db.student.create({
    data: {
      name: `Delete gate ${uniq(erased ? "erased" : "live")}`,
      adminUserId,
      erasedAt: erased ? new Date() : null,
    },
  });
  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-01T00:00:00.000Z"),
      topics: "fractions",
      homework: "p1",
      nextSteps: "review",
      status: "READY",
    },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.example.com/${uniq("events")}.json`,
      sessionPhase: "ACTIVE",
      noteId: note.id,
    },
  });
  const recording = await db.sessionRecording.create({
    data: {
      adminUserId,
      studentId: student.id,
      whiteboardSessionId: session.id,
      noteId: note.id,
      blobUrl: `https://blob.example.com/${uniq("audio")}.webm`,
      mimeType: "audio/webm",
      sizeBytes: 128,
      durationSeconds: 30,
    },
  });
  return { student, note, session, recording };
}

async function callDelete(sessionId: string): Promise<"not_found" | "refused" | "deleted"> {
  try {
    const result = await deleteWhiteboardSessionAndDataAction(sessionId);
    if (result.ok) return "deleted";
    return "refused";
  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_NOT_FOUND")) return "not_found";
    throw err;
  }
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("deleteWhiteboardSessionAndDataAction erasure gate", () => {
  it("does not delete an erasure-suspended student's session, note, or recording", async () => {
    const tutor = await seedTutor();
    const seeded = await seedOwnedSession(tutor.id, true);
    mockSessionAsTutor(tutor);

    const outcome = await callDelete(seeded.session.id);
    expect(outcome).not.toBe("deleted");

    expect(await db.whiteboardSession.findUnique({ where: { id: seeded.session.id } })).not.toBeNull();
    expect(await db.sessionNote.findUnique({ where: { id: seeded.note.id } })).not.toBeNull();
    expect(await db.sessionRecording.findUnique({ where: { id: seeded.recording.id } })).not.toBeNull();
  });

  it("still deletes a non-erased session the tutor owns", async () => {
    const tutor = await seedTutor();
    const seeded = await seedOwnedSession(tutor.id, false);
    mockSessionAsTutor(tutor);

    const outcome = await callDelete(seeded.session.id);
    expect(outcome).toBe("deleted");

    expect(await db.whiteboardSession.findUnique({ where: { id: seeded.session.id } })).toBeNull();
    expect(await db.sessionNote.findUnique({ where: { id: seeded.note.id } })).toBeNull();
    expect(await db.sessionRecording.findUnique({ where: { id: seeded.recording.id } })).toBeNull();
  });
});
