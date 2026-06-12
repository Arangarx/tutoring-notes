/**
 * Security regression: upload routes must NOT return internal error details
 * (exception messages, file paths, internal identifiers) in the HTTP response
 * body when handleUpload throws.
 *
 * Asserts:
 *  - Both /api/upload/audio and /api/upload/blob return a generic error
 *    message rather than the raw exception message when handleUpload throws.
 *  - A correlation debugId is still returned (safe — opaque identifier only).
 */

// ---- /api/upload/audio ----

const handleUploadAudioMock = jest.fn();
const assertOwnsStudentMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  __esModule: true,
  handleUpload: (...args: unknown[]) => handleUploadAudioMock(...args),
}));

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
}));

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertJoinTokenAllowsWhiteboardAssetUpload: jest.fn(),
  assertOwnsWhiteboardSession: jest.fn(),
}));

import { POST as audioPOST } from "@/app/api/upload/audio/route";
import { POST as blobPOST } from "@/app/api/upload/blob/route";

const INTERNAL_DETAIL = "internal db connection string leaked";

describe("Upload routes — error sanitization", () => {
  beforeEach(() => {
    handleUploadAudioMock.mockReset();
    assertOwnsStudentMock.mockReset();
  });

  test("/api/upload/audio: does not expose raw exception message on handleUpload throw", async () => {
    handleUploadAudioMock.mockRejectedValue(new Error(INTERNAL_DETAIL));

    const req = new Request("https://app.example.com/api/upload/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });

    const res = await audioPOST(req);
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error?: string; debugId?: string };
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain(INTERNAL_DETAIL);
    // Generic message must be present
    expect(body.error?.toLowerCase()).toContain("authorization");
    // debugId is still present (correlation ID — not sensitive)
    expect(typeof body.debugId).toBe("string");
  });

  test("/api/upload/blob: does not expose raw exception message on handleUpload throw", async () => {
    handleUploadAudioMock.mockRejectedValue(new Error(INTERNAL_DETAIL));

    const req = new Request("https://app.example.com/api/upload/blob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token" }),
    });

    const res = await blobPOST(req);
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error?: string; debugId?: string };
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain(INTERNAL_DETAIL);
    expect(body.error?.toLowerCase()).toContain("authorization");
    expect(typeof body.debugId).toBe("string");
  });
});
