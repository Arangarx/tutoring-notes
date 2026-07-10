/**
 * @jest-environment node
 *
 * Unit tests for `enqueueChunkTranscriptionAction` — Recording re-arch
 * Phase 1, Slice 2b producer wedge.
 *
 * Contract under test:
 *   1. Ownership boundary — non-owner is rejected before touching
 *      any transcription infra.
 *   2. Blob host validation — a URL not matching the Vercel Blob
 *      namespace is rejected (same allowlist as endWhiteboardSession).
 *   3. Happy path — ownership + valid blob → `enqueueChunkTranscribe`
 *      is called with the correct job payload.
 *   4. Idempotency / repeat calls — the action is safe to call twice
 *      with the same args (idempotency is enforced downstream by the
 *      worker's unique constraint on (sessionId, chunkBlobUrl)).
 *
 * All DB and transcription I/O is mocked.
 */

// ── Mocks must precede imports ───────────────────────────────────────

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

const enqueueChunkTranscribeMock = jest.fn();
jest.mock("@/lib/recording/chunk-transcribe-enqueue", () => ({
  __esModule: true,
  enqueueChunkTranscribe: (job: unknown) => enqueueChunkTranscribeMock(job),
}));

// actions.ts pulls in next/cache and next/navigation — stub them so
// the module can load without a Next.js runtime.
jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));
jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
}));

// actions.ts also uses @vercel/blob, db, action-correlation, transcribe,
// ai, and other modules. Stub anything the module tries to import at
// top-level that would fail in a plain Node test environment.
jest.mock("@vercel/blob", () => ({ __esModule: true, put: jest.fn() }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    // B1: default APPROVED so existing tests are unaffected by the approval gate.
    adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) },
    // Phase check (Concern 4): default ACTIVE so existing happy-path tests pass.
    whiteboardSession: {
      findUnique: jest.fn().mockResolvedValue({ sessionPhase: "ACTIVE" }),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));
jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "test_rid",
}));
jest.mock("@/lib/transcribe", () => ({
  __esModule: true,
  mapWithConcurrency: jest.fn(),
  transcribeAudio: jest.fn(),
}));
jest.mock("@/lib/ai", () => ({
  __esModule: true,
  generateSessionNote: jest.fn(),
  estimateTokens: jest.fn(),
  MAX_INPUT_TOKENS: 4096,
}));
jest.mock("@/app/admin/students/[id]/transcribe-result", () => ({
  __esModule: true,
  buildTranscribeAndGenerateResult: jest.fn(),
  FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE: "timeout",
  shouldTreatAsTranscriptionTimeout: jest.fn(),
}));
jest.mock("@/lib/whisper-guardrails", () => ({
  __esModule: true,
  looksLikeSilenceHallucination: jest.fn(),
}));
jest.mock("@/lib/date-only", () => ({
  __esModule: true,
  parseDateOnlyInput: jest.fn(),
}));
jest.mock("@/lib/revalidateStudentSharePages", () => ({
  __esModule: true,
  revalidateStudentSharePages: jest.fn(),
}));
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: jest.fn(),
  requireStudentScope: jest.fn().mockResolvedValue({ kind: "admin", adminId: "admin_1" }),
}));

import { enqueueChunkTranscriptionAction } from "@/app/admin/students/[id]/whiteboard/actions";

// ── Fixtures ─────────────────────────────────────────────────────────

const WBSID = "wbs_test_session_42";
const VALID_BLOB_URL =
  "https://abc.blob.vercel-storage.com/wb-audio/seg-abc123.webm";
const VALID_OFFSET_MS = 30_000;

function setupOwnerSession() {
  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: WBSID,
    adminUserId: "admin_1",
    studentId: "stu_1",
    endedAt: null,
    eventsBlobUrl: "https://abc.blob.vercel-storage.com/events.json",
    consentAcknowledged: true,
  });
}

// ── Reset ─────────────────────────────────────────────────────────────

beforeEach(() => {
  assertOwnsWhiteboardSessionMock.mockReset();
  enqueueChunkTranscribeMock.mockReset();
  enqueueChunkTranscribeMock.mockResolvedValue(undefined);
});

// ── 1. Ownership boundary ─────────────────────────────────────────────

describe("enqueueChunkTranscriptionAction — ownership", () => {
  it("rejects when assertOwnsWhiteboardSession throws (non-owner)", async () => {
    assertOwnsWhiteboardSessionMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );

    await expect(
      enqueueChunkTranscriptionAction(WBSID, {
        chunkBlobUrl: VALID_BLOB_URL,
        recordingTimeOffsetMs: VALID_OFFSET_MS,
      })
    ).rejects.toThrow();

    // enqueueChunkTranscribe must NOT be called for non-owner requests
    expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
  });

  it("calls assertOwnsWhiteboardSession with the session id", async () => {
    setupOwnerSession();

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
    });

    expect(assertOwnsWhiteboardSessionMock).toHaveBeenCalledWith(WBSID);
  });
});

// ── 2. Blob host validation ───────────────────────────────────────────

describe("enqueueChunkTranscriptionAction — blob host validation", () => {
  beforeEach(() => {
    setupOwnerSession();
  });

  it.each([
    ["non-Blob URL", "https://evil.example.com/audio.webm"],
    ["S3 URL", "https://my-bucket.s3.amazonaws.com/audio.webm"],
    ["local URL", "http://localhost:3000/audio.webm"],
    ["empty string", ""],
    ["no scheme", "blob.vercel-storage.com/audio.webm"],
  ])("rejects %s", async (_label, badUrl) => {
    await expect(
      enqueueChunkTranscriptionAction(WBSID, {
        chunkBlobUrl: badUrl,
        recordingTimeOffsetMs: VALID_OFFSET_MS,
      })
    ).rejects.toThrow(/invalid chunk blob url/i);

    expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "standard Blob host",
      "https://abc.blob.vercel-storage.com/wb-audio/seg.webm",
    ],
    [
      "Blob host with subdomain",
      "https://public.blob.vercel-storage.com/sessions/seg.webm",
    ],
  ])("accepts %s", async (_label, goodUrl) => {
    await expect(
      enqueueChunkTranscriptionAction(WBSID, {
        chunkBlobUrl: goodUrl,
        recordingTimeOffsetMs: VALID_OFFSET_MS,
      })
    ).resolves.toBeUndefined();

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Happy path ─────────────────────────────────────────────────────

describe("enqueueChunkTranscriptionAction — happy path", () => {
  it("calls enqueueChunkTranscribe with correct job payload", async () => {
    setupOwnerSession();

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith({
      sessionId: WBSID,
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
      streamId: "tutor:mic",
      speakerId: null,
    });
  });

  it("returns undefined (void) on success", async () => {
    setupOwnerSession();

    const result = await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(result).toBeUndefined();
  });

  it("passes recordingTimeOffsetMs=0 for first segment correctly", async () => {
    setupOwnerSession();

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ recordingTimeOffsetMs: 0, streamId: "tutor:mic", speakerId: null })
    );
  });

  it("passes explicit streamId and speakerId through to enqueueChunkTranscribe", async () => {
    setupOwnerSession();

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
      streamId: "student:peer-abc:mic",
      speakerId: "peer-abc",
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith({
      sessionId: WBSID,
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
      streamId: "student:peer-abc:mic",
      speakerId: "peer-abc",
    });
  });

  it("defaults streamId to tutor:mic and speakerId to null when omitted", async () => {
    setupOwnerSession();

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: "tutor:mic", speakerId: null })
    );
  });
});

// ── 4. Repeat / idempotency ───────────────────────────────────────────

describe("enqueueChunkTranscriptionAction — repeat calls", () => {
  it("is safe to call twice with the same args (idempotency enforced downstream)", async () => {
    setupOwnerSession();

    // Second call also resolves ownership mock.
    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: WBSID,
      adminUserId: "admin_1",
      studentId: "stu_1",
      endedAt: null,
      eventsBlobUrl: "https://abc.blob.vercel-storage.com/events.json",
      consentAcknowledged: true,
    });

    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
    });
    await enqueueChunkTranscriptionAction(WBSID, {
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
    });

    // Both calls reach enqueueChunkTranscribe — the worker handles
    // idempotency via the (sessionId, chunkBlobUrl) unique constraint.
    expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(2);
    expect(enqueueChunkTranscribeMock).toHaveBeenNthCalledWith(1, {
      sessionId: WBSID,
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
      streamId: "tutor:mic",
      speakerId: null,
    });
    expect(enqueueChunkTranscribeMock).toHaveBeenNthCalledWith(2, {
      sessionId: WBSID,
      chunkBlobUrl: VALID_BLOB_URL,
      recordingTimeOffsetMs: VALID_OFFSET_MS,
      streamId: "tutor:mic",
      speakerId: null,
    });
  });

  it("enqueueChunkTranscribe failure (which never throws) does not surface as action rejection", async () => {
    setupOwnerSession();
    // Simulate enqueueChunkTranscribe swallowing an error (its contract).
    enqueueChunkTranscribeMock.mockResolvedValue(undefined);

    await expect(
      enqueueChunkTranscriptionAction(WBSID, {
        chunkBlobUrl: VALID_BLOB_URL,
        recordingTimeOffsetMs: VALID_OFFSET_MS,
      })
    ).resolves.toBeUndefined();
  });
});
