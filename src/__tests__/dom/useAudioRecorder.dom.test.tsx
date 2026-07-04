/**
 * @jest-environment jsdom
 */

/**
 * jsdom + RTL coverage for `useAudioRecorder` (Phase 3 of the recorder
 * test/refactor plan).
 *
 * Why this file exists: Phases 1+2 split the old 1212-line component into
 * pure modules + a hook + a thin shell, and unit-tested the pure modules
 * directly. Those tests can't catch the *integration* bugs that live where
 * the hook talks to MediaRecorder, the timer, and the upload chain — e.g.
 * "auto-rollover fires twice in the same segment" or "stop button passes
 * its synthetic MouseEvent as the mode arg". This file mocks just enough
 * of the browser API surface to drive those integration paths in jsdom.
 *
 * Mocks (kept fake-but-realistic on purpose):
 *  - `MediaRecorder` (global): controllable instance with `triggerStop()`
 *    and `getInstance()` test handles. Tracks state (`inactive` / `recording`
 *    / `paused`) and call counts.
 *  - `navigator.mediaDevices.getUserMedia` / `enumerateDevices` and
 *    `navigator.permissions.query`: granted by default, single fake
 *    audioinput device.
 *  - `URL.createObjectURL`: returns a stable string. Real jsdom impl can
 *    work but isn't worth the variability.
 *  - `@/lib/mic-recorder-audio`: forced to return `null` from
 *    `createMicAudioGraph` so the hook falls back to the raw stream path.
 *    The graph itself is covered by `mic-recorder-audio.test.ts`.
 *  - `@/lib/recording/upload`: `uploadAudioDirect` mocked per test
 *    (success / failure / retry-then-success). Pre-B1 this mock was on
 *    the legacy `uploadAudioAction` server action; that path was
 *    removed when client-direct upload landed.
 *
 * NOT testing here (covered elsewhere or out of scope):
 *  - MIME priority — `src/__tests__/recording/mime.test.ts`.
 *  - `recorder.start()` no-timeslice — regression grep in
 *    `audio-mime-priority.test.ts`.
 *  - Storage round-trip / chime audio context — Phase 1 unit tests.
 *  - Permission-denied UI copy — covered by acquireMic logic; would need
 *    a separate dedicated rejected-getUserMedia case if we see flakes.
 */

import { renderHook, act } from "@testing-library/react";
import {
  useAudioRecorder,
  VAD_MAX_SEGMENT_SECONDS,
  SESSION_SAFETY_MAX_SECONDS,
} from "@/hooks/useAudioRecorder";

// ---- Mocks for hook dependencies ----------------------------------------

let mockMeterLevel = 0.5;

jest.mock("@/lib/mic-recorder-audio", () => ({
  __esModule: true,
  createMicAudioGraph: jest.fn(async (stream: MediaStream) => ({
    publishStream: stream,
    recordingStream: stream,
    getLevel: () => mockMeterLevel,
    dispose: jest.fn(),
    setGain: jest.fn(),
    addRemoteAudio: jest.fn(() => () => {}),
    setRemoteGain: jest.fn(),
    setTutorRecordingMute: jest.fn(),
  })),
}));

// uploadAudioDirect is the thing the hook hands to uploadAudioWithRetry.
// Tests override its return value per case. We re-export the real
// uploadAudioWithRetry and UploadAudioFn type so the retry policy is
// exercised against the mock; only the leaf uploader is stubbed.
jest.mock("@/lib/recording/upload", () => {
  const actual = jest.requireActual("@/lib/recording/upload");
  return {
    __esModule: true,
    ...actual,
    uploadAudioDirect: jest.fn(),
  };
});

// formatUserFacingActionError is pure; pass through with predictable text.
jest.mock("@/lib/action-correlation", () => ({
  __esModule: true,
  formatUserFacingActionError: (msg: string, debugId?: string) =>
    debugId ? `${msg} [debug=${debugId}]` : msg,
}));

import { uploadAudioDirect } from "@/lib/recording/upload";
import { createMicAudioGraph } from "@/lib/mic-recorder-audio";

// ---- Fake MediaRecorder --------------------------------------------------

type FakeRecorderState = "inactive" | "recording" | "paused";

/**
 * Shared event log across all FakeMediaRecorder instances. We use this to
 * assert the START-BEFORE-STOP ordering invariant for the gapless rollover
 * (B5): the next segment's recorder must be constructed and started BEFORE
 * the current segment's recorder is stopped, otherwise there is a multi-
 * second silent gap while the browser finalizes the container.
 */
type RecorderEvent =
  | { kind: "construct"; instance: number }
  | { kind: "start"; instance: number }
  | { kind: "stop"; instance: number };
const recorderEventLog: RecorderEvent[] = [];

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static lastInstance(): FakeMediaRecorder {
    const last = FakeMediaRecorder.instances.at(-1);
    if (!last) throw new Error("no FakeMediaRecorder created yet");
    return last;
  }
  static reset() {
    FakeMediaRecorder.instances = [];
    recorderEventLog.length = 0;
  }

  state: FakeRecorderState = "inactive";
  mimeType: string;
  /** Per-instance index assigned at construction (1-based). */
  instanceIndex: number;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void | Promise<void>) | null = null;

  startCalls: unknown[][] = [];
  stopCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  constructor(_stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "audio/webm;codecs=opus";
    FakeMediaRecorder.instances.push(this);
    this.instanceIndex = FakeMediaRecorder.instances.length;
    recorderEventLog.push({ kind: "construct", instance: this.instanceIndex });
  }

  start(...args: unknown[]) {
    this.startCalls.push(args);
    this.state = "recording";
    recorderEventLog.push({ kind: "start", instance: this.instanceIndex });
  }
  pause() {
    this.pauseCalls += 1;
    if (this.state === "recording") this.state = "paused";
  }
  resume() {
    this.resumeCalls += 1;
    if (this.state === "paused") this.state = "recording";
  }
  stop() {
    this.stopCalls += 1;
    this.state = "inactive";
    recorderEventLog.push({ kind: "stop", instance: this.instanceIndex });
    // The hook calls recorder.stop() AFTER assigning recorder.onstop, so the
    // assignment is in place by the time we fire it. Real browsers fire it
    // asynchronously; we do too, via a microtask, so the awaiting code runs.
    queueMicrotask(() => {
      this.onstop?.();
    });
  }

  /** Test handle: simulate a dataavailable event with a non-empty blob. */
  feedData(blob: Blob = new Blob(["ok"], { type: this.mimeType })) {
    this.ondataavailable?.({ data: blob });
  }
}

(globalThis as unknown as { MediaRecorder: typeof FakeMediaRecorder }).MediaRecorder =
  FakeMediaRecorder;
// `isTypeSupported` is consulted by chooseMimeType; have it accept anything.
(FakeMediaRecorder as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported =
  () => true;

// ---- navigator.mediaDevices + permissions --------------------------------

function installMediaDevicesMock() {
  const fakeTrack = {
    stop: jest.fn(),
    getSettings: () => ({ deviceId: "fake-mic-id" }),
  };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  } as unknown as MediaStream;

  const getUserMedia = jest.fn(async () => fakeStream);
  const enumerateDevices = jest.fn(async () => [
    { kind: "audioinput", deviceId: "fake-mic-id", label: "Fake Mic", groupId: "" },
  ] as MediaDeviceInfo[]);

  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: jest.fn(async () => ({ state: "granted" })) },
  });

  return { fakeStream, fakeTrack, getUserMedia, enumerateDevices };
}

// jsdom provides URL.createObjectURL only sometimes; pin it so blob previews
// don't blow up.
const originalCreateObjectURL = URL.createObjectURL;
beforeAll(() => {
  URL.createObjectURL = jest.fn(() => "blob://fake-preview");
});
afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
});

// ---- Test plumbing --------------------------------------------------------

const uploadMock = uploadAudioDirect as unknown as jest.Mock;

function mockUploadOk(blobUrl = "https://blob.example/x") {
  uploadMock.mockResolvedValue({ ok: true, blobUrl, mimeType: "audio/webm", sizeBytes: 1 });
}
function mockUploadFail(error = "boom", debugId?: string) {
  uploadMock.mockResolvedValue({ ok: false, error, debugId });
}

/** Render the hook with a recording-active observer + a mocked onRecorded. */
function renderRecorder(overrides: { studentId?: string } = {}) {
  const onRecorded = jest.fn();
  const onRecordingActive = jest.fn();
  const view = renderHook(() =>
    useAudioRecorder({
      studentId: overrides.studentId ?? "stu-1",
      onRecorded,
      onRecordingActive,
    })
  );
  return { ...view, onRecorded, onRecordingActive };
}

/**
 * Drain pending microtasks. Long because the longest chain we drive
 * (auto-rollover: stop → upload → handle → start new recorder) is several
 * `await` hops, each yielding to a separate microtask.
 *
 * Uses `act` so React batches state updates correctly. Loops 20 times —
 * cheap and well above any chain we currently exercise.
 */
async function flushAsync() {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

beforeEach(() => {
  mockMeterLevel = 0.5;
  delete (window as unknown as { __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number })
    .__VAD_MAX_SEGMENT_SECONDS_OVERRIDE;
  delete (window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number })
    .__SESSION_SAFETY_MAX_SECONDS_OVERRIDE;
  // CRITICAL: `doNotFake: ['queueMicrotask']`. Jest 30's modern fake timers
  // also intercept `queueMicrotask` by default, which means the FakeMediaRecorder
  // `stop()` callback (queued via `queueMicrotask`) never fires unless we tick
  // timers explicitly — even though there's no real timer to tick. Excluding
  // it lets the upload chain progress naturally.
  jest.useFakeTimers({ doNotFake: ["queueMicrotask"] });
  FakeMediaRecorder.reset();
  installMediaDevicesMock();
  uploadMock.mockReset();
  // Silence the StrictMode-style console.error from the hook's getUserMedia
  // catch path — we test those branches directly without polluting stdout.
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---- Tests ----------------------------------------------------------------

describe("useAudioRecorder — start → stop (final)", () => {
  test("happy path: idle → ready → recording → uploading → done; onRecorded called once", async () => {
    mockUploadOk("https://blob.example/p1");
    const { result, onRecorded, onRecordingActive } = renderRecorder();

    // Auto-acquire on mount lands us in `ready`.
    await flushAsync();
    expect(result.current.state).toBe("ready");

    // Start recording (reuses live stream — no re-acquire).
    await act(async () => {
      await result.current.handleStartRecording();
    });
    expect(result.current.state).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    // Feed a chunk so the upload blob isn't empty, then stop.
    const recorder = FakeMediaRecorder.lastInstance();
    recorder.feedData();
    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(result.current.state).toBe("done");
    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [audio, meta] = onRecorded.mock.calls[0];
    expect(audio).toMatchObject({
      blobUrl: "https://blob.example/p1",
      mimeType: expect.any(String),
      filename: expect.stringMatching(/^session-\d+-part1\./),
    });
    expect(meta).toBeUndefined();

    // onRecordingActive flips: idle(false) → acquiring(true) → ready(true) →
    // recording(true) → uploading(true) → done(false). We don't assert exact
    // sequence — just that the parent saw both "active" and "inactive".
    const calls = onRecordingActive.mock.calls.map((c) => c[0]);
    expect(calls).toContain(true);
    expect(calls.at(-1)).toBe(false);
  });

  test("regression: stop button onClick passing a MouseEvent as `mode` defaults to final", async () => {
    // The shell does `onClick={() => r.stopAndUpload("final")}`. If a future
    // refactor regresses to `onClick={r.stopAndUpload}`, React passes the
    // synthetic MouseEvent as the first arg. The hook must not crash and
    // must NOT auto-rollover (which would keep the mic hot when the user
    // intended to stop).
    mockUploadOk();
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      // Cast: this is exactly what the bug looked like in the wild.
      (result.current.stopAndUpload as unknown as (e: object) => void)({
        type: "click",
        preventDefault: () => {},
      });
      await flushAsync();
    });

    // A MouseEvent is "truthy and not 'rollover'", so isRollover is false →
    // final flow runs. State must end up `done`, not `recording`.
    expect(result.current.state).toBe("done");
  });
});

describe("useAudioRecorder — pause / resume timer math", () => {
  test("timer freezes on pause and continues on resume", async () => {
    mockUploadOk();
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });

    // Tick 5 seconds.
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.elapsed).toBe(5);

    // Pause → 10 wall-clock seconds pass → elapsed unchanged.
    await act(async () => {
      result.current.pauseRecording();
    });
    expect(result.current.state).toBe("paused");
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.elapsed).toBe(5);

    // Resume → 3 more ticks → elapsed = 8.
    await act(async () => {
      result.current.resumeRecording();
    });
    expect(result.current.state).toBe("recording");
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(result.current.elapsed).toBe(8);
  });
});

async function flushRafAndTimers(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

describe("useAudioRecorder — VAD segment cut", () => {
  test("VAD cap triggers gapless rollover: onRecorded(autoRollover=true), segmentNumber++", async () => {
    (window as unknown as { __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number }).__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 3;
    mockUploadOk("https://blob.example/seg1");
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });

    expect(result.current.segmentNumber).toBe(1);
    const firstRecorder = FakeMediaRecorder.lastInstance();
    firstRecorder.feedData();

    await flushRafAndTimers(3500);

    expect(onRecorded).toHaveBeenCalledTimes(1);
    const [, meta] = onRecorded.mock.calls[0];
    expect(meta).toEqual({ autoRollover: true });
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    expect(result.current.segmentNumber).toBe(2);
    expect(result.current.state).toBe("recording");
  });

  test("B5 gapless: NEW recorder is constructed AND started BEFORE the OLD recorder is stopped", async () => {
    (window as unknown as { __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number }).__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 3;
    mockUploadOk("https://blob.example/seg1");
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });

    const firstRecorder = FakeMediaRecorder.lastInstance();
    firstRecorder.feedData();
    recorderEventLog.length = 0;

    await flushRafAndTimers(3500);

    const events = [...recorderEventLog];
    const stopIdx = events.findIndex((e) => e.kind === "stop");
    const startIdx = events.findIndex(
      (e, i) => e.kind === "start" && i > 0 && e.instance > 1
    );
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(stopIdx).toBeGreaterThanOrEqual(0);
    expect(startIdx).toBeLessThan(stopIdx);
  });

  test("silence-boundary cut after min duration + hold", async () => {
    (window as unknown as { __VAD_MIN_SEGMENT_SECONDS_OVERRIDE?: number }).__VAD_MIN_SEGMENT_SECONDS_OVERRIDE = 1;
    (window as unknown as { __VAD_SILENCE_HOLD_MS_OVERRIDE?: number }).__VAD_SILENCE_HOLD_MS_OVERRIDE = 100;
    (window as unknown as { __VAD_MAX_SEGMENT_SECONDS_OVERRIDE?: number }).__VAD_MAX_SEGMENT_SECONDS_OVERRIDE = 60;
    mockMeterLevel = 0.5;
    mockUploadOk("https://blob.example/seg1");
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();
    await flushRafAndTimers(1100);
    mockMeterLevel = 0;
    await flushRafAndTimers(200);
    expect(onRecorded).toHaveBeenCalledTimes(1);
    expect(onRecorded.mock.calls[0][1]).toEqual({ autoRollover: true });
    expect(result.current.segmentNumber).toBe(2);
  });
});

describe("useAudioRecorder — auto-rollover at SEGMENT_MAX_SECONDS (removed)", () => {
  test("50-min timer rollover is gone — SEGMENT_MAX_SECONDS export removed", () => {
    const hookMod = require("@/hooks/useAudioRecorder") as Record<string, unknown>;
    expect(hookMod.SEGMENT_MAX_SECONDS).toBeUndefined();
  });
});

describe("useAudioRecorder — legacy rollover tests (placeholder)", () => {
  test.skip("timer-based 50-min rollover removed — covered by VAD segment cut describe", () => {});
});

describe("useAudioRecorder — session safety cap", () => {
  test("hits SESSION_SAFETY_MAX_SECONDS → stops as final, not rollover", async () => {
    (window as unknown as { __SESSION_SAFETY_MAX_SECONDS_OVERRIDE?: number }).__SESSION_SAFETY_MAX_SECONDS_OVERRIDE = 10;
    mockUploadOk();
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      jest.advanceTimersByTime(11_000);
      await flushAsync();
    });

    expect(result.current.state).toBe("done");
    const finalCall = onRecorded.mock.calls.at(-1)!;
    expect(finalCall[1]).toBeUndefined();
  });
});

describe("useAudioRecorder — flushPendingUploads (End-session race fix)", () => {
  test("regression: tracking Promise is registered SYNCHRONOUSLY by stopAndUpload, before onstop fires", async () => {
    // The Phase 1b production smoke test surfaced this exact race:
    // handleEndSession calls audio.stopAndUpload("final") then
    // immediately awaits audio.flushPendingUploads(). If
    // flushPendingUploads only sees Promises that were added INSIDE
    // recorder.onstop, the set is still empty at the moment of the
    // await (onstop is queued, hasn't fired yet) — so the End-session
    // flow races past the trailing segment, drains an empty outbox,
    // finalizes, and then the segment finally enqueues into nothing.
    //
    // Console evidence from the affected session:
    //   drainOutboxOrTimeout ok
    //   enqueued ... hasRemoteUrl=true
    //   finalized rowsDeleted=1
    //
    // The fix: pre-register a Promise in `pendingUploadsRef`
    // synchronously inside stopAndUpload (before recorder.stop()),
    // and have onstop's body settle that Promise. This test pins
    // that contract — without holding it, the End-session flow
    // CANNOT correctly synchronise with the trailing segment.
    let resolveUpload!: (v: {
      ok: true;
      blobUrl: string;
      mimeType: string;
      sizeBytes: number;
    }) => void;
    uploadMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve as typeof resolveUpload;
        })
    );

    let onRecordedCalledAt = -1;
    let logTick = 0;
    const onRecorded = jest.fn(async () => {
      onRecordedCalledAt = ++logTick;
    });
    const { result } = renderHook(() =>
      useAudioRecorder({ studentId: "stu-1", onRecorded })
    );

    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    // Kick off the stop. With the fix, flushPendingUploads must
    // observe an in-flight Promise IMMEDIATELY — even though
    // recorder.onstop hasn't fired yet (it's microtask-queued) and
    // the upload hasn't resolved.
    await act(async () => {
      result.current.stopAndUpload("final");
    });

    // Race the assertion: kick off flushPendingUploads(), then
    // measure when it observed completion vs when onRecorded fired.
    // With the pre-fix code, flushPendingUploads resolves
    // IMMEDIATELY (set is empty), so flushCompletedAt < onRecordedCalledAt
    // and the trailing segment is dropped. With the fix, flush waits.
    let flushCompletedAt = -1;
    const flushPromise = result.current
      .flushPendingUploads()
      .then(() => {
        flushCompletedAt = ++logTick;
      });

    // Yield a couple of microtasks — but NOT enough to let the upload
    // resolve. The FakeMediaRecorder's onstop queueMicrotask runs; the
    // upload kicks off; it awaits our deferred resolveUpload. Crucially,
    // flushPendingUploads must STILL be pending at this point.
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(flushCompletedAt).toBe(-1); // flush is still pending
    expect(onRecordedCalledAt).toBe(-1); // onRecorded hasn't fired yet

    // Now resolve the upload. The onstop chain completes, awaits
    // onRecorded, and only then settles the tracking Promise.
    await act(async () => {
      resolveUpload({
        ok: true,
        blobUrl: "https://blob.example/race",
        mimeType: "audio/webm",
        sizeBytes: 1,
      });
      await flushPromise;
    });

    // Ordering invariant: onRecorded must be called BEFORE flush resolves.
    // (The pre-fix code would have flushCompletedAt < onRecordedCalledAt.)
    expect(onRecordedCalledAt).toBeGreaterThan(0);
    expect(flushCompletedAt).toBeGreaterThan(onRecordedCalledAt);
  });

  test("flushPendingUploads is a no-op when no upload chain is active", async () => {
    // Negative case: a tutor who never armed the mic still has
    // handleEndSession call flushPendingUploads. That must not hang
    // and must not throw.
    const { result } = renderRecorder();
    await flushAsync();
    // No stopAndUpload was ever called. Set is empty.
    await expect(result.current.flushPendingUploads()).resolves.toBeUndefined();
  });

  test("flushPendingUploads settles even if the recorder is already inactive when stopAndUpload is called", async () => {
    // Edge case: a double-stopAndUpload (e.g. from a buggy effect)
    // hits a recorder that's already inactive. The fix pre-registers
    // a Promise before checking, so we must settle it via the
    // explicit `recorder.state === "inactive"` branch in stopAndUpload
    // — otherwise flush would hang forever and pin the End-session flow.
    //
    // We don't use a setTimeout-based timeout because the test uses
    // fake timers (doNotFake: ["queueMicrotask"]). If the bug
    // regresses, jest's default test timeout (5s) catches it.
    mockUploadOk();
    const { result } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    // First stop: normal path. State becomes "uploading" then "done".
    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });
    expect(result.current.state).toBe("done");

    // Second stop on an already-inactive recorder — must not hang.
    await act(async () => {
      result.current.stopAndUpload("final");
    });
    // Direct await — if this hangs, jest's test-timeout (5s) catches
    // the regression with a clear failure.
    await result.current.flushPendingUploads();
  });
});

describe("useAudioRecorder — upload failures", () => {
  test("retry-once succeeds: first upload fails, second succeeds → done", async () => {
    uploadMock
      .mockResolvedValueOnce({ ok: false, error: "transient" })
      .mockResolvedValueOnce({ ok: true, blobUrl: "https://blob.example/retry", mimeType: "audio/webm", sizeBytes: 1 });

    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("done");
    expect(onRecorded).toHaveBeenCalledTimes(1);
  });

  test("both attempts fail → state = error, onRecorded not called", async () => {
    mockUploadFail("network down", "rid-42");
    const { result, onRecorded } = renderRecorder();
    await flushAsync();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    FakeMediaRecorder.lastInstance().feedData();

    await act(async () => {
      result.current.stopAndUpload("final");
      await flushAsync();
    });

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe("error");
    // Surfaced through formatUserFacingActionError mock.
    expect(result.current.error).toBe("network down [debug=rid-42]");
    expect(onRecorded).not.toHaveBeenCalled();
  });

  test("setTutorRecordingMute forwards to the mic audio graph when built", async () => {
    const { result } = renderRecorder();
    await act(async () => {
      await result.current.handleStartRecording();
    });
    await flushAsync();

    expect(createMicAudioGraph).toHaveBeenCalled();
    const graph = await (createMicAudioGraph as jest.Mock).mock.results.at(-1)!
      .value;

    act(() => {
      result.current.setTutorRecordingMute(true);
    });
    expect(graph.setTutorRecordingMute).toHaveBeenCalledWith(true);

    act(() => {
      result.current.setTutorRecordingMute(false);
    });
    expect(graph.setTutorRecordingMute).toHaveBeenCalledWith(false);
  });

  test("setTutorRecordingMute before graph exists applies when graph is built", async () => {
    const { result } = renderRecorder();

    act(() => {
      result.current.setTutorRecordingMute(true);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });
    await flushAsync();

    const graph = await (createMicAudioGraph as jest.Mock).mock.results.at(-1)!
      .value;
    expect(graph.setTutorRecordingMute).toHaveBeenCalledWith(true);
  });

  test("setTutorRecordingMute mute then unmute before graph applies unmuted at build", async () => {
    const { result } = renderRecorder();

    act(() => {
      result.current.setTutorRecordingMute(true);
      result.current.setTutorRecordingMute(false);
    });

    await act(async () => {
      await result.current.handleStartRecording();
    });
    await flushAsync();

    const graph = await (createMicAudioGraph as jest.Mock).mock.results.at(-1)!
      .value;
    expect(graph.setTutorRecordingMute).toHaveBeenLastCalledWith(false);
  });
});
