/**
 * @jest-environment node
 *
 * ER-3 access-suspension integration tests (BLOCKERs G, H).
 *
 * Proves session create/start guards and content-route denial during active
 * erasure, with restore after cancel.
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  redirect: jest.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT to ${url}`);
    (err as Error & { digest: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

jest.mock("@vercel/blob", () => ({
  __esModule: true,
  put: jest.fn(),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock("@/lib/revalidateStudentSharePages", () => ({
  __esModule: true,
  revalidateStudentSharePages: jest.fn().mockResolvedValue(undefined),
}));

const requireStudentScopeMock = jest.fn();
const getStudentScopeMock = jest.fn();
const assertOwnsStudentMock = jest.fn();
const assertOwnsWhiteboardSessionMock = jest.fn();

jest.mock("@/lib/student-scope", () => {
  // Lazy require the real assertStudentNotErased so the erasure DB check
  // still fires through the real implementation even though the ownership
  // assertion is mocked out.
  const { assertStudentNotErased: realAssertStudentNotErased } =
    jest.requireActual("@/lib/erasure/assert-student-not-erased");

  return {
    __esModule: true,
    requireStudentScope: () => requireStudentScopeMock(),
    getStudentScope: () => getStudentScopeMock(),
    assertOwnsStudent: (id: string) => assertOwnsStudentMock(id),
    /**
     * assertOwnsMutableStudent: pass ownership mock + run real erasure check
     * so the DB-backed suspension gate fires in integration tests.
     */
    assertOwnsMutableStudent: async (id: string) => {
      await assertOwnsStudentMock(id);
      await realAssertStudentNotErased(id);
    },
  };
});

jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
}));

import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { hashLearnerPin } from "@/lib/account-holder-auth";
import {
  createWhiteboardSession,
  startWhiteboardSession,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { ErasureAccessSuspendedError } from "@/lib/erasure/active-erasure-scope";
import {
  assertStudentNotErasedApi,
} from "@/lib/erasure/assert-student-not-erased";
import { requestErasureByAdmin } from "@/lib/erasure/request-erasure-by-admin";
import { cancelErasureJob } from "@/lib/erasure/process-erasure-job";
import {
  createNote,
  regenerateShareLink,
  revokeShareLink,
  generateNoteFromTextAction,
  setNoteStatus,
  updateNote,
  deleteNote,
} from "@/app/admin/students/[id]/actions";
import { GET as getEvents } from "@/app/api/whiteboard/[sessionId]/events/route";
import { GET as getSnapshot } from "@/app/api/whiteboard/[sessionId]/snapshot/route";
import { GET as getTutorAsset } from "@/app/api/whiteboard/[sessionId]/tutor-asset/route";
import { GET as getAudio } from "@/app/api/audio/admin/[recordingId]/route";
import { uniq } from "../../__tests__/helpers/unique-test-token";

const ADMIN_ID = "00000000-0000-4000-8000-00000000e8a0";
const putMock = put as jest.MockedFunction<typeof put>;


const defaultAdminScope = {
  kind: "admin" as const,
  adminId: "admin-er3",
  email: "tutor-er3@example.com",
};

const defaultBlobResult = {
  url: "https://blob.example.com/events/test.json",
  pathname: "x",
  contentType: "application/json",
  contentDisposition: "",
  downloadUrl: "x",
} as Awaited<ReturnType<typeof put>>;

beforeAll(async () => {
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "erasure_job_active_scope"
      ON "ErasureJob"("scopeKind", "scopeId")
      WHERE "status" NOT IN ('completed', 'failed', 'canceled')
  `);
});

beforeEach(() => {
  jest.clearAllMocks();
  requireStudentScopeMock.mockResolvedValue(defaultAdminScope);
  getStudentScopeMock.mockResolvedValue(defaultAdminScope);
  assertOwnsStudentMock.mockResolvedValue(undefined);
  putMock.mockResolvedValue(defaultBlobResult);
  process.env.BLOB_READ_WRITE_TOKEN = "test_token";
});

afterAll(async () => {
  await db.$disconnect();
});

async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      familyId: `fam_${uniq()}`,
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "ER3 Learner",
      accessMode: "child_pin_required",
    },
  });
}

async function createStudent(adminUserId: string, learnerProfileId: string) {
  return db.student.create({
    data: {
      name: "ER3 Student",
      adminUserId,
      learnerProfileId,
    },
  });
}

async function seedConsent(tutorId: string, learnerProfileId: string, ahId: string) {
  await db.consentRecord.create({
    data: {
      learnerProfileId,
      adminUserId: tutorId,
      version: 1,
      allowLiveSession: true,
      allowAudioRecording: true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ahId,
    },
  });
}

async function createErasureFixture() {
  const tutor = await createTutor();
  const ah = await createAccountHolder();
  const lp = await createLearnerProfile(ah.id);
  const student = await createStudent(tutor.id, lp.id);
  await seedConsent(tutor.id, lp.id, ah.id);
  await db.learnerCredential.create({
    data: {
      learnerProfileId: lp.id,
      accountHolderId: ah.id,
      username: `kid_${uniq()}`,
      secretHash: await hashLearnerPin("123456"),
    },
  });
  return { tutor, ah, lp, student };
}

describe("ER-3 — createWhiteboardSession erasure guard (BLOCKER G)", () => {
  it("blocks session create when student has active ErasureJob", async () => {
    const { tutor, lp, student } = await createErasureFixture();
    requireStudentScopeMock.mockResolvedValue({
      ...defaultAdminScope,
      adminId: tutor.id,
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      ErasureAccessSuspendedError
    );
    expect(putMock).not.toHaveBeenCalled();
  });

  it("allows session create when no active erasure", async () => {
    const { tutor, student } = await createErasureFixture();
    requireStudentScopeMock.mockResolvedValue({
      ...defaultAdminScope,
      adminId: tutor.id,
    });

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    expect(putMock).toHaveBeenCalled();
  });

  it("restores session create after cancel-restore", async () => {
    const { tutor, lp, student } = await createErasureFixture();
    requireStudentScopeMock.mockResolvedValue({
      ...defaultAdminScope,
      adminId: tutor.id,
    });

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      ErasureAccessSuspendedError
    );

    await cancelErasureJob(jobId);

    await expect(createWhiteboardSession(student.id)).rejects.toThrow(
      /NEXT_REDIRECT/
    );
    expect(putMock).toHaveBeenCalled();
  });
});

describe("ER-3 — startWhiteboardSession erasure guard (BLOCKER G)", () => {
  it("blocks session start when student has active ErasureJob", async () => {
    const { tutor, lp, student } = await createErasureFixture();
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/events/pending.json",
        eventsSchemaVersion: 1,
        sessionPhase: "PENDING",
      },
    });

    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: session.id,
      studentId: student.id,
      adminUserId: tutor.id,
      endedAt: null,
      eventsBlobUrl: session.eventsBlobUrl,
      consentAcknowledged: true,
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(startWhiteboardSession(session.id)).rejects.toThrow(
      ErasureAccessSuspendedError
    );
  });

  it("allows session start when no active erasure", async () => {
    const { tutor, student } = await createErasureFixture();
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: "https://blob.example.com/events/ok.json",
        eventsSchemaVersion: 1,
        sessionPhase: "PENDING",
      },
    });

    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: session.id,
      studentId: student.id,
      adminUserId: tutor.id,
      endedAt: null,
      eventsBlobUrl: session.eventsBlobUrl,
      consentAcknowledged: true,
    });

    const result = await startWhiteboardSession(session.id);
    expect(result).toEqual({ ok: true, phase: "active" });
  });
});

describe("ER-3 — content route denial during active erasure (BLOCKER H)", () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  async function createContentFixture() {
    const { tutor, lp, student } = await createErasureFixture();
    const eventsBlobUrl = "https://blob.example.com/events/content.json";
    const snapshotBlobUrl = "https://blob.example.com/snapshots/content.png";
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl,
        snapshotBlobUrl,
        eventsSchemaVersion: 1,
      },
    });
    const note = await db.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date(),
        topics: "",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
      },
    });
    const recording = await db.sessionRecording.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        noteId: note.id,
        whiteboardSessionId: session.id,
        blobUrl: "https://blob.example.com/audio/content.webm",
        mimeType: "audio/webm",
        sizeBytes: 512,
      },
    });
    return { tutor, lp, student, session, recording, eventsBlobUrl, snapshotBlobUrl };
  }

  it("assertStudentNotErasedApi denies during grace and allows after cancel", async () => {
    const { lp, student } = await createContentFixture();

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    const blocked = await assertStudentNotErasedApi(student.id);
    expect(blocked!.status).toBe(404);

    await cancelErasureJob(jobId);

    expect(await assertStudentNotErasedApi(student.id)).toBeNull();
  });

  it("assertStudentNotErasedApi denies during purge (erasedAt set)", async () => {
    const { student } = await createContentFixture();

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    const blocked = await assertStudentNotErasedApi(student.id);
    expect(blocked!.status).toBe(404);
  });

  it("events/snapshot/tutor-asset/audio routes return 404 during active erasure", async () => {
    const fixture = await createContentFixture();

    getStudentScopeMock.mockResolvedValue({
      kind: "admin",
      adminId: fixture.tutor.id,
      email: "tutor-er3@example.com",
    });

    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: fixture.session.id,
      studentId: fixture.student.id,
      adminUserId: fixture.tutor.id,
      eventsBlobUrl: fixture.eventsBlobUrl,
      snapshotBlobUrl: fixture.snapshotBlobUrl,
      endedAt: new Date(),
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "ER3 Learner"
    );

    const eventsRes = await getEvents(
      new Request(`http://localhost/api/whiteboard/${fixture.session.id}/events`),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(eventsRes.status).toBe(404);

    const snapshotRes = await getSnapshot(
      new Request(`http://localhost/api/whiteboard/${fixture.session.id}/snapshot`),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(snapshotRes.status).toBe(404);

    const assetUrl = encodeURIComponent(
      `https://blob.example.com/whiteboard-sessions/${fixture.tutor.id}/${fixture.student.id}/asset.png`
    );
    const assetRes = await getTutorAsset(
      new Request(
        `http://localhost/api/whiteboard/${fixture.session.id}/tutor-asset?u=${assetUrl}`
      ),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(assetRes.status).toBe(404);

    const audioRes = await getAudio(
      new Request(`http://localhost/api/audio/admin/${fixture.recording.id}`),
      { params: Promise.resolve({ recordingId: fixture.recording.id }) }
    );
    expect(audioRes.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ER-3 TUTOR-CONTENT GATE — mutations blocked by assertOwnsMutableStudent
// ---------------------------------------------------------------------------

describe("ER-3 — tutor content mutations blocked during active erasure (BLOCKER H extension)", () => {
  const THROW_NOT_FOUND = "NEXT_NOT_FOUND";

  it("createNote throws not-found during grace period", async () => {
    const { lp, student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    const formData = new FormData();
    formData.set("date", "2026-07-09");
    formData.set("topics", "test");
    formData.set("homework", "");
    formData.set("assessment", "");
    formData.set("plan", "");
    formData.set("links", "");

    await expect(createNote(student.id, formData)).rejects.toThrow(THROW_NOT_FOUND);
  });

  it("createNote succeeds after erasure job cancelled", async () => {
    const { lp, student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await cancelErasureJob(jobId);

    const formData = new FormData();
    formData.set("date", "2026-07-09");
    formData.set("topics", "math fractions");
    formData.set("homework", "");
    formData.set("assessment", "");
    formData.set("plan", "");
    formData.set("links", "");

    const result = await createNote(student.id, formData);
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
  });

  it("createNote throws not-found when student is fully purged (erasedAt set)", async () => {
    const { student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    await db.student.update({
      where: { id: student.id },
      data: { erasedAt: new Date() },
    });

    const formData = new FormData();
    formData.set("date", "2026-07-09");
    formData.set("topics", "test");
    formData.set("homework", "");
    formData.set("assessment", "");
    formData.set("plan", "");
    formData.set("links", "");

    await expect(createNote(student.id, formData)).rejects.toThrow(THROW_NOT_FOUND);
  });

  it("regenerateShareLink throws not-found during grace period", async () => {
    const { lp, student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(regenerateShareLink(student.id)).rejects.toThrow(THROW_NOT_FOUND);
  });

  it("revokeShareLink throws not-found during grace period", async () => {
    const { lp, student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(revokeShareLink(student.id)).rejects.toThrow(THROW_NOT_FOUND);
  });

  it("setNoteStatus / updateNote / deleteNote throw not-found during grace", async () => {
    const { lp, student } = await createErasureFixture();
    assertOwnsStudentMock.mockResolvedValue(undefined);

    const note = await db.sessionNote.create({
      data: {
        studentId: student.id,
        date: new Date(),
        topics: "existing topics",
        homework: "",
        assessment: "",
        nextSteps: "",
        linksJson: "[]",
      },
    });

    await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: lp.id },
      "ER3 Learner"
    );

    await expect(setNoteStatus(note.id, student.id, "READY")).rejects.toThrow(THROW_NOT_FOUND);

    const updateFormData = new FormData();
    updateFormData.set("date", "2026-07-09");
    updateFormData.set("topics", "updated");
    updateFormData.set("homework", "");
    updateFormData.set("assessment", "");
    updateFormData.set("plan", "");
    updateFormData.set("links", "");
    await expect(updateNote(note.id, student.id, updateFormData)).rejects.toThrow(THROW_NOT_FOUND);

    await expect(deleteNote(note.id, student.id)).rejects.toThrow(THROW_NOT_FOUND);
  });
});
