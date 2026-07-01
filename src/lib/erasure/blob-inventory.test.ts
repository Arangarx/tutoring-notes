/**
 * @jest-environment node
 *
 * E3 erasure blob inventory enumerator — unit/integration tests.
 *
 * Coverage:
 *   Test 9 — events.json embedded assetUrl(s) via collectReplayAssetUrls
 *   SessionRecording.blobUrl, snapshotBlobUrl, TranscriptChunk.chunkBlobUrl
 *   Checkpoint prefix list results
 *   Scope exclusion — out-of-scope learner/family not included
 *   Account-holder scope aggregates multiple learner profiles/students
 *   Fetch failure on one events.json does not abort enumeration
 *
 * DB: tutoring_notes_test via jest.global-setup.ts.
 * Blob: mocked — no real Vercel Blob store calls.
 */

const mockList = jest.fn();
const mockFetchPrivateBlobBytes = jest.fn();

jest.mock("@vercel/blob", () => ({
  list: (...args: unknown[]) => mockList(...args),
}));

jest.mock("@/lib/blob", () => ({
  fetchPrivateBlobBytes: (...args: unknown[]) => mockFetchPrivateBlobBytes(...args),
}));

import { db } from "@/lib/db";
import {
  WB_EVENT_LOG_SCHEMA_VERSION,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";
import {
  enumerateLearnerFamilyBlobs,
  resolveErasureScopeStudents,
} from "@/lib/erasure/blob-inventory";

let uniqueSuffix = 0;
function uniq(prefix = "ers-inv") {
  return `${prefix}-${Date.now()}-${++uniqueSuffix}`;
}

async function createTutor() {
  return db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR" },
  });
}

async function createAccountHolder() {
  return db.accountHolder.create({
    data: {
      email: `${uniq("ah")}@example.com`,
      emailVerifiedAt: new Date(),
    },
  });
}

async function createLearnerProfile(accountHolderId: string) {
  return db.learnerProfile.create({
    data: {
      accountHolderId,
      displayName: "Test Learner",
    },
  });
}

async function createStudent(adminUserId: string, learnerProfileId: string) {
  return db.student.create({
    data: { name: "Test Student", adminUserId, learnerProfileId },
  });
}

type SessionBlobUrls = {
  eventsBlobUrl: string;
  snapshotBlobUrl?: string | null;
};

async function createWhiteboardSession(
  adminUserId: string,
  studentId: string,
  blobs: SessionBlobUrls
) {
  return db.whiteboardSession.create({
    data: {
      adminUserId,
      studentId,
      consentAcknowledged: true,
      eventsBlobUrl: blobs.eventsBlobUrl,
      snapshotBlobUrl: blobs.snapshotBlobUrl ?? null,
      eventsSchemaVersion: 1,
    },
  });
}

async function createSessionRecording(
  adminUserId: string,
  studentId: string,
  blobUrl: string,
  whiteboardSessionId?: string
) {
  return db.sessionRecording.create({
    data: {
      adminUserId,
      studentId,
      blobUrl,
      mimeType: "audio/webm",
      sizeBytes: 1024,
      whiteboardSessionId: whiteboardSessionId ?? null,
    },
  });
}

async function createTranscriptChunk(sessionId: string, chunkBlobUrl: string) {
  return db.transcriptChunk.create({
    data: {
      sessionId,
      chunkBlobUrl,
      recordingTimeOffsetMs: 0,
      status: "done",
    },
  });
}

function buildEventsLogWithAssets(assetUrls: string[]): WBEventLog {
  return {
    schemaVersion: WB_EVENT_LOG_SCHEMA_VERSION,
    startedAt: new Date().toISOString(),
    durationMs: 1000,
    events: assetUrls.map((assetUrl, i) => ({
      t: i * 100,
      type: "add" as const,
      element: {
        id: `el-${i}`,
        type: "image" as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        assetUrl,
      },
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue({ blobs: [], hasMore: false, cursor: undefined });
});

afterAll(async () => {
  await db.$disconnect();
});

// ---------------------------------------------------------------------------
// Test 9 + all blob sources
// ---------------------------------------------------------------------------

describe("enumerateLearnerFamilyBlobs — blob sources", () => {
  it("returns eventsBlobUrl, embedded asset URLs, recording, snapshot, chunk, and checkpoint URLs", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    const eventsBlobUrl = `https://blob.example.com/events/${uniq()}.json`;
    const snapshotBlobUrl = `https://blob.example.com/snapshots/${uniq()}.png`;
    const embeddedAsset1 = `https://blob.example.com/wb-assets/${uniq()}.png`;
    const embeddedAsset2 = `https://blob.example.com/wb-assets/${uniq()}.png`;
    const recordingBlobUrl = `https://blob.example.com/sessions/${student.id}/${uniq()}.webm`;
    const chunkBlobUrl = `https://blob.example.com/chunks/${uniq()}.webm`;
    const checkpointUrl = `https://blob.example.com/whiteboard-checkpoints/cp-${uniq()}.json`;

    const session = await createWhiteboardSession(tutor.id, student.id, {
      eventsBlobUrl,
      snapshotBlobUrl,
    });
    await createSessionRecording(tutor.id, student.id, recordingBlobUrl, session.id);
    await createTranscriptChunk(session.id, chunkBlobUrl);

    const eventsLog = buildEventsLogWithAssets([embeddedAsset1, embeddedAsset2]);
    mockFetchPrivateBlobBytes.mockResolvedValue({
      buffer: Buffer.from(JSON.stringify(eventsLog), "utf8"),
      contentType: "application/json",
    });
    mockList.mockImplementation(async (opts: { prefix?: string }) => {
      if (opts.prefix === `whiteboard-checkpoints/${session.id}/`) {
        return {
          blobs: [{ url: checkpointUrl, pathname: "x", size: 1, uploadedAt: new Date() }],
          hasMore: false,
        };
      }
      return { blobs: [], hasMore: false };
    });

    const { urls, eventsFetchFailures } = await enumerateLearnerFamilyBlobs({
      kind: "learner_profile",
      id: lp.id,
    });

    expect(eventsFetchFailures).toBe(0);
    expect(urls.has(eventsBlobUrl)).toBe(true);
    expect(urls.has(snapshotBlobUrl)).toBe(true);
    expect(urls.has(recordingBlobUrl)).toBe(true);
    expect(urls.has(chunkBlobUrl)).toBe(true);
    expect(urls.has(embeddedAsset1)).toBe(true);
    expect(urls.has(embeddedAsset2)).toBe(true);
    expect(urls.has(checkpointUrl)).toBe(true);

    expect(mockFetchPrivateBlobBytes).toHaveBeenCalledWith(eventsBlobUrl);
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: `whiteboard-checkpoints/${session.id}/` })
    );
  });
});

// ---------------------------------------------------------------------------
// Scope correctness
// ---------------------------------------------------------------------------

describe("enumerateLearnerFamilyBlobs — scope", () => {
  it("excludes students and sessions belonging to a different learner profile", async () => {
    const tutor = await createTutor();
    const ahInScope = await createAccountHolder();
    const ahOut = await createAccountHolder();
    const lpInScope = await createLearnerProfile(ahInScope.id);
    const lpOut = await createLearnerProfile(ahOut.id);

    const studentIn = await createStudent(tutor.id, lpInScope.id);
    const studentOut = await createStudent(tutor.id, lpOut.id);

    const inEventsUrl = `https://blob.example.com/in-scope/${uniq()}.json`;
    const outEventsUrl = `https://blob.example.com/out-scope/${uniq()}.json`;
    const inRecordingUrl = `https://blob.example.com/in-rec/${uniq()}.webm`;
    const outRecordingUrl = `https://blob.example.com/out-rec/${uniq()}.webm`;

    const sessionIn = await createWhiteboardSession(tutor.id, studentIn.id, {
      eventsBlobUrl: inEventsUrl,
    });
    await createWhiteboardSession(tutor.id, studentOut.id, {
      eventsBlobUrl: outEventsUrl,
    });
    await createSessionRecording(tutor.id, studentIn.id, inRecordingUrl, sessionIn.id);
    await createSessionRecording(tutor.id, studentOut.id, outRecordingUrl);

    mockFetchPrivateBlobBytes.mockResolvedValue({
      buffer: Buffer.from(JSON.stringify(buildEventsLogWithAssets([])), "utf8"),
      contentType: "application/json",
    });

    const { urls } = await enumerateLearnerFamilyBlobs({
      kind: "learner_profile",
      id: lpInScope.id,
    });

    expect(urls.has(inEventsUrl)).toBe(true);
    expect(urls.has(inRecordingUrl)).toBe(true);
    expect(urls.has(outEventsUrl)).toBe(false);
    expect(urls.has(outRecordingUrl)).toBe(false);
  });

  it("account_holder scope aggregates blobs across multiple learner profiles and students", async () => {
    const tutor1 = await createTutor();
    const tutor2 = await createTutor();
    const ah = await createAccountHolder();
    const lp1 = await createLearnerProfile(ah.id);
    const lp2 = await createLearnerProfile(ah.id);

    const student1 = await createStudent(tutor1.id, lp1.id);
    const student2 = await createStudent(tutor2.id, lp2.id);

    const events1 = `https://blob.example.com/fam-ev1/${uniq()}.json`;
    const events2 = `https://blob.example.com/fam-ev2/${uniq()}.json`;
    const rec1 = `https://blob.example.com/fam-rec1/${uniq()}.webm`;
    const rec2 = `https://blob.example.com/fam-rec2/${uniq()}.webm`;

    await createWhiteboardSession(tutor1.id, student1.id, { eventsBlobUrl: events1 });
    await createWhiteboardSession(tutor2.id, student2.id, { eventsBlobUrl: events2 });
    await createSessionRecording(tutor1.id, student1.id, rec1);
    await createSessionRecording(tutor2.id, student2.id, rec2);

    mockFetchPrivateBlobBytes.mockResolvedValue({
      buffer: Buffer.from(JSON.stringify(buildEventsLogWithAssets([])), "utf8"),
      contentType: "application/json",
    });

    const { urls } = await enumerateLearnerFamilyBlobs({
      kind: "account_holder",
      id: ah.id,
    });

    expect(urls.has(events1)).toBe(true);
    expect(urls.has(events2)).toBe(true);
    expect(urls.has(rec1)).toBe(true);
    expect(urls.has(rec2)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fetch failure tolerance
// ---------------------------------------------------------------------------

describe("enumerateLearnerFamilyBlobs — fetch failures", () => {
  it("continues enumeration when one events.json fetch fails; counts the failure", async () => {
    const tutor = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const student = await createStudent(tutor.id, lp.id);

    const goodEventsUrl = `https://blob.example.com/good/${uniq()}.json`;
    const badEventsUrl = `https://blob.example.com/bad/${uniq()}.json`;
    const goodAssetUrl = `https://blob.example.com/good-asset/${uniq()}.png`;
    const goodRecordingUrl = `https://blob.example.com/good-rec/${uniq()}.webm`;

    await createWhiteboardSession(tutor.id, student.id, { eventsBlobUrl: goodEventsUrl });
    await createWhiteboardSession(tutor.id, student.id, { eventsBlobUrl: badEventsUrl });
    await createSessionRecording(tutor.id, student.id, goodRecordingUrl);

    mockFetchPrivateBlobBytes.mockImplementation(async (url: string) => {
      if (url === badEventsUrl) {
        throw new Error("HTTP 404 Not Found");
      }
      return {
        buffer: Buffer.from(
          JSON.stringify(buildEventsLogWithAssets([goodAssetUrl])),
          "utf8"
        ),
        contentType: "application/json",
      };
    });

    const { urls, eventsFetchFailures } = await enumerateLearnerFamilyBlobs({
      kind: "learner_profile",
      id: lp.id,
    });

    expect(eventsFetchFailures).toBe(1);
    expect(urls.has(goodEventsUrl)).toBe(true);
    expect(urls.has(badEventsUrl)).toBe(true);
    expect(urls.has(goodAssetUrl)).toBe(true);
    expect(urls.has(goodRecordingUrl)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveErasureScopeStudents
// ---------------------------------------------------------------------------

describe("resolveErasureScopeStudents", () => {
  it("returns all students for a learner profile including multi-tutor links", async () => {
    const tutor1 = await createTutor();
    const tutor2 = await createTutor();
    const ah = await createAccountHolder();
    const lp = await createLearnerProfile(ah.id);
    const s1 = await createStudent(tutor1.id, lp.id);
    const s2 = await createStudent(tutor2.id, lp.id);

    const resolved = await resolveErasureScopeStudents({
      kind: "learner_profile",
      id: lp.id,
    });

    expect(resolved.studentIds.sort()).toEqual([s1.id, s2.id].sort());
    expect(resolved.sessionIds).toEqual([]);
  });

  it("returns empty sets when account holder has no learner profiles", async () => {
    const ah = await createAccountHolder();
    const resolved = await resolveErasureScopeStudents({
      kind: "account_holder",
      id: ah.id,
    });
    expect(resolved.studentIds).toEqual([]);
    expect(resolved.sessionIds).toEqual([]);
  });
});
