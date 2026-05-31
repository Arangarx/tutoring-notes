/**
 * Defer `<audio>` range fetches during native-scrubber drag on replay.
 *
 * Dragging the browser's built-in timeline sets `currentTime` on every
 * intermediate tick, which issues a burst of `GET /api/audio/...` range
 * requests (429 storm on long sessions — see BACKLOG "Replay scrub drag").
 *
 * While the pointer is down on the audio element we:
 *   - paint the whiteboard from the scrub target time (in-memory only);
 *   - revert `audio.currentTime` to the last committed position so the
 *     browser does not open new range requests mid-drag.
 *
 * On pointer release we commit `currentTime` once (one fetch) and notify
 * the host so the throttled play loop can `seek()`.
 *
 * A monotonic generation counter drops stale commit callbacks when a new
 * scrub-drop supersedes an in-flight seek.
 */

export type ReplayScrubAudioDeferDeps = {
  /** Last playhead position that was allowed to hit the network. */
  getCommittedSec: () => number;
  setCommittedSec: (sec: number) => void;
  /** Visual-only update (scene + elapsed label) during drag. */
  onVisualSeekMs: (ms: number) => void;
  /**
   * Audio playhead committed after scrub release (or click without drag).
   * `generation` bumps on every commit; ignore stale callbacks when a newer
   * scrub-drop superseded an in-flight seek.
   */
  onAudioCommitSec: (sec: number, generation: number) => void;
};

export function attachReplayScrubAudioDefer(
  audio: HTMLAudioElement,
  deps: ReplayScrubAudioDeferDeps
): () => void {
  const { getCommittedSec, setCommittedSec, onVisualSeekMs, onAudioCommitSec } =
    deps;

  let pointerDownOnAudio = false;
  let pendingScrubSec: number | null = null;
  let commitGeneration = 0;
  /** Prevents double commit when both pointerup and seeked fire for one gesture. */
  let gestureCommitted = false;

  const commitPlayhead = (targetSec: number) => {
    commitGeneration += 1;
    const gen = commitGeneration;
    setCommittedSec(targetSec);
    audio.currentTime = targetSec;
    onAudioCommitSec(targetSec, gen);
    return gen;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (typeof ev.button === "number" && ev.button !== 0) return;
    pointerDownOnAudio = true;
    gestureCommitted = false;
    pendingScrubSec = null;
    // Anchor reverts to the live playhead when the scrub gesture starts.
    setCommittedSec(audio.currentTime);
  };

  const onPointerUp = () => {
    if (!pointerDownOnAudio) return;
    pointerDownOnAudio = false;

    const targetSec = pendingScrubSec ?? audio.currentTime;
    pendingScrubSec = null;

    gestureCommitted = true;
    commitPlayhead(targetSec);
  };

  const onSeeking = () => {
    const targetSec = audio.currentTime;
    pendingScrubSec = targetSec;
    onVisualSeekMs(Math.max(0, Math.floor(targetSec * 1000)));

    if (pointerDownOnAudio) {
      // Revert playhead so the browser does not range-fetch mid-drag.
      const committed = getCommittedSec();
      if (audio.currentTime !== committed) {
        audio.currentTime = committed;
      }
    }
  };

  const onSeeked = () => {
    // Drag: commit on pointerup only. Click: pointerup may follow seeked.
    if (pointerDownOnAudio || gestureCommitted) return;
    gestureCommitted = true;
    commitPlayhead(audio.currentTime);
  };

  audio.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  audio.addEventListener("seeking", onSeeking);
  audio.addEventListener("seeked", onSeeked);

  return () => {
    audio.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    audio.removeEventListener("seeking", onSeeking);
    audio.removeEventListener("seeked", onSeeked);
  };
}
