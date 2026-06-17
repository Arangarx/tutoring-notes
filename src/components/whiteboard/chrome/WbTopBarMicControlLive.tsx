"use client";

/**
 * Top-bar mic control for live A/V without the recording Web Audio graph.
 * Mirrors {@link WbTopBarCamControl} — used on the student join page where
 * `useLiveAV` owns the mic stream directly (no `useAudioRecorder`).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { WbIconMic } from "@/components/whiteboard/chrome/wb-icons";

type Props = {
  isMicMuted: boolean;
  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";
  hasMicStream: boolean;
  onToggleMute: () => void;
  onAcquireMic: () => void | Promise<void>;
  onMicDeviceChange: (deviceId: string) => void | Promise<void>;
  disabled?: boolean;
};

export function WbTopBarMicControlLive({
  isMicMuted,
  hasMicPermission,
  hasMicStream,
  onToggleMute,
  onAcquireMic,
  onMicDeviceChange,
  disabled = false,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasMicPermission !== "granted") return;
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
  }, [hasMicPermission, selectedDeviceId]);

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

  const micUnavailable = hasMicPermission === "denied" || devices.length === 0;

  const btnTitle =
    hasMicPermission === "denied"
      ? "Microphone permission denied"
      : devices.length === 0
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
        onClick={() => void handleMainClick()}
        disabled={disabled || micUnavailable}
        data-testid="wb-topbar-mic-toggle"
      >
        <WbIconMic />
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
