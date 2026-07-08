/**
 * @jest-environment node
 *
 * P1-J2 — GET /api/whiteboard/[sessionId]/timer-anchor behavior/contract tests.
 *
 * Oracle: HTTP 200 JSON body shape (`bothConnectedAt`, `activeMs`, `lastActiveAt`),
 * `Cache-Control: no-store`, and auth denial via `assertOwnsWhiteboardSession`
 * (production: `notFound()` → 404 for cross-tenant / missing session).
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the happy path and
 * `activeMs: 999` both failed before correcting to 200 / DB-backed values.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const requireStudentScopeMock = jest.fn();

jest.mock("@/lib/student-scope", () => {
  const actual = jest.requireActual<typeof import("@/lib/student-scope")>(
    "@/lib/student-scope"
  );
  return {
    ...actual,
    requireStudentScope: () => requireStudentScopeMock(),
  };
});

import { db } from "@/lib/db";
import { GET } from "@/app/api/whiteboard/[sessionId]/timer-anchor/route";
import { uniq } from "../helpers/unique-test-token";


async function seedTimerAnchorFixture() {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: `Timer Student ${uniq()}`, adminUserId: tutor.id },
  });
  const bothConnectedAt = new Date("2026-06-01T10:00:00.000Z");
  const lastActiveAt = new Date("2026-06-01T10:15:30.000Z");
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      consentAcknowledged: true,
      bothConnectedAt,
      activeMs: 930_000,
      lastActiveAt,
    },
  });
  return { tutor, student, session, bothConnectedAt, lastActiveAt };
}

function makeGetRequest(sessionId: string) {
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/timer-anchor`
  );
}

beforeEach(() => {
  requireStudentScopeMock.mockReset();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("GET /api/whiteboard/[sessionId]/timer-anchor — timer reader contract (P1-J2)", () => {
  it("owner → 200 with bothConnectedAt, activeMs, lastActiveAt and no-store cache", async () => {
    const { tutor, session, bothConnectedAt, lastActiveAt } =
      await seedTimerAnchorFixture();
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const res = await GET(makeGetRequest(session.id), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const json = (await res.json()) as {
      bothConnectedAt: string | null;
      activeMs: number;
      lastActiveAt: string | null;
    };
    expect(json.bothConnectedAt).toBe(bothConnectedAt.toISOString());
    expect(json.activeMs).toBe(930_000);
    expect(json.lastActiveAt).toBe(lastActiveAt.toISOString());
  });

  it("cross-tenant tutor → notFound (404 in Next.js runtime)", async () => {
    const { session } = await seedTimerAnchorFixture();
    const otherTutor = await db.adminUser.create({
      data: {
        email: `${uniq("other-tutor")}@example.com`,
        role: "TUTOR",
        approvalStatus: "APPROVED",
      },
    });
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: otherTutor.id,
      email: otherTutor.email,
    });

    await expect(
      GET(makeGetRequest(session.id), {
        params: Promise.resolve({ sessionId: session.id }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("unauthenticated scope → redirect to login (NEXT_REDIRECT in test runtime)", async () => {
    const { session } = await seedTimerAnchorFixture();
    requireStudentScopeMock.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(
      GET(makeGetRequest(session.id), {
        params: Promise.resolve({ sessionId: session.id }),
      })
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  it("unknown session id → notFound (404 in Next.js runtime)", async () => {
    const { tutor } = await seedTimerAnchorFixture();
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    await expect(
      GET(makeGetRequest("wb_nonexistent_session"), {
        params: Promise.resolve({ sessionId: "wb_nonexistent_session" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
