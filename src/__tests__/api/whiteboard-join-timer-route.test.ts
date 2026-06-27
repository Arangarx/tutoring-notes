/**
 * GET /api/whiteboard/[sessionId]/join-timer?token=...
 *
 * Student poll must receive a structured `{ live: false, reason }` when
 * the tutor ends (or revokes/expired) rather than silently treat 404 like
 * a generic failure — the unified student join path (WhiteboardWorkspaceClient
 * via /w/[joinToken] → WhiteboardSessionShell role="student") hinges on this contract.
 */

const findUniqueMock = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    whiteboardJoinToken: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
    whiteboardSession: {
      findUnique: jest.fn(async () => ({ activeMs: 42, lastActiveAt: new Date("2026-05-06T12:00:00Z") })),
    },
  },
  withDbRetry: async <T>(fn: () => Promise<T>) => fn(),
}));

import { GET } from "@/app/api/whiteboard/[sessionId]/join-timer/route";

function makeReq(sessionId: string, token: string) {
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/join-timer?token=${encodeURIComponent(token)}`
  );
}

beforeEach(() => {
  findUniqueMock.mockReset();
});

describe("GET /api/whiteboard/[sessionId]/join-timer", () => {
  const sessionId = "wb_sess_1";
  const token = "tokopaque";

  it("requires token query param", async () => {
    const res = await GET(
      new Request(`http://localhost/api/whiteboard/${sessionId}/join-timer`),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(res.status).toBe(400);
  });

  it("404 when token unknown", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await GET(makeReq(sessionId, token), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(404);
  });

  it("200 live:false session_ended when WhiteboardSession.endedAt is set", async () => {
    findUniqueMock.mockResolvedValue({
      whiteboardSessionId: sessionId,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: new Date(),
      whiteboardSession: { id: sessionId, endedAt: new Date() },
    });
    const res = await GET(makeReq(sessionId, token), {
      params: Promise.resolve({ sessionId }),
    });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { live?: boolean; reason?: string };
    expect(j.live).toBe(false);
    expect(j.reason).toBe("session_ended");
  });

  it("200 live:true with active snapshot when collaboration is allowed", async () => {
    findUniqueMock.mockResolvedValue({
      whiteboardSessionId: sessionId,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
      whiteboardSession: { id: sessionId, endedAt: null },
    });
    const res = await GET(makeReq(sessionId, token), {
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
