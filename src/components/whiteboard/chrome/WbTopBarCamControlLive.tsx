"use client";

/**
 * Top-bar camera control for live A/V without an inline device picker.
 * Mirrors {@link WbTopBarMicControlLive} button styling — used in the
 * waiting-room overlay where device pickers are rendered separately.
 */

import { useCallback } from "react";
import { WbIconCamera } from "@/components/whiteboard/chrome/wb-icons";
import { afterToggleRefreshHover } from "@/lib/refresh-hover-under-pointer";

type Props = {
  isCamMuted: boolean;
  hasCamPermission: "unknown" | "prompt" | "granted" | "denied";
  hasCamStream: boolean;
  onToggleCam: () => void | Promise<void>;
  onAcquireCam?: () => void | Promise<void>;
  disabled?: boolean;
};

export function WbTopBarCamControlLive({
  isCamMuted,
  hasCamPermission,
  hasCamStream,
  onToggleCam,
  onAcquireCam,
  disabled = false,
}: Props) {
  const camUnavailable = hasCamPermission === "denied";

  const btnTitle =
    hasCamPermission === "denied"
      ? "Camera permission denied"
      : isCamMuted
        ? "Turn camera on"
        : "Turn camera off";

  const camStateClass = !camUnavailable
    ? isCamMuted
      ? " mynk-wb-tb-btn--cam-off"
      : " mynk-wb-tb-btn--cam-on"
    : "";

  const handleMainClick = useCallback(async () => {
    if (disabled || camUnavailable) return;
    if (!hasCamStream && onAcquireCam) {
      await onAcquireCam();
      return;
    }
    await onToggleCam();
  }, [disabled, camUnavailable, hasCamStream, onAcquireCam, onToggleCam]);

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
        aria-pressed={!isCamMuted && hasCamStream}
        onClick={(e) => afterToggleRefreshHover(e.currentTarget, handleMainClick)}
        disabled={disabled || camUnavailable}
        data-testid="wb-topbar-cam-toggle"
      >
        <WbIconCamera size={14} />
      </button>
    </div>
  );
}
