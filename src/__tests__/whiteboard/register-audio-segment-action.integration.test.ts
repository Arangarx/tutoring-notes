/**
 * @jest-environment node
 *
 * WS-A A2 — registerWhiteboardSessionAudioSegmentAction integration tests.
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_register_seg_test",
}));

jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));

const requireStudentScopeMock = jest.fn();
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

jest.mock("@/lib/consent-scope", () => {
  const actual = jest.requireActual("@/lib/consent-scope");
  return {
    __esModule: true,
    ...actual,
    resolveModeAwareAudioRecordingConsent: jest.fn().mockResolvedValue({
      allow: true,
      reason: "test",
    }),
  };
});

import { db } from "@/lib/db";
import { registerWhiteboardSessionAudioSegmentAction } from "@/app/admin/students/[id]/whiteboard/actions";
import { TUTOR_MIC_STREAM_ID } from "@/lib/recording/lifecycle-machine";

let uniqueSuffix = 0;
function uniq(prefix = "regseg") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

async function seedActiveSession() {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: "Seg Student", adminUserId: tutor.id },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: "https://blob.vercel-storage.com/test-events.json",
    },
  });
  return { tutor, student, session };
}

function blobUrl(n: number) {
  return `https://blob.vercel-storage.com/wb-${n}.webm`;
}

beforeEach(() => {
  requireStudentScopeMock.mockResolvedValue({
    kind: "db",
    adminUserId: "will-be-overridden",
    email: "tutor@example.com",
  });
});

afterAll(async () => {
  await db.$disconnect();
});

describe("registerWhiteboardSessionAudioSegmentAction — atomic orderIndex", () => {
  it("assigns sequential orderIndex on back-to-back calls", async () => {
    const { tutor, session } = await seedActiveSession();
    requireStudentScopeMock.mockResolvedValue({
      kind: "db",
      adminUserId: tutor.id,
      email: tutor.email,
    });
    assertOwnsWhiteboardSessionMock.mockImplementation(async (wbsid: string) => {
      const row = await db.whiteboardSession.findUniqueOrThrow({
        where: { id: wbsid },
      });
      return row;
    });

    const r1 = await registerWhiteboardSessionAudioSegmentAction(session.id, {
      blobUrl: blobUrl(1),
      mimeType: "audio/webm",
      sizeBytes: 100,
      streamId: TUTOR_MIC_STREAM_ID,
    });
    const r2 = await registerWhiteboardSessionAudioSegmentAction(session.id, {
      blobUrl: blobUrl(2),
      mimeType: "audio/webm",
      sizeBytes: 200,
      streamId: TUTOR_MIC_STREAM_ID,
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.orderIndex).toBe(0);
    expect(r2.orderIndex).toBe(1);
  });

  it("is idempotent on duplicate blobUrl", async () => {
    const { tutor, session } = await seedActiveSession();
    requireStudentScopeMock.mockResolvedValue({
      kind: "db",
      adminUserId: tutor.id,
      email: tutor.email,
    });
    assertOwnsWhiteboardSessionMock.mockImplementation(async (wbsid: string) => {
      return db.whiteboardSession.findUniqueOrThrow({ where: { id: wbsid } });
    });

    const url = blobUrl(99);
    const first = await registerWhiteboardSessionAudioSegmentAction(session.id, {
      blobUrl: url,
      mimeType: "audio/webm",
      sizeBytes: 512,
    });
    const second = await registerWhiteboardSessionAudioSegmentAction(session.id, {
      blobUrl: url,
      mimeType: "audio/webm",
      sizeBytes: 512,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.deduped).toBe(true);
    expect(second.recordingId).toBe(first.recordingId);
    expect(second.orderIndex).toBe(first.orderIndex);

    const count = await db.sessionRecording.count({
      where: { whiteboardSessionId: session.id, blobUrl: url },
    });
    expect(count).toBe(1);
  });

  it("returns sessionEnded when session already ended (worker no-op)", async () => {
    const { tutor, session } = await seedActiveSession();
    await db.whiteboardSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });
    requireStudentScopeMock.mockResolvedValue({
      kind: "db",
      adminUserId: tutor.id,
      email: tutor.email,
    });
    assertOwnsWhiteboardSessionMock.mockImplementation(async (wbsid: string) => {
      return db.whiteboardSession.findUniqueOrThrow({ where: { id: wbsid } });
    });

    const result = await registerWhiteboardSessionAudioSegmentAction(session.id, {
      blobUrl: blobUrl(3),
      mimeType: "audio/webm",
      sizeBytes: 100,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.sessionEnded).toBe(true);
  });
});
