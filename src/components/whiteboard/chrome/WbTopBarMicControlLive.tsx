"use client";



/**

 * Top-bar mic control for live A/V without the recording Web Audio graph.

 * Mirrors {@link WbTopBarCamControl} — used on the student join page where

 * `useLiveAV` owns the mic stream directly (no `useAudioRecorder`).

 */



import { useCallback, useEffect, useRef, useState } from "react";

import AudioControls from "@/components/av/AudioControls";

import { WbInlineMicMeter } from "@/components/whiteboard/chrome/WbInlineMicMeter";

import { WbIconMic } from "@/components/whiteboard/chrome/wb-icons";

import { useMicInputLevel } from "@/hooks/useMicInputLevel";

import { afterToggleRefreshHover } from "@/lib/refresh-hover-under-pointer";



type Props = {

  isMicMuted: boolean;

  hasMicPermission: "unknown" | "prompt" | "granted" | "denied";

  hasMicStream: boolean;

  audioDevices: ReadonlyArray<MediaDeviceInfo>;

  /** Index into audioDevices from useLiveAV's pickedMicSlot. */

  selectedPickerSlot: number;

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

  /** Wired to liveAv.setMicDeviceBySlot — hot-swaps via replaceTrack. */

  onPickMicSlot: (slotIndex: number) => void;

  onRefreshDevices?: () => void | Promise<void>;

  /** When false, hide the in-dropdown device picker (e.g. waiting-room overlay on-page pickers). Default true. */
  showDevicePickerInDropdown?: boolean;

  disabled?: boolean;

};



export function WbTopBarMicControlLive({

  isMicMuted,

  hasMicPermission,

  hasMicStream,

  audioDevices,

  selectedPickerSlot,

  isAcquiring = false,

  showInlineMeter = false,

  micStream = null,

  onToggleMute,

  onAcquireMic,

  onPickMicSlot,

  onRefreshDevices,

  showDevicePickerInDropdown = true,

  disabled = false,

}: Props) {

  const [popoverOpen, setPopoverOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);

  const meterLevel = useMicInputLevel(

    showInlineMeter && hasMicStream ? micStream : null

  );



  useEffect(() => {

    if (!popoverOpen) return;

    const onDoc = (e: MouseEvent) => {

      if (!wrapRef.current?.contains(e.target as Node)) {

        setPopoverOpen(false);

      }

    };

    document.addEventListener("click", onDoc);

    return () => document.removeEventListener("click", onDoc);

  }, [popoverOpen]);



  useEffect(() => {

    if (!popoverOpen) return;

    void onRefreshDevices?.();

  }, [popoverOpen, onRefreshDevices]);



  const micUnavailable = hasMicPermission === "denied";



  const btnTitle =

    hasMicPermission === "denied"

      ? "Microphone permission denied"

      : hasMicPermission === "granted" && audioDevices.length === 0 && hasMicStream

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

      {showDevicePickerInDropdown ? (
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

              <AudioControls

                devices={audioDevices}

                selectedPickerSlot={selectedPickerSlot}

                onPickMicSlot={onPickMicSlot}

                isLive={hasMicStream}
                disabled={disabled}
              />

            </div>

          )}

        </div>
      ) : null}

    </div>

  );

}

