"use client";

import { useEffect, useRef, useState } from "react";
import { attachWebmDurationFix } from "@/lib/audio/webm-duration-fix";

/**
 * <audio> element that works around Chrome's MediaRecorder WebM bug.
 *
 * The hack itself (seek-to-end → durationchange → reset) is shared
 * via `attachWebmDurationFix` so the whiteboard replay surface gets
 * the same fix without copy-paste drift. See that helper for the
 * full background.
 *
 * What this component adds on top of the helper:
 *   - A "preview unavailable" fallback if the audio element fires
 *     `error` BEFORE `loadedmetadata`. Helpful in browsers that
 *     can't decode the recording at all (legacy Safari, etc.).
 *   - The `data-testid="audio-preview"` / `audio-preview-error`
 *     surface used by the post-record review tests.
 *
 * Phase 4 of the recorder refactor originally extracted this from
 * AiAssistPanel for its own jsdom test. The Phase 1b scrubber
 * hotfix re-extracted the duration-fix logic into the shared helper
 * so the whiteboard replay player can use it too.
 */
export type AudioPreviewProps = { src: string; mimeType?: string };

export default function AudioPreview({ src, mimeType }: AudioPreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    const audio = audioRef.current;
    if (!audio) return;
    return attachWebmDurationFix(audio, mimeType, {
      onLoadFailed: () => setHasError(true),
    });
  }, [src, mimeType]);

  if (hasError) {
    return (
      <p
        style={{ margin: 0, fontSize: 12, color: "var(--color-muted)" }}
        data-testid="audio-preview-error"
      >
        Preview unavailable in this browser, but the recording was saved and can
        still be transcribed below.
      </p>
    );
  }

  return (
    <audio
      ref={audioRef}
      controls
      preload="metadata"
      src={src}
      aria-label="Preview of uploaded or recorded audio"
      style={{ width: "100%", height: 36 }}
      data-testid="audio-preview"
    />
  );
}
