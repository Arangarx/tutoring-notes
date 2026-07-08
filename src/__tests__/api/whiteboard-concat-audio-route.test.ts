/**
 * @jest-environment node
 *
 * P1-J5 — GET /api/whiteboard/[sessionId]/concat-audio behavior/contract tests.
 *
 * Oracle: HTTP status, owner vs cross-tenant denial (`notFound` → 404), and
 * DB-origin blob streaming only — the route never accepts a client-supplied blob
 * URL (no-SSRF). `streamBlobWithRangeSupport` is mocked at the helper boundary.
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the owner happy
 * path, streaming a query-param `url=`, and omitting DB `concatBlobUrl` all
 * failed before correcting oracles.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("@/lib/observability/cost-events", () => ({
  __esModule: true,
  logBlobEgressEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const streamBlobWithRangeSupportMock = jest.fn();
jest.mock("@/lib/audio/proxy-stream", () => ({
  __esModule: true,
  streamBlobWithRangeSupport: (...args: unknown[]) =>
    streamBlobWithRangeSupportMock(...args),
}));

const assertStudentNotErasedApiMock = jest.fn();
jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  assertStudentNotErasedApi: (...args: unknown[]) =>
    assertStudentNotErasedApiMock(...args),
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
import { GET } from "@/app/api/whiteboard/[sessionId]/concat-audio/route";
import { uniq } from "../helpers/unique-test-token";


const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

const DB_CONCAT_URL =
  "https://abc.blob.vercel-storage.com/whiteboard-sessions/wbs-concat/concat.webm";
const EVIL_BLOB_URL = "https://evil.example.com/attacker-controlled.webm";

function makeAudioResponse(
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response("concat-audio-bytes", {
    status,
    headers: {
      "Content-Type": "audio/webm",
      "Accept-Ranges": "bytes",
      "Content-Length": "18",
      ...headers,
    },
  });
}

async function seedConcatAudioFixture(opts?: { concatBlobUrl?: string | null }) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: `Concat Audio ${uniq()}`, adminUserId: tutor.id },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      consentAcknowledged: true,
      endedAt: new Date("2026-06-15T12:00:00.000Z"),
      concatBlobUrl:
        opts && "concatBlobUrl" in opts
          ? opts.concatBlobUrl
          : DB_CONCAT_URL,
    },
  });
  return { tutor, student, session };
}

function makeGetRequest(
  sessionId: string,
  extraQuery?: Record<string, string>
): Request {
  const params = new URLSearchParams(extraQuery);
  const query = params.toString() ? `?${params.toString()}` : "";
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/concat-audio${query}`
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
  streamBlobWithRangeSupportMock.mockReset();
  streamBlobWithRangeSupportMock.mockResolvedValue(makeAudioResponse(200));
  assertStudentNotErasedApiMock.mockReset();
  assertStudentNotErasedApiMock.mockResolvedValue(null);
  requireStudentScopeMock.mockReset();
});

afterAll(async () => {
  if (originalBlobToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
  await db.$disconnect();
});

describe("GET /api/whiteboard/[sessionId]/concat-audio — owner proxy + no-SSRF (P1-J5)", () => {
  it("owner + session.concatBlobUrl set → 200 streams DB blob URL", async () => {
    const { tutor, session } = await seedConcatAudioFixture();
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const res = await GET(makeGetRequest(session.id), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
    expect(streamBlobWithRangeSupportMock).toHaveBeenCalledTimes(1);
    const [, blobUrl, mimeType] = streamBlobWithRangeSupportMock.mock
      .calls[0] as [Request, string, string];
    expect(blobUrl).toBe(DB_CONCAT_URL);
    expect(mimeType).toBe("audio/webm");
  });

  it("cross-tenant tutor → notFound (404 in Next.js runtime)", async () => {
    const { session } = await seedConcatAudioFixture();
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
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("no concatBlobUrl on session row → 404 and does not stream", async () => {
    const { tutor, session } = await seedConcatAudioFixture({
      concatBlobUrl: null,
    });
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const res = await GET(makeGetRequest(session.id), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/not found/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("no-SSRF: ignores client-supplied url query param — streams only DB concatBlobUrl", async () => {
    const { tutor, session } = await seedConcatAudioFixture();
    requireStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: tutor.id,
      email: tutor.email,
    });

    const res = await GET(
      makeGetRequest(session.id, { url: EVIL_BLOB_URL }),
      { params: Promise.resolve({ sessionId: session.id }) }
    );

    expect(res.status).toBe(200);
    expect(streamBlobWithRangeSupportMock).toHaveBeenCalledTimes(1);
    const [, blobUrl] = streamBlobWithRangeSupportMock.mock.calls[0] as [
      Request,
      string,
    ];
    expect(blobUrl).toBe(DB_CONCAT_URL);
    expect(blobUrl).not.toBe(EVIL_BLOB_URL);
  });
});
