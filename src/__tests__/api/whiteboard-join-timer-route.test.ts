/**
 * GET /api/whiteboard/[sessionId]/join-timer
 *
 * Covers both the token branch and the learner-session (cookie) branch.
 *
 * TOKEN BRANCH: student poll must receive { live: false, reason } when the
 * tutor ends (or revokes/expires) rather than a silent 404, so the SPA can
 * show tutor-ended copy.
 *
 * LEARNER-SESSION BRANCH: when endWhiteboardSession atomically stamps leftAt
 * on all SessionParticipant rows AND sets endedAt, the authed-student poll
 * must still receive 200 { live: false, reason: "session_ended" } — NOT 404
 * → link_invalid (the pre-fix regression). Security boundary: a learner who
 * was NEVER a participant must still get 404.
 */

const findUniqueTokenMock = jest.fn();
const findUniqueSessionMock = jest.fn();
const findUniqueParticipantMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardJoinToken: {
      findUnique: (...args: unknown[]) => findUniqueTokenMock(...args),
    },
    whiteboardSession: {
      findUnique: (...args: unknown[]) => findUniqueSessionMock(...args),
    },
    sessionParticipant: {
      findUnique: (...args: unknown[]) => findUniqueParticipantMock(...args),
    },
  },
  withDbRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

const getLearnerSessionMock = jest.fn();
const getAccountHolderSessionMock = jest.fn();
const resolveAhJoinLearnerProfileIdMock = jest.fn();

jest.mock("@/lib/learner-session", () => ({
  __esModule: true,
  getLearnerSession: (...args: unknown[]) => getLearnerSessionMock(...args),
}));

jest.mock("@/lib/account-holder-session", () => ({
  __esModule: true,
  getAccountHolderSession: (...args: unknown[]) =>
    getAccountHolderSessionMock(...args),
}));

jest.mock("@/lib/join-scope", () => ({
  __esModule: true,
  resolveAhJoinLearnerProfileId: (...args: unknown[]) =>
    resolveAhJoinLearnerProfileIdMock(...args),
}));

import { GET } from "@/app/api/whiteboard/[sessionId]/join-timer/route";

function makeTokenReq(sessionId: string, token: string) {
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/join-timer?token=${encodeURIComponent(token)}`
  );
}

function makeLearnerReq(sessionId: string) {
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/join-timer`,
    { headers: { Cookie: "mynk_learner_session=fake-cookie" } }
  );
}

beforeEach(() => {
  findUniqueTokenMock.mockReset();
  findUniqueSessionMock.mockReset();
  findUniqueParticipantMock.mockReset();
  getLearnerSessionMock.mockReset();
  getAccountHolderSessionMock.mockReset();
  resolveAhJoinLearnerProfileIdMock.mockReset();

  // Defaults: no auth sessions → forces individual tests to set up what they need.
  getLearnerSessionMock.mockResolvedValue(null);
  getAccountHolderSessionMock.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// TOKEN BRANCH (unchanged behaviour)
// ---------------------------------------------------------------------------

describe("GET /api/whiteboard/[sessionId]/join-timer — token branch", () => {
  const sessionId = "wb_sess_1";
  const token = "tokopaque";

  it("404 when token unknown", async () => {
    findUniqueTokenMock.mockResolvedValue(null);
    const res = await GET(makeTokenReq(sessionId, token), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(404);
  });

  it("200 live:false session_ended when WhiteboardSession.endedAt is set", async () => {
    findUniqueTokenMock.mockResolvedValue({
      whiteboardSessionId: sessionId,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(),
      whiteboardSession: { id: sessionId, endedAt: new Date() },
    });
    const res = await GET(makeTokenReq(sessionId, token), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { live?: boolean; reason?: string };
    expect(j.live).toBe(false);
    expect(j.reason).toBe("session_ended");
  });

  it("200 live:true with active snapshot when collaboration is allowed", async () => {
    findUniqueTokenMock.mockResolvedValue({
      whiteboardSessionId: sessionId,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      whiteboardSession: { id: sessionId, endedAt: null },
    });
    findUniqueSessionMock.mockResolvedValue({
      activeMs: 42,
      lastActiveAt: new Date("2026-05-06T12:00:00Z"),
      sessionPhase: "ACTIVE",
    });
    const res = await GET(makeTokenReq(sessionId, token), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      live?: boolean;
      activeMs?: number;
      lastActiveAt?: string | null;
    };
    expect(j.live).toBe(true);
    expect(j.activeMs).toBe(42);
    expect(typeof j.lastActiveAt).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// LEARNER-SESSION BRANCH (cookie auth — the authed /join/[sessionId] path)
// ---------------------------------------------------------------------------

describe("GET /api/whiteboard/[sessionId]/join-timer — learner-session branch", () => {
  const sessionId = "wb_sess_2";
  const learnerProfileId = "lpr_student";

  beforeEach(() => {
    getLearnerSessionMock.mockResolvedValue({ learnerProfileId });
  });

  it("400 when no auth cookie and no token", async () => {
    getLearnerSessionMock.mockResolvedValue(null);
    const res = await GET(
      new Request(`http://localhost/api/whiteboard/${sessionId}/join-timer`),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(res.status).toBe(400);
  });

  it("404 when learner was NEVER a participant (security boundary)", async () => {
    // Non-participant: no row at all.
    findUniqueParticipantMock.mockResolvedValue(null);
    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(404);
  });

  /**
   * THE BUG FIX CASE
   *
   * endWhiteboardSession atomically stamps leftAt on all SessionParticipant
   * rows AND sets endedAt. Before the fix, the route called
   * verifyIsSessionParticipant (which requires leftAt == null) BEFORE checking
   * endedAt — so the just-ended student got 404 → link_invalid.
   *
   * After the fix the route checks participant existence (ignoring leftAt),
   * then checks endedAt first → should return 200 session_ended.
   */
  it("200 live:false session_ended when tutor ends session (leftAt + endedAt both set)", async () => {
    // Participant row with leftAt set (stamped by endWhiteboardSession).
    findUniqueParticipantMock.mockResolvedValue({
      id: "sp_1",
      whiteboardSessionId: sessionId,
      learnerProfileId,
      joinedAt: new Date("2026-06-01T10:00:00Z"),
      leftAt: new Date("2026-06-01T11:00:00Z"),
    });
    // Session row with endedAt set.
    findUniqueSessionMock.mockResolvedValue({
      activeMs: 3600_000,
      lastActiveAt: new Date("2026-06-01T10:59:00Z"),
      sessionPhase: "ACTIVE",
      endedAt: new Date("2026-06-01T11:00:00Z"),
    });

    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { live?: boolean; reason?: string };
    expect(j.live).toBe(false);
    expect(j.reason).toBe("session_ended");
  });

  it("404 when participant left mid-session but session is still live (leftAt set, endedAt null)", async () => {
    // Participant who navigated away from an ongoing session.
    findUniqueParticipantMock.mockResolvedValue({
      id: "sp_2",
      whiteboardSessionId: sessionId,
      learnerProfileId,
      joinedAt: new Date("2026-06-01T10:00:00Z"),
      leftAt: new Date("2026-06-01T10:30:00Z"),
    });
    // Session is still live.
    findUniqueSessionMock.mockResolvedValue({
      activeMs: 1800_000,
      lastActiveAt: new Date("2026-06-01T10:29:00Z"),
      sessionPhase: "ACTIVE",
      endedAt: null,
    });

    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(404);
  });

  it("200 live:true for an active participant in a live session", async () => {
    // Normal in-session poll: participant row with leftAt null, session live.
    findUniqueParticipantMock.mockResolvedValue({
      id: "sp_3",
      whiteboardSessionId: sessionId,
      learnerProfileId,
      joinedAt: new Date("2026-06-01T10:00:00Z"),
      leftAt: null,
    });
    findUniqueSessionMock.mockResolvedValue({
      activeMs: 900_000,
      lastActiveAt: new Date("2026-06-01T10:14:00Z"),
      sessionPhase: "ACTIVE",
      endedAt: null,
    });

    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      live?: boolean;
      activeMs?: number;
      sessionPhase?: string;
    };
    expect(j.live).toBe(true);
    expect(j.activeMs).toBe(900_000);
    expect(j.sessionPhase).toBe("ACTIVE");
  });
});
