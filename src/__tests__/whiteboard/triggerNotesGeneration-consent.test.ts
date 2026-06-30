/**
 * @jest-environment node
 *
 * Concern 5: triggerNotesGenerationAction must assert allowNoteSending consent
 * before calling enqueueNotesReduce.
 *
 * RED-BEFORE / GREEN-AFTER:
 * Before adding the consent check, triggerNotesGenerationAction would call
 * enqueueNotesReduce even when allowNoteSending=false. After adding the check,
 * it skips enqueue and returns early.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
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

// Consent scope: configurable per test
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
    constructor(public permission: string, message?: string) {
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
  // Default: sealed session
  dbWbFindUniqueMock.mockResolvedValue({ endedAt: new Date("2026-06-30") });
  enqueueNotesReduceMock.mockResolvedValue(undefined);
});

describe("triggerNotesGenerationAction — allowNoteSending consent gate (Concern 5)", () => {
  test(
    "RED-BEFORE/GREEN-AFTER: allowNoteSending=false → skips enqueueNotesReduce",
    async () => {
      consentShouldDeny = true;

      await triggerNotesGenerationAction("wb-1");

      // Guard: enqueue must NOT be called when consent is denied
      expect(enqueueNotesReduceMock).not.toHaveBeenCalled();
    }
  );

  test("allowNoteSending=true (default) → calls enqueueNotesReduce", async () => {
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
