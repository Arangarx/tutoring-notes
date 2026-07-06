/**
 * @jest-environment node
 *
 * P1-J1 — GET /api/audio/[recordingId]?token= share-scoped proxy contract.
 *
 * Oracle: HTTP status, JSON error bodies, response headers (`Accept-Ranges`),
 * and that blob streaming is only invoked after access gates pass. Upstream
 * range/stream mechanics are covered in `proxy-stream.test.ts`; here we assert
 * the route's auth + passthrough contract.
 *
 * Red-before (2026-07-05): temporarily expecting status 403 on the happy path
 * and omitting `Accept-Ranges` both failed before correcting oracles.
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

import { db } from "@/lib/db";
import { generateShareToken } from "@/lib/security";
import { GET } from "@/app/api/audio/[recordingId]/route";
import { uniq } from "../helpers/unique-test-token";


const originalNotesAuthWall = process.env.NOTES_AUTH_WALL;

function makeAudioResponse(
  status: number,
  headers: Record<string, string> = {}
): Response {
  return new Response("audio-bytes", {
    status,
    headers: {
      "Content-Type": "audio/webm",
      "Accept-Ranges": "bytes",
      "Content-Length": "11",
      ...headers,
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.NOTES_AUTH_WALL;
  streamBlobWithRangeSupportMock.mockReset();
  streamBlobWithRangeSupportMock.mockResolvedValue(makeAudioResponse(200));
});

afterAll(async () => {
  if (originalNotesAuthWall === undefined) {
    delete process.env.NOTES_AUTH_WALL;
  } else {
    process.env.NOTES_AUTH_WALL = originalNotesAuthWall;
  }
  await db.$disconnect();
});

async function seedShareAudioFixture(opts?: { shareRecordingInEmail?: boolean }) {
  const tutor = await db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
  const student = await db.student.create({
    data: { name: `Share Audio ${uniq()}`, adminUserId: tutor.id },
  });
  const shareToken = generateShareToken();
  await db.shareLink.create({
    data: { studentId: student.id, token: shareToken },
  });

  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-15T00:00:00Z"),
      topics: "Audio share",
      homework: "",
      assessment: "",
      nextSteps: "",
      linksJson: "[]",
      status: "READY",
      shareRecordingInEmail: opts?.shareRecordingInEmail ?? true,
    },
  });

  const recording = await db.sessionRecording.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      blobUrl: "https://blob.example.com/audio/share-contract.webm",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    },
  });

  return { tutor, student, shareToken, note, recording };
}

function makeGetRequest(
  recordingId: string,
  shareToken: string | null,
  headers: Record<string, string> = {}
): Request {
  const tokenQuery = shareToken === null ? "" : `?token=${shareToken}`;
  return new Request(
    `http://localhost/api/audio/${recordingId}${tokenQuery}`,
    { method: "GET", headers }
  );
}

describe("GET /api/audio/[recordingId] — share-scoped proxy contract (P1-J1)", () => {
  it("valid share token + in-scope recording → 200 with Accept-Ranges and streams blob", async () => {
    const { shareToken, recording } = await seedShareAudioFixture();

    const res = await GET(makeGetRequest(recording.id, shareToken), {
      params: Promise.resolve({ recordingId: recording.id }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
    expect(streamBlobWithRangeSupportMock).toHaveBeenCalledTimes(1);
    const [req, blobUrl, mimeType] = streamBlobWithRangeSupportMock.mock.calls[0] as [
      Request,
      string,
      string,
    ];
    expect(blobUrl).toBe("https://blob.example.com/audio/share-contract.webm");
    expect(mimeType).toBe("audio/webm");
    expect(req.url).toContain(`/api/audio/${recording.id}`);
  });

  it("forwards Range header to streamBlobWithRangeSupport and returns 206 partial", async () => {
    const { shareToken, recording } = await seedShareAudioFixture();
    streamBlobWithRangeSupportMock.mockResolvedValue(
      makeAudioResponse(206, {
        "Content-Range": "bytes 0-1023/2048",
        "Content-Length": "1024",
      })
    );

    const res = await GET(
      makeGetRequest(recording.id, shareToken, {
        Range: "bytes=0-1023",
      }),
      { params: Promise.resolve({ recordingId: recording.id }) }
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1023/2048");
    const [req] = streamBlobWithRangeSupportMock.mock.calls[0] as [Request];
    expect(req.headers.get("range")).toBe("bytes=0-1023");
  });

  it("revoked share token → 403 and does not stream blob", async () => {
    const { shareToken, recording } = await seedShareAudioFixture();
    await db.shareLink.update({
      where: { token: shareToken },
      data: { revokedAt: new Date() },
    });

    const res = await GET(makeGetRequest(recording.id, shareToken), {
      params: Promise.resolve({ recordingId: recording.id }),
    });

    expect(res.status).toBe(403);
    const json = (await res.json()) as { error?: string };
    expect(typeof json.error).toBe("string");
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("missing token query param → 401 and does not stream blob", async () => {
    const { recording } = await seedShareAudioFixture();

    const res = await GET(makeGetRequest(recording.id, null), {
      params: Promise.resolve({ recordingId: recording.id }),
    });

    expect(res.status).toBe(401);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/missing token/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });

  it("recording not shareable for token student → 404 and does not stream blob", async () => {
    const fixture = await seedShareAudioFixture({
      shareRecordingInEmail: false,
    });
    const otherStudent = await db.student.create({
      data: { name: `Other ${uniq()}` },
    });
    const foreignRecording = await db.sessionRecording.create({
      data: {
        adminUserId: fixture.tutor.id,
        studentId: otherStudent.id,
        blobUrl: "https://blob.example.com/audio/foreign.webm",
        mimeType: "audio/webm",
        sizeBytes: 512,
      },
    });

    const res = await GET(
      makeGetRequest(foreignRecording.id, fixture.shareToken),
      { params: Promise.resolve({ recordingId: foreignRecording.id }) }
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/not found/i);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();
  });
});
