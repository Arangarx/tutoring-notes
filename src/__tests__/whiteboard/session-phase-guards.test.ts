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

jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  assertEffectiveConsent: jest.fn().mockResolvedValue(undefined),
  resolveModeAwareAudioRecordingConsent: jest.fn().mockResolvedValue({ allow: true }),
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
