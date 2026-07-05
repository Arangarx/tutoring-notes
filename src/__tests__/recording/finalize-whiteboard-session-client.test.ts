/**
 * WS-N4 — finalizeWhiteboardSessionWithOutbox unit tests.
 *
 * Proves gate/roster End-and-review drains the outbox, forwards extraSegments
 * to finalizeWhiteboardSessionFromBackend, and hard-aborts on drain timeout.
 */

jest.mock("@/lib/recording/upload-outbox-instance", () => ({
  registerSessionStudentId: jest.fn(),
  drainOutboxOrTimeout: jest.fn(),
  assembleEndSessionSegments: jest.fn(),
  finalizeOutboxAfterEnd: jest.fn(),
}));

jest.mock("@/app/admin/students/[id]/whiteboard/actions", () => ({
  finalizeWhiteboardSessionFromBackend: jest.fn(),
}));

import { finalizeWhiteboardSessionFromBackend } from "@/app/admin/students/[id]/whiteboard/actions";
import {
  assembleEndSessionSegments,
  drainOutboxOrTimeout,
  finalizeOutboxAfterEnd,
  registerSessionStudentId,
} from "@/lib/recording/upload-outbox-instance";
import { finalizeWhiteboardSessionWithOutbox } from "@/lib/recording/finalize-whiteboard-session-client";

const mockRegisterStudent = registerSessionStudentId as jest.Mock;
const mockDrain = drainOutboxOrTimeout as jest.Mock;
const mockAssemble = assembleEndSessionSegments as jest.Mock;
const mockFinalizeBackend = finalizeWhiteboardSessionFromBackend as jest.Mock;
const mockFinalizeOutbox = finalizeOutboxAfterEnd as jest.Mock;

const WBSID = "wbs-n4-test";
const STUDENT_ID = "stu-n4";

const SEGMENTS = [
  {
    blobUrl: "https://test.public.blob.vercel-storage.com/seg-1.webm",
    mimeType: "audio/webm",
    sizeBytes: 4096,
    streamId: "tutor:mic",
    segmentId: "seg-1",
    audioStartedAtMs: 1_000,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockDrain.mockResolvedValue({
    timedOut: false,
    remainingCount: 0,
    remainingByStream: new Map(),
    lastError: null,
  });
  mockAssemble.mockResolvedValue(SEGMENTS);
  mockFinalizeBackend.mockResolvedValue({
    ok: true,
    idempotent: false,
    endedAt: new Date().toISOString(),
    durationSeconds: 60,
    registeredSegments: 1,
  });
  mockFinalizeOutbox.mockResolvedValue(undefined);
});

describe("finalizeWhiteboardSessionWithOutbox — happy path", () => {
  it("registers studentId, drains, assembles, finalizes with extraSegments, then clears outbox", async () => {
    const result = await finalizeWhiteboardSessionWithOutbox(WBSID, STUDENT_ID, {
      finalEventsBlobUrl: "https://events.example/events.json",
    });

    expect(result).toEqual(
      expect.objectContaining({ ok: true, registeredSegments: 1 })
    );
    expect(mockRegisterStudent).toHaveBeenCalledWith(WBSID, STUDENT_ID);
    expect(mockDrain).toHaveBeenCalledWith(WBSID);
    expect(mockAssemble).toHaveBeenCalledWith(WBSID);
    expect(mockFinalizeBackend).toHaveBeenCalledWith(WBSID, {
      finalEventsBlobUrl: "https://events.example/events.json",
      extraSegments: SEGMENTS,
    });
    expect(mockFinalizeOutbox).toHaveBeenCalledWith(WBSID);
  });
});

describe("finalizeWhiteboardSessionWithOutbox — drain timeout", () => {
  it("hard-aborts without calling finalizeWhiteboardSessionFromBackend", async () => {
    mockDrain.mockResolvedValue({
      timedOut: true,
      remainingCount: 2,
      remainingByStream: new Map([["tutor:mic", 2]]),
      lastError: "network down",
    });

    const result = await finalizeWhiteboardSessionWithOutbox(WBSID, STUDENT_ID);

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        timedOut: true,
        remainingCount: 2,
        lastError: "network down",
      })
    );
    expect((result as { error: string }).error).toMatch(/still saving/i);
    expect((result as { error: string }).error).toMatch(/network down/i);
    expect(mockAssemble).not.toHaveBeenCalled();
    expect(mockFinalizeBackend).not.toHaveBeenCalled();
    expect(mockFinalizeOutbox).not.toHaveBeenCalled();
  });
});

describe("finalizeWhiteboardSessionWithOutbox — backend failure", () => {
  it("does not finalize outbox when finalizeWhiteboardSessionFromBackend fails", async () => {
    mockFinalizeBackend.mockResolvedValue({
      ok: false,
      error: "Server exploded",
    });

    const result = await finalizeWhiteboardSessionWithOutbox(WBSID, STUDENT_ID);

    expect(result).toEqual({ ok: false, error: "Server exploded" });
    expect(mockFinalizeOutbox).not.toHaveBeenCalled();
  });
});
