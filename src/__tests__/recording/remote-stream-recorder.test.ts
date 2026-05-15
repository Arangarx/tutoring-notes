/**
 * Unit tests for `src/lib/recording/remote-stream-recorder.ts`
 * (Phase 4b commit 4).
 *
 * Pure Jest — no jsdom. Mocks `MediaRecorder`, `MediaStream`,
 * `MediaStreamTrack`, and `UploadOutbox`. Covers:
 *   - start() begins recording; isRecording flips
 *   - dataavailable → outbox.enqueue with correct streamId
 *   - segmentId is unique per segment; audioStartedAtMs threaded
 *   - stop() awaits trailing-segment enqueue + MediaRecorder stop
 *   - empty trailing dataavailable is skipped (no outbox row)
 *   - timeslice path emits multiple segments
 *   - 3-peer canary: independent outbox lanes
 *   - dispose() does not await trailing enqueue
 *   - missing MediaRecorder ctor → start() warns, no throw
 *   - stream with no audio tracks → start() warns, no throw
 *   - studentMicStreamId helper produces the spec string
 */

import {
  createRemoteStreamRecorder,
  studentMicStreamId,
  type RemoteStreamRecorderOptions,
} from "@/lib/recording/remote-stream-recorder";
import type {
  OutboxRow,
  NewOutboxRow,
  UploadOutbox,
} from "@/lib/recording/upload-outbox";

// -----------------------------------------------------------------
// Fakes
// -----------------------------------------------------------------

class FakeBlob {
  size: number;
  type: string;
  private readonly _bytes: ArrayBuffer | null;
  constructor(parts: BlobPart[] = [], opts?: { type?: string }) {
    this.type = opts?.type ?? "";
    let total = 0;
    for (const p of parts) {
      if (p instanceof ArrayBuffer) total += p.byteLength;
      else if (typeof p === "string") total += p.length;
    }
    this.size = total;
    this._bytes = null;
  }
}

class FakeMediaStreamTrack {
  kind: "audio" | "video";
  constructor(kind: "audio" | "video" = "audio") {
    this.kind = kind;
  }
}

class FakeMediaStream {
  private readonly _tracks: MediaStreamTrack[];
  constructor(tracks: MediaStreamTrack[] = []) {
    this._tracks = tracks;
  }
  getTracks(): MediaStreamTrack[] {
    return [...this._tracks];
  }
  getAudioTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "audio");
  }
  getVideoTracks(): MediaStreamTrack[] {
    return this._tracks.filter((t) => t.kind === "video");
  }
}

type MRListener = (ev: BlobEvent) => void;
type StopListener = () => void;

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  stream: MediaStream;
  private dataListeners: MRListener[] = [];
  private stopListeners: StopListener[] = [];
  startedTimesliceMs: number | undefined;

  constructor(stream: MediaStream, opts?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = opts?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(name: "dataavailable" | "stop", cb: unknown): void {
    if (name === "dataavailable") this.dataListeners.push(cb as MRListener);
    else if (name === "stop") this.stopListeners.push(cb as StopListener);
  }
  removeEventListener(name: "dataavailable" | "stop", cb: unknown): void {
    if (name === "dataavailable") {
      this.dataListeners = this.dataListeners.filter((f) => f !== cb);
    } else if (name === "stop") {
      this.stopListeners = this.stopListeners.filter((f) => f !== cb);
    }
  }

  start(timesliceMs?: number): void {
    this.state = "recording";
    this.startedTimesliceMs = timesliceMs;
  }

  stop(): void {
    if (this.state !== "recording") return;
    this.state = "inactive";
    // Browsers fire a trailing dataavailable + then a stop event.
    // Production code awaits the trailing enqueue; this fake leaves
    // the test in control of when the trailing data is emitted via
    // `emitData(...)` + `emitStop()` (or just `emitStop()` to
    // simulate an empty trailing chunk).
  }

  /** Test hook: fire a `dataavailable` event with a blob of `bytes` length. */
  emitData(bytes: number): void {
    const blob = new FakeBlob([new ArrayBuffer(bytes)], {
      type: this.mimeType,
    });
    for (const cb of this.dataListeners) {
      cb({ data: blob as unknown as Blob } as BlobEvent);
    }
  }

  /** Test hook: fire an empty trailing `dataavailable` (size 0). */
  emitEmptyData(): void {
    const blob = new FakeBlob([], { type: this.mimeType });
    for (const cb of this.dataListeners) {
      cb({ data: blob as unknown as Blob } as BlobEvent);
    }
  }

  /** Test hook: fire the `stop` event. */
  emitStop(): void {
    for (const cb of this.stopListeners) cb();
  }
}

(globalThis as unknown as { Blob: typeof FakeBlob }).Blob = FakeBlob;

type EnqueueCall = NewOutboxRow;

function makeFakeOutbox(
  opts?: { enqueueShouldReject?: boolean }
): { outbox: UploadOutbox; calls: EnqueueCall[]; rows: OutboxRow[] } {
  const calls: EnqueueCall[] = [];
  const rows: OutboxRow[] = [];
  const outbox: UploadOutbox = {
    enqueue: jest.fn(async (row: NewOutboxRow) => {
      calls.push(row);
      if (opts?.enqueueShouldReject) {
        throw new Error("enqueue rejected");
      }
      const stored: OutboxRow = {
        id: `id-${calls.length}`,
        sessionId: row.sessionId,
        streamId: row.streamId,
        segmentId: row.segmentId,
        blobLocalRef: row.blobLocalRef,
        blobRemoteUrl: row.blobRemoteUrl ?? null,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        audioStartedAtMs: row.audioStartedAtMs,
        registerOk: false,
        attempts: 0,
        lastError: null,
        createdAt: Date.now(),
      };
      rows.push(stored);
      return stored;
    }),
    observe: jest.fn(),
    drainAndAwait: jest.fn(),
    listUploadedSegments: jest.fn(),
    finalize: jest.fn(),
    listAllRows: jest.fn(),
    close: jest.fn(),
  } as unknown as UploadOutbox;
  return { outbox, calls, rows };
}

function makeBaseOpts(
  overrides?: Partial<RemoteStreamRecorderOptions>
): RemoteStreamRecorderOptions {
  const { outbox } = makeFakeOutbox();
  const stream = new FakeMediaStream([
    new FakeMediaStreamTrack("audio") as unknown as MediaStreamTrack,
  ]);
  return {
    stream: stream as unknown as MediaStream,
    streamId: studentMicStreamId("alice"),
    sessionId: "wb-1",
    outbox,
    _MediaRecorder: FakeMediaRecorder as unknown as typeof MediaRecorder,
    _now: () => 1700000000000,
    log: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
}

// -----------------------------------------------------------------
// Tests
// -----------------------------------------------------------------

beforeEach(() => {
  FakeMediaRecorder.instances = [];
});

describe("studentMicStreamId helper", () => {
  test("produces 'student:peer-<id>:mic' format", () => {
    expect(studentMicStreamId("alice")).toBe("student:peer-alice:mic");
    expect(studentMicStreamId("opaque-uuid-here")).toBe(
      "student:peer-opaque-uuid-here:mic"
    );
  });
});

describe("remote-stream-recorder — start/stop basics", () => {
  test("start(): MediaRecorder constructed with stream + chosen MIME; recording flips true", () => {
    const opts = makeBaseOpts({ mimeType: "audio/webm;codecs=opus" });
    const r = createRemoteStreamRecorder(opts);
    expect(r.isRecording()).toBe(false);

    r.start();
    expect(r.isRecording()).toBe(true);
    expect(FakeMediaRecorder.instances.length).toBe(1);
    const mr = FakeMediaRecorder.instances[0]!;
    expect(mr.mimeType).toBe("audio/webm;codecs=opus");
    expect(mr.stream).toBe(opts.stream);
    expect(mr.state).toBe("recording");
    expect(mr.startedTimesliceMs).toBeUndefined();

    r.dispose();
  });

  test("start() twice in a row: only one MediaRecorder constructed", () => {
    const opts = makeBaseOpts();
    const warnLog = opts.log!.warn as jest.Mock;
    const r = createRemoteStreamRecorder(opts);

    r.start();
    r.start();
    expect(FakeMediaRecorder.instances.length).toBe(1);
    expect(warnLog).toHaveBeenCalledWith(
      expect.stringContaining("already recording")
    );

    r.dispose();
  });

  test("start() on a stream with no audio tracks: no-op + warns", () => {
    const stream = new FakeMediaStream([]);
    const opts = makeBaseOpts({
      stream: stream as unknown as MediaStream,
    });
    const warnLog = opts.log!.warn as jest.Mock;
    const r = createRemoteStreamRecorder(opts);

    r.start();
    expect(r.isRecording()).toBe(false);
    expect(FakeMediaRecorder.instances.length).toBe(0);
    expect(warnLog).toHaveBeenCalledWith(
      expect.stringContaining("no audio tracks")
    );

    r.dispose();
  });

  test("start() when MediaRecorder ctor is unavailable: error + no-op", () => {
    const opts = makeBaseOpts({
      _MediaRecorder: undefined,
    });
    const errLog = opts.log!.error as jest.Mock;
    const r = createRemoteStreamRecorder(opts);

    r.start();
    expect(r.isRecording()).toBe(false);
    expect(errLog).toHaveBeenCalledWith(
      expect.stringContaining("not available")
    );

    r.dispose();
  });

  test("start() on a disposed recorder: warns, no MediaRecorder", () => {
    const opts = makeBaseOpts();
    const warnLog = opts.log!.warn as jest.Mock;
    const r = createRemoteStreamRecorder(opts);
    r.dispose();

    r.start();
    expect(r.isRecording()).toBe(false);
    expect(FakeMediaRecorder.instances.length).toBe(0);
    expect(warnLog).toHaveBeenCalledWith(
      expect.stringContaining("disposed")
    );
  });

  test("start() with timesliceMs: passed through to MediaRecorder.start", () => {
    const opts = makeBaseOpts({ timesliceMs: 2500 });
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;
    expect(mr.startedTimesliceMs).toBe(2500);

    r.dispose();
  });
});

describe("remote-stream-recorder — outbox.enqueue on dataavailable", () => {
  test("dataavailable: outbox.enqueue called with correct streamId + segment metadata", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const segmentIds = ["seg-1", "seg-2"];
    let uuidCounter = 0;
    const opts = makeBaseOpts({
      outbox,
      streamId: studentMicStreamId("bob"),
      mimeType: "audio/webm",
      _now: () => 1700000000000,
      _uuid: () => segmentIds[uuidCounter++]!,
    });

    const r = createRemoteStreamRecorder(opts);
    r.start();
    const mr = FakeMediaRecorder.instances[0]!;

    mr.emitData(1024);
    await Promise.resolve(); // flush microtasks

    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      sessionId: "wb-1",
      streamId: "student:peer-bob:mic",
      segmentId: "seg-1",
      mimeType: "audio/webm",
      sizeBytes: 1024,
      audioStartedAtMs: 1700000000000,
    });
    expect(calls[0]?.blobLocalRef).toBeDefined();

    r.dispose();
  });

  test("dataavailable empty (size 0): outbox.enqueue NOT called", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;
    mr.emitEmptyData();
    await Promise.resolve();

    expect(calls.length).toBe(0);

    r.dispose();
  });

  test("multiple dataavailable: each writes one outbox row (timeslice path)", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox, timesliceMs: 1000 });
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;
    mr.emitData(100);
    mr.emitData(200);
    mr.emitData(300);
    await Promise.resolve();

    expect(calls.length).toBe(3);
    expect(calls.map((c) => c.sizeBytes)).toEqual([100, 200, 300]);
    // Segment ids must be distinct (no dedupe collision).
    const ids = new Set(calls.map((c) => c.segmentId));
    expect(ids.size).toBe(3);

    r.dispose();
  });

  test("audioStartedAtMs advances across segments (timeslice path)", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const ts = [1000, 2000, 3000, 4000];
    let i = 0;
    const opts = makeBaseOpts({
      outbox,
      timesliceMs: 500,
      _now: () => ts[i++ % ts.length]!,
    });
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;
    mr.emitData(10); // segment whose start was the first _now()
    mr.emitData(20);
    mr.emitData(30);
    await Promise.resolve();

    // First call reads the initial start time; subsequent segments
    // pick up the time when the prior segment finalized.
    expect(calls[0]?.audioStartedAtMs).toBe(1000);
    expect(calls[1]?.audioStartedAtMs).toBe(2000);
    expect(calls[2]?.audioStartedAtMs).toBe(3000);

    r.dispose();
  });

  test("outbox.enqueue rejects: error logged, recorder still operable", async () => {
    const { outbox, calls } = makeFakeOutbox({
      enqueueShouldReject: true,
    });
    const opts = makeBaseOpts({ outbox });
    const errLog = opts.log!.error as jest.Mock;
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;
    mr.emitData(50);
    // Let the async catch run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.length).toBe(1);
    expect(errLog).toHaveBeenCalledWith(
      expect.stringContaining("outbox.enqueue threw"),
      expect.any(Error)
    );
    // Recorder hasn't crashed.
    expect(r.isRecording()).toBe(true);

    r.dispose();
  });
});

describe("remote-stream-recorder — stop() lifecycle", () => {
  test("stop(): awaits trailing dataavailable + MediaRecorder.stop event", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const mr = FakeMediaRecorder.instances[0]!;

    let stopResolved = false;
    const stopP = r.stop().then(() => {
      stopResolved = true;
    });

    // Simulate browser: trailing dataavailable, then stop event.
    mr.emitData(2048);
    await Promise.resolve();
    expect(stopResolved).toBe(false); // stop event not yet fired

    mr.emitStop();
    await stopP;
    expect(stopResolved).toBe(true);

    expect(calls.length).toBe(1);
    expect(calls[0]?.sizeBytes).toBe(2048);
    expect(r.isRecording()).toBe(false);
  });

  test("stop() with no buffered data: resolves after stop event, no outbox row", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();
    const mr = FakeMediaRecorder.instances[0]!;

    const stopP = r.stop();
    mr.emitEmptyData();
    mr.emitStop();
    await stopP;

    expect(calls.length).toBe(0);
    expect(r.isRecording()).toBe(false);
  });

  test("stop() when not recording: resolves immediately, no MediaRecorder.stop called", async () => {
    const opts = makeBaseOpts();
    const r = createRemoteStreamRecorder(opts);
    await r.stop();
    expect(FakeMediaRecorder.instances.length).toBe(0);
  });

  test("stop() twice in a row: second call returns the same in-flight promise", async () => {
    const { outbox } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();
    const mr = FakeMediaRecorder.instances[0]!;

    const p1 = r.stop();
    const p2 = r.stop();
    // p1 and p2 are both pending; trigger trailing flush.
    mr.emitData(64);
    mr.emitStop();
    await Promise.all([p1, p2]);
    expect(r.isRecording()).toBe(false);
  });

  test("stop() awaits outbox.enqueue completion (not just the MediaRecorder stop event)", async () => {
    let releaseEnqueue: () => void = () => undefined;
    const enqueueGate = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    const outbox: UploadOutbox = {
      enqueue: jest.fn(async () => {
        await enqueueGate;
        return {} as OutboxRow;
      }),
      observe: jest.fn(),
      drainAndAwait: jest.fn(),
      listUploadedSegments: jest.fn(),
      finalize: jest.fn(),
      listAllRows: jest.fn(),
      close: jest.fn(),
    } as unknown as UploadOutbox;
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();
    const mr = FakeMediaRecorder.instances[0]!;

    let stopDone = false;
    const stopP = r.stop().then(() => {
      stopDone = true;
    });
    mr.emitData(128);
    mr.emitStop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stopDone).toBe(false); // outbox.enqueue still pending

    releaseEnqueue();
    await stopP;
    expect(stopDone).toBe(true);
  });
});

describe("remote-stream-recorder — dispose()", () => {
  test("dispose(): calls MediaRecorder.stop synchronously, does not await trailing enqueue", () => {
    const { outbox, calls } = makeFakeOutbox();
    const opts = makeBaseOpts({ outbox });
    const r = createRemoteStreamRecorder(opts);
    r.start();
    const mr = FakeMediaRecorder.instances[0]!;

    r.dispose();
    expect(mr.state).toBe("inactive");
    expect(r.isRecording()).toBe(false);

    // A late dataavailable after dispose should not crash; whether
    // it lands in the outbox is implementation-defined (we choose
    // to detach listeners on dispose so it does NOT).
    mr.emitData(99);
    expect(calls.length).toBe(0);
  });

  test("dispose() resolves any pending stop() promise", async () => {
    const opts = makeBaseOpts();
    const r = createRemoteStreamRecorder(opts);
    r.start();

    const stopP = r.stop();
    r.dispose();
    await expect(stopP).resolves.toBeUndefined();
  });

  test("dispose() then start(): no-op (recorder is sealed)", () => {
    const opts = makeBaseOpts();
    const r = createRemoteStreamRecorder(opts);
    r.dispose();
    r.start();
    expect(FakeMediaRecorder.instances.length).toBe(0);
  });
});

describe("remote-stream-recorder — multi-peer canary", () => {
  test("3 students → 3 independent recorders write to 3 outbox lanes", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const sessionId = "wb-canary";
    const peers = ["alice", "bob", "carol"];
    const recorders = peers.map((peerId) => {
      const stream = new FakeMediaStream([
        new FakeMediaStreamTrack("audio") as unknown as MediaStreamTrack,
      ]);
      return createRemoteStreamRecorder(
        makeBaseOpts({
          stream: stream as unknown as MediaStream,
          streamId: studentMicStreamId(peerId),
          sessionId,
          outbox,
        })
      );
    });

    for (const r of recorders) r.start();
    expect(FakeMediaRecorder.instances.length).toBe(3);

    // Emit one segment from each peer's MediaRecorder.
    for (let i = 0; i < 3; i++) {
      FakeMediaRecorder.instances[i]!.emitData(100 + i);
    }
    await Promise.resolve();

    expect(calls.length).toBe(3);
    const byStream = new Map<string, number>();
    for (const c of calls) {
      byStream.set(c.streamId, (byStream.get(c.streamId) ?? 0) + 1);
    }
    expect(byStream.get(studentMicStreamId("alice"))).toBe(1);
    expect(byStream.get(studentMicStreamId("bob"))).toBe(1);
    expect(byStream.get(studentMicStreamId("carol"))).toBe(1);
    // Sizes are byte-distinct so we can confirm no cross-talk.
    expect(calls.find((c) => c.streamId.includes("alice"))?.sizeBytes).toBe(100);
    expect(calls.find((c) => c.streamId.includes("bob"))?.sizeBytes).toBe(101);
    expect(calls.find((c) => c.streamId.includes("carol"))?.sizeBytes).toBe(102);

    // Stop all and confirm each can complete independently.
    const stopPs = recorders.map((r) => r.stop());
    for (const mr of FakeMediaRecorder.instances) mr.emitStop();
    await Promise.all(stopPs);
    for (const r of recorders) expect(r.isRecording()).toBe(false);
  });

  test("each recorder's outbox rows include the matching peerId in streamId", async () => {
    const { outbox, calls } = makeFakeOutbox();
    const peers = ["p1", "p2", "p3"];
    const recorders = peers.map((peerId) => {
      const stream = new FakeMediaStream([
        new FakeMediaStreamTrack("audio") as unknown as MediaStreamTrack,
      ]);
      return createRemoteStreamRecorder(
        makeBaseOpts({
          stream: stream as unknown as MediaStream,
          streamId: studentMicStreamId(peerId),
          outbox,
        })
      );
    });

    for (const r of recorders) r.start();
    // p1 emits 2 segments; p2 emits 0; p3 emits 1.
    FakeMediaRecorder.instances[0]!.emitData(10);
    FakeMediaRecorder.instances[0]!.emitData(20);
    FakeMediaRecorder.instances[2]!.emitData(30);
    await Promise.resolve();

    const byStream = calls.reduce((acc, c) => {
      acc[c.streamId] = (acc[c.streamId] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    expect(byStream[studentMicStreamId("p1")]).toBe(2);
    expect(byStream[studentMicStreamId("p2")]).toBeUndefined();
    expect(byStream[studentMicStreamId("p3")]).toBe(1);

    for (const r of recorders) r.dispose();
  });
});
