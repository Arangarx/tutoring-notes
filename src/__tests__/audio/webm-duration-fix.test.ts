/**
 * @jest-environment jsdom
 *
 * Unit tests for `attachWebmDurationFix`.
 *
 * The helper exists to keep Chrome's `MediaRecorder` WebM scrubber
 * usable on playback surfaces. This suite locks the cross-cutting
 * behaviour both `<AudioPreview>` (post-record review) and
 * `<WhiteboardReplay>` rely on:
 *
 *   - WebM blobs with `duration = Infinity` get the seek-to-end
 *     hack on `loadedmetadata`, then reset on `durationchange`.
 *   - Non-WebM (MP4) mime types skip the hack entirely.
 *   - Spurious `error` events that fire right after our out-of-range
 *     seek are swallowed if metadata already loaded.
 *   - Genuine `error` before metadata triggers the `onLoadFailed`
 *     callback so callers can render a fallback.
 *   - `onMetadataLoaded` fires on every load, regardless of mime
 *     type — this is what `<WhiteboardReplay>` uses to hide its
 *     "Audio loading…" hint.
 *   - The returned cleanup actually detaches the listeners.
 */

import { attachWebmDurationFix } from "@/lib/audio/webm-duration-fix";

function makeAudio({
  duration = NaN,
}: { duration?: number } = {}): HTMLAudioElement {
  const audio = document.createElement("audio");
  // jsdom's `<audio>.duration` defaults to NaN; we let callers
  // override it to simulate "duration has now resolved" after our
  // seek hack.
  Object.defineProperty(audio, "duration", {
    configurable: true,
    get: () => duration,
  });
  return audio;
}

function setDuration(audio: HTMLAudioElement, value: number) {
  Object.defineProperty(audio, "duration", {
    configurable: true,
    get: () => value,
  });
}

describe("attachWebmDurationFix", () => {
  it("applies the seek hack on loadedmetadata for WebM with Infinity duration", () => {
    const audio = makeAudio();
    setDuration(audio, Infinity);
    attachWebmDurationFix(audio, "audio/webm;codecs=opus");

    audio.dispatchEvent(new Event("loadedmetadata"));

    // currentTime was bumped (jsdom may clamp; >0 is enough to prove
    // the seek-to-end branch fired).
    expect(audio.currentTime).toBeGreaterThan(0);
  });

  it("resets currentTime to 0 on durationchange once duration is finite", () => {
    const audio = makeAudio();
    setDuration(audio, Infinity);
    attachWebmDurationFix(audio, "audio/webm;codecs=opus");

    audio.dispatchEvent(new Event("loadedmetadata"));
    expect(audio.currentTime).toBeGreaterThan(0);

    setDuration(audio, 123.4);
    audio.dispatchEvent(new Event("durationchange"));

    expect(audio.currentTime).toBe(0);
  });

  it("does NOT apply the hack for MP4 (iOS Safari)", () => {
    const audio = makeAudio();
    setDuration(audio, Infinity);
    attachWebmDurationFix(audio, "audio/mp4");

    audio.dispatchEvent(new Event("loadedmetadata"));

    // MP4 already has correct duration headers; jumping currentTime
    // out of range crashes Safari. Helper must no-op.
    expect(audio.currentTime).toBe(0);
  });

  it("does NOT apply the hack when duration is already finite", () => {
    const audio = makeAudio();
    setDuration(audio, 42);
    attachWebmDurationFix(audio, "audio/webm;codecs=opus");

    audio.dispatchEvent(new Event("loadedmetadata"));

    expect(audio.currentTime).toBe(0);
  });

  it("invokes onMetadataLoaded regardless of mime type", () => {
    const onMetadataLoaded = jest.fn();
    const audio = makeAudio();
    setDuration(audio, 12);
    attachWebmDurationFix(audio, "audio/mp4", { onMetadataLoaded });

    audio.dispatchEvent(new Event("loadedmetadata"));

    expect(onMetadataLoaded).toHaveBeenCalledTimes(1);
  });

  it("swallows spurious error events that fire after metadata loaded", () => {
    const onLoadFailed = jest.fn();
    const audio = makeAudio();
    setDuration(audio, Infinity);
    attachWebmDurationFix(audio, "audio/webm", { onLoadFailed });

    // Chrome sequence: metadata loads, our out-of-range seek
    // triggers an error from the demuxer even though the audio is
    // playable. Helper must NOT call onLoadFailed in this case.
    audio.dispatchEvent(new Event("loadedmetadata"));
    audio.dispatchEvent(new Event("error"));

    expect(onLoadFailed).not.toHaveBeenCalled();
  });

  it("calls onLoadFailed when error fires BEFORE loadedmetadata", () => {
    const onLoadFailed = jest.fn();
    const audio = makeAudio();
    attachWebmDurationFix(audio, "audio/webm", { onLoadFailed });

    audio.dispatchEvent(new Event("error"));

    expect(onLoadFailed).toHaveBeenCalledTimes(1);
  });

  it("returns a cleanup that detaches all listeners", () => {
    const onMetadataLoaded = jest.fn();
    const onLoadFailed = jest.fn();
    const audio = makeAudio();
    setDuration(audio, Infinity);
    const detach = attachWebmDurationFix(audio, "audio/webm", {
      onMetadataLoaded,
      onLoadFailed,
    });

    detach();

    audio.dispatchEvent(new Event("loadedmetadata"));
    audio.dispatchEvent(new Event("error"));
    audio.dispatchEvent(new Event("durationchange"));

    expect(onMetadataLoaded).not.toHaveBeenCalled();
    expect(onLoadFailed).not.toHaveBeenCalled();
    // currentTime untouched because the loadedmetadata handler
    // never ran.
    expect(audio.currentTime).toBe(0);
  });

  it("handles missing mime type (treated as non-WebM)", () => {
    const audio = makeAudio();
    setDuration(audio, Infinity);
    attachWebmDurationFix(audio, null);

    audio.dispatchEvent(new Event("loadedmetadata"));

    expect(audio.currentTime).toBe(0);
  });

  it(
    "catches up if metadata already loaded before attach (cached-blob race)",
    () => {
      // This is the exact scenario behind the Sarah scrubber regression:
      // the audio src is set, the browser serves the response from
      // HTTP cache and fires `loadedmetadata` synchronously, then our
      // React useEffect runs and attaches the listener — too late.
      //
      // The helper MUST catch up by reading `readyState` and firing
      // the handlers manually. Without this, the WebM hack never
      // runs on soft loads and the scrubber stays non-draggable.
      const audio = makeAudio();
      setDuration(audio, Infinity);
      // Simulate the browser having already advanced to HAVE_METADATA.
      Object.defineProperty(audio, "readyState", {
        configurable: true,
        get: () => 1,
      });

      const onMetadataLoaded = jest.fn();
      attachWebmDurationFix(audio, "audio/webm;codecs=opus", {
        onMetadataLoaded,
      });

      // Catch-up should have fired both handlers synchronously.
      expect(onMetadataLoaded).toHaveBeenCalledTimes(1);
      expect(audio.currentTime).toBeGreaterThan(0);
    }
  );

  it(
    "catch-up also resets to 0 if duration is already finite at attach",
    () => {
      // Tail case: by the time the listener attaches, the browser
      // has fully resolved duration (e.g. the audio file is short
      // and came straight from the cache). Helper should still
      // fire the metadata callback and NOT seek out-of-range.
      const audio = makeAudio();
      setDuration(audio, 8);
      Object.defineProperty(audio, "readyState", {
        configurable: true,
        get: () => 2 /* HAVE_CURRENT_DATA */,
      });

      const onMetadataLoaded = jest.fn();
      attachWebmDurationFix(audio, "audio/webm;codecs=opus", {
        onMetadataLoaded,
      });

      expect(onMetadataLoaded).toHaveBeenCalledTimes(1);
      // Duration was already finite so the hack must not have run.
      expect(audio.currentTime).toBe(0);
    }
  );

  it(
    "does NOT catch up when readyState is still HAVE_NOTHING",
    () => {
      const audio = makeAudio();
      setDuration(audio, Infinity);
      Object.defineProperty(audio, "readyState", {
        configurable: true,
        get: () => 0 /* HAVE_NOTHING */,
      });

      const onMetadataLoaded = jest.fn();
      attachWebmDurationFix(audio, "audio/webm;codecs=opus", {
        onMetadataLoaded,
      });

      expect(onMetadataLoaded).not.toHaveBeenCalled();
      expect(audio.currentTime).toBe(0);
    }
  );
});
