jest.mock("@/lib/db", () => ({
  db: {
    transcriptChunk: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    transcriptChunkExtraction: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
    tutorNote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
  },
  withDbRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock("@/lib/whiteboard-scope", () => ({
  assertOwnsWhiteboardSession: jest.fn().mockResolvedValue({
    id: "wbs-1",
    adminUserId: "admin-1",
    studentId: "stu-1",
    consentAcknowledged: true,
    eventsBlobUrl: "https://blob/events",
    endedAt: null,
  }),
}));

import { db } from "@/lib/db";
import { assertOwnsWhiteboardSession } from "@/lib/whiteboard-scope";
import {
  getTranscriptChunksBySessionId,
  getTranscriptChunksForAuthorisedSession,
  getTutorNoteForAuthorisedSession,
  upsertTranscriptChunk,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";

const mockUpsert = db.transcriptChunk.upsert as jest.Mock;
const mockFindMany = db.transcriptChunk.findMany as jest.Mock;
const mockTutorFind = db.tutorNote.findUnique as jest.Mock;
const mockTutorUpsert = db.tutorNote.upsert as jest.Mock;

describe("transcript-store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("upsertTranscriptChunk uses sessionId+chunkBlobUrl composite key", async () => {
    const row = {
      id: "tc-1",
      sessionId: "wbs-1",
      chunkBlobUrl: "https://blob/chunk.webm",
      recordingTimeOffsetMs: 0,
      status: "pending",
      transcript: "",
      durationMs: null,
      transcribedAt: null,
      error: null,
      createdAt: new Date(),
    };
    mockUpsert.mockResolvedValue(row);

    const result = await upsertTranscriptChunk({
      sessionId: "wbs-1",
      chunkBlobUrl: "https://blob/chunk.webm",
      recordingTimeOffsetMs: 0,
      status: "pending",
    });

    expect(result).toEqual(row);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId_chunkBlobUrl: {
            sessionId: "wbs-1",
            chunkBlobUrl: "https://blob/chunk.webm",
          },
        },
      })
    );
  });

  test("getTranscriptChunksBySessionId orders by recordingTimeOffsetMs", async () => {
    mockFindMany.mockResolvedValue([]);

    await getTranscriptChunksBySessionId("wbs-1");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { sessionId: "wbs-1" },
      orderBy: { recordingTimeOffsetMs: "asc" },
    });
  });

  test("getTranscriptChunksForAuthorisedSession asserts ownership first", async () => {
    mockFindMany.mockResolvedValue([]);

    await getTranscriptChunksForAuthorisedSession("wbs-1");

    expect(assertOwnsWhiteboardSession).toHaveBeenCalledWith("wbs-1");
    expect(mockFindMany).toHaveBeenCalled();
  });

  test("getTutorNoteForAuthorisedSession asserts ownership before read", async () => {
    mockTutorFind.mockResolvedValue(null);

    await getTutorNoteForAuthorisedSession("wbs-1");

    expect(assertOwnsWhiteboardSession).toHaveBeenCalledWith("wbs-1");
    expect(mockTutorFind).toHaveBeenCalledWith({ where: { sessionId: "wbs-1" } });
  });

  test("upsertTutorNotePending creates pending row idempotently", async () => {
    const note = {
      id: "tn-1",
      sessionId: "wbs-1",
      status: "pending",
      content: null,
      isPartial: false,
      error: null,
      generatedAt: null,
      createdAt: new Date(),
    };
    mockTutorUpsert.mockResolvedValue(note);

    const result = await upsertTutorNotePending("wbs-1");

    expect(result).toEqual(note);
    expect(mockTutorUpsert).toHaveBeenCalledWith({
      where: { sessionId: "wbs-1" },
      create: { sessionId: "wbs-1", status: "pending" },
      update: {},
    });
  });
});
