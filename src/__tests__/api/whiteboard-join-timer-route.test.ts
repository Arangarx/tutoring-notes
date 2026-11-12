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
/** Every query the route makes, `model.method` (M17 counts them). */
const queryLog: string[] = [];

jest.mock("@/lib/db", () => {
  const logged =
    (name: string, impl: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      queryLog.push(name);
      return impl(...args);
    };
  const consentRead = (model: string) => ({
    findUnique: logged(`${model}.findUnique`, async () => null),
    findFirst: logged(`${model}.findFirst`, async () => null),
    findMany: logged(`${model}.findMany`, async () => []),
  });
  return {
    __esModule: true,
    db: {
      whiteboardJoinToken: {
        findUnique: logged("whiteboardJoinToken.findUnique", (...args) => findUniqueTokenMock(...args)),
      },
      whiteboardSession: {
        findUnique: logged("whiteboardSession.findUnique", (...args) => findUniqueSessionMock(...args)),
      },
      sessionParticipant: {
        findUnique: logged("sessionParticipant.findUnique", (...args) => findUniqueParticipantMock(...args)),
      },
      consentRecord: consentRead("consentRecord"),
      consentRestriction: consentRead("consentRestriction"),
      sessionConsentSnapshot: consentRead("sessionConsentSnapshot"),
    },
    withDbRetry: async <T>(fn: () => Promise<T>) => fn(),
  };
});

// The live-record resolver and the entry inputs are counted spies (M17: an ACTIVE poll makes neither read). The
// toggle projection stays real.
const resolveSessionCapabilitiesMock = jest.fn();
const loadSessionEntryInputsMock = jest.fn();
jest.mock("@/lib/consent-scope", () => {
  const actual = jest.requireActual("@/lib/consent-scope");
  return {
    __esModule: true,
    ...actual,
    resolveSessionCapabilities: (...args: unknown[]) => resolveSessionCapabilitiesMock(...args),
  };
});
jest.mock("@/lib/scheduling/session-entry-loader", () => ({
  __esModule: true,
  loadSessionEntryInputs: (...args: unknown[]) => loadSessionEntryInputsMock(...args),
}));
jest.mock("@/lib/org-force-end-touch", () => ({
  __esModule: true,
  touchOrgForceEndIfDue: jest.fn(async () => undefined),
}));

import {
  deriveSessionCapabilities,
  type SessionCapabilities,
} from "@/lib/recording/session-capabilities";

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

const ALL_ON_CAPABILITIES: SessionCapabilities = deriveSessionCapabilities({
  hasConsentSnapshot: true,
  toggles: { audio: true, whiteboard: true, notes: true },
  sessionMode: "LIVE",
  notesForbidden: false,
});

beforeEach(() => {
  findUniqueTokenMock.mockReset();
  findUniqueSessionMock.mockReset();
  findUniqueParticipantMock.mockReset();
  getLearnerSessionMock.mockReset();
  getAccountHolderSessionMock.mockReset();
  resolveAhJoinLearnerProfileIdMock.mockReset();
  resolveSessionCapabilitiesMock.mockReset();
  loadSessionEntryInputsMock.mockReset();
  queryLog.length = 0;
  resolveSessionCapabilitiesMock.mockResolvedValue(ALL_ON_CAPABILITIES);
  loadSessionEntryInputsMock.mockResolvedValue({
    erasureSuspended: false,
    org: null,
    claimed: true,
    isSelfLearner: false,
    consent: { allowLiveSession: true },
  });

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
      endedAt: null,
      adminUserId: "admin_1",
      student: { organizationId: null, adminUserId: "admin_1" },
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
      adminUserId: "admin_1",
      student: { organizationId: null, adminUserId: "admin_1" },
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
      adminUserId: "admin_1",
      student: { organizationId: null, adminUserId: "admin_1" },
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
      adminUserId: "admin_1",
      student: { organizationId: null, adminUserId: "admin_1" },
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

  /**
   * CHANGE 1 — auth parity with the join page.
   *
   * A STALE child learner cookie (non-participant of THIS session) must NOT be
   * trusted unconditionally. The poll must fall through to the account-holder
   * self-learner path (resolveAhJoinLearnerProfileId) — mirroring the join page —
   * and resolve the session's self-learner, which IS a participant → 200 live.
   *
   * Pre-fix: the route bound effectiveLearnerProfileId to the child cookie
   * unconditionally → findSessionParticipantRow(child) null → 404 → link_invalid.
   */
  it("200 live:true when stale child cookie is non-participant but AH self-learner path resolves", async () => {
    const childProfileId = "lpr_child_stale";
    const selfProfileId = "lpr_self_learner";

    getLearnerSessionMock.mockResolvedValue({ learnerProfileId: childProfileId });
    // Participant lookup: child is NOT a participant; self-learner IS.
    findUniqueParticipantMock.mockImplementation((args: {
      where?: { whiteboardSessionId_learnerProfileId?: { learnerProfileId?: string } };
    }) => {
      const lp = args?.where?.whiteboardSessionId_learnerProfileId?.learnerProfileId;
      if (lp === selfProfileId) {
        return Promise.resolve({
          id: "sp_self",
          whiteboardSessionId: sessionId,
          learnerProfileId: selfProfileId,
          joinedAt: new Date("2026-06-01T10:00:00Z"),
          leftAt: null,
        });
      }
      return Promise.resolve(null);
    });
    // AH session present + resolves to the self-learner profile.
    getAccountHolderSessionMock.mockResolvedValue({ accountHolderId: "ah_1" });
    resolveAhJoinLearnerProfileIdMock.mockResolvedValue({
      learnerProfileId: selfProfileId,
    });
    findUniqueSessionMock.mockResolvedValue({
      activeMs: 120_000,
      lastActiveAt: new Date("2026-06-01T10:02:00Z"),
      sessionPhase: "ACTIVE",
      endedAt: null,
      adminUserId: "admin_1",
      student: { organizationId: null, adminUserId: "admin_1" },
    });

    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { live?: boolean };
    expect(j.live).toBe(true);
  });

  /**
   * CHANGE 1 security boundary — a stale child cookie that is NOT a participant
   * AND no account-holder fallback must still fail closed (404). Access is never
   * broadened for a genuine non-participant principal.
   */
  it("404 when stale child cookie is non-participant and there is no AH fallback", async () => {
    getLearnerSessionMock.mockResolvedValue({ learnerProfileId: "lpr_child_stale" });
    findUniqueParticipantMock.mockResolvedValue(null); // not a participant
    getAccountHolderSessionMock.mockResolvedValue(null); // no AH path

    const res = await GET(makeLearnerReq(sessionId), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// ACCOUNT-HOLDER BRANCH — cancel deletes the row; the waiting parent/self-
// learner has only mynk_ah_session (no learner cookie). A missing row must
// 404 so the overlay can show "Session was canceled". A row that exists but
// this account holder cannot join stays a refusal (not 404).
// ---------------------------------------------------------------------------

describe("GET /api/whiteboard/[sessionId]/join-timer — account-holder cookie", () => {
  const sessionId = "wb_sess_ah_cancel";
  const accountHolderId = "ah_parent_1";

  function makeAhReq() {
    return new Request(`http://localhost/api/whiteboard/${sessionId}/join-timer`, {
      headers: { Cookie: "mynk_ah_session=fake-ah-cookie" },
    });
  }

  beforeEach(() => {
    getLearnerSessionMock.mockResolvedValue(null);
    getAccountHolderSessionMock.mockResolvedValue({ accountHolderId });
    resolveAhJoinLearnerProfileIdMock.mockResolvedValue(null);
  });

  it("404 when the account-holder cookie is valid, the session row is gone, and there is no learner cookie", async () => {
    findUniqueSessionMock.mockResolvedValue(null);

    const res = await GET(makeAhReq(), {
      params: Promise.resolve({ sessionId }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Not found.");
  });

  it("refuses when the account-holder cookie is valid but the session belongs to someone else", async () => {
    // Row is present. Resolver denies (not the owner). Must not become 404 —
    // that status is what the waiting overlay treats as "canceled".
    findUniqueSessionMock.mockResolvedValue({
      id: sessionId,
      activeMs: 0,
      lastActiveAt: null,
      sessionPhase: "PENDING",
      endedAt: null,
      adminUserId: "admin_other",
      student: { organizationId: null, adminUserId: "admin_other" },
    });

    const res = await GET(makeAhReq(), {
      params: Promise.resolve({ sessionId }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).not.toBe("Not found.");
  });

  it("400 when the request has no cookies and no token", async () => {
    getLearnerSessionMock.mockResolvedValue(null);
    getAccountHolderSessionMock.mockResolvedValue(null);

    const res = await GET(
      new Request(`http://localhost/api/whiteboard/${sessionId}/join-timer`),
      { params: Promise.resolve({ sessionId }) }
    );

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// C3c (consent wave plan § 4.1 item 6, Q9, M17, E19): both live bodies carry the session mode and capabilities;
// a family's online switch turned off answers `{ live: false, reason: "online_off" }` on both branches.
// ---------------------------------------------------------------------------

type Branch = "token" | "learner";
const C3C_SESSION = "wb_sess_c3c";
const LEARNER = "lpr_c3c";

function sessionRow(over: {
  sessionPhase: "PENDING" | "ACTIVE";
  sessionMode?: "LIVE" | "IN_PERSON";
  snapshot?: { allowLiveSession: boolean; allowAudioRecording: boolean } | null;
}) {
  const snap = over.snapshot ?? null;
  return {
    id: C3C_SESSION,
    studentId: "stu_c3c",
    activeMs: 10_000,
    lastActiveAt: new Date("2026-11-11T10:00:00Z"),
    sessionPhase: over.sessionPhase,
    sessionMode: over.sessionMode ?? "LIVE",
    notesForbidden: false,
    endedAt: null,
    adminUserId: "admin_c3c",
    consentSnapshot: snap
      ? {
          allowLiveSession: snap.allowLiveSession,
          allowAudioRecording: snap.allowAudioRecording,
          allowWhiteboardRecording: true,
          allowNoteSending: true,
        }
      : null,
    student: {
      organizationId: null,
      adminUserId: "admin_c3c",
      learnerProfileId: LEARNER,
      learnerProfile: { isSelfLearner: false },
    },
  };
}

function arrange(branch: Branch, row: ReturnType<typeof sessionRow>) {
  if (branch === "token") {
    findUniqueTokenMock.mockResolvedValue({
      whiteboardSessionId: C3C_SESSION,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      whiteboardSession: { id: C3C_SESSION, endedAt: null },
    });
  } else {
    getLearnerSessionMock.mockResolvedValue({ learnerProfileId: LEARNER });
    findUniqueParticipantMock.mockResolvedValue({
      id: "sp_c3c",
      whiteboardSessionId: C3C_SESSION,
      learnerProfileId: LEARNER,
      joinedAt: new Date("2026-11-11T09:59:00Z"),
      leftAt: null,
    });
  }
  findUniqueSessionMock.mockResolvedValue(row);
  queryLog.length = 0;
}

async function poll(branch: Branch) {
  const req = branch === "token" ? makeTokenReq(C3C_SESSION, "tok_c3c") : makeLearnerReq(C3C_SESSION);
  const res = await GET(req, { params: Promise.resolve({ sessionId: C3C_SESSION }) });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const firstQuery: Record<Branch, string> = {
  token: "whiteboardJoinToken.findUnique",
  learner: "sessionParticipant.findUnique",
};

describe.each(["token", "learner"] as const)("GET join-timer — C3c, %s branch", (branch) => {
  it("M17: ACTIVE with a frozen snapshot — one session read carrying the snapshot; no live-record or resolver read", async () => {
    arrange(
      branch,
      sessionRow({
        sessionPhase: "ACTIVE",
        sessionMode: "IN_PERSON",
        snapshot: { allowLiveSession: true, allowAudioRecording: false },
      })
    );
    const { status, body } = await poll(branch);
    expect(status).toBe(200);
    expect(queryLog).toEqual([firstQuery[branch], "whiteboardSession.findUnique"]);
    const sessionSelect = findUniqueSessionMock.mock.calls[0]![0] as { select: Record<string, unknown> };
    expect(sessionSelect.select.consentSnapshot).toBeTruthy();
    expect(resolveSessionCapabilitiesMock).not.toHaveBeenCalled();
    expect(loadSessionEntryInputsMock).not.toHaveBeenCalled();
    expect(body.live).toBe(true);
    expect(body.sessionMode).toBe("IN_PERSON");
    // In person with audio off: no recording and no learner mic (plan § 2.2 table).
    const caps = body.sessionCapabilities as SessionCapabilities;
    expect(caps.audio.mode).toBe("none");
    expect(caps.mic.acquire).toBe("no");
  });

  it("ACTIVE online with audio off: the frozen answer keeps the learner mic for the live call", async () => {
    arrange(
      branch,
      sessionRow({
        sessionPhase: "ACTIVE",
        sessionMode: "LIVE",
        snapshot: { allowLiveSession: true, allowAudioRecording: false },
      })
    );
    const { body } = await poll(branch);
    expect(body.sessionMode).toBe("LIVE");
    expect((body.sessionCapabilities as SessionCapabilities).mic.acquire).toBe("yes");
  });

  it("PENDING: one resolver read of the live record with mode UNKNOWN; the body says UNKNOWN", async () => {
    const deferred = deriveSessionCapabilities({
      hasConsentSnapshot: true,
      toggles: { audio: false, whiteboard: true, notes: true },
      sessionMode: "UNKNOWN",
      notesForbidden: false,
    });
    resolveSessionCapabilitiesMock.mockResolvedValue(deferred);
    arrange(branch, sessionRow({ sessionPhase: "PENDING", sessionMode: "LIVE" }));
    const { status, body } = await poll(branch);
    expect(status).toBe(200);
    expect(resolveSessionCapabilitiesMock).toHaveBeenCalledTimes(1);
    expect(resolveSessionCapabilitiesMock).toHaveBeenCalledWith(C3C_SESSION, undefined, { sessionMode: "UNKNOWN" });
    expect(body.live).toBe(true);
    expect(body.sessionPhase).toBe("PENDING");
    expect(body.sessionMode).toBe("UNKNOWN");
    expect((body.sessionCapabilities as SessionCapabilities).mic.acquire).toBe("defer");
  });

  it("E19: ACTIVE, the frozen online switch is off — live:false online_off", async () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});
    arrange(
      branch,
      sessionRow({ sessionPhase: "ACTIVE", snapshot: { allowLiveSession: false, allowAudioRecording: true } })
    );
    const { status, body } = await poll(branch);
    expect(status).toBe(200);
    expect(body).toEqual({ live: false, reason: "online_off" });
    expect(
      info.mock.calls.some((c) =>
        String(c[0]).includes(`[slc] wbsid=${C3C_SESSION} action=join_timer_online_off principal=`)
      )
    ).toBe(true);
    info.mockRestore();
  });

  it("E19: PENDING, the family turned online sessions off — live:false online_off", async () => {
    loadSessionEntryInputsMock.mockResolvedValue({
      erasureSuspended: false,
      org: null,
      claimed: true,
      isSelfLearner: false,
      consent: { allowLiveSession: false },
    });
    arrange(branch, sessionRow({ sessionPhase: "PENDING" }));
    const { status, body } = await poll(branch);
    expect(status).toBe(200);
    expect(body).toEqual({ live: false, reason: "online_off" });
  });

  it("control: other entry reasons (unclaimed, no consent record) do not evict a connected learner", async () => {
    loadSessionEntryInputsMock.mockResolvedValue({
      erasureSuspended: false,
      org: null,
      claimed: false,
      isSelfLearner: false,
      consent: null,
    });
    arrange(branch, sessionRow({ sessionPhase: "PENDING" }));
    const { body } = await poll(branch);
    expect(body.live).toBe(true);
  });
});
