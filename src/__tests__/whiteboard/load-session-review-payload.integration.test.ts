/**
 * @jest-environment node
 *
 * P1-J4 / WS-S — loadSessionReviewPayload behavior/contract tests.
 *
 * Oracle: user-observable review payload fields after a real DB round-trip —
 * `hasAudio`, `eventCount`, `initialNote.found` (+ content when present), and
 * honest empty representation when audio/events/note are absent (not an error).
 * Cross-tenant load → `assertOwnsWhiteboardSession` notFound denial.
 *
 * Supersedes RW-4 query-shape coupling in `notes-session-bridge.test.ts`.
 *
 * Red-before (2026-07-05): temporarily expecting `hasAudio: false` on a seeded
 * audio session and `eventCount: 99` on empty events both failed before
 * correcting to `true` / `0`.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const mockGetServerSession = jest.fn();

jest.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}));

jest.mock("@/auth-options", () => ({ authOptions: {} }));

import { db } from "@/lib/db";
import { loadSessionReviewPayload } from "@/app/admin/students/[id]/whiteboard/notes-actions";

let uniqueSuffix = 0;
function uniq(prefix = "review-payload") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

const EVENTS_BLOB_URL = "https://blob.vercel-storage.com/review-events.json";

const originalFetch = global.fetch;

async function seedTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function seedStudent(adminUserId: string) {
  return db.student.create({
    data: { name: `Review Student ${uniq()}`, adminUserId },
  });
}

type SeedReviewSessionOpts = {
  withAudio?: boolean;
  withNote?: boolean;
  eventsBlobUrl?: string;
};

async function seedReviewSession(
  tutorId: string,
  studentId: string,
  opts: SeedReviewSessionOpts = {}
) {
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutorId,
      studentId,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: opts.eventsBlobUrl ?? EVENTS_BLOB_URL,
      endedAt: new Date("2026-06-15T12:00:00Z"),
      durationSeconds: 1800,
      billedDurationMin: 30,
    },
  });

  if (opts.withAudio) {
    await db.sessionRecording.create({
      data: {
        adminUserId: tutorId,
        studentId,
        whiteboardSessionId: session.id,
        blobUrl: `https://blob.vercel-storage.com/${uniq("audio")}.webm`,
        mimeType: "audio/webm",
        sizeBytes: 2048,
        durationSeconds: 90,
        orderIndex: 0,
      },
    });
  }

  if (opts.withNote) {
    await db.tutorNote.create({
      data: {
        sessionId: session.id,
        status: "done",
        content: "Topics covered: fractions and long division.",
      },
    });
  }

  return session;
}

function mockSessionAsTutor(tutor: { email: string }) {
  mockGetServerSession.mockResolvedValue({
    user: { email: tutor.email },
  });
}

function mockEventsFetch(eventCount: number) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === EVENTS_BLOB_URL) {
      const events = Array.from({ length: eventCount }, (_, i) => ({
        type: "stroke",
        id: `evt-${i}`,
      }));
      return new Response(JSON.stringify({ events }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

beforeEach(() => {
  mockGetServerSession.mockReset();
});

afterEach(() => {
  global.fetch = originalFetch;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("loadSessionReviewPayload — non-empty review contract (P1-J4 / WS-S)", () => {
  it("returns hasAudio, eventCount, and initialNote when session data is seeded", async () => {
    const tutor = await seedTutor();
    const student = await seedStudent(tutor.id);
    const session = await seedReviewSession(tutor.id, student.id, {
      withAudio: true,
      withNote: true,
    });
    mockSessionAsTutor(tutor);
    mockEventsFetch(4);

    const payload = await loadSessionReviewPayload(session.id);

    expect(payload.hasAudio).toBe(true);
    expect(payload.eventCount).toBe(4);
    expect(payload.initialNote.found).toBe(true);
    if (payload.initialNote.found) {
      expect(payload.initialNote.status).toBe("done");
      expect(payload.initialNote.content).toContain("fractions");
    }
    expect(payload.audioSegments.length).toBeGreaterThan(0);
    expect(payload.eventsProxyUrl).toBe(
      `/api/whiteboard/${session.id}/events`
    );
    expect(payload.studentName).toBe(student.name);
    expect(payload.endedAtIso).not.toBeNull();
  });
});

describe("loadSessionReviewPayload — honest empty contract (P1-J4 / WS-S)", () => {
  it("reports hasAudio false and eventCount 0 when no audio or events exist", async () => {
    const tutor = await seedTutor();
    const student = await seedStudent(tutor.id);
    const session = await seedReviewSession(tutor.id, student.id, {
      withAudio: false,
      withNote: false,
      eventsBlobUrl: "https://blob.vercel-storage.com/empty-events.json",
    });
    mockSessionAsTutor(tutor);
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;

    const payload = await loadSessionReviewPayload(session.id);

    expect(payload.hasAudio).toBe(false);
    expect(payload.eventCount).toBe(0);
    expect(payload.initialNote.found).toBe(false);
    expect(payload.audioSegments).toEqual([]);
    expect(payload.canonicalAudioBlobUrl).toBeNull();
  });
});

describe("loadSessionReviewPayload — ownership contract (P1-J4)", () => {
  it("cross-tenant tutor → assertOwnsWhiteboardSession notFound (no payload)", async () => {
    const owner = await seedTutor();
    const other = await seedTutor();
    const student = await seedStudent(owner.id);
    const session = await seedReviewSession(owner.id, student.id, {
      withAudio: true,
      withNote: true,
    });
    mockSessionAsTutor(other);
    mockEventsFetch(2);

    await expect(loadSessionReviewPayload(session.id)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );
  });
});
