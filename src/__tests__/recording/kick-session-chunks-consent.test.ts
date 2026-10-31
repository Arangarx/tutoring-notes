/**
 * Consent wave C2, A8 (kick half): `kickSessionChunksAction` reads each row's STORED lane, passes it on explicitly,
 * refuses what the session's capabilities forbid, and writes a terminal `refused` status instead of re-enqueueing.
 *
 * Real test DB for rows, consent resolution and the gate. Mocked: ownership (the action's own boundary, covered
 * elsewhere), Next cache, and the enqueue transport (so the test captures exactly what the kick hands it).
 */

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
const mockAssertOwns = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (...a: unknown[]) => mockAssertOwns(...a),
  orgBoardEditsAllowed: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));
const mockEnqueueChunk = jest.fn();
jest.mock("@/lib/recording/chunk-transcribe-enqueue", () => ({
  __esModule: true,
  enqueueChunkTranscribe: (...a: unknown[]) => mockEnqueueChunk(...a),
}));
jest.mock("@/lib/recording/notes-enqueue", () => ({
  __esModule: true,
  enqueueNotesReduce: jest.fn(),
}));

import { db } from "@/lib/db";
import { kickSessionChunksAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { upsertTranscriptChunk } from "@/lib/recording/transcript-store";
import { uniq } from "../helpers/unique-test-token";

const TUTOR = "tutor:mic";
const LEARNER = "speaker:learner-1:transcript";

async function seedSession(o: { audio: boolean; notes?: boolean; mode?: "LIVE" | "IN_PERSON" }) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
  });
  const student = await db.student.create({
    data: { name: "Kick Student", parentEmail: `p-${uniq()}@example.com`, adminUserId: tutor.id },
  });
  const note = await db.sessionNote.create({
    data: { studentId: student.id, date: new Date("2026-01-15"), topics: "t", homework: "h", nextSteps: "n" },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.example.com/events/${uniq()}.json`,
      sessionPhase: "ACTIVE",
      sessionMode: o.mode ?? "LIVE",
      consentSnapshot: {
        create: {
          allowLiveSession: true,
          allowAudioRecording: o.audio,
          allowWhiteboardRecording: true,
          allowNoteSending: o.notes ?? true,
        },
      },
    },
  });
  mockAssertOwns.mockResolvedValue({ id: session.id, adminUserId: tutor.id, studentId: student.id });
  return session.id;
}

async function chunk(sessionId: string, streamId: string, speakerId: string | null, status = "pending") {
  const r = await upsertTranscriptChunk({
    sessionId,
    chunkBlobUrl: `https://blob.example.com/chunks/${uniq()}.webm`,
    recordingTimeOffsetMs: 0,
    status: status as "pending",
    streamId,
    speakerId,
  });
  return r.id;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("kickSessionChunksAction (consent wave C2)", () => {
  test("audio on: every unsettled chunk is re-enqueued with its STORED lane and speaker", async () => {
    const sid = await seedSession({ audio: true });
    await chunk(sid, TUTOR, null);
    await chunk(sid, LEARNER, "learner-1");

    const result = await kickSessionChunksAction(sid);

    expect(result).toEqual({ kicked: 2, refused: 0 });
    const jobs = mockEnqueueChunk.mock.calls.map((c) => c[0] as { streamId: string; speakerId: string | null; surface: string });
    expect(jobs.map((j) => [j.streamId, j.speakerId, j.surface]).sort()).toEqual(
      [
        [TUTOR, null, "kick"],
        [LEARNER, "learner-1", "kick"],
      ].sort()
    );
  });

  test("audio off online: the learner chunk is refused (terminal row, lane intact, never re-enqueued); the tutor chunk is kicked", async () => {
    const sid = await seedSession({ audio: false });
    await chunk(sid, TUTOR, null);
    const learnerId = await chunk(sid, LEARNER, "learner-1");

    const result = await kickSessionChunksAction(sid);

    expect(result).toEqual({ kicked: 1, refused: 1 });
    const l = await db.transcriptChunk.findUniqueOrThrow({ where: { id: learnerId } });
    expect({ status: l.status, streamId: l.streamId, speakerId: l.speakerId, error: l.error }).toEqual({
      status: "refused",
      streamId: LEARNER,
      speakerId: "learner-1",
      error: "audio_off",
    });
    const enqueuedLanes = mockEnqueueChunk.mock.calls.map((c) => (c[0] as { streamId: string }).streamId);
    expect(enqueuedLanes).toEqual([TUTOR]);
  });

  test("a second kick does not touch refused rows again (terminal)", async () => {
    const sid = await seedSession({ audio: false });
    await chunk(sid, LEARNER, "learner-1");
    await kickSessionChunksAction(sid);
    mockEnqueueChunk.mockClear();

    const again = await kickSessionChunksAction(sid);

    expect(again).toEqual({ kicked: 0, refused: 0 });
    expect(mockEnqueueChunk).not.toHaveBeenCalled();
  });

  test("notes off: every unsettled chunk is refused, even with audio on", async () => {
    const sid = await seedSession({ audio: true, notes: false });
    const a = await chunk(sid, TUTOR, null);
    const b = await chunk(sid, LEARNER, "learner-1");

    const result = await kickSessionChunksAction(sid);

    expect(result).toEqual({ kicked: 0, refused: 2 });
    for (const id of [a, b]) {
      const r = await db.transcriptChunk.findUniqueOrThrow({ where: { id } });
      expect({ status: r.status, error: r.error }).toEqual({ status: "refused", error: "notes_off" });
    }
    expect(mockEnqueueChunk).not.toHaveBeenCalled();
  });

  test("done chunks are left alone", async () => {
    const sid = await seedSession({ audio: false });
    const doneId = await chunk(sid, LEARNER, "learner-1", "done");

    const result = await kickSessionChunksAction(sid);

    expect(result).toEqual({ kicked: 0, refused: 0 });
    expect((await db.transcriptChunk.findUniqueOrThrow({ where: { id: doneId } })).status).toBe("done");
  });
});
