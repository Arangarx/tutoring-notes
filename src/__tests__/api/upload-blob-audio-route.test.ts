/**
 * Route-handler tests for /api/upload/blob kind:"audio" (Vercel Blob handleUpload).
 *
 * Ported from the deleted /api/upload/audio route — the hot zone is the
 * onBeforeGenerateToken callback for kind === "audio". handleUpload is
 * stubbed so we assert auth + size + content-type policy without a real
 * blob store.
 */

type GenerateTokenCb = (
  pathname: string,
  clientPayload: string | null,
  multipart: boolean
) => Promise<{
  allowedContentTypes?: string[];
  maximumSizeInBytes?: number;
  addRandomSuffix?: boolean;
  tokenPayload?: string | null;
}>;

const handleUploadMock = jest.fn();
const assertOwnsStudentMock = jest.fn();
const assertStudentNotErasedMock = jest.fn();
const requireStudentScopeMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  __esModule: true,
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
}));

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
  requireStudentScope: () => requireStudentScopeMock(),
}));

jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  assertStudentNotErased: (id: string) => assertStudentNotErasedMock(id),
}));

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertJoinTokenAllowsWhiteboardAssetUpload: jest.fn(),
  assertLearnerSessionAllowsWhiteboardAssetUpload: jest.fn(),
  assertOwnsWhiteboardSession: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) },
  },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

import { POST } from "@/app/api/upload/blob/route";
import { BLOB_MAX_BYTES } from "@/lib/audio-constants";
import { db } from "@/lib/db";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/upload/blob", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function audioPayload(studentId: string): string {
  return JSON.stringify({ kind: "audio", studentId });
}

async function captureOnBeforeGenerateToken(): Promise<GenerateTokenCb> {
  let captured: GenerateTokenCb | null = null;
  handleUploadMock.mockImplementation(
    async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: GenerateTokenCb }) => {
      captured = onBeforeGenerateToken;
      return { type: "blob.generate-client-token", clientToken: "stubbed" };
    }
  );
  await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
  expect(captured).not.toBeNull();
  return captured as unknown as GenerateTokenCb;
}

beforeEach(() => {
  handleUploadMock.mockReset();
  assertOwnsStudentMock.mockReset();
  assertStudentNotErasedMock.mockReset();
  requireStudentScopeMock.mockReset();
  assertOwnsStudentMock.mockResolvedValue(undefined);
  assertStudentNotErasedMock.mockResolvedValue(undefined);
  requireStudentScopeMock.mockResolvedValue({ kind: "admin", adminId: "admin_test_1" });
  (db.adminUser.findUnique as jest.Mock).mockResolvedValue({ approvalStatus: "APPROVED" });
});

describe("POST /api/upload/blob — kind: audio", () => {
  test("400s on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/upload/blob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(typeof json.error).toBe("string");
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  test("onBeforeGenerateToken throws when kind is missing or unknown", async () => {
    const cb = await captureOnBeforeGenerateToken();
    await expect(cb("sessions/x.webm", null, false)).rejects.toThrow(/kind/i);
    await expect(cb("sessions/x.webm", "{}", false)).rejects.toThrow(/kind/i);
    await expect(
      cb("sessions/x.webm", JSON.stringify({ studentId: "stu-1" }), false)
    ).rejects.toThrow(/kind/i);
    await expect(
      cb("sessions/x.webm", JSON.stringify({ kind: "not-a-real-kind" }), false)
    ).rejects.toThrow(/kind/i);
    expect(assertOwnsStudentMock).not.toHaveBeenCalled();
  });

  test("onBeforeGenerateToken throws when audio kind is missing studentId", async () => {
    const cb = await captureOnBeforeGenerateToken();
    await expect(
      cb("sessions/x.webm", JSON.stringify({ kind: "audio" }), false)
    ).rejects.toThrow(/studentId/i);
    expect(assertOwnsStudentMock).not.toHaveBeenCalled();
  });

  test("onBeforeGenerateToken validates ownership and returns the audio constraints", async () => {
    const cb = await captureOnBeforeGenerateToken();
    const opts = await cb(
      "sessions/stu-1/123-foo.webm",
      audioPayload("stu-1"),
      false
    );

    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu-1");
    expect(assertStudentNotErasedMock).toHaveBeenCalledWith("stu-1");
    expect(opts.allowedContentTypes).toEqual(["audio/*"]);
    expect(opts.maximumSizeInBytes).toBe(BLOB_MAX_BYTES);
    expect(opts.addRandomSuffix).toBe(true);
    const tokenPayload = JSON.parse(opts.tokenPayload as string) as {
      kind: string;
      studentId: string;
      rid?: string;
    };
    expect(tokenPayload.kind).toBe("audio");
    expect(tokenPayload.studentId).toBe("stu-1");
    expect(typeof tokenPayload.rid).toBe("string");
  });

  test("onBeforeGenerateToken bubbles ownership rejection up to handleUpload", async () => {
    assertOwnsStudentMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    const cb = await captureOnBeforeGenerateToken();
    await expect(
      cb("sessions/stu-2/123-foo.webm", audioPayload("stu-2"), false)
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu-2");
  });

  test("onBeforeGenerateToken blocks erased students", async () => {
    assertStudentNotErasedMock.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    const cb = await captureOnBeforeGenerateToken();
    await expect(
      cb("sessions/stu-erased/123-foo.webm", audioPayload("stu-erased"), false)
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(assertStudentNotErasedMock).toHaveBeenCalledWith("stu-erased");
  });

  test("onBeforeGenerateToken blocks WAITLISTED tutors from minting audio tokens", async () => {
    (db.adminUser.findUnique as jest.Mock).mockResolvedValueOnce({
      approvalStatus: "WAITLISTED",
    });
    const cb = await captureOnBeforeGenerateToken();
    await expect(
      cb("sessions/stu-3/123-foo.webm", audioPayload("stu-3"), false)
    ).rejects.toMatchObject({ name: "TutorNotApprovedError" });
    expect(assertOwnsStudentMock).toHaveBeenCalledWith("stu-3");
  });

  test("returns the handleUpload result on success", async () => {
    handleUploadMock.mockResolvedValue({
      type: "blob.generate-client-token",
      clientToken: "stubbed-token-abc",
    });
    const res = await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { type: string; clientToken: string };
    expect(json.type).toBe("blob.generate-client-token");
    expect(json.clientToken).toBe("stubbed-token-abc");
  });

  test("returns 400 with a generic error (no internal detail) when handleUpload throws", async () => {
    handleUploadMock.mockRejectedValue(new Error("bad signature"));
    const res = await POST(makeRequest({ type: "blob.generate-client-token", payload: {} }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string; debugId?: string };
    expect(json.error).not.toContain("bad signature");
    expect(json.error).toContain("authorization");
    expect(typeof json.debugId).toBe("string");
  });
});
