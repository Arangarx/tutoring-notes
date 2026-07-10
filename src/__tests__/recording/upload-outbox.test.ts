/**
 * @jest-environment node
 *
 * Pure-function-ish coverage for the Phase 1b upload outbox.
 *
 * Uses fake-indexeddb so the worker, dedupe index, and crash-recovery
 * paths all exercise real IDB semantics under the jest node
 * environment. Backoff durations are overridden to zero so retries
 * happen on the same microtask — saves us minutes of wall-clock when
 * driving the permanent-fail path through 5+ attempts.
 *
 * Test scenarios (per master plan Phase 1 Task 2 + Phase 1b brief):
 *   - enqueue → drains → blob uploaded → marked ready
 *   - enqueue with blobRemoteUrl pre-set (Phase 1b workspace path) →
 *     no upload triggered; row is registering-ready immediately
 *   - upload fails once → retries → succeeds
 *   - upload fails N times → marked permanently failed → observer
 *     state = "failed" → drainAndAwait returns timedOut:false (no
 *     in-flight rows; the failed one is permanent)
 *   - crash mid-upload: enqueue + close + new outbox instance → next
 *     mount drains the pending row
 *   - double-enqueue same (sessionId, streamId, segmentId) → dedupe
 *   - multi-stream concurrent: tutor:mic + student:peer-A:mic drain
 *     in parallel; same-stream serial
 *   - drainAndAwait with timeout: timeout fires, remainingCount > 0
 *   - finalize wipes rows; subsequent observe is idle
 *   - listUploadedSegments returns rows in deterministic order
 */

import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  createUploadOutbox,
  type OutboxRow,
  type OutboxUploadFn,
  type OutboxUploadResult,
  type UploadOutbox,
} from "@/lib/recording/upload-outbox";
import {
  studentMicStreamId,
  TUTOR_MIC_STREAM_ID,
} from "@/lib/recording/lifecycle-machine";

// ----------------------------------------------------------------
// Setup helpers
// ----------------------------------------------------------------

const SILENT_LOGGER = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

function makeBlob(text = "audio-bytes"): Blob {
  return new Blob([text], { type: "audio/webm" });
}

function uniqueDbName(): string {
  // Each test gets its own IDB so parallel jest workers don't collide.
  return `tutoring-notes-upload-outbox-test-${Math.random().toString(36).slice(2)}`;
}

/**
 * Test harness — wraps `createUploadOutbox` with a controllable
 * uploader (queue of canned results) and zero backoff so the worker
 * is instant on the test timeline.
 */
type Harness = {
  outbox: UploadOutbox;
  upload: jest.Mock<Promise<OutboxUploadResult>, [OutboxRow, Blob]>;
  /** Push a canned result for the next upload call. */
  pushResult: (r: OutboxUploadResult) => void;
  /** Replace the default result returned when no specific canned value is queued. */
  setDefaultResult: (r: OutboxUploadResult) => void;
};

function makeHarness(opts: {
  dbName?: string;
  permanentFailAfter?: number;
  backoffMsByAttempt?: ReadonlyArray<number>;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  defaultResult?: OutboxUploadResult;
  onSegmentUploaded?: (row: OutboxRow) => Promise<void>;
}): Harness {
  const queue: OutboxUploadResult[] = [];
  let defaultResult: OutboxUploadResult =
    opts.defaultResult ?? { ok: true, blobUrl: "https://blob.example/x" };
  const upload = jest.fn<Promise<OutboxUploadResult>, [OutboxRow, Blob]>(
    async () => {
      const r = queue.shift();
      return r ?? defaultResult;
    }
  );
  const outbox = createUploadOutbox({
    upload: upload as unknown as OutboxUploadFn,
    dbName: opts.dbName ?? uniqueDbName(),
    backoffMsByAttempt: opts.backoffMsByAttempt ?? [0, 0, 0, 0, 0],
    permanentFailAfter: opts.permanentFailAfter ?? 5,
    indexedDB: new IDBFactory(),
    logger: SILENT_LOGGER,
    onSegmentUploaded: opts.onSegmentUploaded,
    setTimeout: (cb, ms) =>
      (opts.setTimeout ?? globalThis.setTimeout)(cb, ms) as unknown as number,
    clearTimeout: (id) =>
      (opts.clearTimeout ?? globalThis.clearTimeout)(id as number),
  });
  return {
    outbox,
    upload,
    pushResult: (r) => queue.push(r),
    setDefaultResult: (r) => {
      defaultResult = r;
    },
  };
}

/**
 * Wait for the outbox worker to settle on the given session — polls
 * `observe(sessionId).getState()` until either `inFlightStreamCount`
 * reaches 0 OR `state` is "failed" (permanent), bounded by a deadline
 * so a stalled worker doesn't hang the test runner indefinitely.
 */
async function waitForRegisterOk(
  outbox: UploadOutbox,
  sessionId: string,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 2_000);
  while (Date.now() < deadline) {
    const rows = await outbox.listAllRows(sessionId);
    if (rows.some((r) => r.registerOk)) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(
    `waitForRegisterOk: no row marked registerOk within ${opts.timeoutMs ?? 2_000}ms for ${sessionId}`
  );
}

async function waitForSettled(
  outbox: UploadOutbox,
  sessionId: string,
  opts: { timeoutMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 1_000);
  while (Date.now() < deadline) {
    const s = outbox.observe(sessionId).getState();
    if (s.inFlightStreamCount === 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(
    `waitForSettled: outbox did not settle within ${opts.timeoutMs ?? 1_000}ms for ${sessionId}`
  );
}

// ----------------------------------------------------------------
// Happy-path enqueue + drain
// ----------------------------------------------------------------

describe("upload-outbox — enqueue + drain", () => {
  test("enqueue with local blob → worker uploads → drainAndAwait returns timedOut:false", async () => {
    const h = makeHarness({});
    await h.outbox.enqueue({
      sessionId: "ws-1",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-1",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 1_000,
    });

    const drain = await h.outbox.drainAndAwait("ws-1", { timeoutMs: 200 });
    expect(drain.timedOut).toBe(false);
    expect(drain.remainingCount).toBe(0);
    expect(h.upload).toHaveBeenCalledTimes(1);

    const uploaded = await h.outbox.listUploadedSegments("ws-1");
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].blobRemoteUrl).toBe("https://blob.example/x");
    expect(uploaded[0].streamId).toBe("tutor:mic");
    await h.outbox.close();
  });

  test("enqueue with blobRemoteUrl already set (Phase 1b workspace path) → no upload, registering immediately", async () => {
    const h = makeHarness({});
    await h.outbox.enqueue({
      sessionId: "ws-2",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-x",
      blobLocalRef: makeBlob(),
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 2_000,
    });

    const drain = await h.outbox.drainAndAwait("ws-2", { timeoutMs: 200 });
    expect(drain.timedOut).toBe(false);
    expect(h.upload).not.toHaveBeenCalled();
    const state = h.outbox.observe("ws-2").getState();
    expect(state.state).toBe("idle");
    expect(state.inFlightStreamCount).toBe(0);
    const rows = await h.outbox.listUploadedSegments("ws-2");
    expect(rows).toHaveLength(1);
    expect(rows[0].blobRemoteUrl).toBe("https://blob.example/preuploaded");
    await h.outbox.close();
  });

  test("listUploadedSegments orders rows by createdAt, then streamId, then segmentId", async () => {
    const h = makeHarness({});
    // Force three rows with controllable createdAt — we go in
    // chronological order so the test is deterministic without
    // mocking Date.now.
    const studentId = studentMicStreamId("peerA");
    await h.outbox.enqueue({
      sessionId: "ws-ord",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-A",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/A",
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 1,
    });
    await new Promise((r) => setTimeout(r, 5));
    await h.outbox.enqueue({
      sessionId: "ws-ord",
      streamId: studentId,
      segmentId: "seg-B",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/B",
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 2,
    });
    await new Promise((r) => setTimeout(r, 5));
    await h.outbox.enqueue({
      sessionId: "ws-ord",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-C",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/C",
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 3,
    });

    const rows = await h.outbox.listUploadedSegments("ws-ord");
    expect(rows.map((r) => r.segmentId)).toEqual(["seg-A", "seg-B", "seg-C"]);
    await h.outbox.close();
  });
});

// ----------------------------------------------------------------
// Retry semantics
// ----------------------------------------------------------------

describe("upload-outbox — retry policy", () => {
  test("upload fails once → retries → succeeds", async () => {
    const h = makeHarness({});
    h.pushResult({ ok: false, error: "transient 502" });
    h.pushResult({ ok: true, blobUrl: "https://blob.example/ok" });

    await h.outbox.enqueue({
      sessionId: "ws-r1",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-1",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 1_000,
    });

    await waitForSettled(h.outbox, "ws-r1", { timeoutMs: 2_000 });
    expect(h.upload).toHaveBeenCalledTimes(2);
    const rows = await h.outbox.listUploadedSegments("ws-r1");
    expect(rows).toHaveLength(1);
    expect(rows[0].blobRemoteUrl).toBe("https://blob.example/ok");
    await h.outbox.close();
  });

  test("upload fails until permanent-fail cap → row marked failed → observer state 'failed'", async () => {
    const cap = 3;
    const h = makeHarness({ permanentFailAfter: cap });
    h.setDefaultResult({ ok: false, error: "still broken" });

    await h.outbox.enqueue({
      sessionId: "ws-r2",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-1",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 1_000,
    });

    // Wait for the worker to exhaust the cap. Each failure schedules
    // a retry with zero backoff so this settles in a few ticks.
    await waitForSettled(h.outbox, "ws-r2", { timeoutMs: 2_000 });

    expect(h.upload.mock.calls.length).toBeGreaterThanOrEqual(cap);
    const state = h.outbox.observe("ws-r2").getState();
    expect(state.state).toBe("failed");
    expect(state.lastError).toMatch(/still broken/);
    expect(state.inFlightStreamCount).toBe(0); // permanent — no longer in-flight

    const uploaded = await h.outbox.listUploadedSegments("ws-r2");
    expect(uploaded).toHaveLength(0); // never produced a blobRemoteUrl

    // drainAndAwait completes promptly because there are no in-flight
    // rows (the permanent failure is terminal).
    const drain = await h.outbox.drainAndAwait("ws-r2", { timeoutMs: 200 });
    expect(drain.timedOut).toBe(false);
    expect(drain.remainingCount).toBe(0);
    await h.outbox.close();
  });
});

// ----------------------------------------------------------------
// Crash recovery
// ----------------------------------------------------------------

describe("upload-outbox — crash recovery", () => {
  test("enqueue → close outbox → new instance with same dbName drains pending row", async () => {
    const dbName = uniqueDbName();
    // Pass a SHARED IDBFactory across both outbox instances so they
    // see the same in-memory IDB universe (fake-indexeddb).
    const factory = new IDBFactory();
    const uploadA = jest.fn<Promise<OutboxUploadResult>, [OutboxRow, Blob]>(
      async () => ({ ok: false, error: "first instance crashed" })
    );
    const outboxA = createUploadOutbox({
      upload: uploadA as unknown as OutboxUploadFn,
      dbName,
      backoffMsByAttempt: [10_000],
      permanentFailAfter: 50,
      indexedDB: factory,
      logger: SILENT_LOGGER,
    });
    await outboxA.enqueue({
      sessionId: "ws-crash",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-c",
      blobLocalRef: makeBlob("crash-bytes"),
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 0,
    });
    // Don't await — simulate a crash by closing while upload is in
    // flight (the first call has already fired).
    await new Promise((r) => setTimeout(r, 20));
    await outboxA.close();

    // Re-mount: fresh outbox instance, same DB, second uploader will
    // succeed.
    const uploadB = jest.fn<Promise<OutboxUploadResult>, [OutboxRow, Blob]>(
      async () => ({ ok: true, blobUrl: "https://blob.example/recovered" })
    );
    const outboxB = createUploadOutbox({
      upload: uploadB as unknown as OutboxUploadFn,
      dbName,
      backoffMsByAttempt: [0, 0, 0],
      permanentFailAfter: 50,
      indexedDB: factory,
      logger: SILENT_LOGGER,
    });

    // Subscribing to observe kicks a recompute (which in turn kicks
    // the worker on rows that still need upload).
    outboxB.observe("ws-crash");
    // Triggering an idempotent enqueue or a direct kick by listing
    // rows works too; here we explicitly drain.
    const drain = await outboxB.drainAndAwait("ws-crash", { timeoutMs: 2_000 });
    expect(drain.timedOut).toBe(false);
    expect(uploadB).toHaveBeenCalledTimes(1);
    const rows = await outboxB.listUploadedSegments("ws-crash");
    expect(rows[0].blobRemoteUrl).toBe("https://blob.example/recovered");
    expect(rows[0].segmentId).toBe("seg-c");
    await outboxB.close();
  });
});

// ----------------------------------------------------------------
// Dedupe
// ----------------------------------------------------------------

describe("upload-outbox — dedupe by (sessionId, streamId, segmentId)", () => {
  test("double-enqueue same logical key is a no-op", async () => {
    const h = makeHarness({});
    const a = await h.outbox.enqueue({
      sessionId: "ws-dd",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-dup",
      blobLocalRef: makeBlob("a"),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 1_000,
    });
    const b = await h.outbox.enqueue({
      sessionId: "ws-dd",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-dup",
      blobLocalRef: makeBlob("b"),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 1_001,
    });
    expect(b.id).toBe(a.id); // dedupe returns the existing row

    await waitForSettled(h.outbox, "ws-dd");
    const rows = await h.outbox.listAllRows("ws-dd");
    expect(rows).toHaveLength(1);
    expect(h.upload).toHaveBeenCalledTimes(1);
    await h.outbox.close();
  });

  test("dedupe attaches a newly-known blobRemoteUrl onto an existing in-flight row", async () => {
    // Scenario: row enqueued with blobLocalRef only (worker is
    // mid-upload), then a second enqueue arrives carrying the
    // post-upload blobRemoteUrl. We should adopt that url and skip
    // re-uploading.
    const h = makeHarness({});
    // Make the worker fail forever so it never finishes on its own.
    h.setDefaultResult({ ok: false, error: "blocked" });

    await h.outbox.enqueue({
      sessionId: "ws-merge",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-merge",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });

    // Wait a couple ticks for the first attempt(s) to fire.
    await new Promise((r) => setTimeout(r, 30));

    // Second enqueue: same logical key, but with a remote url.
    await h.outbox.enqueue({
      sessionId: "ws-merge",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-merge",
      blobLocalRef: makeBlob(),
      blobRemoteUrl: "https://blob.example/sideloaded",
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });

    const rows = await h.outbox.listAllRows("ws-merge");
    expect(rows).toHaveLength(1);
    expect(rows[0].blobRemoteUrl).toBe("https://blob.example/sideloaded");
    await h.outbox.close();
  });
});

// ----------------------------------------------------------------
// Multi-stream concurrency
// ----------------------------------------------------------------

describe("upload-outbox — multi-stream concurrency", () => {
  test("rows from different streams upload in parallel; same-stream serial", async () => {
    const studentId = studentMicStreamId("peerA");
    const order: string[] = [];
    const uploaderHolds = new Map<string, () => void>();
    const upload = jest.fn<Promise<OutboxUploadResult>, [OutboxRow, Blob]>(
      async (row) => {
        order.push(`begin:${row.streamId}:${row.segmentId}`);
        await new Promise<void>((resolve) => {
          uploaderHolds.set(`${row.streamId}:${row.segmentId}`, resolve);
        });
        order.push(`end:${row.streamId}:${row.segmentId}`);
        return { ok: true, blobUrl: `https://blob.example/${row.segmentId}` };
      }
    );
    const outbox = createUploadOutbox({
      upload: upload as unknown as OutboxUploadFn,
      dbName: uniqueDbName(),
      backoffMsByAttempt: [0],
      permanentFailAfter: 5,
      indexedDB: new IDBFactory(),
      logger: SILENT_LOGGER,
    });

    // Two tutor:mic rows (must serialize) + one student:peer-A:mic
    // (parallel to tutor stream).
    await outbox.enqueue({
      sessionId: "ws-cc",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "T1",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });
    await outbox.enqueue({
      sessionId: "ws-cc",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "T2",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 1,
    });
    await outbox.enqueue({
      sessionId: "ws-cc",
      streamId: studentId,
      segmentId: "S1",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });

    // Wait until both T1 and S1 have begun (parallel across streams).
    for (let i = 0; i < 100; i++) {
      if (
        order.includes("begin:tutor:mic:T1") &&
        order.includes(`begin:${studentId}:S1`)
      ) {
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(order).toEqual(
      expect.arrayContaining([
        "begin:tutor:mic:T1",
        `begin:${studentId}:S1`,
      ])
    );
    // T2 should NOT have begun yet — tutor stream is serialized
    // behind T1.
    expect(order).not.toContain("begin:tutor:mic:T2");

    // Release them in order.
    uploaderHolds.get("tutor:mic:T1")!();
    uploaderHolds.get(`${studentId}:S1`)!();
    // Wait for T2 to begin.
    for (let i = 0; i < 100; i++) {
      if (order.includes("begin:tutor:mic:T2")) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(order).toContain("begin:tutor:mic:T2");
    uploaderHolds.get("tutor:mic:T2")!();

    await waitForSettled(outbox, "ws-cc", { timeoutMs: 2_000 });
    const rows = await outbox.listUploadedSegments("ws-cc");
    expect(rows.map((r) => r.segmentId).sort()).toEqual(["S1", "T1", "T2"]);
    await outbox.close();
  });
});

// ----------------------------------------------------------------
// drainAndAwait timeout
// ----------------------------------------------------------------

describe("upload-outbox — drainAndAwait timeout", () => {
  test("returns timedOut:true with remainingCount > 0 when worker can't finish in time", async () => {
    const h = makeHarness({
      // Make the worker block on every upload so it never finishes
      // within the timeout window.
      defaultResult: { ok: false, error: "still broken" },
      backoffMsByAttempt: [10_000], // long backoff → no retry inside window
      permanentFailAfter: 50,
    });
    await h.outbox.enqueue({
      sessionId: "ws-to",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-to",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });

    const start = Date.now();
    const result = await h.outbox.drainAndAwait("ws-to", { timeoutMs: 150 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(result.timedOut).toBe(true);
    expect(result.remainingCount).toBeGreaterThan(0);
    expect(result.remainingByStream.get(TUTOR_MIC_STREAM_ID)).toBeGreaterThan(
      0
    );
    await h.outbox.close();
  });

  test("returns immediately when outbox is already empty", async () => {
    const h = makeHarness({});
    const result = await h.outbox.drainAndAwait("ws-empty", {
      timeoutMs: 5_000,
    });
    expect(result.timedOut).toBe(false);
    expect(result.remainingCount).toBe(0);
    await h.outbox.close();
  });
});

// ----------------------------------------------------------------
// finalize
// ----------------------------------------------------------------

describe("upload-outbox — transcriptionOnly flag", () => {
  test("transcriptionOnly persists in IndexedDB and round-trips on reload", async () => {
    const dbName = uniqueDbName();
    const outboxA = createUploadOutbox({
      upload: async () => ({ ok: true, blobUrl: "https://blob.example/tx.webm" }),
      dbName,
      logger: SILENT_LOGGER,
      backoffMsByAttempt: [0],
    });
    await outboxA.enqueue({
      sessionId: "ws-tx-flag",
      streamId: studentMicStreamId("peer-2"),
      segmentId: "seg-tx",
      blobLocalRef: makeBlob(),
      mimeType: "audio/webm",
      sizeBytes: 12,
      audioStartedAtMs: 42,
      transcriptionOnly: true,
    });
    const rowsBeforeClose = await outboxA.listAllRows("ws-tx-flag");
    expect(rowsBeforeClose).toHaveLength(1);
    expect(rowsBeforeClose[0].transcriptionOnly).toBe(true);
    await outboxA.close();

    const outboxB = createUploadOutbox({
      upload: async () => ({ ok: true, blobUrl: "https://blob.example/tx.webm" }),
      dbName,
      logger: SILENT_LOGGER,
      backoffMsByAttempt: [0],
    });
    const rowsAfterReload = await outboxB.listAllRows("ws-tx-flag");
    expect(rowsAfterReload).toHaveLength(1);
    expect(rowsAfterReload[0].transcriptionOnly).toBe(true);
    await outboxB.close();
  });
});

describe("upload-outbox — onSegmentUploaded (WS-A mid-session register)", () => {
  test("enqueue with blobRemoteUrl pre-set → worker invokes onSegmentUploaded and marks registerOk", async () => {
    const onSegmentUploaded = jest.fn(async (_row: OutboxRow) => {});
    const h = makeHarness({ onSegmentUploaded });

    await h.outbox.enqueue({
      sessionId: "ws-mid",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-mid-1",
      blobLocalRef: makeBlob(),
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 3_000,
    });

    await waitForRegisterOk(h.outbox, "ws-mid", { timeoutMs: 2_000 });

    expect(h.upload).not.toHaveBeenCalled();
    expect(onSegmentUploaded).toHaveBeenCalledTimes(1);
    expect(onSegmentUploaded.mock.calls[0][0].blobRemoteUrl).toBe(
      "https://blob.example/preuploaded"
    );
    expect(onSegmentUploaded.mock.calls[0][0].segmentId).toBe("seg-mid-1");

    const rows = await h.outbox.listAllRows("ws-mid");
    expect(rows).toHaveLength(1);
    expect(rows[0].registerOk).toBe(true);
    await h.outbox.close();
  });

  test("drainAndAwait waits for register-only rows (blobRemoteUrl set, registerOk false)", async () => {
    let registerCalls = 0;
    const onSegmentUploaded = jest.fn(async () => {
      registerCalls += 1;
      if (registerCalls === 1) {
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    const h = makeHarness({ onSegmentUploaded, backoffMsByAttempt: [0] });

    await h.outbox.enqueue({
      sessionId: "ws-reg-wait",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-reg-wait",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 5_000,
    });

    const drain = await h.outbox.drainAndAwait("ws-reg-wait", { timeoutMs: 500 });
    expect(drain.timedOut).toBe(false);
    expect(drain.remainingCount).toBe(0);
    expect(onSegmentUploaded).toHaveBeenCalled();
    const rows = await h.outbox.listAllRows("ws-reg-wait");
    expect(rows[0].registerOk).toBe(true);
    await h.outbox.close();
  });

  test("onSegmentUploaded failure leaves row retryable (registerOk stays false)", async () => {
    const onSegmentUploaded = jest.fn(async () => {
      throw new Error("register transient 503");
    });
    const h = makeHarness({ onSegmentUploaded });

    await h.outbox.enqueue({
      sessionId: "ws-mid-fail",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-mid-fail",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 4_000,
    });

    await new Promise((r) => setTimeout(r, 100));

    expect(onSegmentUploaded).toHaveBeenCalledTimes(1);
    const rows = await h.outbox.listAllRows("ws-mid-fail");
    expect(rows[0].registerOk).toBe(false);
    expect(h.upload).not.toHaveBeenCalled();
    await h.outbox.close();
  });

  test("in-flight guard: concurrent drains invoke onSegmentUploaded exactly once per row", async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let invocationCount = 0;
    const onSegmentUploaded = jest.fn(async () => {
      invocationCount += 1;
      if (invocationCount === 1) {
        await firstGate;
      }
    });
    const h = makeHarness({ onSegmentUploaded });

    await h.outbox.enqueue({
      sessionId: "ws-inflight",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-inflight",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 1_000,
    });

    // Let enqueue kick finish drain #1 while callback blocks on firstGate.
    await new Promise((r) => setTimeout(r, 30));

    // WS-N resume_drain_kick: second drain while registerOk still false.
    const unsub = h.outbox.observe("ws-inflight").subscribe(() => {});
    await new Promise((r) => setTimeout(r, 50));

    expect(onSegmentUploaded).toHaveBeenCalledTimes(1);

    releaseFirst();
    await waitForRegisterOk(h.outbox, "ws-inflight");
    unsub();
    await h.outbox.close();
  });

  test("in-flight guard: after register failure completes, retry invoke is allowed", async () => {
    let callNum = 0;
    const onSegmentUploaded = jest.fn(async () => {
      callNum += 1;
      if (callNum === 1) {
        throw new Error("register transient 503");
      }
    });
    const h = makeHarness({ onSegmentUploaded });

    await h.outbox.enqueue({
      sessionId: "ws-inflight-retry",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-inflight-retry",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/preuploaded",
      mimeType: "audio/webm",
      sizeBytes: 11,
      audioStartedAtMs: 2_000,
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(onSegmentUploaded).toHaveBeenCalledTimes(1);
    expect((await h.outbox.listAllRows("ws-inflight-retry"))[0].registerOk).toBe(
      false
    );

    const drain = await h.outbox.drainAndAwait("ws-inflight-retry", {
      timeoutMs: 500,
    });
    expect(drain.timedOut).toBe(false);
    expect(onSegmentUploaded).toHaveBeenCalledTimes(2);
    expect((await h.outbox.listAllRows("ws-inflight-retry"))[0].registerOk).toBe(
      true
    );
    await h.outbox.close();
  });
});

describe("upload-outbox — finalize", () => {
  test("finalize clears rows; observer drops to idle", async () => {
    const h = makeHarness({ onSegmentUploaded: jest.fn(async () => {}) });
    await h.outbox.enqueue({
      sessionId: "ws-fin",
      streamId: TUTOR_MIC_STREAM_ID,
      segmentId: "seg-f",
      blobLocalRef: null,
      blobRemoteUrl: "https://blob.example/already",
      mimeType: "audio/webm",
      sizeBytes: 1,
      audioStartedAtMs: 0,
    });
    await waitForRegisterOk(h.outbox, "ws-fin");
    expect(await h.outbox.listAllRows("ws-fin")).toHaveLength(1);
    await h.outbox.finalize("ws-fin");
    expect(await h.outbox.listAllRows("ws-fin")).toHaveLength(0);
    const state = h.outbox.observe("ws-fin").getState();
    expect(state.state).toBe("idle");
    expect(state.inFlightStreamCount).toBe(0);
    await h.outbox.close();
  });
});
