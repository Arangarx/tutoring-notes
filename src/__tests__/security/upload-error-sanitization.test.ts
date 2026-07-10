/**
 * Security regression: upload routes must NOT return internal error details
 * (exception messages, file paths, internal identifiers) in the HTTP response
 * body when handleUpload throws.
 *
 * Asserts:
 *  - /api/upload/blob returns a generic error message rather than the raw
 *    exception message when handleUpload throws.
 *  - A correlation debugId is still returned (safe — opaque identifier only).
 */

const handleUploadMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  __esModule: true,
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
}));

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: jest.fn(),
}));

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertJoinTokenAllowsWhiteboardAssetUpload: jest.fn(),
  assertOwnsWhiteboardSession: jest.fn(),
}));

import { POST as blobPOST } from "@/app/api/upload/blob/route";

const INTERNAL_DETAIL = "internal db connection string leaked";

describe("Upload routes — error sanitization", () => {
  beforeEach(() => {
    handleUploadMock.mockReset();
  });

  test("/api/upload/blob: does not expose raw exception message on handleUpload throw", async () => {
    handleUploadMock.mockRejectedValue(new Error(INTERNAL_DETAIL));

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
