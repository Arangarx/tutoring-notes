"use client";

import { useEffect, useState } from "react";
import { createMicLevelMonitor } from "@/lib/mic-recorder-audio";

/**
 * Live mic input level (0–1) for inline top-bar metering on paths that
 * do not use `useAudioRecorder`.
 *
 * **Do not** pass a `useLiveAV` publish stream here — Web Audio
 * `createMediaStreamSource` on the same hardware track can silence WebRTC
 * (see LIVE-AV.md / `showInlineMeter` on WbTopBarMicControlLive).
 */
export function useMicInputLevel(micStream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!micStream || micStream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }

    let monitor: Awaited<ReturnType<typeof createMicLevelMonitor>> = null;
    let raf = 0;
    let cancelled = false;

    void createMicLevelMonitor(micStream).then((m) => {
      if (cancelled || !m) return;
      monitor = m;
      const tick = () => {
        const next = monitor!.getLevel();
        setLevel((prev) => (Math.abs(prev - next) > 0.02 ? next : prev));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      monitor?.dispose();
      setLevel(0);
    };
  }, [micStream]);

  return level;
}
