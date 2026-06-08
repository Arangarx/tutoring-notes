/**
 * B1 privacy regression: sendUpdateEmail must exclude DRAFT auto-notes.
 *
 * Slice-3 auto-creates a DRAFT SessionNote on every whiteboard session end.
 * Before the fix, sendUpdateEmail swept DRAFT notes into three operations:
 *   (1) noteCount — counted DRAFTs, inflating the parent-visible count
 *   (2) latestNote — could surface DRAFT topics in the email body
 *   (3) updateMany — could flip DRAFT → SENT, permanently marking it sent
 *
 * This suite proves red-before/green-after for all three query call-sites by
 * asserting the Prisma where-clause arguments passed to each db call.
 *
 * Red state (pre-fix):
 *   (1) db.sessionNote.count called with { where: { studentId } }           → assertion on status.not fails
 *   (2) db.sessionNote.findFirst called with { where: { studentId } }        → assertion on status.not fails
 *   (3) db.sessionNote.updateMany called with { in: ["READY","DRAFT"] }      → assertion on status: "READY" fails
 *
 * Green state (post-fix):
 *   (1) db.sessionNote.count: status: { not: "DRAFT" }                       → passes
 *   (2) db.sessionNote.findFirst: status: { not: "DRAFT" }                   → passes
 *   (3) db.sessionNote.updateMany: status: "READY"                           → passes
 *
 * All DB / email / auth calls are mocked — no live DB or network.
 */

// ---------------------------------------------------------------------------
// Mocks (must be before imports)
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: {
    shareLink: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    student: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    sessionNote: {
      count: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    emailMessage: {
      create: jest.fn(),
    },
  },
  withDbRetry: jest.fn((fn: () => unknown) => fn()),
  isTransientDbConnectionError: jest.fn(() => false),
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendMail: jest.fn(),
}));

jest.mock("@/lib/security", () => ({
  __esModule: true,
  generateShareToken: jest.fn(() => "tok-test"),
  parseLinksFromTextarea: jest.fn(() => []),
}));

jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  assertOwnsStudent: jest.fn().mockResolvedValue(undefined),
  requireStudentScope: jest.fn(),
  getStudentScope: jest.fn(),
}));

jest.mock("next-auth", () => ({
  __esModule: true,
  getServerSession: jest.fn(),
}));

jest.mock("@/auth-options", () => ({
  __esModule: true,
  authOptions: {},
}));

jest.mock("@/lib/auth-db", () => ({
  __esModule: true,
  getAdminByEmail: jest.fn(),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/revalidateStudentSharePages", () => ({
  __esModule: true,
  revalidateStudentSharePages: jest.fn().mockResolvedValue(undefined),
}));

// Heavy imports not needed for this test path
jest.mock("@/lib/ai", () => ({
  __esModule: true,
  generateSessionNote: jest.fn(),
  estimateTokens: (s: string) => Math.ceil(s.length / 4),
  MAX_INPUT_TOKENS: 30000,
}));
jest.mock("@/lib/transcribe", () => ({
  __esModule: true,
  transcribeAudio: jest.fn(),
  mapWithConcurrency: jest.fn(),
}));
jest.mock("@/lib/blob", () => ({
  __esModule: true,
  getAudioUrl: jest.fn(),
  getBlobMetadata: jest.fn(),
  deleteBlob: jest.fn(),
}));
jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "test-rid",
}));
jest.mock("@/lib/date-only", () => ({
  __esModule: true,
  parseDateOnlyInput: (s: string) => {
    const d = new Date(s + "T00:00:00.000Z");
    return Number.isNaN(d.getTime()) ? null : d;
  },
}));
jest.mock("@/lib/whisper-guardrails", () => ({
  __esModule: true,
  looksLikeSilenceHallucination: () => false,
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { sendMail } from "@/lib/email";
import { requireStudentScope } from "@/lib/student-scope";
import { getServerSession } from "next-auth";
import { getAdminByEmail } from "@/lib/auth-db";
import { sendUpdateEmail } from "@/app/admin/students/[id]/actions";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const mockNoteCount = db.sessionNote.count as jest.Mock;
const mockNoteFindFirst = db.sessionNote.findFirst as jest.Mock;
const mockNoteUpdateMany = db.sessionNote.updateMany as jest.Mock;
const mockShareLinkFindFirst = db.shareLink.findFirst as jest.Mock;
const mockShareLinkCreate = db.shareLink.create as jest.Mock;
const mockStudentFindOrThrow = db.student.findUniqueOrThrow as jest.Mock;
const mockStudentUpdate = db.student.update as jest.Mock;
const mockEmailCreate = db.emailMessage.create as jest.Mock;
const mockSendMail = sendMail as jest.Mock;
const mockRequireScope = requireStudentScope as jest.Mock;
const mockGetSession = getServerSession as jest.Mock;
const mockGetAdmin = getAdminByEmail as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STUDENT_ID = "stu-email-test-01";
const ADMIN_ID = "admin-email-test-01";
const SHARE_TOKEN = "tok-test";
const SHARE_LINK = { id: "link-1", token: SHARE_TOKEN, studentId: STUDENT_ID, revokedAt: null };

function makeFormData(): FormData {
  const fd = new FormData();
  fd.set("studentId", STUDENT_ID);
  fd.set("toEmail", "parent@example.com");
  return fd;
}

function setupHappyPath() {
  mockGetSession.mockResolvedValue({ user: { email: "tutor@example.com" } });
  mockGetAdmin.mockResolvedValue({ displayName: "Ms. Tutor" });
  mockShareLinkFindFirst.mockResolvedValue(SHARE_LINK);
  mockShareLinkCreate.mockResolvedValue(SHARE_LINK);
  mockStudentFindOrThrow.mockResolvedValue({ id: STUDENT_ID, name: "Alice" });
  mockStudentUpdate.mockResolvedValue({});
  // Simulate: one READY note exists and one DRAFT auto-note exists
  mockNoteCount.mockResolvedValue(1); // correct count (READY only)
  mockNoteFindFirst.mockResolvedValue({
    id: "note-ready-1",
    studentId: STUDENT_ID,
    status: "READY",
    topics: "Algebra basics",
    date: new Date("2026-06-07"),
  });
  mockNoteUpdateMany.mockResolvedValue({ count: 1 });
  mockEmailCreate.mockResolvedValue({});
  mockSendMail.mockResolvedValue({ sent: true, error: undefined });
  mockRequireScope.mockResolvedValue({ kind: "admin", adminId: ADMIN_ID });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("B1: sendUpdateEmail excludes DRAFT auto-notes (privacy fix)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupHappyPath();
  });

  it("(1) noteCount query excludes DRAFT notes via status: { not: 'DRAFT' }", async () => {
    await sendUpdateEmail(null, makeFormData());

    // Pre-fix: db.sessionNote.count was called with { where: { studentId } } — no status filter.
    // Post-fix: must include status: { not: "DRAFT" }.
    expect(mockNoteCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: STUDENT_ID,
          status: expect.objectContaining({ not: "DRAFT" }),
        }),
      })
    );
  });

  it("(2) latestNote query excludes DRAFT notes via status: { not: 'DRAFT' }", async () => {
    await sendUpdateEmail(null, makeFormData());

    // Pre-fix: db.sessionNote.findFirst was called with { where: { studentId } } — no status filter.
    // Post-fix: must include status: { not: "DRAFT" }.
    expect(mockNoteFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: STUDENT_ID,
          status: expect.objectContaining({ not: "DRAFT" }),
        }),
      })
    );
  });

  it("(3) updateMany only marks READY notes as SENT — DRAFT notes are excluded", async () => {
    await sendUpdateEmail(null, makeFormData());

    // Pre-fix: updateMany where clause was { status: { in: ["READY", "DRAFT"] } } — marked DRAFTs as SENT.
    // Post-fix: must use { status: "READY" } — never touching DRAFTs.
    const call = mockNoteUpdateMany.mock.calls.find(
      (args: unknown[]) =>
        (args[0] as { data?: { status?: string } })?.data?.status === "SENT"
    );
    expect(call).toBeDefined();

    const whereStatus = (call?.[0] as { where?: { status?: unknown } })?.where?.status;

    // Must be exactly "READY" (string), NOT an object with `in: [...]` containing "DRAFT".
    expect(whereStatus).toBe("READY");
    expect(whereStatus).not.toEqual(expect.objectContaining({ in: expect.anything() }));
  });

  it("returns ok:true sent:true when email delivers", async () => {
    const result = await sendUpdateEmail(null, makeFormData());
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(true);
  });

  it("does NOT mark notes SENT when SMTP fails", async () => {
    mockSendMail.mockResolvedValue({ sent: false, error: "SMTP timeout" });

    await sendUpdateEmail(null, makeFormData());

    // On SMTP failure, updateMany should NOT have been called at all.
    expect(mockNoteUpdateMany).not.toHaveBeenCalled();
  });
});
