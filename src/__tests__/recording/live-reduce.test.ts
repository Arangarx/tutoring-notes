/**
 * WS-K live-reduce teeth tests — red-before/green-after.
 *
 * Tests five user-observable requirements:
 * (a) After N mapped chunks during an UNSEALED session, reduce runs live (BEFORE End).
 * (b) End fast-path: ZERO LLM calls when the running draft is already current (watermark match).
 * (c) Tail case: one un-reduced chunk at End → exactly ONE final reduce → READY.
 * (d) Shimmer CSS: gradient uses DEFINED vars (not transparent --surface-muted/hover).
 * (e) Copy: "Preparing your notes..." (not "Waiting for transcript…").
 */

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  db: {
    adminUser: {
      findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }),
    },
    whiteboardSession: {
      findUnique: jest.fn(),
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
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

jest.mock("@/lib/observability/cost-events", () => ({
  estimateCostUsd: jest.fn().mockReturnValue(0.001),
  logCostEvent: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";

import { db } from "@/lib/db";
import {
  getTutorNoteBySessionId,
  getTranscriptChunksBySessionId,
  getChunkExtractionsBySessionId,
  updateTutorNote,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";
import { logCostEvent } from "@/lib/observability/cost-events";
import { processLiveReduceJob } from "@/lib/recording/notes-worker";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";

const mockGetSession = db.whiteboardSession.findUnique as jest.Mock;
const mockGetNote = getTutorNoteBySessionId as jest.Mock;
const mockGetChunks = getTranscriptChunksBySessionId as jest.Mock;
const mockGetExtractions = getChunkExtractionsBySessionId as jest.Mock;
const mockUpdateNote = updateTutorNote as jest.Mock;
const mockUpsertNotePending = upsertTutorNotePending as jest.Mock;
const mockLogCostEvent = logCostEvent as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SESSION_ID = "wbs-wsk-live-01";
const NOW = new Date("2026-07-05T10:00:00Z");

function makeChunk(id: string, status = "done", offsetMs = 0) {
  return {
    id,
    sessionId: SESSION_ID,
    chunkBlobUrl: `https://blob/${id}.webm`,
    status,
    attempts: 1,
    recordingTimeOffsetMs: offsetMs,
    transcript: `Tutor explained topic ${id}.`,
    durationMs: 30000,
    transcribedAt: NOW,
    error: null,
    speakerId: null,
    streamId: "tutor:mic",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeExtraction(chunkId: string) {
  return {
    id: `ext-${chunkId}`,
    sessionId: SESSION_ID,
    chunkId,
    topics: JSON.stringify(["Algebra"]),
    studentQuestions: JSON.stringify([]),
    corrections: JSON.stringify([]),
    followUps: JSON.stringify([]),
    extractedAt: NOW,
  };
}

function makeNote(overrides: {
  status?: string;
  lastReducedChunkCount?: number;
  lastLiveReduceAt?: Date | null;
  content?: string | null;
} = {}) {
  return {
    id: "note-wsk-01",
    sessionId: SESSION_ID,
    status: overrides.status ?? "pending",
    content: overrides.content ?? null,
    isPartial: false,
    error: null,
    generatedAt: null,
    lastReducedChunkCount: overrides.lastReducedChunkCount ?? 0,
    lastLiveReduceAt: overrides.lastLiveReduceAt ?? null,
    createdAt: NOW,
  };
}

function mockOpenAISuccess() {
  mockChatCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({
            topics: "Algebra",
            assessment: "Good progress",
            nextSteps: "Practice set 3",
            links: "",
          }),
        },
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 200 },
  });
}

// ---------------------------------------------------------------------------
// (a) Live reduce runs during UNSEALED session (BEFORE End)
// ---------------------------------------------------------------------------

describe("(a) processLiveReduceJob — reduce runs live during unsealed session", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertNotePending.mockResolvedValue(makeNote());
    mockUpdateNote.mockResolvedValue(makeNote());
  });

  it("runs the LLM reduce when N done chunks exist and watermark is behind", async () => {
    const doneChunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    // Unsealed session (endedAt = null)
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 0 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    const result = await processLiveReduceJob(SESSION_ID);

    expect(result.outcome).toBe("live_done");
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
  });

  it("updates lastReducedChunkCount watermark after successful reduce", async () => {
    const doneChunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 0 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    await processLiveReduceJob(SESSION_ID);

    const updateCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) =>
        typeof (c[1] as Record<string, unknown>).lastReducedChunkCount === "number"
    );
    expect(updateCall).toBeDefined();
    const data = updateCall?.[1] as { lastReducedChunkCount?: number };
    expect(data.lastReducedChunkCount).toBe(5);
  });

  it("skips LLM when watermark is already current (idempotency guard)", async () => {
    const doneChunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    // Watermark already at 5 (already current)
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 5 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([]);

    const result = await processLiveReduceJob(SESSION_ID);

    expect(result.outcome).toBe("skipped");
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it("does NOT require endedAt to be set (session still live)", async () => {
    const doneChunks = [makeChunk("chunk-1", "done", 0)];

    // NOTE: no endedAt check — this is the lift of the guard
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 0 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess();

    // Should NOT abort even though endedAt is irrelevant here
    const result = await processLiveReduceJob(SESSION_ID);

    expect(result.outcome).toBe("live_done");
  });

  it("does NOT set status=done (keeps status unchanged, no premature finalize)", async () => {
    const doneChunks = [makeChunk("chunk-1", "done", 0)];
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 0 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([makeExtraction("chunk-1")]);
    mockOpenAISuccess();

    await processLiveReduceJob(SESSION_ID);

    // updateTutorNote should NOT set status="done" (that's for finalize only)
    const doneStatusCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    expect(doneStatusCall).toBeUndefined();
  });

  it("aborts stale write when finalize lands during LLM (Race A straggler)", async () => {
    const doneChunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    // 1st read: watermark behind → reduce proceeds. 2nd read: finalize wrote done.
    mockGetNote
      .mockResolvedValueOnce(makeNote({ lastReducedChunkCount: 0 }))
      .mockResolvedValueOnce(
        makeNote({
          status: "done",
          lastReducedChunkCount: 5,
          content:
            '{"topics":"Final","assessment":"From finalize","nextSteps":"N","links":""}',
        })
      );
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    const result = await processLiveReduceJob(SESSION_ID);

    expect(result).toEqual({
      outcome: "skipped",
      reason: "finalized_during_llm",
    });
    expect(mockUpdateNote).not.toHaveBeenCalled();
    expect(mockLogCostEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (b) End fast-path — ZERO LLM calls when draft is current
// ---------------------------------------------------------------------------

describe("(b) processNotesReduceJob fast-path — zero LLM when watermark is current", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertNotePending.mockResolvedValue(makeNote());
    mockUpdateNote.mockResolvedValue(makeNote());
  });

  it("does NOT call LLM when lastReducedChunkCount == total done chunks", async () => {
    const doneChunks = Array.from({ length: 5 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    // Sealed session
    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    // Draft is current: watermark = 5, doneChunks = 5
    mockGetNote.mockResolvedValue(
      makeNote({ lastReducedChunkCount: 5, content: '{"topics":"Algebra","assessment":"Good","nextSteps":"Practice","links":""}' })
    );
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([]);

    const result = await processNotesReduceJob(SESSION_ID);

    // Fast-path: skipped LLM, flipped to done
    expect(mockChatCreate).not.toHaveBeenCalled();
    expect(result.outcome).toBe("done");
  });

  it("writes status=done via fast-path (no LLM, no generating transition)", async () => {
    const doneChunks = Array.from({ length: 3 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    mockGetNote.mockResolvedValue(
      makeNote({ lastReducedChunkCount: 3, content: '{"topics":"Algebra","assessment":"","nextSteps":"","links":""}' })
    );
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([]);

    await processNotesReduceJob(SESSION_ID);

    // Must write status=done
    const doneCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    expect(doneCall).toBeDefined();
  });

  it("completes fast (no await on LLM) — synchronous path through worker", async () => {
    const doneChunks = [makeChunk("chunk-1", "done", 0)];

    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    mockGetNote.mockResolvedValue(
      makeNote({ lastReducedChunkCount: 1, content: '{"topics":"T","assessment":"A","nextSteps":"N","links":""}' })
    );
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue([]);

    const start = Date.now();
    await processNotesReduceJob(SESSION_ID);
    const elapsed = Date.now() - start;

    // No LLM call = should resolve quickly (< 500ms)
    expect(elapsed).toBeLessThan(500);
    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// (c) Tail case — one un-reduced chunk at End → exactly ONE reduce → READY
// ---------------------------------------------------------------------------

describe("(c) processNotesReduceJob tail case — one un-reduced chunk → one reduce", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsertNotePending.mockResolvedValue(makeNote());
    mockUpdateNote.mockResolvedValue(makeNote());
  });

  it("calls LLM exactly ONCE when one chunk is beyond the watermark", async () => {
    const doneChunks = Array.from({ length: 6 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    // Watermark at 5, but 6 done chunks → tail chunk
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 5 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    const result = await processNotesReduceJob(SESSION_ID);

    // Exactly one LLM call for the tail reduce
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("done");
  });

  it("writes status=done after tail reduce", async () => {
    const doneChunks = Array.from({ length: 6 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 5 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    await processNotesReduceJob(SESSION_ID);

    const doneCall = mockUpdateNote.mock.calls.find(
      (c: unknown[]) => (c[1] as { status?: string }).status === "done"
    );
    expect(doneCall).toBeDefined();
  });

  it("does NOT fast-path when watermark is BELOW done chunk count", async () => {
    const doneChunks = Array.from({ length: 10 }, (_, i) =>
      makeChunk(`chunk-${i + 1}`, "done", i * 30000)
    );

    mockGetSession.mockResolvedValue({
      id: SESSION_ID,
      endedAt: NOW,
      adminUserId: "admin-1",
    });
    // Large tail: 0 chunks reduced, 10 done
    mockGetNote.mockResolvedValue(makeNote({ lastReducedChunkCount: 0 }));
    mockGetChunks.mockResolvedValue(doneChunks);
    mockGetExtractions.mockResolvedValue(
      doneChunks.map((c) => makeExtraction(c.id))
    );
    mockOpenAISuccess();

    const result = await processNotesReduceJob(SESSION_ID);

    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// (d) Shimmer CSS — gradient uses DEFINED vars (not transparent)
// ---------------------------------------------------------------------------

describe("(d) Shimmer CSS — gradient vars are defined (not --surface-muted/hover)", () => {
  const cssPath = path.resolve(
    __dirname,
    "../../styles/tutor-notes-shimmer.css"
  );

  it("CSS file exists", () => {
    expect(fs.existsSync(cssPath)).toBe(true);
  });

  it("does NOT use undefined --surface-muted (resolves to transparent)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).not.toContain("--surface-muted");
  });

  it("does NOT use undefined --surface-hover (resolves to transparent)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).not.toContain("--surface-hover");
  });

  it("uses --surface-2 instead (guaranteed non-transparent in both themes)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toContain("--surface-2");
  });

  it("uses --surface-3 instead (guaranteed non-transparent in both themes)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toContain("--surface-3");
  });

  it("preserves reduced-motion branch (animation: none)", () => {
    const css = fs.readFileSync(cssPath, "utf8");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("animation: none");
  });
});

// ---------------------------------------------------------------------------
// (e) Copy — "Preparing your notes..."
// ---------------------------------------------------------------------------

describe("(e) Copy — 'Preparing your notes...' (not 'Waiting for transcript…')", () => {
  const tntPath = path.resolve(
    __dirname,
    "../../components/whiteboard/TutorNotesSection.tsx"
  );

  it("component source contains updated copy 'Preparing your notes...'", () => {
    const src = fs.readFileSync(tntPath, "utf8");
    expect(src).toContain("Preparing your notes...");
  });

  it("component source does NOT contain old copy 'Waiting for transcript…'", () => {
    const src = fs.readFileSync(tntPath, "utf8");
    expect(src).not.toContain("Waiting for transcript\u2026");
  });
});
