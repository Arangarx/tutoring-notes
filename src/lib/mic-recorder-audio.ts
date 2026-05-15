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

    return {
      recordingStream: recordingDest.stream,
      publishStream: publishDest.stream,
      dispose: () => {
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
    };
  } catch {
    return null;
  }
}
