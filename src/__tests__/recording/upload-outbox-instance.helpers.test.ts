/**
 * @jest-environment jsdom
 */

/**
 * Tests for the Phase 1b End-session glue helpers exported from
 * `upload-outbox-instance`:
 *
 *   - `drainOutboxOrTimeout` — wraps `outbox.drainAndAwait`
 *   - `assembleEndSessionSegments` — converts uploaded outbox rows
 *     into the atomic `endWhiteboardSession` payload
 *   - `finalizeOutboxAfterEnd` — clears the outbox after the server
 *     transaction commits
 *
 * Each helper is a thin adapter around the outbox factory's public
 * methods. The point of these tests is to pin the SHAPE of the
 * adapter — what fields end up in the EndSessionSegment, what we
 * skip when blobRemoteUrl is null, what we do when there's no
 * IndexedDB at all. Worker semantics + retry behaviour are tested
 * in `upload-outbox.test.ts`.
 */

import "fake-indexeddb/auto";

import {
  drainOutboxOrTimeout,
  assembleEndSessionSegments,
  finalizeOutboxAfterEnd,
  setUploadOutboxForTests,
  resetUploadOutboxForTests,
} from "@/lib/recording/upload-outbox-instance";
import {
  createUploadOutbox,
  type OutboxUploadResult,
  type OutboxUploadFn,
} from "@/lib/recording/upload-outbox";

const NEVER_CALLED_UPLOADER: OutboxUploadFn = async () => {
  throw new Error("uploader should not be invoked in these tests");
};

afterEach(() => {
  resetUploadOutboxForTests();
});

describe("assembleEndSessionSegments", () => {
  test("returns empty array when the outbox has no rows for the session", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    const segs = await assembleEndSessionSegments("wbs-empty");
    expect(segs).toEqual([]);
  });

  test("converts uploaded rows into the EndSessionSegment shape (1:1 field map)", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-shape",
      streamId: "tutor:mic",
      segmentId: "seg-1",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/seg-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 4096,
      audioStartedAtMs: 1_700_000_001_000,
    });

    const segs = await assembleEndSessionSegments("wbs-shape");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({
      blobUrl: "https://abc.blob.vercel-storage.com/seg-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 4096,
      audioStartedAtMs: 1_700_000_001_000,
      streamId: "tutor:mic",
      segmentId: "seg-1",
    });
  });

  test("skips rows that don't yet have a blobRemoteUrl", async () => {
    // Uploader that never finishes — so the row stays "pending" in
    // the outbox. We don't kick the worker here because the row is
    // enqueued with `blobRemoteUrl: null` and our uploader would be
    // called; we use a successful uploader that returns a url so
    // we can prove the helper filtering is independent of "did
    // upload succeed at all".
    const sometimesUploader: OutboxUploadFn = async (
      row
    ): Promise<OutboxUploadResult> => {
      if (row.segmentId === "seg-uploaded") {
        return {
          ok: true,
          blobUrl: "https://abc.blob.vercel-storage.com/uploaded.webm",
        };
      }
      // Permanent failure for the not-uploaded path so the worker
      // doesn't loop infinitely.
      return { ok: false, error: "test-fail" };
    };
    const outbox = createUploadOutbox({
      upload: sometimesUploader,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
      backoffMsByAttempt: [0],
      permanentFailAfter: 1,
    });
    setUploadOutboxForTests(outbox);

    // One row with an upload-ready blob.
    await outbox.enqueue({
      sessionId: "wbs-mixed",
      streamId: "tutor:mic",
      segmentId: "seg-uploaded",
      blobLocalRef: new Blob([new Uint8Array(4)], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 4,
      audioStartedAtMs: 100,
    });
    // One row that will fail and stay un-uploaded.
    await outbox.enqueue({
      sessionId: "wbs-mixed",
      streamId: "tutor:mic",
      segmentId: "seg-pending",
      blobLocalRef: new Blob([new Uint8Array(8)], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 8,
      audioStartedAtMs: 200,
    });
    // Let the worker run.
    await outbox.drainAndAwait("wbs-mixed", { timeoutMs: 1_000 });

    const segs = await assembleEndSessionSegments("wbs-mixed");
    expect(segs).toHaveLength(1);
    expect(segs[0].segmentId).toBe("seg-uploaded");
  });

  test("preserves multi-stream ordering (createdAt then streamId)", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    // Enqueue tutor first (lower createdAt), then student.
    await outbox.enqueue({
      sessionId: "wbs-multi",
      streamId: "tutor:mic",
      segmentId: "tutor-1",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/tutor-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 100,
      audioStartedAtMs: 1_000,
    });
    await outbox.enqueue({
      sessionId: "wbs-multi",
      streamId: "student:peer-1:mic",
      segmentId: "student-1",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/student-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 200,
      audioStartedAtMs: 1_000,
    });

    const segs = await assembleEndSessionSegments("wbs-multi");
    // listUploadedSegments sorts by (createdAt, streamId, segmentId).
    // The two enqueues land in the same millisecond, so streamId
    // tie-breaks — "student:..." sorts before "tutor:...". This is
    // the same ordering the server then re-derives by (audioStartedAtMs,
    // streamId), so the round-trip is consistent.
    expect(segs.map((s) => s.segmentId)).toEqual(["student-1", "tutor-1"]);
  });
});

describe("drainOutboxOrTimeout", () => {
  test("returns immediately when there's nothing to drain", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    const result = await drainOutboxOrTimeout("wbs-drain-empty", 5_000);
    expect(result.timedOut).toBe(false);
    expect(result.remainingCount).toBe(0);
  });

  test("returns timedOut=true when uploads can't finish in the budget", async () => {
    const slowUploader: OutboxUploadFn = () =>
      new Promise<OutboxUploadResult>(() => {
        /* never resolves — simulates an indefinitely-stuck worker */
      });
    const outbox = createUploadOutbox({
      upload: slowUploader,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
      backoffMsByAttempt: [0],
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-stuck",
      streamId: "tutor:mic",
      segmentId: "stuck-1",
      blobLocalRef: new Blob([new Uint8Array(4)], { type: "audio/webm" }),
      mimeType: "audio/webm",
      sizeBytes: 4,
      audioStartedAtMs: 1,
    });

    const result = await drainOutboxOrTimeout("wbs-stuck", 50);
    expect(result.timedOut).toBe(true);
    expect(result.remainingCount).toBeGreaterThan(0);
  });
});

describe("finalizeOutboxAfterEnd", () => {
  test("deletes every row for the session so the next mount starts empty", async () => {
    const outbox = createUploadOutbox({
      upload: NEVER_CALLED_UPLOADER,
      dbName: `outbox-helpers-${Math.random().toString(36).slice(2)}`,
    });
    setUploadOutboxForTests(outbox);

    await outbox.enqueue({
      sessionId: "wbs-fin",
      streamId: "tutor:mic",
      segmentId: "fin-1",
      blobLocalRef: null,
      blobRemoteUrl: "https://abc.blob.vercel-storage.com/fin-1.webm",
      mimeType: "audio/webm",
      sizeBytes: 100,
      audioStartedAtMs: 1,
    });
    expect(await outbox.listAllRows("wbs-fin")).toHaveLength(1);

    await finalizeOutboxAfterEnd("wbs-fin");

    expect(await outbox.listAllRows("wbs-fin")).toEqual([]);
  });
});
