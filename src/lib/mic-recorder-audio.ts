/**
 * Web Audio helpers for in-browser recording: optional gain + level metering.
 * Falls back to the raw MediaStream if Web Audio is unavailable or throws
 * (e.g. tests with a stub MediaStream).
 */

/**
 * Noise-floor threshold: ambient-room RMS samples below this are treated as
 * silence and map to 0 bars. Subtract before scaling so that quiet rooms
 * don't keep bar-1 lit permanently (8d calibration fix 2026-06-29).
 */
export const METER_NOISE_FLOOR = 0.006;

/**
 * Post-floor scale factor: maps the speech band above the noise floor into
 * the 0–1 level range. With NOISE_FLOOR=0.006 and SCALE=9:
 *   quiet speech  RMS≈0.02 → (0.02-0.006)*9 = 0.126 → bar-1 (min 0.05)
 *   normal speech RMS≈0.05 → (0.05-0.006)*9 = 0.396 → bar-2 (min 0.25)
 *   louder speech RMS≈0.08 → (0.08-0.006)*9 = 0.666 → bar-3 (min 0.55)
 *
 * Old formula (rms * 4.5) required RMS≈0.122 for bar-3, making the meter
 * appear stuck at 1–2 bars for typical laptop-mic speech levels.
 */
export const METER_SCALE = 9;

/**
 * Pure calibration transform — independent oracle for the level-mapping math.
 * Exported so unit tests can verify the calibration without a real AudioContext.
 *
 * @param rms - raw RMS from AnalyserNode getFloatTimeDomainData (0–1)
 * @returns calibrated level 0–1 for WbInlineMicMeter
 */
export function calibrateMicLevel(rms: number): number {
  return Math.min(1, Math.max(0, rms - METER_NOISE_FLOOR) * METER_SCALE);
}

/** Map analyser time-domain RMS into the 0–1 meter range (tutor + student). */
export function readAnalyserRmsLevel(
  analyser: AnalyserNode,
  data: Float32Array<ArrayBuffer>
): number {
  analyser.getFloatTimeDomainData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = data[i] ?? 0;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / data.length);
  return calibrateMicLevel(rms);
}

export type MicLevelMonitor = {
  getLevel: () => number;
  dispose: () => void;
};

/**
 * Lightweight analyser tap for live-A/V mic metering (student top bar).
 * Does NOT stop tracks on dispose — the stream is owned by `useLiveAV`.
 *
 * **Unsafe on student publish streams** — use only on dedicated meter
 * taps, not the track wired to RTCPeerConnection (see LIVE-AV.md).
 */
export async function createMicLevelMonitor(
  micStream: MediaStream
): Promise<MicLevelMonitor | null> {
  try {
    const audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(micStream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    source.connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    let disposed = false;
    return {
      getLevel: () => readAnalyserRmsLevel(analyser, data),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          source.disconnect();
        } catch {
          /* ignore */
        }
        void audioContext.close();
      },
    };
  } catch {
    return null;
  }
}

export type CreateMicAudioGraphOptions = {
  /** Same id as live-A/V `avx=` for correlating logs (`whiteboardSessionId`). */
  sessionId?: string;
};

export type MicAudioGraph = {
  /**
   * Stream to pass to MediaRecorder (processed: source → gain → recordingDest).
   * Independent from `publishStream` so muting one (live A/V) does NOT silence
   * the other (recording).
   *
   * Mixdown semantics: any streams attached via {@link addRemoteAudio} are
   * also summed into this destination. The MediaRecorder consuming
   * recordingStream therefore captures the tutor's mic plus every remote
   * participant's audio in one mixed track, which is what gets stored as the
   * single per-session audio file and played back on the replay page.
   */
  recordingStream: MediaStream;
  /**
   * Stream to pass to live-A/V / WebRTC (processed: source → gain → publishDest).
   *
   * Web Audio fan-out solves the "two MediaStreamTrack consumers of the same
   * hardware mic" problem: instead of cloning a getUserMedia track (which can
   * cause Chrome to send silence on the WebRTC track even though Web Audio
   * captures fine), we have ONE source feeding TWO MediaStreamDestinations.
   * Each destination produces its own independent track, but both are driven
   * by the same Web Audio pipeline — single hardware consumer.
   *
   * IMPORTANT — publishStream contains ONLY the tutor's mic (NOT the
   * recording mixdown). Routing remote audio back through publishStream
   * would feed every remote participant's voice back over WebRTC to every
   * other participant, causing an infinite feedback loop. Remote audio is
   * exclusively mixed into `recordingStream`.
   *
   * Muting publishStream's track via `track.enabled = false` for live mute is
   * safe: the recordingStream destination has its own track that stays live.
   */
  publishStream: MediaStream;
  /** Call when done to release the mic and audio context. */
  dispose: () => void;
  /** RMS-ish level 0..1 for UI meter; call from rAF. */
  getLevel: () => number;
  /** Update digital gain live (no graph rebuild needed). */
  setGain: (gainLinear: number) => void;
  /**
   * Attach a remote audio MediaStream (typically a WebRTC participant's
   * `audioStream` from `useLiveAV`) as an additional input to the
   * recording mixdown. The remote source is routed through a per-
   * stream {@link GainNode} into `recordingStream`, so the resulting
   * MediaRecorder blob contains tutor + every attached remote and
   * the workspace can mute individual participants from the recording
   * by flipping their gain to 0 (see {@link setRemoteGain}).
   *
   * Returns an unsubscribe that disconnects the remote source. Calling
   * the unsubscribe is safe at any time — including after `dispose()` —
   * and is idempotent on repeated invocations.
   *
   * Caveats:
   *
   *   - The remote stream's lifecycle is NOT owned by the graph. We do
   *     not stop its tracks on unsubscribe or on dispose; whoever owns
   *     the WebRTC connection (peer-mesh / `useLiveAV`) is responsible
   *     for that.
   *   - The graph anchors mixing to the AudioContext clock. WebRTC
   *     streams arrive at the AudioContext via `createMediaStreamSource`;
   *     a known Chrome bug requires the same MediaStream ALSO be
   *     attached to a media element on the page for the source node to
   *     produce audible samples (the AVTile component does this via its
   *     `<audio>` element, so production is covered).
   *   - If `createMediaStreamSource` throws (test stub, no audio tracks
   *     yet, etc.) we return a no-op unsubscribe and log a warning.
   *     Failing soft here is important: a single bad participant should
   *     not break the rest of the recording mixdown.
   */
  addRemoteAudio: (stream: MediaStream) => () => void;
  /**
   * Live-update the per-remote-stream gain used in the recording
   * mixdown (Phase 4d Commit 7 — per-peer moderation restore).
   * `gainLinear` is clamped to >=0; `0` is a silent "Don't record
   * this peer" while keeping the source connected so live-A/V
   * playback (the `<audio>` element on the AVTile) stays unaffected.
   *
   * No-op when `stream` is not attached to the graph (already
   * unsubscribed, or never attached). Idempotent.
   *
   * The replay UI sees a clean silence for the muted window
   * (not a gap) because the source stays connected with zero gain
   * rather than being disconnected and re-connected on toggle —
   * that's important for the existing single-blob/single-row
   * replay pipeline which has no multi-track-sync metadata.
   */
  setRemoteGain: (stream: MediaStream, gainLinear: number) => void;
  /**
   * Swap the tutor mic's {@link MediaStreamAudioSourceNode} to feed from a
   * new `getUserMedia` stream without recreating recording/publish
   * destinations (MediaRecorder continues on the same mixed graph).
   */
  swapLocalMicSource: (newMicStream: MediaStream) => void;
};

/**
 * Build source → gain → (recordingDest + publishDest) plus an analyser tap.
 * `gainLinear` is applied in the digital domain (0.25–2 typical).
 */
export async function createMicAudioGraph(
  micStream: MediaStream,
  gainLinear: number,
  options?: CreateMicAudioGraphOptions
): Promise<MicAudioGraph | null> {
  const sid = options?.sessionId ?? "?";
  try {
    const audioContext = new AudioContext();
    await audioContext.resume();

    let inboundMicStream = micStream;
    let mediaStreamSource = audioContext.createMediaStreamSource(micStream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = gainLinear;

    const recordingDest = audioContext.createMediaStreamDestination();
    const publishDest = audioContext.createMediaStreamDestination();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;

    const data = new Float32Array(analyser.fftSize);

    mediaStreamSource.connect(gainNode);
    gainNode.connect(recordingDest);
    gainNode.connect(publishDest);
    gainNode.connect(analyser);

    // Track attached remote sources so dispose() can detach them
    // explicitly. Detach also happens implicitly when the AudioContext
    // closes, but explicit detach lets unit tests assert disconnect
    // semantics without poking at the context's internal state.
    //
    // Phase 4d Commit 7: each entry carries its own GainNode so the
    // workspace can mute individual participants from the recording
    // (gain=0) without disconnecting the source — replay then sees
    // clean silence for the muted window rather than a gap.
    type RemoteEntry = {
      stream: MediaStream;
      source: MediaStreamAudioSourceNode;
      gain: GainNode;
    };
    const remoteEntries = new Set<RemoteEntry>();
    const remoteByStream = new Map<MediaStream, RemoteEntry>();
    let disposed = false;

    return {
      recordingStream: recordingDest.stream,
      publishStream: publishDest.stream,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const entry of [...remoteEntries]) {
          try {
            entry.source.disconnect();
          } catch {
            /* ignore */
          }
          try {
            entry.gain.disconnect();
          } catch {
            /* ignore */
          }
        }
        remoteEntries.clear();
        remoteByStream.clear();
        try {
          inboundMicStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        void audioContext.close();
      },
      getLevel: () => readAnalyserRmsLevel(analyser, data),
      setGain: (g: number) => {
        gainNode.gain.value = Math.max(0, g);
      },
      addRemoteAudio: (remoteStream: MediaStream) => {
        if (disposed) {
          return () => {};
        }
        // Idempotent: re-attaching the same stream is a no-op
        // (returns the original entry's unsubscribe semantics via
        // a fresh detached-aware closure).
        const existing = remoteByStream.get(remoteStream);
        if (existing) {
          let detached = false;
          return () => {
            if (detached) return;
            detached = true;
            disconnectRemoteEntry(existing);
          };
        }
        let remoteSource: MediaStreamAudioSourceNode;
        try {
          remoteSource = audioContext.createMediaStreamSource(remoteStream);
        } catch (err) {
          console.warn(
            "[mic-recorder-audio] addRemoteAudio: createMediaStreamSource failed, skipping; remote audio will not be in the mixdown",
            (err as Error)?.message ?? String(err)
          );
          return () => {};
        }
        const remoteGain = audioContext.createGain();
        remoteGain.gain.value = 1;
        const entry: RemoteEntry = {
          stream: remoteStream,
          source: remoteSource,
          gain: remoteGain,
        };
        try {
          // Phase 4d Commit 7: route source → gain → recordingDest
          // (was: source → recordingDest). The gain stays connected
          // for the lifetime of the entry; `setRemoteGain` flips its
          // value live without disconnecting. Sum into the RECORDING
          // destination only — publishStream is intentionally
          // excluded to avoid feedback (every peer's audio echoed
          // back to every other peer over WebRTC).
          remoteSource.connect(remoteGain);
          remoteGain.connect(recordingDest);
        } catch (err) {
          console.warn(
            "[mic-recorder-audio] addRemoteAudio: connect failed",
            (err as Error)?.message ?? String(err)
          );
          try {
            remoteSource.disconnect();
          } catch {
            /* ignore */
          }
          return () => {};
        }
        remoteEntries.add(entry);
        remoteByStream.set(remoteStream, entry);
        let detached = false;
        return () => {
          if (detached) return;
          detached = true;
          disconnectRemoteEntry(entry);
        };
      },
      setRemoteGain: (remoteStream: MediaStream, gainLinear: number) => {
        const entry = remoteByStream.get(remoteStream);
        if (!entry) return;
        const clamped = Math.max(0, gainLinear);
        try {
          entry.gain.gain.value = clamped;
        } catch {
          // AudioContext closed under us mid-flight. The detach
          // path will clean the entry; nothing to do here.
        }
      },
      swapLocalMicSource: (newMicStream: MediaStream) => {
        if (disposed) return;
        try {
          mediaStreamSource.disconnect();
        } catch {
          /* ignore */
        }
        let newSource: MediaStreamAudioSourceNode;
        try {
          newSource = audioContext.createMediaStreamSource(newMicStream);
        } catch (err) {
          console.warn(
            `[mic-recorder-audio] avx=${sid} event=swap-local-source reason=create-source-failed`,
            (err as Error)?.message ?? String(err)
          );
          return;
        }
        try {
          newSource.connect(gainNode);
          mediaStreamSource = newSource;
          inboundMicStream = newMicStream;
          console.log(
            `[mic-recorder-audio] avx=${sid} event=swap-local-source`
          );
        } catch (err) {
          console.warn(
            `[mic-recorder-audio] avx=${sid} event=swap-local-source reason=connect-failed`,
            (err as Error)?.message ?? String(err)
          );
          try {
            newSource.disconnect();
          } catch {
            /* ignore */
          }
        }
      },
    };

    function disconnectRemoteEntry(entry: RemoteEntry): void {
      remoteEntries.delete(entry);
      remoteByStream.delete(entry.stream);
      try {
        entry.source.disconnect();
      } catch {
        /* ignore — context may already be closed */
      }
      try {
        entry.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  } catch {
    return null;
  }
}
