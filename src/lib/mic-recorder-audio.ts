/**
 * Web Audio helpers for in-browser recording: optional gain + level metering.
 * Falls back to the raw MediaStream if Web Audio is unavailable or throws
 * (e.g. tests with a stub MediaStream).
 */

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
  /**
   * Frame-accurate recording clock. Returns elapsed recording-active
   * milliseconds: frames counted while setActive(true), converted via
   * sampleRate. Monotonic. Cumulative across rollovers (never resets).
   * Freezes if the AudioContext is suspended (e.g. iOS background).
   */
  frameClockGetMs: () => number;
  /**
   * Gate the frame counter. Call true on recording start/resume,
   * false on pause/stop. Only frames counted while active contribute
   * to the clock — matches the MediaRecorder's recording/paused state.
   */
  frameClockSetActive: (active: boolean) => void;
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

    audioContext.onstatechange = () => {
      console.log(
        `[mic-recorder-audio] avx=${sid} event=audiocontext-state-change state=${audioContext.state}`
      );
    };

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
    gainNode.connect(publishDest);
    gainNode.connect(analyser);

    // Frame counter — accumulates only while frameClockActive=true.
    let frameClockActive = false;
    let accumulatedFrames = 0;
    let lastWorkletFrames = 0;

    const workletName = `frame-counter-${sid}-${Date.now()}`;
    const workletCode = `
      class FrameCounterProcessor extends AudioWorkletProcessor {
        constructor() { super(); this._active = false; this._frames = 0;
          this.port.onmessage = e => { if (e.data?.type === 'setActive') this._active = e.data.active; };
        }
        process(inputs, outputs) {
          const ch = inputs[0]?.[0];
          if (this._active && ch?.length) {
            this._frames += ch.length;
            if (this._frames % 1024 < ch.length) this.port.postMessage({ frames: this._frames });
          }
          const out = outputs[0]?.[0];
          if (out && ch) out.set(ch);
          return true;
        }
      }
      registerProcessor('${workletName}', FrameCounterProcessor);
    `;

    let useWorklet = false;
    let workletNode: AudioWorkletNode | null = null;
    let scriptNode: ScriptProcessorNode | null = null;

    if (audioContext.audioWorklet) {
      try {
        const blob = new Blob([workletCode], { type: "text/javascript" });
        const url = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        workletNode = new AudioWorkletNode(audioContext, workletName);
        workletNode.port.onmessage = (e) => {
          if (e.data?.frames !== undefined) lastWorkletFrames = e.data.frames;
        };
        workletNode.port.postMessage({ type: "setActive", active: false });
        gainNode.connect(workletNode);
        workletNode.connect(recordingDest);
        useWorklet = true;
        console.log(`[mic-recorder-audio] avx=${sid} frame-counter=audioworklet`);
      } catch (err) {
        console.warn(
          `[mic-recorder-audio] avx=${sid} AudioWorklet init failed; falling back:`,
          (err as Error)?.message ?? String(err)
        );
        try {
          gainNode.connect(recordingDest);
        } catch {
          /* ignore */
        }
      }
    }

    if (!useWorklet) {
      try {
        scriptNode = audioContext.createScriptProcessor(256, 1, 1);
        scriptNode.onaudioprocess = (e) => {
          if (frameClockActive) accumulatedFrames += e.inputBuffer.length;
          const inCh = e.inputBuffer.getChannelData(0);
          const outCh = e.outputBuffer.getChannelData(0);
          outCh.set(inCh);
        };
        gainNode.connect(scriptNode);
        scriptNode.connect(recordingDest);
        console.log(`[mic-recorder-audio] avx=${sid} frame-counter=script-processor`);
      } catch (err) {
        console.warn(
          `[mic-recorder-audio] avx=${sid} ScriptProcessorNode init failed; frame clock unavailable:`,
          (err as Error)?.message ?? String(err)
        );
        try {
          gainNode.connect(recordingDest);
        } catch {
          /* ignore */
        }
      }
    }

    const sampleRate = audioContext.sampleRate;

    const frameClockGetMs = (): number => {
      if (useWorklet) {
        return Math.floor((lastWorkletFrames * 1000) / sampleRate);
      }
      return Math.floor((accumulatedFrames * 1000) / sampleRate);
    };

    const frameClockSetActive = (active: boolean): void => {
      frameClockActive = active;
      if (useWorklet && workletNode) {
        try {
          workletNode.port.postMessage({ type: "setActive", active });
        } catch {
          /* AudioContext may be closed */
        }
      }
    };

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
        try {
          workletNode?.disconnect();
        } catch {
          /* ignore */
        }
        try {
          scriptNode?.disconnect();
        } catch {
          /* ignore */
        }
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
      frameClockGetMs,
      frameClockSetActive,
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
