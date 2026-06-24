"use client";

/**
 * Top-bar mic control for live A/V without the recording Web Audio graph.
 * Mirrors {@link WbTopBarCamControl} — used on the student join page where
 * `useLiveAV` owns the mic stream directly (no `useAudioRecorder`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WbInlineMicMeter } from "@/components/whiteboard/chrome/WbInlineMicMeter";
import { WbIconMic } from "@/components/whiteboard/chrome/wb-icons";
import { useMicInputLevel } from "@/hooks/useMicInputLevel";
import { afterToggleRefreshHover } from "@/lib/refresh-hover-under-pointer";

type Props = {
  isMicMuted: boolean;
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasMicStream: boolean;
  /**
   * When true, tap the live mic stream for the inline 3-bar meter.
   * Must stay false on student `useLiveAV` publish streams — a Web Audio
   * `MediaStreamSource` on the same track Chrome sends over WebRTC can
   * silence the peer connection (same class of bug as track cloning;
   * see LIVE-AV.md).
   */
  showInlineMeter?: boolean;
  /** Only read when `showInlineMeter` is true. */
  micStream?: MediaStream | null;
  onToggleMute: () => void;
  onAcquireMic: () => void | Promise<void>;
  onMicDeviceChange: (deviceId: string) => void | Promise<void>;
  disabled?: boolean;
};

export function WbTopBarMicControlLive({
  isMicMuted,
  hasMicPermission,
  hasMicStream,
  showInlineMeter = false,
  micStream = null,
  onToggleMute,
  onAcquireMic,
  onMicDeviceChange,
  disabled = false,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const meterLevel = useMicInputLevel(
    showInlineMeter && hasMicStream && !isMicMuted ? micStream : null
  );

  useEffect(() => {
    // Re-enumerate after permission OR first successful acquire — labels
    // stay blank until getUserMedia has run at least once on many browsers.
    if (hasMicPermission !== "granted" && !hasMicStream) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const mics = all.filter((d) => d.kind === "audioinput");
        setDevices(mics);
        if (!selectedDeviceId && mics[0]?.deviceId) {
          setSelectedDeviceId(mics[0].deviceId);
        }
      } catch {
        //
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", refresh);
    };
  }, [hasMicPermission, hasMicStream, selectedDeviceId]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [popoverOpen]);

  // Only hard-disable when permission is denied. An empty pre-enumerate
  // device list (common before the first getUserMedia) must not block acquire.
  const micUnavailable = hasMicPermission === "denied";

  const btnTitle =
    hasMicPermission === "denied"
      ? "Microphone permission denied"
      : hasMicPermission === "granted" && devices.length === 0
        ? "No microphone found"
        : isMicMuted
          ? "Unmute microphone"
          : "Microphone — click to mute";

  const handleMainClick = useCallback(async () => {
    if (disabled || micUnavailable) return;
    if (!hasMicStream) {
      await onAcquireMic();
    }
    onToggleMute();
  }, [disabled, hasMicStream, micUnavailable, onAcquireMic, onToggleMute]);

  const micStateClass = !micUnavailable
    ? isMicMuted
      ? " mynk-wb-tb-btn--mic-off"
      : " mynk-wb-tb-btn--mic-on"
    : "";

  return (
    <div
      className="mynk-wb-mic-wrap mynk-wb-topbar__desktop-only"
      data-testid="wb-topbar-mic"
    >
      <button
        type="button"
        className={`mynk-wb-tb-btn${micStateClass}`}
        title={btnTitle}
        aria-label={btnTitle}
        onClick={(e) => afterToggleRefreshHover(e.currentTarget, handleMainClick)}
        disabled={disabled || micUnavailable}
        data-testid="wb-topbar-mic-toggle"
      >
        <WbIconMic />
        {showInlineMeter ? <WbInlineMicMeter level={meterLevel} /> : null}
      </button>
      <div className="mynk-wb-mic-settings-anchor" ref={wrapRef}>
        <button
          type="button"
          className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-mic-caret"
          title="Microphone settings"
          aria-label="Microphone settings"
          aria-expanded={popoverOpen}
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            setPopoverOpen((p) => !p);
          }}
          data-testid="wb-topbar-mic-settings"
        >
          <span className="mynk-wb-share-chevron">▾</span>
        </button>

        {popoverOpen && (
          <div
            className="mynk-wb-mic-popover"
            role="dialog"
            aria-label="Microphone settings"
          >
            <label className="mynk-wb-view-item" style={{ display: "block" }}>
              <span style={{ display: "block", marginBottom: 4, fontSize: 12 }}>
                Microphone
              </span>
              <select
                className="mynk-wb-native-select"
                value={selectedDeviceId}
                disabled={disabled || devices.length === 0}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedDeviceId(id);
                  void onMicDeviceChange(id);
                }}
                data-testid="wb-topbar-mic-device-select"
              >
                {devices.map((d, i) => (
                  <option key={d.deviceId || `mic-${i}`} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
