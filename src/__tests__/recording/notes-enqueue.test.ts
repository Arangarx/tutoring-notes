/**
 * Recording re-arch Phase 1, Slice 3 — notes-enqueue tests.
 *
 * Tests the durable enqueue mechanism for the notes pipeline:
 * - Upserts pending TutorNote before firing (durability)
 * - Skips when already done/partial (idempotency)
 * - Fires immediate reduce job via after() callback
 * - Polls until done when reduce returns "pending" (preview-safe path)
 */

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock("@/lib/recording/transcript-store", () => ({
  getTutorNoteBySessionId: jest.fn(),
  upsertTutorNotePending: jest.fn(),
}));

jest.mock("@/lib/recording/notes-worker", () => ({
  processNotesReduceJob: jest.fn(),
}));

// Mock after() from next/server to execute the callback immediately (inline).
// This mirrors the real behaviour (runs after response) but in tests lets us
// assert synchronously without waiting for real timers.
jest.mock("next/server", () => ({
  after: jest.fn((callback: () => Promise<void>) => {
    void callback();
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  getTutorNoteBySessionId,
  upsertTutorNotePending,
} from "@/lib/recording/transcript-store";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";
import { enqueueNotesReduce } from "@/lib/recording/notes-enqueue";

const mockGetNote = getTutorNoteBySessionId as jest.Mock;
const mockUpsertPending = upsertTutorNotePending as jest.Mock;
const mockProcessJob = processNotesReduceJob as jest.Mock;

const SESSION_ID = "wbs-enqueue-01";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for after() callback microtask queue to drain. */
const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetNote.mockResolvedValue(null);
  mockUpsertPending.mockResolvedValue({ sessionId: SESSION_ID, status: "pending" });
  // Default: return "done" so the polling loop exits on first call.
  mockProcessJob.mockResolvedValue({ outcome: "done" });
});

describe("enqueueNotesReduce — durability", () => {
  it("upserts pending TutorNote before firing the immediate job", async () => {
    await enqueueNotesReduce(SESSION_ID);
    await drain();

    expect(mockUpsertPending).toHaveBeenCalledWith(SESSION_ID);
  });

  it("fires the reduce worker via after() callback", async () => {
    await enqueueNotesReduce(SESSION_ID);
    await drain();

    expect(mockProcessJob).toHaveBeenCalledWith(SESSION_ID);
  });

  it("polls until done when reduce returns pending (preview-safe path)", async () => {
    // First two calls return pending, third returns done.
    mockProcessJob
      .mockResolvedValueOnce({ outcome: "pending" })
      .mockResolvedValueOnce({ outcome: "pending" })
      .mockResolvedValue({ outcome: "done" });

    // Use fake timers so setTimeout(5000) doesn't actually wait 5s.
    jest.useFakeTimers();
    await enqueueNotesReduce(SESSION_ID);

    // Advance time past the poll intervals (2 × 5000ms).
    await jest.runAllTimersAsync();
    jest.useRealTimers();

    expect(mockProcessJob).toHaveBeenCalledTimes(3);
  });
});

describe("enqueueNotesReduce — idempotency", () => {
  it("skips upsert and fire when TutorNote is already done", async () => {
    mockGetNote.mockResolvedValue({ status: "done", sessionId: SESSION_ID });

    await enqueueNotesReduce(SESSION_ID);
    await drain();

    expect(mockUpsertPending).not.toHaveBeenCalled();
    expect(mockProcessJob).not.toHaveBeenCalled();
  });

  it("skips upsert and fire when TutorNote is already partial", async () => {
    mockGetNote.mockResolvedValue({ status: "partial", sessionId: SESSION_ID });

    await enqueueNotesReduce(SESSION_ID);
    await drain();

    expect(mockUpsertPending).not.toHaveBeenCalled();
    expect(mockProcessJob).not.toHaveBeenCalled();
  });

  it("re-fires when TutorNote is failed (retry path)", async () => {
    mockGetNote.mockResolvedValue({ status: "failed", sessionId: SESSION_ID });

    await enqueueNotesReduce(SESSION_ID);
    await drain();

    expect(mockUpsertPending).toHaveBeenCalledWith(SESSION_ID);
    expect(mockProcessJob).toHaveBeenCalledWith(SESSION_ID);
  });

  it("re-fires when TutorNote is pending (cron retry path)", async () => {
    mockGetNote.mockResolvedValue({ status: "pending", sessionId: SESSION_ID });

    await enqueueNotesReduce(SESSION_ID);
    await drain();

    // Even if pending, we still fire the immediate attempt
    expect(mockProcessJob).toHaveBeenCalledWith(SESSION_ID);
  });
});

describe("enqueueNotesReduce — resilience", () => {
  it("still fires the worker if DB upsert fails", async () => {
    mockUpsertPending.mockRejectedValue(new Error("DB timeout"));

    await enqueueNotesReduce(SESSION_ID);
    await drain();

    // Worker should still be fired despite the upsert error
    expect(mockProcessJob).toHaveBeenCalledWith(SESSION_ID);
  });
});
