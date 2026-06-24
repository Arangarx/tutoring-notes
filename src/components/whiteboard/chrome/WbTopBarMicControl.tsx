"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import MicControls from "@/components/recording/MicControls";
import { WbInlineMicMeter } from "@/components/whiteboard/chrome/WbInlineMicMeter";
import { WbIconMic } from "@/components/whiteboard/chrome/wb-icons";
import { afterToggleRefreshHover } from "@/lib/refresh-hover-under-pointer";

type Props = {
  audio: UseAudioRecorderReturn;
  isMicMuted: boolean;
  onToggleMute: () => void;
  onAcquireMic: () => void | Promise<void>;
  onMicDeviceChange?: (deviceId: string) => void | Promise<void>;
  /** Slot-aware mic pick — preferred when wired to `useLiveAV.setMicDeviceBySlot`. */
  onPickMicSlot?: (slotIndex: number) => void | Promise<void>;
  disabled?: boolean;
};

/**
 * Top-bar mic control: inline icon + 3-bar meter; device/boost/level/chime in popover.
 * Hidden meter bar keeps `meterBarRef` attached for the recorder rAF loop.
 */
export function WbTopBarMicControl({
  audio,
  isMicMuted,
  onToggleMute,
  onAcquireMic,
  onMicDeviceChange,
  onPickMicSlot,
  disabled,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const bar = audio.meterBarRef?.current;
      if (bar) {
        const pct = parseFloat(bar.style.width || "0") / 100;
        setMeterLevel((prev) => (Math.abs(prev - pct) > 0.02 ? pct : prev));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audio.meterBarRef]);

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

  const handleMainClick = useCallback(async () => {
    if (disabled) return;
    if (!audio.isLive && !audio.localMicStream) {
      await onAcquireMic();
    }
    onToggleMute();
  }, [audio.isLive, audio.localMicStream, disabled, onAcquireMic, onToggleMute]);

  const micControls = {
    meterBarRef: audio.meterBarRef,
    devices: audio.devices,
    selectedPickerSlot: audio.pickedMicSlot,
    onPickMicSlot: (slot: number) => {
      if (onPickMicSlot) {
        void onPickMicSlot(slot);
      } else if (onMicDeviceChange) {
        const id = audio.devices[slot]?.deviceId;
        if (id) void onMicDeviceChange(id);
      } else {
        void audio.handleMicSlotChange(slot);
      }
    },
    gainLinear: audio.gainLinear,
    onGainChange: audio.setGainLinear,
    isLive: audio.isLive,
    lockDevice: audio.lockDevice,
    chimeEnabled: audio.chimeEnabled,
    onChimeEnabledChange: audio.setChimeEnabled,
    chimeVolume: audio.chimeVolume,
    onChimeVolumeChange: audio.setChimeVolume,
    hideLevelMeter: true,
  };

  return (
    <div className="mynk-wb-mic-wrap" data-testid="wb-topbar-mic">
      {/* Hidden meter target — recorder rAF writes here when popover is closed */}
      <div className="mynk-wb-mic-meter-hidden" aria-hidden>
        <div ref={audio.meterBarRef} style={{ width: "0%", height: "100%" }} />
      </div>

      <button
        type="button"
        className={`mynk-wb-tb-btn${isMicMuted ? " mynk-wb-tb-btn--mic-off" : " mynk-wb-tb-btn--mic-on"}`}
        title={isMicMuted ? "Unmute microphone" : "Microphone — click to mute"}
        onClick={(e) => afterToggleRefreshHover(e.currentTarget, handleMainClick)}
        disabled={disabled}
        data-testid="wb-topbar-mic-toggle"
      >
        <WbIconMic />
        <WbInlineMicMeter level={meterLevel} />
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
          <div className="mynk-wb-mic-popover" role="dialog" aria-label="Microphone settings">
            <MicControls {...micControls} />
          </div>
        )}
      </div>
    </div>
  );
}
