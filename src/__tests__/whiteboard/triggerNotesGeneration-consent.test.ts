/**
 * @jest-environment node
 *
 * History: 2026-06-30 (77dde18b) notes generation was UNGATED from allowNoteSending, because a "sending"-named
 * permission silently killed AI notes. The consent wave (docs/handoff/consent-wave-plan.md § 2.3, C2) re-gates it on the
 * session's CAPABILITIES (notes toggle off, org no-notes, or in-person audio off): the switch is now "Allow session
 * notes" (SESSION_NOTES_CONSENT_COPY), and a refusal returns the visible reason instead of silently doing nothing.
 * The gate itself is tested in consent-gates.test.ts and the N-rows of wb-consent-matrix.spec.ts; here it is mocked.
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

const gateNotesDraftMock = jest.fn();
jest.mock("@/lib/recording/consent-gates", () => ({
  __esModule: true,
  gateNotesDraft: (...args: unknown[]) => gateNotesDraftMock(...args),
  gateTranscription: jest.fn(),
}));

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
  gateNotesDraftMock.mockResolvedValue({ allow: true });
});

describe("triggerNotesGenerationAction — notes capability gate", () => {
  test("enqueues when the notes gate allows", async () => {
    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({ ok: true });
    expect(enqueueNotesReduceMock).toHaveBeenCalledTimes(1);
    expect(enqueueNotesReduceMock).toHaveBeenCalledWith("wb-1");
  });

  test("notes off for the session: refused with the visible reason and nothing is enqueued (N3)", async () => {
    gateNotesDraftMock.mockResolvedValue({ allow: false, reason: "notes_off" });

    const result = await triggerNotesGenerationAction("wb-1");

    expect(result).toEqual({ ok: false, error: "Notes are off for this session" });
    expect(gateNotesDraftMock).toHaveBeenCalledWith("wb-1", "trigger");
    expect(enqueueNotesReduceMock).not.toHaveBeenCalled();
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
