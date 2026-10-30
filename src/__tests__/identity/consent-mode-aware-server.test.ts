/**
 * @jest-environment node
 *
 * Block B Commit 3a — mode-aware server consent gates (B-5, B-6, H-6, M-6).
 *
 * T-new-D: enqueueChunkTranscriptionAction mode-aware consent
 * T-new-E: endWhiteboardSession LIVE+denied registers segments
 * M-6:     no snapshot + claimed non-self → fail-closed
 *
 * DB: tutoring_notes_test via jest.global-setup.ts
 */

jest.mock("next/navigation", () => ({
  __esModule: true,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

jest.mock("next/cache", () => ({
  __esModule: true,
  revalidatePath: jest.fn(),
}));
jest.mock("next/server", () => ({
  __esModule: true,
  after: (fn: () => unknown) => {
    void fn();
  },
}));

jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  createActionCorrelationId: () => "rid_mode_aware_test",
}));

const assertOwnsWhiteboardSessionMock = jest.fn();
jest.mock("@/lib/whiteboard-scope", () => ({
  __esModule: true,
  assertOwnsWhiteboardSession: (id: string) =>
    assertOwnsWhiteboardSessionMock(id),
}));

const requireStudentScopeMock = jest.fn();
jest.mock("@/lib/student-scope", () => ({
  __esModule: true,
  requireStudentScope: () => requireStudentScopeMock(),
  assertOwnsStudent: jest.fn(),
}));

const enqueueChunkTranscribeMock = jest.fn();
jest.mock("@/lib/recording/chunk-transcribe-enqueue", () => ({
  __esModule: true,
  enqueueChunkTranscribe: (job: unknown) => enqueueChunkTranscribeMock(job),
}));

jest.mock("@vercel/blob", () => ({ __esModule: true, put: jest.fn() }));
jest.mock("@/lib/transcribe", () => ({
  __esModule: true,
  mapWithConcurrency: jest.fn(),
  transcribeAudio: jest.fn(),
}));
jest.mock("@/lib/ai", () => ({
  __esModule: true,
  generateSessionNote: jest.fn(),
  estimateTokens: jest.fn(),
  MAX_INPUT_TOKENS: 4096,
}));
jest.mock("@/app/admin/students/[id]/transcribe-result", () => ({
  __esModule: true,
  buildTranscribeAndGenerateResult: jest.fn(),
  FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE: "timeout",
  shouldTreatAsTranscriptionTimeout: jest.fn(),
}));
jest.mock("@/lib/whisper-guardrails", () => ({
  __esModule: true,
  looksLikeSilenceHallucination: jest.fn(),
}));
jest.mock("@/lib/date-only", () => ({
  __esModule: true,
  parseDateOnlyInput: jest.fn(),
}));
jest.mock("@/lib/revalidateStudentSharePages", () => ({
  __esModule: true,
  revalidateStudentSharePages: jest.fn(),
}));
jest.mock("@/lib/env", () => ({
  __esModule: true,
  env: { OPENAI_API_KEY: "test-key" },
}));
const mockNotesChatCreate = jest.fn();
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockNotesChatCreate } },
  })),
}));
jest.mock("@/lib/observability/cost-events", () => ({
  __esModule: true,
  estimateCostUsd: jest.fn().mockReturnValue(0.001),
  logCostEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/tutor-approval-scope", () => ({
  __esModule: true,
  assertTutorApproved: jest.fn().mockResolvedValue(undefined),
  isTutorApproved: jest.fn().mockResolvedValue(true),
}));

import { db } from "@/lib/db";
import {
  createSessionConsentSnapshot,
  resolveSessionCapabilities,
} from "@/lib/consent-scope";
import { acceptsAudioSegments } from "@/lib/recording/session-capabilities";
import {
  endWhiteboardSession,
  enqueueChunkTranscriptionAction,
  type EndSessionSegment,
} from "@/app/admin/students/[id]/whiteboard/actions";
import { triggerNotesGenerationAction } from "@/app/admin/students/[id]/whiteboard/notes-actions";
import { uniq } from "../helpers/unique-test-token";

// ---------------------------------------------------------------------------
// Helpers (mirrors consent-b2.test.ts)
// ---------------------------------------------------------------------------


async function createTutor() {
  return db.adminUser.create({
    data: {
      email: `${uniq("tutor")}@example.com`,
      role: "TUTOR",
      approvalStatus: "APPROVED",
    },
  });
}

async function createAccountHolder(opts?: { isSelfLearner?: boolean }) {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createLearnerProfile(
  accountHolderId: string,
  opts?: { isSelfLearner?: boolean }
) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
      isSelfLearner: opts?.isSelfLearner ?? false,
    },
  });
}

async function createStudent(adminUserId: string, learnerProfileId?: string | null) {
  return db.student.create({
    data: {
      name: "Test Student",
      adminUserId,
      learnerProfileId: learnerProfileId ?? null,
    },
  });
}

async function createConsentRecord(
  learnerProfileId: string,
  adminUserId: string,
  version: number,
  overrides?: Partial<{ allowAudioRecording: boolean }>
) {
  const ah = await db.learnerProfile.findUniqueOrThrow({
    where: { id: learnerProfileId },
    select: { accountHolderId: true },
  });
  return db.consentRecord.create({
    data: {
      learnerProfileId,
      adminUserId,
      version,
      allowLiveSession: true,
      allowAudioRecording: overrides?.allowAudioRecording ?? true,
      allowWhiteboardRecording: true,
      allowNoteSending: true,
      setByAccountHolderId: ah.accountHolderId,
      captureMethod: "electronic",
    },
  });
}

type SessionSetupOpts = {
  sessionMode: "LIVE" | "IN_PERSON";
  allowAudioRecording: boolean;
  withSnapshot: boolean;
  /** Latest ConsentRecord without a session snapshot. */
  consentRecordWithoutSnapshot?: boolean;
  isSelfLearner?: boolean;
  claimed?: boolean;
  sessionPhase?: "PENDING" | "ACTIVE";
};

async function setupActiveSession(opts: SessionSetupOpts) {
  const tutor = await createTutor();
  const claimed = opts.claimed !== false;
  let profileId: string | null = null;

  if (claimed) {
    const ah = await createAccountHolder({ isSelfLearner: opts.isSelfLearner });
    const profile = await createLearnerProfile(ah.id, {
      isSelfLearner: opts.isSelfLearner,
    });
    profileId = profile.id;
    if (opts.withSnapshot || opts.consentRecordWithoutSnapshot) {
      await createConsentRecord(profile.id, tutor.id, 1, {
        allowAudioRecording: opts.allowAudioRecording,
      });
    }
  }

  const student = await createStudent(tutor.id, profileId);
  const eventsUrl = `https://abc.blob.vercel-storage.com/test-${uniq()}.json`;
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      consentAcknowledged: true,
      eventsBlobUrl: eventsUrl,
      eventsSchemaVersion: 1,
      sessionMode: opts.sessionMode,
      sessionPhase: opts.sessionPhase ?? "ACTIVE",
      startedAt: new Date(Date.now() - 60_000),
    },
  });

  if (opts.withSnapshot && profileId) {
    await db.$transaction(async (tx) => {
      await createSessionConsentSnapshot(tx, session.id, profileId, tutor.id);
    });
  }

  assertOwnsWhiteboardSessionMock.mockResolvedValue({
    id: session.id,
    adminUserId: tutor.id,
    studentId: student.id,
    consentAcknowledged: true,
    eventsBlobUrl: eventsUrl,
    endedAt: null,
  });

  requireStudentScopeMock.mockResolvedValue({
    kind: "admin",
    adminId: tutor.id,
    email: tutor.email,
  });

  return { tutor, student, session, eventsUrl };
}

const VALID_CHUNK_URL =
  "https://abc.blob.vercel-storage.com/wb-audio/chunk-test.webm";

function makeSegment(sessionId: string): EndSessionSegment {
  return {
    blobUrl: `https://abc.blob.vercel-storage.com/wb-audio/${sessionId}-seg.webm`,
    mimeType: "audio/webm",
    sizeBytes: 2048,
    audioStartedAtMs: 1_700_000_000_000,
    streamId: "tutor:mic",
    segmentId: `seg-${sessionId}`,
  };
}

// ---------------------------------------------------------------------------

afterAll(async () => {
  await db.$disconnect();
});

beforeEach(() => {
  enqueueChunkTranscribeMock.mockReset();
  enqueueChunkTranscribeMock.mockResolvedValue(undefined);
  assertOwnsWhiteboardSessionMock.mockReset();
  requireStudentScopeMock.mockReset();
});

// ---------------------------------------------------------------------------
// resolveSessionCapabilities — the one server answer (real DB). Oracle: the plan's truth table and § 2.2 / § 2.6
// semantics, written as literal expectations.
// ---------------------------------------------------------------------------

describe("resolveSessionCapabilities", () => {
  it("LIVE + audio off → tutor_only: the learner's voice is out, the server still accepts the tutor mixdown", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const caps = await resolveSessionCapabilities(session.id);
    expect(caps.audio.mode).toBe("tutor_only");
    expect(caps.transcript).toEqual({ tutorVoice: true, learnerVoice: false });
    expect(acceptsAudioSegments(caps)).toBe(true);
  });

  it("IN_PERSON + audio off → none: nothing is accepted, no transcript, nothing to draft from", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const caps = await resolveSessionCapabilities(session.id);
    expect(caps.audio.mode).toBe("none");
    expect(acceptsAudioSegments(caps)).toBe(false);
    expect(caps.transcript).toEqual({ tutorVoice: false, learnerVoice: false });
    expect(caps.notes.draft).toBe(false);
    expect(caps.off).toEqual(["audio"]);
  });

  it("audio on → full in both modes", async () => {
    for (const sessionMode of ["LIVE", "IN_PERSON"] as const) {
      const { session } = await setupActiveSession({ sessionMode, allowAudioRecording: true, withSnapshot: true });
      const caps = await resolveSessionCapabilities(session.id);
      expect(caps.audio.mode).toBe("full");
      expect(acceptsAudioSegments(caps)).toBe(true);
    }
  });

  it("M-6: no snapshot + claimed learner with no record → fails closed (nothing captured, stored or drafted)", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: true,
      withSnapshot: false,
      claimed: true,
    });
    const caps = await resolveSessionCapabilities(session.id);
    expect(acceptsAudioSegments(caps)).toBe(false);
    expect(caps.whiteboard.persist).toBe(false);
    expect(caps.notes.draft).toBe(false);
    expect(caps.transcript).toEqual({ tutorVoice: false, learnerVoice: false });
  });

  it("no snapshot + self-learner with no ConsentRecord → fails closed", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: true,
      withSnapshot: false,
      isSelfLearner: true,
    });
    expect(acceptsAudioSegments(await resolveSessionCapabilities(session.id))).toBe(false);
  });

  it("no snapshot + unclaimed learner → legacy: nothing is restricted", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: false,
      claimed: false,
    });
    const caps = await resolveSessionCapabilities(session.id);
    expect(caps.audio.mode).toBe("full");
    expect(caps.whiteboard.persist).toBe(true);
    expect(caps.off).toEqual([]);
  });

  it("no snapshot + self-learner record with audio off, in person → none", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: false,
      consentRecordWithoutSnapshot: true,
      isSelfLearner: true,
    });
    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("none");
  });

  it("no snapshot + self-learner record with audio on → full", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: false,
      consentRecordWithoutSnapshot: true,
      isSelfLearner: true,
    });
    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("full");
  });

  it("snapshot present + self-learner audio off, in person → none", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder({ isSelfLearner: true });
    const profile = await createLearnerProfile(ah.id, { isSelfLearner: true });
    const record = await createConsentRecord(profile.id, tutor.id, 1, {
      allowAudioRecording: false,
    });
    const student = await createStudent(tutor.id, profile.id);
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: `https://abc.blob.vercel-storage.com/test-${uniq()}.json`,
        eventsSchemaVersion: 1,
        sessionMode: "IN_PERSON",
        sessionPhase: "ACTIVE",
        startedAt: new Date(),
      },
    });
    await db.sessionConsentSnapshot.create({
      data: {
        whiteboardSessionId: session.id,
        allowLiveSession: true,
        allowAudioRecording: false,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        consentRecordId: record.id,
        consentRecordVersion: record.version,
      },
    });

    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("none");
  });

  it("an unknown session id fails closed", async () => {
    const caps = await resolveSessionCapabilities("no-such-session");
    expect(acceptsAudioSegments(caps)).toBe(false);
    expect(caps.whiteboard.persist).toBe(false);
  });

  it("notesForbidden stops drafting and transcription even with every toggle on", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: true,
      withSnapshot: true,
    });
    await db.whiteboardSession.update({ where: { id: session.id }, data: { notesForbidden: true } });
    const caps = await resolveSessionCapabilities(session.id);
    expect(caps.notes.draft).toBe(false);
    expect(caps.transcript).toEqual({ tutorVoice: false, learnerVoice: false });
    expect(caps.audio.mode).toBe("full");
  });

  it("an ACTIVE session answers from its frozen snapshot, not from a later change to the live record", async () => {
    const { session, student } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: true,
    });
    const profileId = (await db.student.findUniqueOrThrow({ where: { id: student.id } })).learnerProfileId!;
    const ownerId = session.adminUserId;
    await createConsentRecord(profileId, ownerId, 2, { allowAudioRecording: false });

    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("full");
  });

  // plan § 2.2 / § 2.6: while PENDING (nothing recorded yet) the live record decides, so a parent who flips a
  // switch after the tutor opened the room is respected immediately. Red on the old snapshot-only gate.
  it("a PENDING session answers from the LIVE record, not the snapshot frozen at create", async () => {
    const { session, student } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: true,
      sessionPhase: "PENDING",
    });
    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("full");

    const profileId = (await db.student.findUniqueOrThrow({ where: { id: student.id } })).learnerProfileId!;
    await createConsentRecord(profileId, session.adminUserId, 2, { allowAudioRecording: false });

    const caps = await resolveSessionCapabilities(session.id);
    expect(caps.audio.mode).toBe("none");
    expect(acceptsAudioSegments(caps)).toBe(false);
  });

  it("a PENDING session applies the child's restriction to the live record (child floor)", async () => {
    const { session, student } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: true,
      sessionPhase: "PENDING",
    });
    const profileId = (await db.student.findUniqueOrThrow({ where: { id: student.id } })).learnerProfileId!;
    await db.consentRestriction.create({ data: { learnerProfileId: profileId, restrictAudioRecording: true } });

    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("none");
  });

  it("the consent owner is the Student row's owner: an organization student reads the organization's record", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const profile = await createLearnerProfile(ah.id);
    const org = await db.organization.create({
      data: { name: uniq("caps-org"), createdByOperatorId: "caps-op@test.local" },
      select: { id: true },
    });
    const student = await db.student.create({
      data: { name: "Org Student", adminUserId: null, organizationId: org.id, learnerProfileId: profile.id },
    });
    // The organization allows audio; a private tutor's record for the same learner forbids it.
    await db.consentRecord.create({
      data: {
        learnerProfileId: profile.id,
        organizationId: org.id,
        version: 1,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
        setByAccountHolderId: ah.id,
        captureMethod: "electronic",
      },
    });
    await createConsentRecord(profile.id, tutor.id, 1, { allowAudioRecording: false });
    const session = await db.whiteboardSession.create({
      data: {
        adminUserId: tutor.id,
        studentId: student.id,
        consentAcknowledged: true,
        eventsBlobUrl: `https://abc.blob.vercel-storage.com/test-${uniq()}.json`,
        eventsSchemaVersion: 1,
        sessionMode: "IN_PERSON",
        sessionPhase: "PENDING",
      },
    });

    expect((await resolveSessionCapabilities(session.id)).audio.mode).toBe("full");
  });

  it("accepts a transaction client and gives the same answer inside it", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const outside = await resolveSessionCapabilities(session.id);
    const inside = await db.$transaction((tx) => resolveSessionCapabilities(session.id, tx));
    expect(inside).toEqual(outside);
  });
});

// ---------------------------------------------------------------------------
// T-new-D — enqueueChunkTranscriptionAction
// ---------------------------------------------------------------------------

describe("T-new-D — enqueueChunkTranscriptionAction mode-aware consent", () => {
  it("IN_PERSON + allowAudioRecording=false → early return, NOT enqueued", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: true,
    });

    await enqueueChunkTranscriptionAction(session.id, {
      chunkBlobUrl: VALID_CHUNK_URL,
      recordingTimeOffsetMs: 5000,
    });

    expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
  });

  it("LIVE + allowAudioRecording=false → enqueues (tutor-only path)", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: false,
      withSnapshot: true,
    });

    await enqueueChunkTranscriptionAction(session.id, {
      chunkBlobUrl: VALID_CHUNK_URL,
      recordingTimeOffsetMs: 5000,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        chunkBlobUrl: VALID_CHUNK_URL,
        recordingTimeOffsetMs: 5000,
      })
    );
  });

  it("full consent (allowAudioRecording=true) → enqueues", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: true,
    });

    await enqueueChunkTranscriptionAction(session.id, {
      chunkBlobUrl: VALID_CHUNK_URL,
      recordingTimeOffsetMs: 10_000,
    });

    expect(enqueueChunkTranscribeMock).toHaveBeenCalledTimes(1);
  });

  it("M-6: no snapshot + claimed non-self → NOT enqueued", async () => {
    const { session } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: true,
      withSnapshot: false,
    });

    await enqueueChunkTranscriptionAction(session.id, {
      chunkBlobUrl: VALID_CHUNK_URL,
      recordingTimeOffsetMs: 0,
    });

    expect(enqueueChunkTranscribeMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T-new-E — endWhiteboardSession
// ---------------------------------------------------------------------------

describe("T-new-E — endWhiteboardSession mode-aware segment registration", () => {
  it("LIVE + allowAudioRecording=false → segments REGISTERED", async () => {
    const { session, eventsUrl } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const segment = makeSegment(session.id);

    const result = await endWhiteboardSession(session.id, eventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(1);

    const rows = await db.sessionRecording.findMany({
      where: { whiteboardSessionId: session.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blobUrl).toBe(segment.blobUrl);
  });

  it("IN_PERSON + allowAudioRecording=false → segments SKIPPED", async () => {
    const { session, eventsUrl } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const segment = makeSegment(session.id);

    const result = await endWhiteboardSession(session.id, eventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(0);

    const rows = await db.sessionRecording.findMany({
      where: { whiteboardSessionId: session.id },
    });
    expect(rows).toHaveLength(0);
  });

  it("full consent IN_PERSON → segments REGISTERED (positive pair)", async () => {
    const { session, eventsUrl } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: true,
      withSnapshot: true,
    });
    const segment = makeSegment(session.id);

    const result = await endWhiteboardSession(session.id, eventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(1);
  });

  it("M-6: no snapshot + claimed non-self → segments SKIPPED", async () => {
    const { session, eventsUrl } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: true,
      withSnapshot: false,
    });
    const segment = makeSegment(session.id);

    const result = await endWhiteboardSession(session.id, eventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(0);
  });

  it("self-learner in person with audio off → segments SKIPPED", async () => {
    const { session, eventsUrl } = await setupActiveSession({
      sessionMode: "IN_PERSON",
      allowAudioRecording: false,
      withSnapshot: true,
      isSelfLearner: true,
    });
    const segment = makeSegment(session.id);

    const result = await endWhiteboardSession(session.id, eventsUrl, {
      segments: [segment],
    });

    expect(result.registeredSegments).toBe(0);

    const rows = await db.sessionRecording.findMany({
      where: { whiteboardSessionId: session.id },
    });
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CF-4/MB-5 — tutor_only LIVE notes pipeline (local DB + mocked OpenAI)
// ---------------------------------------------------------------------------

describe("CF-4 — tutor_only LIVE notes reduce pipeline", () => {
  beforeEach(() => {
    mockNotesChatCreate.mockReset();
  });

  it("LIVE + allowAudioRecording=false → enqueue → reduce → TutorNote done", async () => {
    const { session, tutor, eventsUrl } = await setupActiveSession({
      sessionMode: "LIVE",
      allowAudioRecording: false,
      withSnapshot: true,
    });
    const chunkUrl = `https://abc.blob.vercel-storage.com/wb-audio/${session.id}-chunk.webm`;

    await enqueueChunkTranscriptionAction(session.id, {
      chunkBlobUrl: chunkUrl,
      recordingTimeOffsetMs: 5000,
    });
    expect(enqueueChunkTranscribeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.id,
        chunkBlobUrl: chunkUrl,
      })
    );

    const segment = makeSegment(session.id);
    await endWhiteboardSession(session.id, eventsUrl, { segments: [segment] });

    const sealed = await db.whiteboardSession.findUniqueOrThrow({
      where: { id: session.id },
      select: { endedAt: true },
    });
    expect(sealed.endedAt).not.toBeNull();

    await db.transcriptChunk.create({
      data: {
        sessionId: session.id,
        chunkBlobUrl: chunkUrl,
        recordingTimeOffsetMs: 5000,
        durationMs: 30_000,
        transcript: "Tutor explained quadratic equations.",
        status: "done",
        transcribedAt: new Date(),
      },
    });

    assertOwnsWhiteboardSessionMock.mockResolvedValue({
      id: session.id,
      adminUserId: tutor.id,
      studentId: session.studentId,
      consentAcknowledged: true,
      eventsBlobUrl: eventsUrl,
      endedAt: sealed.endedAt,
    });

    mockNotesChatCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              topics: "Quadratic equations",
              assessment: "Solid progress",
              nextSteps: "Practice factoring",
              links: "",
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const triggerResult = await triggerNotesGenerationAction(session.id);
    expect(triggerResult).toEqual({ ok: true });

    // Mocked `after()` runs reduce inline — brief yield for async completion.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const note = await db.tutorNote.findUnique({
      where: { sessionId: session.id },
    });
    expect(note?.status).toBe("done");
    expect(note?.content).toBeTruthy();
  });
});
