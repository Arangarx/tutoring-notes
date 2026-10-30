/**
 * @jest-environment node
 *
 * Notes generation must NOT be gated on allowNoteSending — audio capture is
 * already gated upstream by allowAudioRecording; a "sending"-named permission
 * silently killing AI notes is a footgun (Andrew 2026-06-30).
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (...args: unknown[]) =>
    assertOwnsWhiteboardSessionMock(...args),
}));

jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));

const dbWbFindUniqueMock = jest.fn();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardSession: {
      findUnique: (...args: unknown[]) => dbWbFindUniqueMock(...args),
    },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

const enqueueNotesReduceMock = jest.fn();
jest.mock("@/lib/recording/notes-enqueue", () => ({
  __esModule: true,
  enqueueNotesReduce: (...args: unknown[]) => enqueueNotesReduceMock(...args),
}));

// Consent scope exposes NO gate function here: triggerNotesGenerationAction must not consult consent
// (any call into a gate would be a call to undefined and throw). Notes-off gating is consent wave C2.
jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  ConsentError: class ConsentError extends Error {
    constructor(
      public permission: string,
      message?: string
    ) {
      super(message ?? permission);
      this.name = "ConsentError";
    }
  },
}));

import { triggerNotesGenerationAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";

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
  assertOwnsWhiteboardSessionMock.mockResolvedValue(defaultSession);
  dbWbFindUniqueMock.mockResolvedValue({ endedAt: new Date("2026-06-30") });
  enqueueNotesReduceMock.mockResolvedValue(undefined);
});

describe("triggerNotesGenerationAction — allowNoteSending is not a gate", () => {
  test("enqueues without consulting any consent gate", async () => {
    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({ ok: true });
    expect(enqueueNotesReduceMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotesReduceMock).toHaveBeenCalledWith("wb-1");
  });

  test("sealed session → calls enqueueNotesReduce", async () => {
    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({ ok: true });
    expect(enqueueNotesReduceMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotesReduceMock).toHaveBeenCalledWith("wb-1");
  });

  test("session not yet sealed → skips enqueue (regardless of consent)", async () => {
    dbWbFindUniqueMock.mockResolvedValue({ endedAt: null });

    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({ ok: false, error: "Session is not sealed yet" });
    expect(enqueueNotesReduceMock).not.toHaveBeenCalled();
  });

  test("ownership denial returns ok:false instead of throwing", async () => {
    assertOwnsWhiteboardSessionMock.mockRejectedValue(
      new Error("You do not own this whiteboard session")
    );

    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({
      ok: false,
      error: "You do not own this whiteboard session",
    });
    expect(enqueueNotesReduceMock).not.toHaveBeenCalled();
  });
});
