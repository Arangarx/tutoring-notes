/**
 * @jest-environment node
 *
 * P1-J5 — GET /api/whiteboard/[sessionId]/public-concat-audio behavior/contract tests.
 *
 * Oracle: HTTP status for share-token access (valid→200, revoked→403, missing
 * token→401), ended-session gate, and DB-origin blob streaming only — no client
 * URL injection (no-SSRF). Blob stream mocked at helper boundary.
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the happy path,
 * streaming a query-param `url=`, and allowing live (non-ended) sessions all
 * failed before correcting oracles.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("@/lib/observability/cost-events", () => ({
  __esModule: true,
  logBlobEgressEvent: jest.fn().mockResolvedValue(undefined),
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

import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/security";
import { GET } from "@/app/api/whiteboard/[sessionId]/public-concat-audio/route";

let uniqueSuffix = 0;
function uniq(prefix = "public-concat") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const originalNotesAuthWall = process.env.NOTES_AUTH_WALL;

const DB_CONCAT_URL =
  "https://abc.blob.vercel-storage.com/whiteboard-sessions/wbs-pub/concat.webm";
const EVIL_BLOB_URL = "https://evil.example.com/attacker-controlled.webm";

function makeAudioResponse(
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response("public-concat-bytes", {
    status,
    headers: {
      "Content-Type": "audio/webm",
      "Accept-Ranges": "bytes",
      "Content-Length": "19",
      ...headers,
    },
  });
}

async function seedPublicConcatFixture(opts?: {
  ended?: boolean;
  concatBlobUrl?: string | null;
}) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: `Public Concat ${uniq()}`, adminUserId: tutor.id },
  });
  const shareToken = generateShareToken();
  await db.shareLink.create({
    data: { studentId: student.id, token: shareToken },
  });
  const ended = opts?.ended !== false;
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      sessionPhase: ended ? "ACTIVE" : "ACTIVE",
      sessionMode: "LIVE",
      eventsBlobUrl: `https://blob.vercel-storage.com/test-${uniq()}.json`,
      consentAcknowledged: true,
      endedAt: ended ? new Date("2026-06-15T12:00:00.000Z") : null,
      concatBlobUrl:
        opts && "concatBlobUrl" in opts
          ? opts.concatBlobUrl
          : DB_CONCAT_URL,
    },
  });
  return { tutor, student, shareToken, session };
}

function makeGetRequest(
  sessionId: string,
  shareToken: string | null,
  extraQuery?: Record<string, string>
): Request {
  const params = new URLSearchParams();
  if (shareToken !== null) params.set("token", shareToken);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) params.set(k, v);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return new Request(
    `http://localhost/api/whiteboard/${sessionId}/public-concat-audio${query}`
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.NOTES_AUTH_WALL;
  process.env.BLOB_READ_WRITE_TOKEN = "test_blob_rw_token";
  streamBlobWithRangeSupportMock.mockReset();
  streamBlobWithRangeSupportMock.mockResolvedValue(makeAudioResponse(200));
  assertStudentNotErasedApiMock.mockReset();
  assertStudentNotErasedApiMock.mockResolvedValue(null);
});

afterAll(async () => {
  if (originalBlobToken === undefined) {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  } else {
    process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
  }
  if (originalNotesAuthWall === undefined) {
    delete process.env.NOTES_AUTH_WALL;
  } else {
    process.env.NOTES_AUTH_WALL = originalNotesAuthWall;
  }
  await db.$disconnect();
});

describe("GET /api/whiteboard/[sessionId]/public-concat-audio — share proxy + no-SSRF (P1-J5)", () => {
  it("valid share token + ended session + concatBlobUrl → 200 streams DB blob", async () => {
    const { shareToken, session } = await seedPublicConcatFixture();

    const res = await GET(makeGetRequest(session.id, shareToken), {
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

  it("revoked share token → 403 and does not stream blob", async () => {
    const { shareToken, session } = await seedPublicConcatFixture();
    await db.shareLink.update({
      where: { token: shareToken },
      data: { revokedAt: new Date() },
    });

    const res = await GET(makeGetRequest(session.id, shareToken), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(typeof json.error).toBe("string");
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("missing token query param → 401 and does not stream blob", async () => {
    const { session } = await seedPublicConcatFixture();

    const res = await GET(makeGetRequest(session.id, null), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/missing token/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("live (non-ended) session → 404 and does not stream blob", async () => {
    const { shareToken, session } = await seedPublicConcatFixture({
      ended: false,
    });

    const res = await GET(makeGetRequest(session.id, shareToken), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/not found/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("no-SSRF: ignores client-supplied url query param — streams only DB concatBlobUrl", async () => {
    const { shareToken, session } = await seedPublicConcatFixture();

    const res = await GET(
      makeGetRequest(session.id, shareToken, { url: EVIL_BLOB_URL }),
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

  it("session without concatBlobUrl → 404 and does not stream blob", async () => {
    const { shareToken, session } = await seedPublicConcatFixture({
      concatBlobUrl: null,
    });

    const res = await GET(makeGetRequest(session.id, shareToken), {
      params: Promise.resolve({ sessionId: session.id }),
    });

    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/not found/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });
});
