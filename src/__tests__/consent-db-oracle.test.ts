/**
 * Self-test for the consent DB oracle helpers (consent wave C0).
 *
 * The helper (`tests/helpers/consent-db-oracle.ts`) is what later waves trust to
 * say "nothing was purged / something was written", so it is proven against rows
 * this test writes through the app's own client and counts independently.
 */
import { db } from "@/lib/db";
import {
  BOARD_PURGE_FIRST_PASS_COLUMN_MISSING,
  backdateBoardPurgeFirstPass,
  boardPurgeColumnsExist,
  countEventBatches,
  countRowsBySession,
  expectBatchCount,
} from "../../tests/helpers/consent-db-oracle";
import { uniq } from "./helpers/unique-test-token";

async function fixture() {
  const tutor = await db.adminUser.create({
    data: { email: `${uniq("tutor")}@example.com`, role: "TUTOR", approvalStatus: "APPROVED" },
  });
  const student = await db.student.create({
    data: { name: "Oracle Student", parentEmail: `p-${uniq()}@example.com`, adminUserId: tutor.id },
  });
  const note = await db.sessionNote.create({
    data: {
      studentId: student.id,
      date: new Date("2026-01-15"),
      topics: "t",
      homework: "h",
      nextSteps: "n",
    },
  });
  const session = await db.whiteboardSession.create({
    data: {
      adminUserId: tutor.id,
      studentId: student.id,
      noteId: note.id,
      consentAcknowledged: true,
      eventsBlobUrl: `https://blob.example.com/events/${uniq()}.json`,
    },
  });
  return { tutor, student, note, session };
}

async function addBatch(sessionId: string, seq: number) {
  return db.whiteboardEventBatch.create({
    data: {
      whiteboardSessionId: sessionId,
      batchSeq: seq,
      fromEventIndex: seq * 2,
      toEventIndex: seq * 2 + 1,
      eventsJson: [],
      boardDocumentJson: { schemaVersion: 1, activePageId: "p1", pageList: [], pages: {} },
      schemaVersion: 1,
    },
  });
}

describe("consent DB oracle", () => {
  test("countRowsBySession counts each table by session and groups audio and transcript by streamId", async () => {
    const f = await fixture();
    const other = await fixture();
    await addBatch(f.session.id, 1);
    await addBatch(f.session.id, 2);
    await addBatch(other.session.id, 1);
    for (const [i, streamId] of ["tutor:mic", "tutor:mic", "student:mic"].entries()) {
      await db.sessionRecording.create({
        data: {
          adminUserId: f.tutor.id,
          studentId: f.student.id,
          whiteboardSessionId: f.session.id,
          blobUrl: `https://blob.example.com/${uniq("rec")}.webm`,
          mimeType: "audio/webm",
          sizeBytes: 1,
          orderIndex: i,
          streamId,
        },
      });
    }
    await db.transcriptChunk.create({
      data: {
        sessionId: f.session.id,
        chunkBlobUrl: `https://blob.example.com/${uniq("chunk")}.webm`,
        recordingTimeOffsetMs: 0,
        status: "done",
        streamId: "student:mic",
      },
    });
    await db.tutorNote.create({ data: { sessionId: f.session.id, status: "done", content: "x" } });

    const counts = await countRowsBySession(f.session.id);
    expect(counts).toEqual({
      transcriptChunksByStream: { "student:mic": 1 },
      recordingsByStream: { "tutor:mic": 2, "student:mic": 1 },
      eventBatches: 2,
      tutorNotes: 1,
      sessionNotes: 1,
    });
    // the other session's rows never leak in
    expect(await countRowsBySession(other.session.id)).toMatchObject({
      eventBatches: 1,
      tutorNotes: 0,
      recordingsByStream: {},
      transcriptChunksByStream: {},
    });
  });

  test("a session with nothing written reports zeros (so a purge test needs the positive control)", async () => {
    const f = await fixture();
    expect(await countEventBatches(f.session.id)).toBe(0);
    expect(await countRowsBySession(f.session.id)).toMatchObject({
      eventBatches: 0,
      tutorNotes: 0,
      recordingsByStream: {},
    });
  });

  test("expectBatchCount: positive control passes on written rows and FAILS on an empty session; 0 passes only after delete", async () => {
    const f = await fixture();
    // positive control must fail when nothing was ever written (the whole point of W10)
    await expect(expectBatchCount(f.session.id, "some", { timeout: 500 })).rejects.toThrow();
    // 0 must fail while a row exists
    await addBatch(f.session.id, 1);
    await expect(expectBatchCount(f.session.id, 0, { timeout: 500 })).rejects.toThrow();
    await expectBatchCount(f.session.id, "some", { timeout: 2000 });
    await db.whiteboardEventBatch.deleteMany({ where: { whiteboardSessionId: f.session.id } });
    await expectBatchCount(f.session.id, 0, { timeout: 2000 });
  });

  test("backdateBoardPurgeFirstPass: clear error before the C4b column exists; moves the stamp back by exactly ms after", async () => {
    const f = await fixture();
    if (!(await boardPurgeColumnsExist())) {
      await expect(backdateBoardPurgeFirstPass(f.session.id, 1000)).rejects.toThrow(
        BOARD_PURGE_FIRST_PASS_COLUMN_MISSING
      );
      return;
    }
    // C4b has landed: stamp, backdate, compare against the stamp we wrote (independent arithmetic).
    const stamp = new Date("2026-03-01T12:00:00.000Z");
    await db.$executeRaw`UPDATE "WhiteboardSession" SET "boardPurgeFirstPassAt" = ${stamp} WHERE id = ${f.session.id}`;
    expect(await backdateBoardPurgeFirstPass(f.session.id, 90_000)).toBe(1);
    const rows = await db.$queryRaw<{ t: Date }[]>`SELECT "boardPurgeFirstPassAt" AS t FROM "WhiteboardSession" WHERE id = ${f.session.id}`;
    expect(rows[0].t.getTime()).toBe(stamp.getTime() - 90_000);
    // a session whose first pass has not stamped is untouched
    const unstamped = await fixture();
    expect(await backdateBoardPurgeFirstPass(unstamped.session.id, 90_000)).toBe(0);
  });
});
