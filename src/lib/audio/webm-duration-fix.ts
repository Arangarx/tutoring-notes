/**
 * Workaround for the Chrome `MediaRecorder` WebM duration bug.
 *
 * Chrome's `MediaRecorder` writes a streaming WebM container with no
 * duration in the header. As a result, when the resulting blob is
 * played back through an `<audio>` element:
 *
 *   - `<audio>.duration` reports `Infinity` until the browser has
 *     scanned the file to its end.
 *   - The native scrubber renders but is non-draggable (clicks reset
 *     `currentTime` to 0).
 *   - In some Chromium versions clicking play does nothing at all.
 *
 * The standard workaround, documented on the Chromium bug tracker
 * (https://bugs.chromium.org/p/chromium/issues/detail?id=642012), is:
 *
 *   1. Wait for `loadedmetadata`.
 *   2. If `duration` is `Infinity` / `NaN`, set `currentTime` to a
 *      huge value (e.g. `1e101`). Chrome will scan the whole file to
 *      find the real end and fire `durationchange` with the real
 *      duration.
 *   3. On the resulting `durationchange`, reset `currentTime` to 0.
 *
 * The hack is WebM-specific. iOS Safari plays back MP4/m4a which
 * already carries a duration header; assigning a wildly out-of-range
 * `currentTime` there throws or puts the element into an error state,
 * so we explicitly gate on the mime type.
 *
 * Chrome may also fire an `error` event right after the out-of-range
 * seek even though the audio loaded fine and is playable. We
 * suppress that case (loaded ok ⇒ `error` is spurious) — letting
 * callers react to `error` only on actual load failures.
 *
 * Previously this lived inline in `<AudioPreview>` for the
 * post-record preview surface. Phase 1b hotfix extracted it after
 * Sarah reported the whiteboard replay scrubber was non-draggable on
 * a fresh visit (hard-refresh masked it because the browser fully
 * buffered the file). The replay player's `<audio>` element never
 * had the hack applied; the scene-paint engine drove the clock fine
 * but the native scrubber was inert until Chrome had scanned the
 * full file by chance.
 *
 * @param audio    The HTML audio element to attach handlers to.
 * @param mimeType The recording's mime type, used to gate the WebM
 *                 hack. Pass the full `audio/webm;codecs=opus`
 *                 string — we case-fold + substring-match `webm`.
 * @param options.onMetadataLoaded Optional hook that fires on the
 *                 audio element's `loadedmetadata` event, regardless
 *                 of whether the WebM hack applies. Use it to drive
 *                 "Audio loading…" UI without registering a second
 *                 listener.
 * @param options.onLoadFailed     Optional hook that fires on `error`
 *                 only when metadata has NOT yet loaded — i.e. a
 *                 genuine load failure, not a spurious post-seek
 *                 error. Lets callers render an "unavailable in this
 *                 browser" fallback without having to disambiguate
 *                 spurious errors themselves.
 *
 * @returns A cleanup function that removes the listeners. Always
 *          call it from `useEffect` cleanup or you'll leak handlers
 *          across re-renders.
 */
export type AttachWebmDurationFixOptions = {
  onMetadataLoaded?: () => void;
  onLoadFailed?: () => void;
};

export type AttachWebmDurationFixResult = {
  /** Remove all listeners added by the fix. Call from useEffect cleanup. */
  cleanup: () => void;
  /**
   * Cancel any pending durationchange reset-to-0.
   * Call this when the user (or player code) has intentionally seeked to a
   * specific position so the fix doesn't clobber it on durationchange.
   */
  cancelPendingFix: () => void;
};

export function attachWebmDurationFix(
  audio: HTMLAudioElement,
  mimeType: string | null | undefined,
  options: AttachWebmDurationFixOptions = {}
): AttachWebmDurationFixResult {
  const isWebm = (mimeType ?? "").toLowerCase().includes("webm");

  // State lives in closures (not React refs) so this helper is
  // framework-agnostic; AudioPreview wraps it with refs to keep the
  // existing test surface, but the helper itself is plain DOM.
  let loadedOk = false;
  let needsFix = false;

  function onLoadedMetadata() {
    loadedOk = true;
    options.onMetadataLoaded?.();
    if (!isWebm) return;
    if (!Number.isFinite(audio.duration) || audio.duration === 0) {
      needsFix = true;
      try {
        audio.currentTime = 1e101;
      } catch {
        // Some browsers throw on out-of-range currentTime. Harmless;
        // the user can still press play and it will work, just
        // without a draggable scrubber.
        needsFix = false;
      }
    }
  }

  function onDurationChange() {
    if (!needsFix) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      needsFix = false;
      // Don't reset position if audio is actively playing — the play() call
      // already positioned it correctly; resetting would jump the playhead.
      if (!audio.paused && !audio.ended) return;
      // Don't reset if a seek is in progress — the controller has already
      // set currentTime to the intended seek target; clobbering it here would
      // restart audio from 0.
      if (audio.seeking) return;
      console.log("[avx] webmfix_reset_currentTime");
      try {
        audio.currentTime = 0;
      } catch {
        // Reset to 0 is best-effort; ignore.
      }
    }
  }

  function onError() {
    // Chrome can fire `error` immediately after our out-of-range
    // seek even though the audio loaded fine. If metadata already
    // loaded, the audio is usable — swallow the spurious event.
    if (loadedOk) {
      needsFix = false;
      return;
    }
    options.onLoadFailed?.();
  }

  audio.addEventListener("loadedmetadata", onLoadedMetadata);
  audio.addEventListener("durationchange", onDurationChange);
  audio.addEventListener("error", onError);

  // Catch-up: if the audio already advanced past `HAVE_METADATA`
  // before we attached, fire the handler manually.
  //
  // This is the actual root cause of the intermittent "scrubber
  // non-draggable on first load, works after hard refresh"
  // regression reported during Phase 1b smoke testing. On a hard
  // refresh, network latency means `loadedmetadata` fires AFTER the
  // useEffect attaches the listener — the hack runs, the scrubber
  // works. On a soft load (link click, back-navigation), the audio
  // is served from the HTTP cache and `loadedmetadata` fires
  // synchronously when `src=` is assigned, BEFORE the
  // `attachWebmDurationFix` useEffect runs — the listener attaches
  // after the train left the station, the hack never runs, the
  // scrubber stays inert.
  //
  // `HAVE_METADATA = 1`: duration + dimensions known. Higher
  // ready-states (`HAVE_CURRENT_DATA = 2`, etc.) also satisfy this
  // — the event already fired regardless.
  //
  // GUARD: do NOT fire the WebM hack (currentTime = 1e101) while
  // audio is actively playing.  The replay player re-mounts this
  // fix when segment mimeType changes, which can happen mid-playback
  // during a segment advance.  Setting currentTime while the element
  // is playing would reset the playhead to 0 — causing the current
  // segment to replay from the beginning and firing a second `ended`
  // event, which Andrew observed as "replays segment 2 after
  // reaching end-of-timeline" (S3).  If the audio is playing, mark
  // it as loaded (so the error-suppression logic works) and skip
  // the hack — the real `loadedmetadata` event already ran and the
  // duration was either fixed then or is already finite.
  if (audio.readyState >= 1) {
    if (!audio.paused && !audio.ended) {
      // Audio is actively playing — skip the currentTime thrash.
      loadedOk = true;
      options.onMetadataLoaded?.();
    } else {
      onLoadedMetadata();
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        onDurationChange();
      }
    }
  }

  return {
    cleanup: () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
    },
    cancelPendingFix: () => {
      needsFix = false;
    },
  };
}
