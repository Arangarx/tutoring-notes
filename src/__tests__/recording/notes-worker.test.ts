/**
 * Recording re-arch Phase 1, Slice 3 — notes-worker tests.
 *
 * Tests the reduce phase: completion gate, session-sealed guard,
 * timeout/partial path, idempotency, and cost logging.
 *
 * All DB and OpenAI calls are mocked — no live DB or network.
 */

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    adminUser: {
      // B1: default APPROVED so existing tests are unaffected by the approval gate.
      findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }),
    },
    whiteboardSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sessionNote: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
  withDbRetry: jest.fn((fn: () => unknown) => fn()),
}));

jest.mock("@/lib/recording/transcript-store", () => ({
  getTutorNoteBySessionId: jest.fn(),
  getTranscriptChunksBySessionId: jest.fn(),
  getChunkExtractionsBySessionId: jest.fn(),
  updateTutorNote: jest.fn(),
  upsertTutorNotePending: jest.fn(),
}));

jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "test-key" },
}));

const mockChatCreate = jest.fn();
jest.mock("openai", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: { completions: { create: mockChatCreate } },
    })),
  };
});

jest.mock("@/lib/observability/cost-events", () => ({
  estimateCostUsd: jest.fn().mockReturnValue(0.001),
  logCostEvent: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import {
  getTutorNoteBySessionId,
  getTranscriptChunksBySessionId,
  getChunkExtractionsBySessionId,
  updateTutorNote,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";
import { parseNoteContent } from "@/components/whiteboard/TutorNotesSection";

const mockGetSession = db.whiteboardSession.findUnique as jest.Mock;
const mockGetNote = getTutorNoteBySessionId as jest.Mock;
const mockGetChunks = getTranscriptChunksBySessionId as jest.Mock;
const mockGetExtractions = getChunkExtractionsBySessionId as jest.Mock;
const mockUpdateNote = updateTutorNote as jest.Mock;
const mockUpsertNotePending = upsertTutorNotePending as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "wbs-test-01";
const NOW = new Date("2026-06-07T12:00:00Z");

function makeSession(endedAt: Date | null = NOW) {
  // Worker only selects {id, endedAt} from WhiteboardSession (bridge removed).
  return {
    id: SESSION_ID,
    endedAt,
  };
}

function makeChunk(overrides: Partial<{
  id: string;
  status: string;
  attempts: number;
  recordingTimeOffsetMs: number;
  transcript: string;
}> = {}) {
  return {
    id: overrides.id ?? "chunk-1",
    sessionId: SESSION_ID,
    chunkBlobUrl: "https://blob/chunk.webm",
    status: overrides.status ?? "done",
    attempts: overrides.attempts ?? 1,
    recordingTimeOffsetMs: overrides.recordingTimeOffsetMs ?? 0,
    transcript: overrides.transcript ?? "Tutor explained Pythagoras theorem.",
    durationMs: 30000,
    transcribedAt: NOW,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeExtraction(chunkId: string) {
  return {
    id: "ext-1",
    sessionId: SESSION_ID,
    chunkId,
    topics: JSON.stringify(["Pythagoras theorem"]),
    studentQuestions: JSON.stringify(["What is a right angle?"]),
    corrections: JSON.stringify([]),
    followUps: JSON.stringify(["Practice 3 problems"]),
    extractedAt: NOW,
  };
}

function mockOpenAISuccess(content: string) {
  mockChatCreate.mockResolvedValueOnce({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNote.mockResolvedValue(null);
  mockUpsertNotePending.mockResolvedValue({ sessionId: SESSION_ID, status: "pending" });
  mockUpdateNote.mockResolvedValue({ sessionId: SESSION_ID });

  // Worker now only selects {id, endedAt} from WhiteboardSession (bridge removed).
  mockGetSession.mockResolvedValue({
    id: SESSION_ID,
    endedAt: NOW,
  });
});

describe("processNotesReduceJob — idempotency", () => {
  it("skips immediately if TutorNote is already done", async () => {
    mockGetNote.mockResolvedValue({ status: "done", sessionId: SESSION_ID });

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("skipped");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("skips immediately if TutorNote is already partial", async () => {
    mockGetNote.mockResolvedValue({ status: "partial", sessionId: SESSION_ID });

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("skipped");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});

describe("processNotesReduceJob — session-sealed guard", () => {
  it("aborts if session not found", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("failed");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("aborts if session not yet sealed (endedAt = null)", async () => {
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: null,
    });

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("skipped");
    if (result.outcome === "skipped") {
      expect(result.reason).toBe("session_not_sealed");
    }
    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});

describe("processNotesReduceJob — completion gate", () => {
  it("returns pending when chunks are still transcribing and within timeout", async () => {
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: new Date(),
    });

    mockGetChunks.mockResolvedValue([
      makeChunk({ status: "done" }),
      makeChunk({ id: "chunk-2", status: "transcribing" }),
    ]);
    mockGetExtractions.mockResolvedValue([]);

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("pending");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("returns pending when chunks are pending and within timeout", async () => {
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: new Date(),
    });

    mockGetChunks.mockResolvedValue([
      makeChunk({ status: "pending" }),
    ]);
    mockGetExtractions.mockResolvedValue([]);

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("pending");
  });

  it("proceeds with partial=true when timeout exceeded and chunks still pending", async () => {
    // Session sealed 6 minutes ago (past the 5-min timeout)
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000);
    mockGetSession.mockResolvedValue(makeSession(sixMinAgo));

    const doneChunk = makeChunk({ id: "chunk-1", status: "done" });
    mockGetChunks.mockResolvedValue([
      doneChunk,
      makeChunk({ id: "chunk-2", status: "pending" }),
    ]);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess(JSON.stringify({
      topics: "Pythagoras theorem",
      assessment: "Good progress",
      nextSteps: "Review next session",
      links: "",
    }));

    // Worker only selects {id, endedAt} from session (bridge removed).
    (db.whiteboardSession.findUnique as jest.Mock).mockResolvedValue({ id: SESSION_ID, endedAt: sixMinAgo });

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("partial");
    if (result.outcome === "partial") {
      expect(result.isPartial).toBe(true);
    }
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    const updateCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "partial"
    );
    expect(updateCall).toBeDefined();
    expect((updateCall?.[1] as { isPartial?: boolean })?.isPartial).toBe(true);
  });
});

describe("processNotesReduceJob — successful reduce", () => {
  it("uses map extractions when available", async () => {
    const chunk = makeChunk({ id: "chunk-1", status: "done" });
    mockGetChunks.mockResolvedValue([chunk]);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess(JSON.stringify({ topics: "Math", assessment: "Good", nextSteps: "Practice", links: "" }));

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("done");
    expect(mockChatCreate).toHaveBeenCalledTimes(1);

    const callArgs = mockChatCreate.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(userMsg).toContain("extractions");
    const systemMsg = callArgs.messages.find((m: { role: string }) => m.role === "system").content as string;
    expect(systemMsg).toContain("do not fabricate");
  });

  it("falls back to raw transcripts when no extractions exist", async () => {
    const chunk = makeChunk({ id: "chunk-1", status: "done", transcript: "Student asked about area." });
    mockGetChunks.mockResolvedValue([chunk]);
    mockGetExtractions.mockResolvedValue([]);
    mockOpenAISuccess(JSON.stringify({ topics: "Area", assessment: "", nextSteps: "", links: "" }));

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("done");
    const callArgs = mockChatCreate.mock.calls[0][0];
    const userMsg = callArgs.messages.find((m: { role: string }) => m.role === "user").content as string;
    expect(userMsg).toContain("Student asked about area.");
  });

  it("writes TutorNote with status=done and structured JSON content on success", async () => {
    mockGetChunks.mockResolvedValue([makeChunk()]);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess(JSON.stringify({
      topics: "Pythagoras theorem",
      assessment: "Covered well",
      nextSteps: "Practice 3 problems",
      links: "",
    }));

    await processNotesReduceJob(SESSION_ID);

    const donecall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    expect(donecall).toBeDefined();
    const content = (donecall?.[1] as { content?: string })?.content;
    expect(content).toBeDefined();
    const parsed = JSON.parse(content!);
    expect(parsed.topics).toBe("Pythagoras theorem");
    expect(parseNoteContent(content!)).toEqual({
      topics: "Pythagoras theorem",
      assessment: "Covered well",
      nextSteps: "Practice 3 problems",
      links: "",
    });
  });

  it("handles sessions with no chunks (no audio)", async () => {
    mockGetChunks.mockResolvedValue([]); // no audio chunks
    mockGetExtractions.mockResolvedValue([]);
    mockOpenAISuccess(JSON.stringify({ topics: "", assessment: "", nextSteps: "", links: "" }));

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("done");
    expect(result).toMatchObject({ outcome: "done", isPartial: false });
  });
});

describe("processNotesReduceJob — failure handling", () => {
  it("writes failed status and returns failed on OpenAI error", async () => {
    mockGetChunks.mockResolvedValue([makeChunk()]);
    mockGetExtractions.mockResolvedValue([]);
    mockChatCreate.mockRejectedValue(new Error("API rate limit"));

    const result = await processNotesReduceJob(SESSION_ID);

    expect(result.outcome).toBe("failed");
    const failCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "failed"
    );
    expect(failCall).toBeDefined();
  });
});

describe("processNotesReduceJob — failed chunks do not block reduce", () => {
  it("marks isPartial=true when some chunks are failed but proceeds", async () => {
    const doneChunk = makeChunk({ id: "chunk-1", status: "done" });
    const failedChunk = makeChunk({ id: "chunk-2", status: "failed" });
    mockGetChunks.mockResolvedValue([doneChunk, failedChunk]);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess(JSON.stringify({ topics: "Math", assessment: "Partial notes", nextSteps: "", links: "" }));

    const result = await processNotesReduceJob(SESSION_ID);

    // Failed chunks = partial = true, but still proceeds (not blocked)
    expect(result.outcome).toBe("partial");
    if (result.outcome === "partial") {
      expect(result.isPartial).toBe(true);
    }
  });
});
