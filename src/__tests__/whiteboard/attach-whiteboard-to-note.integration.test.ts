/**
 * @jest-environment node
 *
 * P1-J4 — attachWhiteboardToNoteAction behavior/contract tests.
 *
 * Oracle: DB linkage after attach — `WhiteboardSession.noteId` points at the
 * target note and orphan `SessionRecording` rows (noteId null) for the session
 * are linked to that note with sequential orderIndex. Cross-tenant attach →
 * `assertOwnsWhiteboardSession` notFound denial.
 *
 * Red-before (2026-07-05): temporarily expecting `noteId` to remain null and
 * orphan segment `noteId` to stay null both failed before correcting to the
 * linked state.
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

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_attach_wb_note_test",
}));

jest.mock("@/lib/revalidateStudentSharePages", () => ({
  __esModule: true,
  revalidateStudentSharePages: jest.fn().mockResolvedValue(undefined),
}));

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { attachWhiteboardToNoteAction } from "@/app/admin/students/[id]/whiteboard/actions";
import { uniq } from "../helpers/unique-test-token";


async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function seedAttachFixture() {
  const tutor = await seedTutor();
  const student = await db.student.create({
    data: { name: `Attach Student ${uniq()}`, adminUserId: tutor.id },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: "https://blob.vercel-storage.com/attach-events.json",
      endedAt: new Date(),
    },
  });
  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-15T00:00:00Z"),
      topics: "Pre-existing note",
      homework: "",
      assessment: "",
      nextSteps: "",
      linksJson: "[]",
      status: "DRAFT",
    },
  });
  const orphanSeg1 = await db.sessionRecording.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
      noteId: null,
      blobUrl: `https://blob.vercel-storage.com/${uniq("orphan1")}.webm`,
      mimeType: "audio/webm",
      sizeBytes: 512,
      orderIndex: 0,
    },
  });
  const orphanSeg2 = await db.sessionRecording.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      whiteboardSessionId: session.id,
      noteId: null,
      blobUrl: `https://blob.vercel-storage.com/${uniq("orphan2")}.webm`,
      mimeType: "audio/webm",
      sizeBytes: 768,
      orderIndex: 1,
    },
  });
  return { tutor, student, session, note, orphanSeg1, orphanSeg2 };
}

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: tutor.email },
  });
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("attachWhiteboardToNoteAction — link + orphan segments (P1-J4)", () => {
  it("links session to note and assigns orphan recordings to that note", async () => {
    const { tutor, session, note, orphanSeg1, orphanSeg2 } =
      await seedAttachFixture();
    mockSessionAsTutor(tutor);

    const result = await attachWhiteboardToNoteAction(session.id, {
      mode: "existing",
      noteId: note.id,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.noteId).toBe(note.id);

    const linkedSession = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { noteId: true },
    });
    expect(linkedSession.noteId).toBe(note.id);

    const seg1 = await db.sessionRecording.findUniqueOrThrow({
      where: { id: orphanSeg1.id },
      select: { noteId: true, orderIndex: true },
    });
    const seg2 = await db.sessionRecording.findUniqueOrThrow({
      where: { id: orphanSeg2.id },
      select: { noteId: true, orderIndex: true },
    });
    expect(seg1.noteId).toBe(note.id);
    expect(seg2.noteId).toBe(note.id);
    expect(seg1.orderIndex).toBe(0);
    expect(seg2.orderIndex).toBe(1);
  });
});

describe("attachWhiteboardToNoteAction — ownership contract (P1-J4)", () => {
  it("cross-tenant tutor → assertOwnsWhiteboardSession notFound (no link)", async () => {
    const owner = await seedTutor();
    const other = await seedTutor();
    const student = await db.student.create({
      data: { name: `Owned ${uniq()}`, adminUserId: owner.id },
    });
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: owner.id,
        studentId: student.id,
        sessionPhase: "ACTIVE",
        sessionMode: "LIVE",
        eventsBlobUrl: "https://blob.vercel-storage.com/owned-events.json",
        endedAt: new Date(),
      },
    });
    const note = await db.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date("2026-06-16T00:00:00Z"),
        topics: "Owned note",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
        status: "DRAFT",
      },
    });
    mockSessionAsTutor(other);

    await expect(
      attachWhiteboardToNoteAction(session.id, {
        mode: "existing",
        noteId: note.id,
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    const row = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { noteId: true },
    });
    expect(row.noteId).toBeNull();
  });
});
