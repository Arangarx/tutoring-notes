/**
 * Shared getUserMedia retry helpers for enumerate-slot device pickers.
 * Some OEMs (Windows Logitech Brio rows, Android) duplicate `deviceId` across
 * sibling `audioinput` / `videoinput` rows — pick by slot + `groupId`.
 */

/**
 * Raw RMS threshold below which a track is considered silent.
 * Truly silent tracks (wrong OS audio endpoint, hardware gain=0) report
 * raw RMS ≈ 0.  Quiet rooms still generate ambient pickup above ~0.002.
 * 0.0005 is safely above absolute zero and below ambient room noise.
 */
export const SILENT_TRACK_RAW_RMS_THRESHOLD = 0.0005;

/** How long to sample audio frames before deciding silence. */
const SILENT_TRACK_SAMPLE_MS = 250;

type SilentTrackTestWindow = {
  __VAD_TEST_SILENT_TRACK__?: boolean;
};

/**
 * Returns true if the first audio track in `stream` appears silent
 * (raw RMS < SILENT_TRACK_RAW_RMS_THRESHOLD after a ~250 ms sampling window).
 *
 * This catches the "GUM succeeds but returns a live-but-silent track" class of
 * Logitech Brio / Windows bugs — the OS audio engine picks the wrong input
 * endpoint when constrained by `deviceId: { exact }` alone.
 *
 * - Returns false (not silent) when Web Audio is unavailable (jsdom, server).
 * - Test seam: set `window.__VAD_TEST_SILENT_TRACK__ = true|false` in
 *   non-production environments to override the real AudioContext sampling.
 */
export async function isMicStreamSilent(stream: MediaStream): Promise<boolean> {
  // Test / non-prod override — avoids AudioContext in jest/jsdom.
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const w = window as unknown as SilentTrackTestWindow;
    if (typeof w.__VAD_TEST_SILENT_TRACK__ === "boolean") {
      return w.__VAD_TEST_SILENT_TRACK__;
    }
  }

  try {
    const audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    // No smoothing: we want the raw frame values, not a time-smoothed average.
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0;
    source.connect(analyser);

    // Wait for the audio pipeline to produce frames.
    await new Promise<void>((resolve) => setTimeout(resolve, SILENT_TRACK_SAMPLE_MS));

    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] ?? 0;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);

    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    await audioContext.close();

    return rms < SILENT_TRACK_RAW_RMS_THRESHOLD;
  } catch {
    // AudioContext unavailable (server, jsdom without mock) — treat as non-silent
    // so we don't block acquisition on unsupported environments.
    return false;
  }
}

export function mediaInputsHaveDuplicateIds(list: MediaDeviceInfo[]): boolean {
  const ids = list.map((d) => d.deviceId);
  if (ids.length >= 2 && ids.filter((id) => !id || id === "").length >= 2) {
    return true;
  }
  const nonEmpty = ids.filter(Boolean);
  return nonEmpty.length !== new Set(nonEmpty).size;
}

export function fingerprintMediaTrackSettings(s: MediaTrackSettings): string {
  return `${s.deviceId ?? ""}|${s.groupId ?? ""}`;
}

export function reconcilePickerSlotAfterEnumerate(
  preferredDeviceId: string | null,
  list: MediaDeviceInfo[],
  prevSlot: number,
  pinnedGroupId: string
): number {
  if (list.length === 0) return 0;
  const max = list.length - 1;
  const clamped = Math.max(0, Math.min(prevSlot, max));
  if (!preferredDeviceId) return clamped;

  const atPrev = list[clamped];
  if (
    atPrev?.deviceId === preferredDeviceId &&
    (!pinnedGroupId ||
      !atPrev.groupId ||
      atPrev.groupId === pinnedGroupId)
  ) {
    return clamped;
  }

  if (pinnedGroupId) {
    const byPinned = list.findIndex(
      (d) =>
        d.deviceId === preferredDeviceId && d.groupId === pinnedGroupId
    );
    if (byPinned >= 0) return byPinned;
  }

  const idx = list.findIndex((d) => d.deviceId === preferredDeviceId);
  if (idx >= 0) return idx;

  return clamped;
}

export function disposeStreamTracks(
  stream: MediaStream | null | undefined
): void {
  if (!stream) return;
  for (const t of stream.getTracks()) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
}

export async function getUserMediaAudioForEnumerateEntry(
  getUM: (c: MediaStreamConstraints) => Promise<MediaStream>,
  entry: MediaDeviceInfo,
  allAudioinputs: MediaDeviceInfo[],
  priorFingerprint: string | null,
  opts?: { userPickedSlot?: boolean }
): Promise<{ stream: MediaStream; fingerprint: string }> {
  const requireDifferent =
    !opts?.userPickedSlot &&
    priorFingerprint !== null &&
    allAudioinputs.length > 1;

  const attempts: Array<MediaTrackConstraints | boolean> = [];

  // User picked a specific enumerate row — try groupId pairing first.
  if (entry.groupId) {
    attempts.push({ groupId: { exact: entry.groupId } });
  }
  if (entry.deviceId && entry.groupId) {
    attempts.push({
      deviceId: { exact: entry.deviceId },
      groupId: { exact: entry.groupId },
    });
  }

  const baseIdeal: MediaTrackConstraints = {};
  if (entry.deviceId) baseIdeal.deviceId = { ideal: entry.deviceId };
  if (entry.groupId) baseIdeal.groupId = { ideal: entry.groupId };
  if (Object.keys(baseIdeal).length > 0) attempts.push(baseIdeal);

  if (entry.deviceId) {
    attempts.push({
      deviceId: { exact: entry.deviceId },
      ...(entry.groupId ? { groupId: { ideal: entry.groupId } } : {}),
    });
    attempts.push({
      deviceId: { exact: entry.deviceId },
      ...(entry.groupId ? { groupId: { exact: entry.groupId } } : {}),
    });
    attempts.push({ deviceId: { exact: entry.deviceId } });
  }

  if (entry.groupId) {
    attempts.push({ groupId: { ideal: entry.groupId } });
    attempts.push({ groupId: { exact: entry.groupId } });
  }

  attempts.push(true);

  let lastErr: unknown = null;
  for (const aud of attempts) {
    let stream: MediaStream;
    try {
      stream = await getUM({
        audio: aud,
        video: false,
      });
    } catch (e) {
      lastErr = e;
      continue;
    }

    const t = stream.getAudioTracks()[0];
    const fp =
      fingerprintMediaTrackSettings(t?.getSettings?.() ?? {}) || "|";

    const looksUnchanged =
      requireDifferent && priorFingerprint !== null && fp === priorFingerprint;

    if (!looksUnchanged) {
      return { stream, fingerprint: fp };
    }

    if (process.env.NODE_ENV !== "production") {
      console.debug(
        `[enumerate-device-acquire] mic-pick discarded same-fingerprint fps=${priorFingerprint ?? "<none>"}`
      );
    }
    disposeStreamTracks(stream);
  }

  try {
    const fallback = await getUM({ audio: true, video: false });
    const t = fallback.getAudioTracks()[0];
    if (!t) {
      disposeStreamTracks(fallback);
    } else {
      console.warn(
        `[enumerate-device-acquire] mic picker exhausted constraints; fingerprints may collide on this device`
      );
      return {
        stream: fallback,
        fingerprint: fingerprintMediaTrackSettings(t.getSettings?.() ?? {}),
      };
    }
  } catch {
    /* fall through */
  }

  throw lastErr instanceof Error
    ? lastErr
    : new DOMException(String(lastErr ?? "constraints failed"));
}
