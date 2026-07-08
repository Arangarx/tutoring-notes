/**
 * @jest-environment node
 */

/**
 * Auth-boundary unit tests for session-participant-scope.ts (A7.2).
 *
 * BLOCKER coverage:
 *   - Learner with valid SessionParticipant row → granted.
 *   - Learner without a participant row (or different learner) → notFound() / denied.
 *   - Participant with leftAt set → denied.
 *   - [lpr] join_denied / session_join_granted log lines emitted.
 *
 * verifyIsSessionParticipant (non-throwing API-route helper) is also tested.
 */

const findUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    sessionParticipant: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
  withDbRetry: async <T,>(fn: () => Promise<T>) => fn(),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    const err = new Error("NEXT_NOT_FOUND");
    (err as Error & { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw err;
  }),
}));

import {
  assertIsSessionParticipant,
  verifyIsSessionParticipant,
} from "@/lib/session-participant-scope";

const LEARNER_ID = "learner_profile_abc";
const SESSION_ID = "wb_session_xyz";

beforeEach(() => {
  findUniqueMock.mockReset();
});

// ---------------------------------------------------------------------------
// assertIsSessionParticipant
// ---------------------------------------------------------------------------

describe("assertIsSessionParticipant", () => {
  it("returns participant row when learner has an active participant entry", async () => {
    const participant = {
      id: "part_1",
      whiteboardSessionId: SESSION_ID,
      learnerProfileId: LEARNER_ID,
      joinedAt: new Date("2026-06-01T10:00:00Z"),
      leftAt: null,
    };
    findUniqueMock.mockResolvedValue(participant);

    const result = await assertIsSessionParticipant(LEARNER_ID, SESSION_ID);

    expect(result).toEqual(participant);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: {
        whiteboardSessionId_learnerProfileId: {
          whiteboardSessionId: SESSION_ID,
          learnerProfileId: LEARNER_ID,
        },
      },
    });
  });

  it("calls notFound() when no participant row exists (learner not in this session)", async () => {
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertIsSessionParticipant(LEARNER_ID, SESSION_ID)
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() when participant row belongs to a different learner (cross-learner BLOCKER)", async () => {
    // DB correctly returns null for the wrong learner (unique key mismatch → not found)
    findUniqueMock.mockResolvedValue(null);

    await expect(
      assertIsSessionParticipant("learner_DIFFERENT", SESSION_ID)
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() when leftAt is set (participant has left)", async () => {
    findUniqueMock.mockResolvedValue({
      id: "part_2",
      whiteboardSessionId: SESSION_ID,
      learnerProfileId: LEARNER_ID,
      joinedAt: new Date("2026-06-01T10:00:00Z"),
      leftAt: new Date("2026-06-01T11:00:00Z"),
    });

    await expect(
      assertIsSessionParticipant(LEARNER_ID, SESSION_ID)
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("emits [lpr] join_denied log on denial", async () => {
    findUniqueMock.mockResolvedValue(null);
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      assertIsSessionParticipant(LEARNER_ID, SESSION_ID)
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("action=join_denied")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`lpr=${LEARNER_ID}`)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`sessionId=${SESSION_ID}`)
    );

    consoleSpy.mockRestore();
  });

  it("emits [lpr] session_join_granted log on success", async () => {
    findUniqueMock.mockResolvedValue({
      id: "part_3",
      whiteboardSessionId: SESSION_ID,
      learnerProfileId: LEARNER_ID,
      joinedAt: new Date(),
      leftAt: null,
    });
    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);

    await assertIsSessionParticipant(LEARNER_ID, SESSION_ID);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("action=session_join_granted")
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`lpr=${LEARNER_ID}`)
    );

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// verifyIsSessionParticipant (non-throwing helper for API routes)
// ---------------------------------------------------------------------------

describe("verifyIsSessionParticipant", () => {
  it("returns true when learner has an active participant row", async () => {
    findUniqueMock.mockResolvedValue({
      id: "part_4",
      whiteboardSessionId: SESSION_ID,
      learnerProfileId: LEARNER_ID,
      joinedAt: new Date(),
      leftAt: null,
    });

    const result = await verifyIsSessionParticipant(LEARNER_ID, SESSION_ID);
    expect(result).toBe(true);
  });

  it("returns false when no participant row exists", async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await verifyIsSessionParticipant(LEARNER_ID, SESSION_ID);
    expect(result).toBe(false);
  });

  it("returns false when participant has leftAt set", async () => {
    findUniqueMock.mockResolvedValue({
      id: "part_5",
      whiteboardSessionId: SESSION_ID,
      learnerProfileId: LEARNER_ID,
      joinedAt: new Date(),
      leftAt: new Date(),
    });

    const result = await verifyIsSessionParticipant(LEARNER_ID, SESSION_ID);
    expect(result).toBe(false);
  });

  it("does not throw on denial (API-route safe)", async () => {
    findUniqueMock.mockResolvedValue(null);
    await expect(
      verifyIsSessionParticipant(LEARNER_ID, SESSION_ID)
    ).resolves.toBe(false);
  });
});
