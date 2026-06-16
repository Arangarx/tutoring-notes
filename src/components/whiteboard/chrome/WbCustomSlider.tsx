"use client";

import { useCallback, useRef, useState } from "react";

export const WB_SLIDER_THUMB_PX = 16;
const WB_SLIDER_THUMB_RADIUS_PX = WB_SLIDER_THUMB_PX / 2;

export type WbCustomSliderProps = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel: string;
  testId?: string;
  thumbTestId?: string;
  className?: string;
  onChange: (value: number) => void;
  /** Fired during pointer drag for live label updates; null when drag ends. */
  onLiveValueChange?: (value: number | null) => void;
  onPointerDown?: () => void;
  onPointerUp?: (value: number) => void;
};

/**
 * Custom range slider — thumb is flush at both 0% and 100%.
 * Shared by stroke opacity and replay timeline scrubber.
 */
export function WbCustomSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  ariaLabel,
  testId = "wb-custom-slider",
  thumbTestId = "wb-custom-slider-thumb",
  className = "",
  onChange,
  onLiveValueChange,
  onPointerDown,
  onPointerUp,
}: WbCustomSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragListenersRef = useRef<{
    pointerId: number;
    cleanup: () => void;
  } | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const range = Math.max(max - min, 1);
  const displayValue = dragValue ?? value;
  const displayPercent = ((displayValue - min) / range) * 100;

  const computeValue = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= WB_SLIDER_THUMB_PX) return displayValue;
      const travel = rect.width - WB_SLIDER_THUMB_PX;
      const raw =
        min + ((clientX - rect.left - WB_SLIDER_THUMB_RADIUS_PX) / travel) * range;
      const stepped = Math.round(raw / step) * step;
      return Math.max(min, Math.min(max, stepped));
    },
    [displayValue, max, min, range, step]
  );

  const endDrag = useCallback(
    (commitValue: number) => {
      dragListenersRef.current?.cleanup();
      dragListenersRef.current = null;
      setDragValue(null);
      onLiveValueChange?.(null);
      onChange(commitValue);
      onPointerUp?.(commitValue);
    },
    [onChange, onLiveValueChange, onPointerUp]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    onPointerDown?.();
    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    const next = computeValue(e.clientX);
    setDragValue(next);
    onLiveValueChange?.(next);
    onChange(next);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const v = computeValue(ev.clientX);
      setDragValue(v);
      onLiveValueChange?.(v);
      onChange(v);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      ev.preventDefault();
      const v = computeValue(ev.clientX);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      endDrag(v);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    dragListenersRef.current?.cleanup();
    dragListenersRef.current = { pointerId: e.pointerId, cleanup };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={displayValue}
      aria-label={ariaLabel}
      tabIndex={0}
      className={`mynk-wb-slider-custom${className ? ` ${className}` : ""}`}
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(min, value - step));
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(max, value + step));
        } else if (e.key === "Home") {
          e.preventDefault();
          onChange(min);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(max);
        }
      }}
    >
      <div className="mynk-wb-slider-custom__track" />
      <div
        className="mynk-wb-slider-custom__thumb"
        data-testid={thumbTestId}
        style={{
          left: `calc(${displayPercent / 100} * (100% - ${WB_SLIDER_THUMB_PX}px))`,
        }}
      />
    </div>
  );
}
