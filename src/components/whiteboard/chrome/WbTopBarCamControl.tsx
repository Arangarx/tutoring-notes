"use client";

/**
 * Top-bar camera control: cam toggle button + device-picker caret popover.
 *
 * Mirrors the `WbTopBarMicControl` pattern (icon button + chevron → popover)
 * for the camera device picker. The main button calls `onToggleCam` which
 * should be wired to `handleTopBarCam` in the workspace — i.e. it acquires
 * the camera via `requestCam()` when no stream exists, then toggles.
 *
 * The underlying hot-swap (`replaceLocalTrackOnAllPeers`, `setVideoCameraBySlot`)
 * is implemented in `useLiveAV`; this component only exposes the UI controls.
 *
 * Invariant (LIVE-AV.md §12): device picks call `setVideoCameraBySlot(slot)`
 * which uses `RTCRtpSender.replaceTrack` — the peer mesh is NOT rebuilt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import VideoControls from "@/components/av/VideoControls";
import { WbIconCamera } from "@/components/whiteboard/chrome/wb-icons";
import { afterToggleRefreshHover } from "@/lib/refresh-hover-under-pointer";

type Props = {
  /**
   * Should be wired to `handleTopBarCam` in the workspace: acquires camera if
   * no local stream yet, otherwise toggles the track enabled state.
   */
  onToggleCam: () => void;
  isCamMuted: boolean;
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  videoDevices: ReadonlyArray<MediaDeviceInfo>;
  /** Index into videoDevices from useLiveAV's pickedVideoCameraSlot. */
  selectedPickerSlot: number;
  /** Wired to liveAv.setVideoCameraBySlot — hot-swaps via replaceTrack, no mesh rebuild. */
  onPickCameraSlot: (slotIndex: number) => void;
  /** True when a camera stream has been acquired (picker labels + default row). */
  isLive: boolean;
  /** Re-enumerate camera inputs when the settings popover opens. */
  onRefreshDevices?: () => void | Promise<void>;
  disabled?: boolean;
};

/**
 * SR-04 addendum — camera device picker control for the whiteboard top bar.
 * Desktop-only visibility is applied via `mynk-wb-topbar__desktop-only` on
 * the wrapper so it is hidden on mobile layouts (overflow menu covers mobile).
 */
export function WbTopBarCamControl({
  onToggleCam,
  isCamMuted,
  hasCamPermission,
  videoDevices,
  selectedPickerSlot,
  onPickCameraSlot,
  isLive,
  onRefreshDevices,
  disabled = false,
}: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!popoverOpen) return;
    void onRefreshDevices?.();
  }, [popoverOpen, onRefreshDevices]);

  const camUnavailable = hasCamPermission === "denied";

  const btnTitle = hasCamPermission === "denied"
    ? "Camera permission denied"
    : hasCamPermission === "granted" && videoDevices.length === 0
      ? "No camera device found"
      : isCamMuted
        ? "Turn camera on"
        : "Turn camera off";

  const camStateClass =
    !camUnavailable
      ? isCamMuted
        ? " mynk-wb-tb-btn--cam-off"
        : " mynk-wb-tb-btn--cam-on"
      : "";

  const handleCaretClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPopoverOpen((p) => !p);
  }, []);

  return (
    <div
      className="mynk-wb-cam-wrap mynk-wb-topbar__desktop-only"
      data-testid="wb-topbar-cam"
    >
      <button
        type="button"
        className={`mynk-wb-tb-btn mynk-wb-tb-btn--icon${camStateClass}`}
        title={btnTitle}
        aria-label={btnTitle}
        onClick={(e) => afterToggleRefreshHover(e.currentTarget, onToggleCam)}
        disabled={disabled || camUnavailable}
        style={camUnavailable ? { opacity: 0.4 } : undefined}
      >
        <WbIconCamera size={14} />
      </button>
      <div className="mynk-wb-cam-settings-anchor" ref={wrapRef}>
        <button
          type="button"
          className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-cam-caret"
          title="Camera settings"
          aria-label="Camera settings"
          aria-expanded={popoverOpen}
          disabled={disabled}
          onClick={handleCaretClick}
          data-testid="wb-topbar-cam-settings"
        >
          <span className="mynk-wb-share-chevron">▾</span>
        </button>

        {popoverOpen && (
          <div
            className="mynk-wb-cam-popover"
            role="dialog"
            aria-label="Camera settings"
          >
            <VideoControls
              devices={videoDevices}
              selectedPickerSlot={selectedPickerSlot}
              onPickCameraSlot={onPickCameraSlot}
              isLive={isLive}
              disabled={disabled}
            />
          </div>
        )}
      </div>
    </div>
  );
}
