/**
 * @jest-environment node
 *
 * Share-link erasure guard integration tests (BLOCKER H completeness).
 *
 * Proves family-facing /s/[token] pages and public-* / share-audio API routes
 * deny during active ErasureJob grace and restore after cancel-restore.
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
import { hashLearnerPin } from "@/lib/account-holder-auth";
import { generateShareToken } from "@/lib/security";
import { assertStudentNotErased } from "@/lib/erasure/assert-student-not-erased";
import { requestErasureByAdmin } from "@/lib/erasure/request-erasure-by-admin";
import { cancelErasureJob } from "@/lib/erasure/process-erasure-job";
import { assertCanAccessShareLink } from "@/lib/share-access-scope";
import { GET as getPublicEvents } from "@/app/api/whiteboard/[sessionId]/public-events/route";
import { GET as getPublicSnapshot } from "@/app/api/whiteboard/[sessionId]/public-snapshot/route";
import { GET as getShareAudio } from "@/app/api/audio/[recordingId]/route";
import { uniq } from "../../__tests__/helpers/unique-test-token";

const ADMIN_ID = "00000000-0000-4000-8000-00000000e8a1";
const originalFetch = global.fetch;
const fetchMock = jest.fn();
const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});


beforeAll(async () => {
  await db.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "erasure_job_active_scope"
      ON "ErasureJob"("scopeKind", "scopeId")
      WHERE "status" NOT IN ('completed', 'failed', 'canceled')
  `);
});

beforeEach(() => {
  jest.clearAllMocks();
  consoleErrorSpy.mockClear();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  streamBlobWithRangeSupportMock.mockReset();
  process.env.NOTES_AUTH_WALL = "false";
  process.env.BLOB_READ_WRITE_TOKEN = "test_token";
});

afterAll(async () => {
  global.fetch = originalFetch;
  consoleErrorSpy.mockRestore();
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
      displayName: "Share ER Learner",
      accessMode: "child_pin_required",
    },
  });
}

async function createStudent(adminUserId: string, learnerProfileId: string) {
  return db.student.create({
    data: {
      name: "Share ER Student",
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

async function createShareFixture() {
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

  const shareToken = generateShareToken();
  await db.shareLink.create({
    data: { studentId: student.id, token: shareToken },
  });

  const eventsBlobUrl = "https://blob.example.com/events/share-public.json";
  const snapshotBlobUrl = "https://blob.example.com/snapshots/share-public.png";
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl,
      snapshotBlobUrl,
      eventsSchemaVersion: 1,
      endedAt: new Date("2026-06-01T18:00:00Z"),
    },
  });

  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-06-01T00:00:00Z"),
      topics: "Share topics",
      homework: "",
      assessment: "",
      nextSteps: "",
      linksJson: "[]",
      status: "READY",
      shareRecordingInEmail: true,
    },
  });

  const recording = await db.sessionRecording.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      whiteboardSessionId: session.id,
      blobUrl: "https://blob.example.com/audio/share-public.webm",
      mimeType: "audio/webm",
      sizeBytes: 1024,
    },
  });

  return {
    tutor,
    lp,
    student,
    shareToken,
    session,
    recording,
    eventsBlobUrl,
    snapshotBlobUrl,
  };
}

function mockBlobFetchOk(body = '{"events":[]}') {
  fetchMock.mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockBlobSnapshotOk() {
  fetchMock.mockResolvedValue(
    new Response(Buffer.from("png"), {
      status: 200,
      headers: { "Content-Type": "image/png" },
    }) as unknown as Response
  );
}

describe("share-link erasure guards — API routes (BLOCKER H)", () => {
  it("public-events returns 404 during active erasure and 200 after cancel", async () => {
    const fixture = await createShareFixture();
    mockBlobFetchOk();

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    const blocked = await getPublicEvents(
      new Request(
        `http://localhost/api/whiteboard/${fixture.session.id}/public-events?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(blocked.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ers] action=content_access_denied")
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[sal] sal=")
    );

    await cancelErasureJob(jobId);
    mockBlobFetchOk();

    const restored = await getPublicEvents(
      new Request(
        `http://localhost/api/whiteboard/${fixture.session.id}/public-events?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(restored.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("public-snapshot returns 404 during active erasure and 200 after cancel", async () => {
    const fixture = await createShareFixture();
    mockBlobSnapshotOk();

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    const blocked = await getPublicSnapshot(
      new Request(
        `http://localhost/api/whiteboard/${fixture.session.id}/public-snapshot?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(blocked.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    await cancelErasureJob(jobId);
    mockBlobSnapshotOk();

    const restored = await getPublicSnapshot(
      new Request(
        `http://localhost/api/whiteboard/${fixture.session.id}/public-snapshot?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ sessionId: fixture.session.id }) }
    );
    expect(restored.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("share audio returns 404 during active erasure and 200 after cancel", async () => {
    const fixture = await createShareFixture();
    streamBlobWithRangeSupportMock.mockResolvedValue(
      new Response("audio", {
        status: 200,
        headers: { "Content-Type": "audio/webm", "Content-Length": "5" },
      })
    );

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    const blocked = await getShareAudio(
      new Request(
        `http://localhost/api/audio/${fixture.recording.id}?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ recordingId: fixture.recording.id }) }
    );
    expect(blocked.status).toBe(404);
    expect(streamBlobWithRangeSupportMock).not.toHaveBeenCalled();

    await cancelErasureJob(jobId);

    const restored = await getShareAudio(
      new Request(
        `http://localhost/api/audio/${fixture.recording.id}?token=${fixture.shareToken}`
      ),
      { params: Promise.resolve({ recordingId: fixture.recording.id }) }
    );
    expect(restored.status).toBe(200);
    expect(streamBlobWithRangeSupportMock).toHaveBeenCalled();
  });
});

describe("share-link erasure guards — /s/[token] pages (BLOCKER H)", () => {
  async function assertSharePageGuard(
    shareToken: string,
    sharePagePath: string
  ): Promise<void> {
    const access = await assertCanAccessShareLink(shareToken, sharePagePath);
    await assertStudentNotErased(access.studentId, { salToken: shareToken });
  }

  it("main notes page guard denies during grace and allows after cancel", async () => {
    const fixture = await createShareFixture();
    const pagePath = `/s/${fixture.shareToken}`;

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    await cancelErasureJob(jobId);

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).resolves.toBeUndefined();
  });

  it("all-notes page guard denies during grace and allows after cancel", async () => {
    const fixture = await createShareFixture();
    const pagePath = `/s/${fixture.shareToken}/all`;

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    await cancelErasureJob(jobId);

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).resolves.toBeUndefined();
  });

  it("whiteboard replay page guard denies during grace and allows after cancel", async () => {
    const fixture = await createShareFixture();
    const pagePath = `/s/${fixture.shareToken}/whiteboard/${fixture.session.id}`;

    const { jobId } = await requestErasureByAdmin(
      ADMIN_ID,
      { kind: "learner_profile", learnerProfileId: fixture.lp.id },
      "Share ER Learner"
    );

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).rejects.toThrow(
      "NEXT_NOT_FOUND"
    );

    await cancelErasureJob(jobId);

    await expect(assertSharePageGuard(fixture.shareToken, pagePath)).resolves.toBeUndefined();
  });
});
