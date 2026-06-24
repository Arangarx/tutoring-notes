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
  /** Active track device id — keeps the picker aligned after acquire. */
  activeMicDeviceId?: string | null;
  isAcquiring?: boolean;
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
  activeMicDeviceId = null,
  isAcquiring = false,
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

  const refreshMicDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === "audioinput");
      setDevices(mics);
      const preferred = activeMicDeviceId || mics[0]?.deviceId || "";
      if (preferred) {
        setSelectedDeviceId(preferred);
      }
    } catch {
      //
    }
  }, [activeMicDeviceId]);

  useEffect(() => {
    if (hasMicPermission !== "granted" && !hasMicStream) return;
    void refreshMicDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshMicDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener("devicechange", refreshMicDevices);
    };
  }, [hasMicPermission, hasMicStream, refreshMicDevices]);

  useEffect(() => {
    if (!popoverOpen) return;
    void refreshMicDevices();
  }, [popoverOpen, refreshMicDevices]);

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

  const micUnavailable = hasMicPermission === "denied";

  const micPickerPlaceholder = (() => {
    if (hasMicPermission === "denied") return "(microphone permission denied)";
    if (isAcquiring) return "(starting microphone…)";
    if (hasMicStream) return "(default microphone)";
    return "(allow microphone access to choose)";
  })();

  const btnTitle =
    hasMicPermission === "denied"
      ? "Microphone permission denied"
      : hasMicPermission === "granted" && devices.length === 0 && hasMicStream
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
                value={devices.length === 0 ? "" : selectedDeviceId}
                disabled={disabled || (devices.length === 0 && !hasMicStream)}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  setSelectedDeviceId(id);
                  void onMicDeviceChange(id);
                }}
                data-testid="wb-topbar-mic-device-select"
              >
                {devices.length === 0 ? (
                  <option value="">{micPickerPlaceholder}</option>
                ) : (
                  devices.map((d, i) => (
                    <option key={d.deviceId || `mic-${i}`} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
