/**
 * Consent wave C2 against the REAL test database (plan § 2.3; rows A1, A6, A8, A9, N1, N4-N7).
 *
 * Nothing between the worker and Postgres is mocked except the three external effects (blob download, Whisper, the
 * map phase). So the real consent resolution, the real gate, the real lane-preserving upsert and the real status
 * writes all run, and every oracle is a DATABASE ROW (status, streamId, speakerId) or a log line, never a value
 * read back from the code under test.
 */

jest.mock("@/lib/blob", () => ({
  fetchPrivateBlobBytes: jest.fn().mockResolvedValue({ buffer: Buffer.alloc(64, 1), contentType: "audio/webm" }),
}));
jest.mock("@/lib/recording/transcribe-chunk", () => ({
  transcribeChunk: jest.fn().mockResolvedValue({
    transcript: "We worked on factoring.",
    durationMs: 5000,
    modelUsed: "test-model",
  }),
}));
jest.mock("@/lib/recording/extract-chunk", () => ({
  extractChunkMap: jest.fn().mockResolvedValue("done"),
}));
// The notes worker would call OpenAI; these tests only reach it through the gate's refusal path.
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ chat: { completions: { create: jest.fn() } } })),
}));

import { db } from "@/lib/db";
import { fetchPrivateBlobBytes } from "@/lib/blob";
import { transcribeChunk } from "@/lib/recording/transcribe-chunk";
import { processChunkTranscribeJob } from "@/lib/recording/transcription-worker";
import { processNotesReduceJob } from "@/lib/recording/notes-worker";
import {
  findStaleTranscriptChunksForSweep,
  upsertTranscriptChunk,
} from "@/lib/recording/transcript-store";
import { TRANSCRIBE_SWEEP_BATCH_LIMIT } from "@/lib/recording/transcribe-sweep-config";
import { uniq } from "../helpers/unique-test-token";

const mockFetchBlob = fetchPrivateBlobBytes as jest.Mock;
const mockTranscribe = transcribeChunk as jest.Mock;

const TUTOR = "tutor:mic";
const LEARNER = "speaker:learner-1:transcript";

type SessionOpts = {
  audio: boolean;
  notes?: boolean;
  mode?: "LIVE" | "IN_PERSON";
  notesForbidden?: boolean;
  ended?: boolean;
};

async function seedSession(o: SessionOpts) {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
  });
  const student = await db.student.create({
    data: { name: "Lane Student", parentEmail: `p-${uniq()}@example.com`, adminUserId: tutor.id },
  });
  const note = await db.sessionNote.create({
    data: { studentId: student.id, date: new Date("2026-01-15"), topics: "t", homework: "h", nextSteps: "n" },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.example.com/events/${uniq()}.json`,
      sessionPhase: "ACTIVE",
      sessionMode: o.mode ?? "LIVE",
      notesForbidden: o.notesForbidden ?? false,
      endedAt: o.ended === "recent" ? new Date(Date.now() - 1000) : o.ended ? new Date("2026-01-15T12:00:00Z") : null,
      consentSnapshot: {
        create: {
          allowLiveSession: true,
          allowAudioRecording: o.audio,
          allowWhiteboardRecording: true,
          allowNoteSending: o.notes ?? true,
        },
      },
    },
  });
  return session.id;
}

async function seedChunk(sessionId: string, streamId: string, speakerId: string | null, status = "pending") {
  const chunkBlobUrl = `https://blob.example.com/chunks/${uniq()}.webm`;
  const row = await upsertTranscriptChunk({
    sessionId,
    chunkBlobUrl,
    recordingTimeOffsetMs: 0,
    status: status as "pending",
    streamId,
    speakerId,
  });
  return { id: row.id, chunkBlobUrl };
}

async function row(id: string) {
  return db.transcriptChunk.findUniqueOrThrow({ where: { id } });
}

/** Mirrors what the sweep passes: the STORED lane, read straight off the row. */
async function runAsSweep(sessionId: string, chunkId: string) {
  const r = await row(chunkId);
  return processChunkTranscribeJob({
    sessionId,
    chunkBlobUrl: r.chunkBlobUrl,
    recordingTimeOffsetMs: r.recordingTimeOffsetMs,
    streamId: r.streamId,
    speakerId: r.speakerId,
    surface: "sweep",
  });
}

let logs: string[];
beforeEach(() => {
  jest.clearAllMocks();
  mockFetchBlob.mockResolvedValue({ buffer: Buffer.alloc(64, 1), contentType: "audio/webm" });
  mockTranscribe.mockResolvedValue({ transcript: "We worked on factoring.", durationMs: 5000, modelUsed: "test-model" });
  logs = [];
  jest.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(" "));
  });
});
afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// A9 — a stored lane is write-once
// ---------------------------------------------------------------------------
describe("A9: transcript upsert never overwrites a stored lane", () => {
  test("re-upserting with default args leaves streamId and speakerId as created", async () => {
    const sid = await seedSession({ audio: true });
    const { id, chunkBlobUrl } = await seedChunk(sid, LEARNER, "learner-1");

    await upsertTranscriptChunk({ sessionId: sid, chunkBlobUrl, recordingTimeOffsetMs: 7, status: "transcribing" });

    const r = await row(id);
    expect(r.streamId).toBe(LEARNER);
    expect(r.speakerId).toBe("learner-1");
    expect(r.status).toBe("transcribing"); // the update itself did apply
    expect(r.recordingTimeOffsetMs).toBe(7);
  });

  test("re-upserting with an explicit DIFFERENT lane (a relabel attempt) leaves the stored lane", async () => {
    const sid = await seedSession({ audio: true });
    const { id, chunkBlobUrl } = await seedChunk(sid, LEARNER, "learner-1");

    await upsertTranscriptChunk({
      sessionId: sid,
      chunkBlobUrl,
      recordingTimeOffsetMs: 0,
      status: "pending",
      streamId: TUTOR,
      speakerId: null,
    });

    const r = await row(id);
    expect(r.streamId).toBe(LEARNER);
    expect(r.speakerId).toBe("learner-1");
  });

  test("no row in 5 retries drifts the lane (done and failed transitions included)", async () => {
    const sid = await seedSession({ audio: true });
    const { id, chunkBlobUrl } = await seedChunk(sid, LEARNER, "learner-1");
    for (const status of ["transcribing", "failed", "pending", "transcribing", "done"] as const) {
      await upsertTranscriptChunk({ sessionId: sid, chunkBlobUrl, recordingTimeOffsetMs: 0, status });
    }
    const r = await row(id);
    expect({ streamId: r.streamId, speakerId: r.speakerId }).toEqual({ streamId: LEARNER, speakerId: "learner-1" });
  });
});

// ---------------------------------------------------------------------------
// A1 — the allow path (this is what gates the wave)
// ---------------------------------------------------------------------------
describe("A1: audio on, online: tutor and learner voices are both transcribed, each under its own lane", () => {
  test("both chunks reach done, are transcribed, and keep their lanes", async () => {
    const sid = await seedSession({ audio: true });
    const tutor = await seedChunk(sid, TUTOR, null);
    const learner = await seedChunk(sid, LEARNER, "learner-1");

    expect(await runAsSweep(sid, tutor.id)).toBe("done");
    expect(await runAsSweep(sid, learner.id)).toBe("done");

    const t = await row(tutor.id);
    const l = await row(learner.id);
    expect({ status: t.status, streamId: t.streamId, speakerId: t.speakerId }).toEqual({
      status: "done",
      streamId: TUTOR,
      speakerId: null,
    });
    expect({ status: l.status, streamId: l.streamId, speakerId: l.speakerId }).toEqual({
      status: "done",
      streamId: LEARNER,
      speakerId: "learner-1",
    });
    expect(l.transcript).toBe("We worked on factoring.");
    expect(mockTranscribe).toHaveBeenCalledTimes(2);
    expect(logs.some((m) => m.includes("action=refused") || m.includes("learner_lane_refused"))).toBe(false);
  });

  test("in person with audio on, the tutor mic lane is transcribed (A7 allow path)", async () => {
    const sid = await seedSession({ audio: true, mode: "IN_PERSON" });
    const tutor = await seedChunk(sid, TUTOR, null);
    expect(await runAsSweep(sid, tutor.id)).toBe("done");
    expect((await row(tutor.id)).status).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// A8 / A6 — audio off
// ---------------------------------------------------------------------------
describe("A8: audio off, online: a swept learner chunk keeps its lane and is refused; the tutor lane still works", () => {
  test("the learner row ends refused with its stored lane; the tutor row is transcribed", async () => {
    const sid = await seedSession({ audio: false });
    const tutor = await seedChunk(sid, TUTOR, null);
    const learner = await seedChunk(sid, LEARNER, "learner-1");

    expect(await runAsSweep(sid, tutor.id)).toBe("done");
    expect(await runAsSweep(sid, learner.id)).toBe("refused");

    const l = await row(learner.id);
    expect({ status: l.status, streamId: l.streamId, speakerId: l.speakerId }).toEqual({
      status: "refused",
      streamId: LEARNER,
      speakerId: "learner-1",
    });
    expect(l.transcript).toBe("");
    expect((await row(tutor.id)).status).toBe("done");
    // Only the tutor chunk was downloaded and transcribed.
    expect(mockFetchBlob).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(logs).toContain(
      `[cns] wbsid=${sid} action=learner_lane_refused surface=sweep streamId=${LEARNER}`
    );
    expect(logs).toContain(
      `[txc] wbsid=${sid} action=refused reason=audio_off surface=sweep streamId=${LEARNER}`
    );
  });

  test("a retry that omits the lane (the old tutor:mic default path) still refuses and does not relabel the row", async () => {
    const sid = await seedSession({ audio: false });
    const learner = await seedChunk(sid, LEARNER, "learner-1");
    const r = await row(learner.id);

    // The kick/sweep/queue bug class: a caller that lost the lane. The stored lane must win.
    const outcome = await processChunkTranscribeJob({ sessionId: sid, chunkBlobUrl: r.chunkBlobUrl });

    expect(outcome).toBe("refused");
    const after = await row(learner.id);
    expect({ status: after.status, streamId: after.streamId }).toEqual({ status: "refused", streamId: LEARNER });
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  test("a caller claiming tutor:mic for a stored learner chunk is refused and logged as lane_mismatch", async () => {
    const sid = await seedSession({ audio: false });
    const learner = await seedChunk(sid, LEARNER, "learner-1");
    const r = await row(learner.id);

    const outcome = await processChunkTranscribeJob({
      sessionId: sid,
      chunkBlobUrl: r.chunkBlobUrl,
      streamId: TUTOR,
      speakerId: null,
    });

    expect(outcome).toBe("refused");
    expect(logs).toContain(`[cns] wbsid=${sid} action=lane_mismatch stored=${LEARNER} input=${TUTOR}`);
    expect((await row(learner.id)).streamId).toBe(LEARNER);
  });

  test("a refused row is terminal: running it again refuses again without touching blob or Whisper", async () => {
    const sid = await seedSession({ audio: false });
    const learner = await seedChunk(sid, LEARNER, "learner-1");
    await runAsSweep(sid, learner.id);
    mockFetchBlob.mockClear();

    expect(await runAsSweep(sid, learner.id)).toBe("refused");
    expect((await row(learner.id)).status).toBe("refused");
    expect(mockFetchBlob).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
});

describe("A6: audio off: server transcription refuses a learner-lane chunk, and creates no row for it", () => {
  test("a queue-style job for a learner lane with no stored row is refused and writes nothing", async () => {
    const sid = await seedSession({ audio: false });
    const url = `https://blob.example.com/chunks/${uniq()}.webm`;

    const outcome = await processChunkTranscribeJob({
      sessionId: sid,
      chunkBlobUrl: url,
      recordingTimeOffsetMs: 0,
      streamId: LEARNER,
      speakerId: "learner-1",
      surface: "queue",
    });

    expect(outcome).toBe("refused");
    expect(await db.transcriptChunk.count({ where: { sessionId: sid } })).toBe(0);
    expect(mockFetchBlob).not.toHaveBeenCalled();
  });

  test("no row and no lane: skipped, nothing written, never defaulted to the tutor lane", async () => {
    const sid = await seedSession({ audio: true });
    const outcome = await processChunkTranscribeJob({
      sessionId: sid,
      chunkBlobUrl: `https://blob.example.com/chunks/${uniq()}.webm`,
    });
    expect(outcome).toBe("skipped");
    expect(await db.transcriptChunk.count({ where: { sessionId: sid } })).toBe(0);
    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  test("in person with audio off, even the tutor lane is refused", async () => {
    const sid = await seedSession({ audio: false, mode: "IN_PERSON" });
    const tutor = await seedChunk(sid, TUTOR, null);
    expect(await runAsSweep(sid, tutor.id)).toBe("refused");
    expect((await row(tutor.id)).status).toBe("refused");
    expect(mockTranscribe).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// N1 / N7 — notes off, org no-notes
// ---------------------------------------------------------------------------
describe("N1: notes off: nothing is transcribed even though audio is on", () => {
  test("tutor and learner chunks are both refused with reason notes_off", async () => {
    const sid = await seedSession({ audio: true, notes: false });
    const tutor = await seedChunk(sid, TUTOR, null);
    const learner = await seedChunk(sid, LEARNER, "learner-1");

    expect(await runAsSweep(sid, tutor.id)).toBe("refused");
    expect(await runAsSweep(sid, learner.id)).toBe("refused");

    expect((await row(tutor.id)).status).toBe("refused");
    expect((await row(learner.id)).status).toBe("refused");
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(logs).toContain(`[txc] wbsid=${sid} action=refused reason=notes_off surface=sweep streamId=${TUTOR}`);
  });
});

describe("N7: org no-notes session (notesForbidden): nothing is transcribed even with every switch on", () => {
  test("refused with reason notes_forbidden", async () => {
    const sid = await seedSession({ audio: true, notes: true, notesForbidden: true });
    const tutor = await seedChunk(sid, TUTOR, null);
    expect(await runAsSweep(sid, tutor.id)).toBe("refused");
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(logs).toContain(
      `[txc] wbsid=${sid} action=refused reason=notes_forbidden surface=sweep streamId=${TUTOR}`
    );
  });
});

// ---------------------------------------------------------------------------
// N4 / N5 / N6 — notes worker + sweep predicate
// ---------------------------------------------------------------------------
describe("notes worker under the gate", () => {
  test("N5: audio off in person, notes on: no TutorNote row is created for a sealed session", async () => {
    const sid = await seedSession({ audio: false, mode: "IN_PERSON", ended: true });
    const result = await processNotesReduceJob(sid);
    expect(result).toMatchObject({ outcome: "skipped" });
    expect(await db.tutorNote.count({ where: { sessionId: sid } })).toBe(0);
    expect(logs).toContain(`[tnt] wbsid=${sid} action=skip reason=no_audio surface=reduce`);
  });

  test("N1/N4: notes off with a pending row: the row becomes skipped (terminal) and nothing is drafted", async () => {
    const sid = await seedSession({ audio: true, notes: false, ended: true });
    await db.tutorNote.create({ data: { sessionId: sid, status: "pending" } });

    const result = await processNotesReduceJob(sid);

    expect(result).toMatchObject({ outcome: "skipped", reason: "notes_off" });
    const n = await db.tutorNote.findUniqueOrThrow({ where: { sessionId: sid } });
    expect(n.status).toBe("skipped");
    expect(n.content).toBeNull();
  });

  test("N6: refused chunks do not hold the notes reduce in `pending` (a refused chunk is settled; a pending one is not)", async () => {
    // Control: a session just sealed with a still-PENDING chunk waits for it, so `pending` is a reachable outcome.
    const waiting = await seedSession({ audio: false, ended: "recent" });
    await seedChunk(waiting, TUTOR, null, "pending");
    await db.tutorNote.create({ data: { sessionId: waiting, status: "pending" } });
    expect(await processNotesReduceJob(waiting)).toMatchObject({ outcome: "pending" });

    // Same shape, but the only chunk is a REFUSED learner chunk: nothing left to wait for, so the job moves on.
    const settled = await seedSession({ audio: false, ended: "recent" });
    await seedChunk(settled, LEARNER, "learner-1", "refused");
    await db.tutorNote.create({ data: { sessionId: settled, status: "pending" } });
    const result = await processNotesReduceJob(settled);
    expect(result.outcome).not.toBe("pending");
    expect((await db.tutorNote.findUniqueOrThrow({ where: { sessionId: settled } })).status).not.toBe("pending");
  });
  test("a skipped note is settled: a second run does not re-open it", async () => {
    const sid = await seedSession({ audio: true, notes: false, ended: true });
    await db.tutorNote.create({ data: { sessionId: sid, status: "skipped" } });
    await processNotesReduceJob(sid);
    expect((await db.tutorNote.findUniqueOrThrow({ where: { sessionId: sid } })).status).toBe("skipped");
  });
});

describe("N6: refused rows reach a terminal state and cannot starve the sweep", () => {
  const LONG_AGO = new Date("2001-01-01T00:00:00Z");
  const SOON = () => new Date(Date.now() + 60 * 60 * 1000);

  async function backdate(id: string, when: Date) {
    await db.transcriptChunk.update({ where: { id }, data: { updatedAt: when } });
  }

  test("more refused rows than the sweep batch, all OLDER than a pending row: the pending row is still the first selected", async () => {
    const sid = await seedSession({ audio: false });
    // Terminal rows first (oldest), strictly more than one batch of them.
    for (let i = 0; i < TRANSCRIBE_SWEEP_BATCH_LIMIT + 5; i++) {
      const c = await seedChunk(sid, LEARNER, "learner-1", "refused");
      await backdate(c.id, new Date(LONG_AGO.getTime() + i * 1000));
    }
    const pending = await seedChunk(sid, TUTOR, null, "pending");
    await backdate(pending.id, new Date(LONG_AGO.getTime() + 10_000_000));

    const picked = await findStaleTranscriptChunksForSweep({
      staleBefore: SOON(),
      maxAttempts: 5,
      limit: TRANSCRIBE_SWEEP_BATCH_LIMIT,
    });

    const mine = picked.filter((c) => c.sessionId === sid);
    expect(mine.map((c) => c.id)).toEqual([pending.id]);
    expect(mine.some((c) => c.status === "refused")).toBe(false);
  });

  test("a pending learner chunk that the worker refuses is never selected again", async () => {
    const sid = await seedSession({ audio: false });
    const learner = await seedChunk(sid, LEARNER, "learner-1");
    await backdate(learner.id, LONG_AGO);
    const selectMine = async () =>
      (
        await findStaleTranscriptChunksForSweep({ staleBefore: SOON(), maxAttempts: 5, limit: 100_000 })
      ).filter((c) => c.sessionId === sid);

    expect((await selectMine()).map((c) => c.id)).toEqual([learner.id]);
    expect(await runAsSweep(sid, learner.id)).toBe("refused");
    expect(await selectMine()).toEqual([]);
  });

  test("a skipped TutorNote is not a pending/generating note, so the notes sweep cannot reselect it", async () => {
    const sid = await seedSession({ audio: true, notes: false, ended: true });
    await db.tutorNote.create({ data: { sessionId: sid, status: "pending" } });
    await processNotesReduceJob(sid);
    expect((await db.tutorNote.findUniqueOrThrow({ where: { sessionId: sid } })).status).toBe("skipped");

    // The notes sweep reads "oldest 10 pending/generating rows of ended sessions"; an independent restatement of
    // that spec, not an import of its query.
    const sweepable = await db.tutorNote.findMany({
      where: { sessionId: sid, status: { in: ["pending", "generating"] }, session: { endedAt: { not: null } } },
    });
    expect(sweepable).toEqual([]);
  });
});
