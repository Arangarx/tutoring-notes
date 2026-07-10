/**
 * @jest-environment jsdom
 *
 * Unit / integration tests for the SMOKE-AUDIO-1 first-mic-acquire fix.
 *
 * Covers:
 *  A) isMicStreamSilent — test-seam + fallback-to-false behaviour.
 *  B) Option A — enumerate-based re-acquire on first mount: when a stored
 *     deviceId is present, the hook redoes GUM via getUserMediaAudioForEnumerateEntry
 *     (groupId-first) and passes the resulting stream to createMicAudioGraph,
 *     NOT the initial bare-exact-deviceId stream.
 *  C) Option B — silent-track oracle + retry: when the oracle signals silence,
 *     the hook walks the enumerate list, finds a live track, and passes THAT
 *     stream to createMicAudioGraph.
 *  D) No-op path — when there is no stored deviceId, a single GUM call is made
 *     and the stream goes straight to createMicAudioGraph (no enumerate redo).
 *
 * @wb-av
 */

import { act, renderHook } from "@testing-library/react";
import { isMicStreamSilent, SILENT_TRACK_RAW_RMS_THRESHOLD } from "../enumerate-device-acquire";

// ─── Test seam types ────────────────────────────────────────────────────────

type SilentTrackTestWindow = Window & {
  __VAD_TEST_SILENT_TRACK__?: boolean;
};

// ─── Fake MediaStream helpers ────────────────────────────────────────────────

function makeTrackSettings(
  deviceId: string,
  groupId: string
): MediaTrackSettings {
  return { deviceId, groupId };
}

function makeFakeTrack(
  deviceId: string,
  groupId: string
): MediaStreamTrack {
  const settings = makeTrackSettings(deviceId, groupId);
  return {
    stop: jest.fn(),
    getSettings: () => settings,
    enabled: true,
    kind: "audio",
    label: `Mic ${deviceId}`,
    muted: false,
    onended: null,
    onmute: null,
    onunmute: null,
    readyState: "live",
    id: deviceId,
  } as unknown as MediaStreamTrack;
}

function makeFakeStream(
  deviceId: string,
  groupId: string
): MediaStream {
  const track = makeFakeTrack(deviceId, groupId);
  const tracks = [track];
  return {
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

// ─── Section A: isMicStreamSilent unit tests ─────────────────────────────────

describe("isMicStreamSilent — test-seam override", () => {
  afterEach(() => {
    delete (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__;
  });

  it("returns true when __VAD_TEST_SILENT_TRACK__ is set to true", async () => {
    (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__ = true;
    const stream = makeFakeStream("dev-1", "grp-1");
    const result = await isMicStreamSilent(stream);
    expect(result).toBe(true);
  });

  it("returns false when __VAD_TEST_SILENT_TRACK__ is set to false", async () => {
    (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__ = false;
    const stream = makeFakeStream("dev-1", "grp-1");
    const result = await isMicStreamSilent(stream);
    expect(result).toBe(false);
  });

  it("returns false (treat-as-live) when AudioContext is unavailable", async () => {
    // jsdom doesn't ship AudioContext — isMicStreamSilent catches and returns false.
    delete (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__;
    const stream = makeFakeStream("dev-2", "grp-2");
    // Should resolve without throwing.
    const result = await isMicStreamSilent(stream);
    expect(result).toBe(false);
  });

  it("SILENT_TRACK_RAW_RMS_THRESHOLD is a sensible constant", () => {
    // > absolute zero (must catch silence)
    expect(SILENT_TRACK_RAW_RMS_THRESHOLD).toBeGreaterThan(0);
    // < ambient room noise floor (~0.002 typical raw RMS)
    expect(SILENT_TRACK_RAW_RMS_THRESHOLD).toBeLessThan(0.002);
  });
});

// ─── Shared hook-level mocks ──────────────────────────────────────────────────

// Stored ID simulated via module-level variable (we re-mock per test).
let _storedDeviceId = "";
let _storedGroupId = "";

jest.mock("@/lib/recording/storage", () => ({
  loadStoredDeviceId: () => _storedDeviceId,
  loadStoredMicGroupId: () => _storedGroupId,
  saveStoredDeviceId: jest.fn((id: string) => { _storedDeviceId = id; }),
  saveStoredMicGroupId: jest.fn((id: string) => { _storedGroupId = id; }),
  loadStoredGain: () => 1.0,
  saveStoredGain: jest.fn(),
  loadStoredChimeEnabled: () => true,
  saveStoredChimeEnabled: jest.fn(),
  loadStoredChimeVolume: () => 0.5,
  saveStoredChimeVolume: jest.fn(),
  STORAGE_LEARNER_MIC_GAIN_KEY_PREFIX: "learner-mic-gain-",
  saveStoredLearnerMicGain: jest.fn(),
  loadStoredLearnerMicDeviceId: jest.fn(() => ""),
  loadStoredLearnerMicGroupId: jest.fn(() => ""),
}));

jest.mock("@/lib/recording/permissions", () => ({
  queryMicPermission: jest.fn(async () => "granted" as const),
}));

jest.mock("@/lib/recording/upload", () => ({
  uploadAudioDirect: jest.fn(),
  uploadAudioWithRetry: jest.fn(),
}));

jest.mock("@/lib/recording/mime", () => ({
  chooseMimeType: jest.fn(() => "audio/webm"),
  fileExtension: jest.fn(() => "webm"),
}));

jest.mock("@/lib/recording/segment-policy", () => ({
  SESSION_BILLING_HOUR_SECONDS: 3600,
  SESSION_SAFETY_MAX_SECONDS: 7200,
  SESSION_TIME_WARN_SECONDS: 3540,
  VAD_MAX_SEGMENT_SECONDS: 120,
  effectiveVadSilenceRmsThreshold: jest.fn(() => 0.01),
  clampVadSilenceAccumulationMs: jest.fn(() => 0),
  isSessionTimeWarning: jest.fn(() => false),
  sessionChimeMilestoneIndex: jest.fn(() => -1),
  shouldCutOnSilence: jest.fn(() => false),
  shouldFireSessionTimeChime: jest.fn(() => false),
  shouldForceVadCap: jest.fn(() => false),
  shouldHardStopSession: jest.fn(() => false),
}));

jest.mock("@/lib/recording/chimes", () => ({
  playApproachingMaxTimeChime: jest.fn(),
}));

jest.mock("@/lib/action-correlation", () => ({
  formatUserFacingActionError: jest.fn((e: unknown) => String(e)),
}));

jest.mock("@/lib/recording/recording-draft-store", () => ({
  draftRowKey: jest.fn(() => "draft-key"),
  getOrCreateRecordingDraftStore: jest.fn(() => ({
    checkpoint: jest.fn(),
    loadDraft: jest.fn(),
    deleteDraft: jest.fn(),
  })),
}));

// Track what stream createMicAudioGraph is called with.
const mockCreateMicAudioGraph = jest.fn();
const mockPublishStream = makeFakeStream("publish-out", "publish-grp");

jest.mock("@/lib/mic-recorder-audio", () => ({
  createMicAudioGraph: (...args: unknown[]) => mockCreateMicAudioGraph(...args),
  METER_NOISE_FLOOR: 0.006,
  METER_SCALE: 9,
  calibrateMicLevel: jest.fn((rms: number) => Math.max(0, rms - 0.006) * 9),
  readAnalyserRmsLevel: jest.fn(() => 0),
}));

// ─── Sections B, C, D — hook-level acquire tests ─────────────────────────────

describe("useAudioRecorder first-acquire (SMOKE-AUDIO-1)", () => {
  const STORED_DEVICE_ID = "brio-dev-abc123";
  const STORED_GROUP_ID = "brio-grp-xyz789";

  // Stream objects with distinct identity so we can assert which one
  // was passed to createMicAudioGraph.
  const initialStream = makeFakeStream(STORED_DEVICE_ID, STORED_GROUP_ID);
  const enumeratedStream = makeFakeStream("brio-dev-resolved", STORED_GROUP_ID);
  const activeStream = makeFakeStream("default-dev", "default-grp");

  const ENUMERATE_LIST: MediaDeviceInfo[] = [
    {
      kind: "audioinput",
      deviceId: STORED_DEVICE_ID,
      groupId: STORED_GROUP_ID,
      label: "Logitech Brio (mic)",
      toJSON: () => ({}),
    },
  ];

  let mockGetUM: jest.Mock;
  let mockEnumerate: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    _storedDeviceId = STORED_DEVICE_ID;
    _storedGroupId = STORED_GROUP_ID;
    delete (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__;

    // Default: isMicStreamSilent returns false (non-silent).
    (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__ = false;

    mockCreateMicAudioGraph.mockResolvedValue({
      publishStream: mockPublishStream,
      recordingStream: makeFakeStream("rec-out", "rec-grp"),
      dispose: jest.fn(),
      getLevel: jest.fn(() => 0),
      setGain: jest.fn(),
      setTutorRecordingMute: jest.fn(),
      addRemoteAudio: jest.fn(),
      setRemoteGain: jest.fn(),
      swapLocalMicSource: jest.fn(() => true),
    });

    mockGetUM = jest.fn();
    mockEnumerate = jest.fn();

    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: mockGetUM,
        enumerateDevices: mockEnumerate,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        ondevicechange: null,
      },
    });
  });

  afterEach(() => {
    delete (window as SilentTrackTestWindow).__VAD_TEST_SILENT_TRACK__;
    delete (window as unknown as { __VAD_WARM_RETRY_DELAY_MS__?: number }).__VAD_WARM_RETRY_DELAY_MS__;
  });

  // ── B: Option A — enumerate-based re-acquire ─────────────────────────────

  it("B: uses enumerate-based stream (not initial-GUM stream) when stored deviceId present", async () => {
    // First call: bare-exact GUM (permission + initial stream)
    // Subsequent calls: getUserMediaAudioForEnumerateEntry attempts (groupId-first)
    mockGetUM.mockResolvedValueOnce(initialStream).mockResolvedValue(enumeratedStream);
    mockEnumerate.mockResolvedValue([
      ...ENUMERATE_LIST,
      { kind: "audioinput", deviceId: "other-dev", groupId: "other-grp", label: "Other Mic", toJSON: () => ({}) },
      { kind: "videoinput", deviceId: "cam-1", groupId: "cam-grp", label: "Camera", toJSON: () => ({}) },
    ]);

    // Dynamically import to allow mock re-use.
    const { useAudioRecorder } = await import("@/hooks/useAudioRecorder");

    await act(async () => {
      renderHook(() =>
        useAudioRecorder({
          studentId: "student-1",
          onRecorded: jest.fn(),
        })
      );
      // Allow all async mount effects to run.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    // createMicAudioGraph must have been called.
    expect(mockCreateMicAudioGraph).toHaveBeenCalledTimes(1);

    // It must NOT have been called with the initial (bare-exact) stream.
    const calledWithStream = mockCreateMicAudioGraph.mock.calls[0]?.[0] as MediaStream;
    expect(calledWithStream).not.toBe(initialStream);

    // It must have been called with the enumerate-based stream.
    expect(calledWithStream).toBe(enumeratedStream);
  });

  // ── C: Option B — silent-track oracle and retry ───────────────────────────

  it("C: retries and uses live-track stream when first stream is silent", async () => {
    // All GUM calls return the same object, but we differentiate via test seam.
    let callCount = 0;
    mockGetUM.mockImplementation(async () => {
      callCount++;
      // First call → initial (silent), subsequent calls → active (live).
      return callCount === 1 ? initialStream : activeStream;
    });
    mockEnumerate.mockResolvedValue(ENUMERATE_LIST);

    // First `isMicStreamSilent` call (on initial stream) → silent.
    // All subsequent calls → not silent (live stream from retry).
    let silentCallIdx = 0;
    Object.defineProperty(window, "__VAD_TEST_SILENT_TRACK__", {
      configurable: true,
      get() {
        silentCallIdx++;
        // Return true for first check (initial stream is silent),
        // false for all subsequent checks (retry streams are live).
        return silentCallIdx <= 1;
      },
    });

    const { useAudioRecorder } = await import("@/hooks/useAudioRecorder");

    await act(async () => {
      renderHook(() =>
        useAudioRecorder({
          studentId: "student-1",
          onRecorded: jest.fn(),
        })
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    // createMicAudioGraph must have been called once.
    expect(mockCreateMicAudioGraph).toHaveBeenCalledTimes(1);

    // It must have been called with the active (live) stream, not the silent initial one.
    const calledWithStream = mockCreateMicAudioGraph.mock.calls[0]?.[0] as MediaStream;
    expect(calledWithStream).not.toBe(initialStream);
  });

  // ── E: Delayed-retry recovery — cancel→refresh class (SMOKE-AUDIO-1 residual) ──

  it("E: recovers with delayed retry when all enumerate slots are initially silent", async () => {
    // Simulate the cancel → page-reload path: the OS audio pipeline isn't ready
    // in the initial + recovery-loop windows, but warms up by the delayed retry.
    //
    // Two distinct stream objects so we can assert which one was committed:
    //   silentStream   — all initial + recovery-loop GUM calls (oracle: silent)
    //   recoveredStream — ONLY the delayed-retry GUM call (oracle: live)
    const silentStream   = makeFakeStream("brio-dev-abc123", STORED_GROUP_ID);
    const recoveredStream = makeFakeStream("brio-dev-recovered", STORED_GROUP_ID);

    // getUserMediaAudioForEnumerateEntry with priorFp=null makes exactly 1 GUM
    // call per invocation (returns on the first successful constraint attempt).
    // Total calls in this test:
    //   Call 1 : initial bare-exact GUM           → silentStream
    //   Call 2 : Option A enumerate GUM           → silentStream
    //   Call 3 : recovery-loop slot 0 GUM         → silentStream
    //   Call 4+: delayed-retry GUM                → recoveredStream
    let gumCallCount = 0;
    mockGetUM.mockImplementation(async () => {
      gumCallCount++;
      return gumCallCount < 4 ? silentStream : recoveredStream;
    });
    mockEnumerate.mockResolvedValue(ENUMERATE_LIST); // 1 entry

    // Set the warm-retry delay to 0 so the test doesn't wait 500 ms.
    (window as unknown as { __VAD_WARM_RETRY_DELAY_MS__?: number }).__VAD_WARM_RETRY_DELAY_MS__ = 0;

    // Spy on isMicStreamSilent so we can control per-call return values without
    // the double-read issue that affects window-property getters (the real
    // isMicStreamSilent reads __VAD_TEST_SILENT_TRACK__ twice per call:
    // once for typeof and once to return the value).
    //
    // Oracle call sequence for this test (1 enumerate entry):
    //   Call 1: Option B initial detect  → silent (true)
    //   Call 2: recovery-loop slot 0     → silent (true)
    //   Call 3: delayed-retry check      → live (false)  ← fix under test
    // Use the __VAD_TEST_SILENT_TRACK__ window seam with a pair-tracker because
    // isMicStreamSilent reads the property TWICE per logical call (once for
    // typeof, once to return the value). Without pairing, a call-index counter
    // would advance twice per isMicStreamSilent invocation.
    //
    // Oracle call sequence for this test (1 enumerate entry):
    //   Logical call 1: Option B initial detect  → silent (true)
    //   Logical call 2: recovery-loop slot 0     → silent (true)
    //   Logical call 3: delayed-retry check      → live (false)  ← fix under test
    let logicalOracleIdx = 0;
    let _lastOracleValue = true;
    let _pairIsFirst = true; // alternates: first read in pair vs second read
    (window as unknown as { __VAD_WARM_RETRY_DELAY_MS__?: number }).__VAD_WARM_RETRY_DELAY_MS__ = 0;
    Object.defineProperty(window, "__VAD_TEST_SILENT_TRACK__", {
      configurable: true,
      get() {
        if (_pairIsFirst) {
          // First read in pair (the typeof check): decide the logical value.
          logicalOracleIdx++;
          _lastOracleValue = logicalOracleIdx <= 2;
          _pairIsFirst = false;
        } else {
          // Second read in pair (the return statement): return cached value.
          _pairIsFirst = true;
        }
        return _lastOracleValue;
      },
    });

    const { useAudioRecorder } = await import("@/hooks/useAudioRecorder");

    await act(async () => {
      renderHook(() =>
        useAudioRecorder({
          studentId: "student-1",
          onRecorded: jest.fn(),
        })
      );
      // With __VAD_WARM_RETRY_DELAY_MS__ = 0, the delayed retry skips the
      // setTimeout gate and runs entirely via microtasks — same as Options A+B.
      // A single 50ms wait is sufficient to drain all async work.
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    // createMicAudioGraph must have been called exactly once.
    expect(mockCreateMicAudioGraph).toHaveBeenCalledTimes(1);

    // The graph must have been called with the recovered (delayed-retry) stream,
    // NOT one of the earlier silent streams. This proves the delayed-retry path
    // ran and committed recoveredStream rather than silentStream.
    const calledWithStream = mockCreateMicAudioGraph.mock.calls[0]?.[0] as MediaStream;
    expect(calledWithStream).toBe(recoveredStream);
    expect(calledWithStream).not.toBe(silentStream);
  });

  // ── D: No-op path — no stored deviceId ───────────────────────────────────

  it("D: skips enumerate-based re-acquire when no deviceId is stored (single GUM)", async () => {
    _storedDeviceId = "";
    _storedGroupId = "";

    mockGetUM.mockResolvedValue(activeStream);
    mockEnumerate.mockResolvedValue([]);

    const { useAudioRecorder } = await import("@/hooks/useAudioRecorder");

    await act(async () => {
      renderHook(() =>
        useAudioRecorder({
          studentId: "student-1",
          onRecorded: jest.fn(),
        })
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    });

    // GUM called exactly once (no enumerate redo with no stored deviceId).
    expect(mockGetUM).toHaveBeenCalledTimes(1);
    expect(mockCreateMicAudioGraph).toHaveBeenCalledTimes(1);
    // The stream passed to the graph must be the one GUM returned directly.
    const calledWithStream = mockCreateMicAudioGraph.mock.calls[0]?.[0] as MediaStream;
    expect(calledWithStream).toBe(activeStream);
  });
});
