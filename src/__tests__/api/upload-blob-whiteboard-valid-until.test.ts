/**
 * @jest-environment node
 */

/**
 * Consent wave C4b (docs/handoff/consent-wave-plan.md § 3.3): a whiteboard upload token carries an
 * explicit `validUntil`, and the purge's second pass waits longer than any such token can live. The
 * platform default (one hour) would let a token minted just before End upload a board long after the
 * second pass ran. Audio tokens are unchanged.
 *
 * Real Vercel Blob enforcement of `validUntil` is not reproducible here (BACKLOG BLOB-VALIDUNTIL-REAL,
 * W12 PLAYWRIGHT-GAP); this pins what we send.
 */

type GenerateTokenCb = (
  pathname: string,
  clientPayload: string | null,
  multipart: boolean
) => Promise<{ validUntil?: number; tokenPayload?: string | null }>;

const handleUploadMock = jest.fn();

jest.mock("@vercel/blob/client", () => ({
  __esModule: true,
  handleUpload: (...args: unknown[]) => handleUploadMock(...args),
}));
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: async () => undefined,
  requireStudentScope: async () => ({ kind: "admin", adminId: "admin_1" }),
}));
jest.mock("@/lib/erasure/assert-student-not-erased", () => ({
  __esModule: true,
  assertStudentNotErased: async () => undefined,
}));
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertJoinTokenAllowsWhiteboardAssetUpload: jest.fn(),
  assertLearnerSessionAllowsWhiteboardAssetUpload: jest.fn(),
  assertOwnsWhiteboardSession: async () => ({
    id: "wb_1",
    studentId: "stu_1",
    adminUserId: "admin_1",
    organizationId: null,
    endedAt: null,
    orgAccess: { kind: "owner" },
  }),
  assertTutorSessionAllowsWhiteboardUpload: async () => undefined,
}));
jest.mock("@/lib/learner-session", () => ({ __esModule: true, getLearnerSession: async () => null }));
jest.mock("@/lib/account-holder-session", () => ({ __esModule: true, getAccountHolderSession: async () => null }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { adminUser: { findUnique: jest.fn().mockResolvedValue({ approvalStatus: "APPROVED" }) } },
  withDbRetry: <T,>(fn: () => Promise<T>) => fn(),
}));

import { POST } from "@/app/api/upload/blob/route";
import {
  BLOB_UPLOAD_TOKEN_LIFETIME_MS,
  BOARD_PURGE_SECOND_PASS_DELAY_MS,
} from "@/lib/session-cleanup-config";

async function captureCallback(): Promise<GenerateTokenCb> {
  let captured: GenerateTokenCb | null = null;
  handleUploadMock.mockImplementation(
    async ({ onBeforeGenerateToken }: { onBeforeGenerateToken: GenerateTokenCb }) => {
      captured = onBeforeGenerateToken;
      return { type: "blob.generate-client-token", clientToken: "stub" };
    }
  );
  await POST(
    new Request("http://localhost/api/upload/blob", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
    })
  );
  expect(captured).not.toBeNull();
  return captured as unknown as GenerateTokenCb;
}

const wbPayload = (kind: string) => JSON.stringify({ kind, whiteboardSessionId: "wb_1", studentId: "stu_1" });

beforeEach(() => {
  handleUploadMock.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe("whiteboard upload token lifetime", () => {
  it.each(["whiteboard-events", "whiteboard-snapshot", "whiteboard-asset"])(
    "%s: the token carries validUntil = now + the configured lifetime",
    async (kind) => {
      const cb = await captureCallback();
      const before = Date.now();
      const opts = await cb("whiteboard-sessions/stu_1/wb_1/1-file", wbPayload(kind), false);
      const after = Date.now();
      expect(typeof opts.validUntil).toBe("number");
      expect(opts.validUntil!).toBeGreaterThanOrEqual(before + BLOB_UPLOAD_TOKEN_LIFETIME_MS);
      expect(opts.validUntil!).toBeLessThanOrEqual(after + BLOB_UPLOAD_TOKEN_LIFETIME_MS);
    }
  );

  it("audio tokens are unchanged (no validUntil)", async () => {
    const cb = await captureCallback();
    const opts = await cb("sessions/stu_1/1.webm", JSON.stringify({ kind: "audio", studentId: "stu_1" }), false);
    expect(opts.validUntil).toBeUndefined();
  });

  it("the lifetime is shorter than the platform default and long enough for a 25 MiB asset on a slow link", () => {
    // Independent bounds: the platform default is one hour; 25 MiB at ~0.35 Mbit/s is ~600 s.
    expect(BLOB_UPLOAD_TOKEN_LIFETIME_MS).toBeLessThan(60 * 60_000);
    expect(BLOB_UPLOAD_TOKEN_LIFETIME_MS).toBeGreaterThanOrEqual((25 * 1024 * 1024 * 8) / 350_000 * 1000 - 1_000);
  });

  it("the purge's second pass waits longer than a token minted at End can live, plus the recorder's persist interval", () => {
    expect(BOARD_PURGE_SECOND_PASS_DELAY_MS).toBeGreaterThan(BLOB_UPLOAD_TOKEN_LIFETIME_MS + 1_000);
  });
});
