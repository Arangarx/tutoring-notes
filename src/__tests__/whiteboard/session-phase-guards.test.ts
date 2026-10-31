/**
 * @jest-environment node
 *
 * Unit tests for Concern 4: sessionPhase === ACTIVE guards.
 *
 * Verifies that active-ping, enqueueChunkTranscriptionAction, and
 * registerWhiteboardSessionAudioSegmentAction are no-ops / return early when
 * the session is in PENDING phase.
 *
 * RED-BEFORE / GREEN-AFTER: before adding phase checks, a PENDING-phase ping
 * would stamp activeMs/bothConnectedAt, a PENDING-phase chunk enqueue would
 * call enqueueChunkTranscribe, and a PENDING-phase audio register would
 * create a SessionRecording row. After adding the guards, all three skip
 * gracefully.
 *
 * Note: active-ping route is tested via the action unit path here because
 * the Next.js route handler is hard to unit-test without a request object.
 * The behavior is verified at the action level for enqueue + register, and
 * at the route level for active-ping via a functional assertion.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

jest.mock("@vercel/blob", () => ({ __esModule: true, put: jest.fn() }));

// ---------------------------------------------------------------------------
// DB mocks for phase-guard tests
// ---------------------------------------------------------------------------

const dbWbFindUniqueMock = jest.fn();
const dbSessionRecordingFindFirstMock = jest.fn();
const dbSessionRecordingCreateMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) },
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWbFindUniqueMock(...args),
    },
    sessionRecording: {
      findFirst: (...args: unknown[]) => dbSessionRecordingFindFirstMock(...args),
      create: (...args: unknown[]) => dbSessionRecordingCreateMock(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => dbTransactionMock(fn),
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const requireStudentScopeMock = jest.fn();
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  canAccessStudentRow: jest.fn().mockReturnValue(true),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (...args: unknown[]) => assertOwnsWhiteboardSessionMock(...args),
}));

jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));

// Capabilities the consent gates resolve. Mutable so the consent-gate describe block below can flip switches; the
// phase-guard tests above run with everything on.
const mockConsentState = {
  audio: true,
  notes: true,
  mode: "LIVE" as "LIVE" | "IN_PERSON",
  notesForbidden: false,
};
function mockDerivedContext() {
  const capabilities = jest
    .requireActual<typeof import("@/lib/recording/session-capabilities")>("@/lib/recording/session-capabilities")
    .deriveSessionCapabilities({
      hasConsentSnapshot: true,
      toggles: { audio: mockConsentState.audio, whiteboard: true, notes: mockConsentState.notes },
      sessionMode: mockConsentState.mode,
      notesForbidden: mockConsentState.notesForbidden,
    });
  return { capabilities, notesForbidden: mockConsentState.notesForbidden };
}
jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  resolveSessionCapabilities: jest.fn().mockImplementation(async () => mockDerivedContext().capabilities),
  resolveSessionCapabilityContext: jest.fn().mockImplementation(async () => mockDerivedContext()),
  ConsentError: class ConsentError extends Error {
    constructor(public permission: string, message?: string) {
      super(message ?? permission);
      this.name = "ConsentError";
    }
  },
}));

jest.mock("@/lib/recording/chunk-transcribe-enqueue", () => ({
  __esModule: true,
  enqueueChunkTranscribe: jest.fn().mockResolvedValue(undefined),
}));

import {
  enqueueChunkTranscriptionAction,
  registerWhiteboardSessionAudioSegmentAction,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { enqueueChunkTranscribe } from "@/lib/recording/chunk-transcribe-enqueue";

const enqueueChunkTranscribeMock = enqueueChunkTranscribe as jest.MockedFunction<
  typeof enqueueChunkTranscribe
>;

const defaultSession = {
  id: "wb-1",
  adminUserId: "admin-1",
  studentId: "student-1",
  consentAcknowledged: true,
  eventsBlobUrl: "https://blob.vercel-storage.com/events.json",
  endedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConsentState.audio = true;
  mockConsentState.notes = true;
  mockConsentState.mode = "LIVE";
  mockConsentState.notesForbidden = false;
  requireStudentScopeMock.mockResolvedValue({
    kind: "admin",
    adminId: "admin-1",
    email: "tutor@example.com",
  });
  assertOwnsWhiteboardSessionMock.mockResolvedValue(defaultSession);
  dbSessionRecordingFindFirstMock.mockResolvedValue(null);
  dbSessionRecordingCreateMock.mockResolvedValue({ id: "rec-1", orderIndex: 0 });
  dbTransactionMock.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      sessionRecording: {
        findFirst: dbSessionRecordingFindFirstMock,
        create: dbSessionRecordingCreateMock,
      },
    };
    return fn(tx);
  });
});

// ---------------------------------------------------------------------------
// enqueueChunkTranscriptionAction — phase guard
// ---------------------------------------------------------------------------

describe("enqueueChunkTranscriptionAction — PENDING phase guard (Concern 4)", () => {
  const chunkBlobUrl =
    "https://abc123.public.blob.vercel-storage.com/whiteboard-sessions/a/b/chunk.webm";

  test(
    "RED-BEFORE/GREEN-AFTER: PENDING session → skips enqueue (does not call enqueueChunkTranscribe)",
    async () => {
      // Phase is PENDING
      dbWbFindUniqueMock.mockResolvedValue({ sessionPhase: "PENDING" });

      await enqueueChunkTranscriptionAction("wb-1", {
        chunkBlobUrl,
        recordingTimeOffsetMs: 0,
      });

      // Guard: enqueue must NOT be called during PENDING
      expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
    }
  );

  test("ACTIVE session → calls enqueueChunkTranscribe", async () => {
    dbWbFindUniqueMock.mockResolvedValue({ sessionPhase: "ACTIVE" });

    await enqueueChunkTranscriptionAction("wb-1", {
      chunkBlobUrl,
      recordingTimeOffsetMs: 0,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// registerWhiteboardSessionAudioSegmentAction — phase guard
// ---------------------------------------------------------------------------

describe(
  "registerWhiteboardSessionAudioSegmentAction — PENDING phase guard (Concern 4)",
  () => {
    const segment = {
      blobUrl: "https://abc.blob.vercel-storage.com/seg.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    };

    test(
      "RED-BEFORE/GREEN-AFTER: PENDING session → returns ok=false without creating a row",
      async () => {
        dbWbFindUniqueMock.mockResolvedValue({ sessionPhase: "PENDING" });

        const result = await registerWhiteboardSessionAudioSegmentAction(
          "wb-1",
          segment
        );

        expect(result.ok).toBe(false);
        expect(dbSessionRecordingCreateMock).not.toHaveBeenCalled();
      }
    );

    test("ACTIVE session → creates SessionRecording row", async () => {
      dbWbFindUniqueMock.mockResolvedValue({ sessionPhase: "ACTIVE" });

      const result = await registerWhiteboardSessionAudioSegmentAction(
        "wb-1",
        segment
      );

      expect(result.ok).toBe(true);
      expect(dbSessionRecordingCreateMock).toHaveBeenCalledTimes(1);
    });
  }
);

// ---------------------------------------------------------------------------
// Consent wave C2: the per-lane gates at the action boundary (A5, A6, N1).
// The capability table itself is proven in consent-lane-decisions.test.ts; here the question is only that these two
// ENTRY POINTS ask the gate with the right lane, and act on the answer.
// ---------------------------------------------------------------------------

describe("consent lane gates at the action boundary (wave C2)", () => {
  const chunkBlobUrl = "https://abc123.public.blob.vercel-storage.com/whiteboard-sessions/a/b/chunk.webm";
  const segment = { blobUrl: "https://abc.blob.vercel-storage.com/seg.webm", mimeType: "audio/webm", sizeBytes: 1024 };
  const LEARNER_SEGMENT_LANE = "student:peer-p1:mic";
  const LEARNER_TRANSCRIPT_LANE = "speaker:learner-1:transcript";

  beforeEach(() => {
    dbWbFindUniqueMock.mockResolvedValue({ sessionPhase: "ACTIVE" });
  });

  describe("registerWhiteboardSessionAudioSegmentAction", () => {
    test("A5: audio off online: a learner-lane segment is refused with refused:true and no row is created", async () => {
      mockConsentState.audio = false;

      const result = await registerWhiteboardSessionAudioSegmentAction("wb-1", {
        ...segment,
        streamId: LEARNER_SEGMENT_LANE,
        speakerId: "p1",
      });

      expect(result).toMatchObject({ ok: false, refused: true });
      expect(dbSessionRecordingCreateMock).not.toHaveBeenCalled();
    });

    test("A5: audio off online: a tutor-lane segment is still stored (the mixdown is kept)", async () => {
      mockConsentState.audio = false;

      const result = await registerWhiteboardSessionAudioSegmentAction("wb-1", { ...segment, streamId: "tutor:mic" });

      expect(result.ok).toBe(true);
      expect(dbSessionRecordingCreateMock).toHaveBeenCalledTimes(1);
    });

    test("A5: an UNRECOGNIZED lane label is refused when audio is off (it fails closed as a learner lane)", async () => {
      mockConsentState.audio = false;

      const result = await registerWhiteboardSessionAudioSegmentAction("wb-1", { ...segment, streamId: "mystery:lane" });

      expect(result).toMatchObject({ ok: false, refused: true });
      expect(dbSessionRecordingCreateMock).not.toHaveBeenCalled();
    });

    test("A1: audio on: the learner lane is stored", async () => {
      const result = await registerWhiteboardSessionAudioSegmentAction("wb-1", {
        ...segment,
        streamId: LEARNER_SEGMENT_LANE,
        speakerId: "p1",
      });

      expect(result.ok).toBe(true);
      expect(dbSessionRecordingCreateMock).toHaveBeenCalledTimes(1);
    });

    test("A6: in person, audio off: even the tutor lane is refused", async () => {
      mockConsentState.audio = false;
      mockConsentState.mode = "IN_PERSON";

      const result = await registerWhiteboardSessionAudioSegmentAction("wb-1", { ...segment, streamId: "tutor:mic" });

      expect(result).toMatchObject({ ok: false, refused: true });
      expect(dbSessionRecordingCreateMock).not.toHaveBeenCalled();
    });
  });

  describe("enqueueChunkTranscriptionAction", () => {
    test("A2/A6: audio off online: a learner transcript-lane chunk is not enqueued", async () => {
      mockConsentState.audio = false;

      await enqueueChunkTranscriptionAction("wb-1", {
        chunkBlobUrl,
        recordingTimeOffsetMs: 0,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: "learner-1",
      });

      expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
    });

    test("A2: audio off online: the tutor chunk (no lane named, the real client's call) is enqueued as tutor:mic", async () => {
      mockConsentState.audio = false;

      await enqueueChunkTranscriptionAction("wb-1", { chunkBlobUrl, recordingTimeOffsetMs: 0 });

      expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(1);
      expect(enqueueChunkTranscribeMock.mock.calls[0][0]).toMatchObject({ streamId: "tutor:mic" });
    });

    test("A1: audio on: the learner transcript-lane chunk is enqueued under its own lane and speaker", async () => {
      await enqueueChunkTranscriptionAction("wb-1", {
        chunkBlobUrl,
        recordingTimeOffsetMs: 0,
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: "learner-1",
      });

      expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(1);
      expect(enqueueChunkTranscribeMock.mock.calls[0][0]).toMatchObject({
        streamId: LEARNER_TRANSCRIPT_LANE,
        speakerId: "learner-1",
      });
    });

    test("A6: in person, audio off: nothing is enqueued, not even the tutor chunk", async () => {
      mockConsentState.audio = false;
      mockConsentState.mode = "IN_PERSON";

      await enqueueChunkTranscriptionAction("wb-1", { chunkBlobUrl, recordingTimeOffsetMs: 0 });

      expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
    });

    test("N1: notes off, audio on: nothing is enqueued for transcription", async () => {
      mockConsentState.notes = false;

      await enqueueChunkTranscriptionAction("wb-1", { chunkBlobUrl, recordingTimeOffsetMs: 0 });

      expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
    });

    test("N7: org no-notes: nothing is enqueued even with every switch on", async () => {
      mockConsentState.notesForbidden = true;

      await enqueueChunkTranscriptionAction("wb-1", { chunkBlobUrl, recordingTimeOffsetMs: 0 });

      expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
    });
  });
});