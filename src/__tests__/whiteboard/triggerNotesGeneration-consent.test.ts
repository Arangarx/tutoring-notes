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

// Consent scope: configurable per test — must NOT block notes generation.
let consentShouldDeny = false;
jest.mock("@/lib/consent-scope", () => ({
  __esModule: true,
  assertEffectiveConsent: jest.fn().mockImplementation(async () => {
    if (consentShouldDeny) {
      const { ConsentError: CE } = jest.requireActual<
        typeof import("@/lib/consent-scope")
      >("@/lib/consent-scope");
      throw new CE("allowNoteSending", "Consent denied for allowNoteSending");
    }
  }),
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
  consentShouldDeny = false;
  assertOwnsWhiteboardSessionMock.mockResolvedValue(defaultSession);
  dbWbFindUniqueMock.mockResolvedValue({ endedAt: new Date("2026-06-30") });
  enqueueNotesReduceMock.mockResolvedValue(undefined);
});

describe("triggerNotesGenerationAction — allowNoteSending is not a gate", () => {
  test("allowNoteSending=false does not block enqueueNotesReduce", async () => {
    consentShouldDeny = true;

    await triggerNotesGenerationAction("wb-1");

    expect(enqueueNotesReduceMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotesReduceMock).toHaveBeenCalledWith("wb-1");
  });

  test("sealed session with consent granted → calls enqueueNotesReduce", async () => {
    consentShouldDeny = false;

    await triggerNotesGenerationAction("wb-1");

    expect(enqueueNotesReduceMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotesReduceMock).toHaveBeenCalledWith("wb-1");
  });

  test("session not yet sealed → skips enqueue (regardless of consent)", async () => {
    dbWbFindUniqueMock.mockResolvedValue({ endedAt: null });

    await triggerNotesGenerationAction("wb-1");

    expect(enqueueNotesReduceMock).not.toHaveBeenCalled();
  });
});
