/**
 * Web Audio helpers for in-browser recording: optional gain + level metering.
 * Falls back to the raw MediaStream if Web Audio is unavailable or throws
 * (e.g. tests with a stub MediaStream).
 */

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
   * recording mixdown. The remote source is summed into `recordingStream`
   * via Web Audio's implicit mixing at the shared destination node, so
   * the resulting MediaRecorder blob contains tutor + every attached
   * remote.
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
};

/**
 * Build source → gain → (recordingDest + publishDest) plus an analyser tap.
 * `gainLinear` is applied in the digital domain (0.25–2 typical).
 */
export async function createMicAudioGraph(
  micStream: MediaStream,
  gainLinear: number
): Promise<MicAudioGraph | null> {
  try {
    const audioContext = new AudioContext();
    await audioContext.resume();

    const source = audioContext.createMediaStreamSource(micStream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = gainLinear;

    const recordingDest = audioContext.createMediaStreamDestination();
    const publishDest = audioContext.createMediaStreamDestination();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;

    const data = new Float32Array(analyser.fftSize);

    source.connect(gainNode);
    gainNode.connect(recordingDest);
    gainNode.connect(publishDest);
    gainNode.connect(analyser);

    // Track attached remote sources so dispose() can detach them
    // explicitly. Detach also happens implicitly when the AudioContext
    // closes, but explicit detach lets unit tests assert disconnect
    // semantics without poking at the context's internal state.
    type RemoteEntry = {
      stream: MediaStream;
      source: MediaStreamAudioSourceNode;
    };
    const remoteEntries = new Set<RemoteEntry>();
    let disposed = false;

    return {
      recordingStream: recordingDest.stream,
      publishStream: publishDest.stream,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const entry of remoteEntries) {
          try {
            entry.source.disconnect();
          } catch {
            /* ignore */
          }
        }
        remoteEntries.clear();
        try {
          micStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        void audioContext.close();
      },
      getLevel: () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] ?? 0;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        // Map typical speech RMS (~0.01–0.2) into a visible 0–1 range.
        return Math.min(1, rms * 4.5);
      },
      setGain: (g: number) => {
        gainNode.gain.value = Math.max(0, g);
      },
      addRemoteAudio: (remoteStream: MediaStream) => {
        if (disposed) {
          return () => {};
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
        const entry: RemoteEntry = { stream: remoteStream, source: remoteSource };
        try {
          // Sum into the RECORDING destination only — publishStream is
          // intentionally excluded to avoid sending every peer's audio
          // back to every other peer over WebRTC (feedback loop).
          remoteSource.connect(recordingDest);
        } catch (err) {
          console.warn(
            "[mic-recorder-audio] addRemoteAudio: connect failed",
            (err as Error)?.message ?? String(err)
          );
          return () => {};
        }
        remoteEntries.add(entry);
        let detached = false;
        return () => {
          if (detached) return;
          detached = true;
          remoteEntries.delete(entry);
          try {
            remoteSource.disconnect();
          } catch {
            /* ignore — context may already be closed */
          }
        };
      },
    };
  } catch {
    return null;
  }
}
