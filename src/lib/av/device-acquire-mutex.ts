/**
 * Process-wide device-acquire mutex (LIVE-AV invariant 14).
 *
 * Tutor first-acquire historically ran `useAudioRecorder.acquireMic` GUM /
 * enumerate **outside** `useLiveAV`'s per-hook chain while auto-`requestCam`
 * ran concurrently — Windows Brio can latch a live-but-silent mic endpoint
 * while video still paints. Sharing one tail serializes recorder + live A/V.
 */

/** Serialize every `getUserMedia` / device-enumerate call on this page. */
export function chainDeviceAcquire<T>(
  tail: { current: Promise<void> },
  work: () => Promise<T>
): Promise<T> {
  const next = tail.current.then(work, work);
  tail.current = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Shared mutex tail for tutor recorder + live A/V on the same document.
 * Both hooks must route acquire/enumerate through this (or the same object).
 */
export const sharedDeviceAcquireMutex: { current: Promise<void> } = {
  current: Promise.resolve(),
};
