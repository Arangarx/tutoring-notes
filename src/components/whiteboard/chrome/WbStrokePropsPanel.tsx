"use client";

import { useRef } from "react";
import {
  triggerBringForward,
  triggerBringToFront,
  triggerDeleteSelected,
  triggerSendBackward,
  triggerSendToBack,
} from "@/lib/whiteboard/undo-redo";
import {
  EXCALIDRAW_STROKE_HEX,
  WB_INK_ADAPTIVE_SENTINEL,
  WB_STROKE_PRESETS,
  WB_STROKE_WIDTHS,
} from "@/styles/token-values";

export type WbStrokePropsPanelProps = {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  roughness: number;
  /** Excalidraw currentItemRoundness — "sharp" | "round" */
  roundness: "sharp" | "round";
  moreStylesOpen: boolean;
  /** Theme-resolved hex for the adaptive ink swatch: #1e293b (light) or #ffffff (dark). */
  inkHex: string;
  onStrokeChange: (updates: {
    color?: string;
    width?: number;
    opacity?: number;
    roughness?: number;
  }) => void;
  onMoreStylesToggle: () => void;
  onRoughnessChange: (roughness: number) => void;
  onRoundnessChange: (roundness: "sharp" | "round") => void;
};

/** Roughness level icons — simple SVGs representing Architect / Artist / Cartoon. Exported for reuse in sidebar summary. */
export const RoughnessIcon = ({ level }: { level: 0 | 1 | 2 }) => (
  <svg
    width={24}
    height={14}
    viewBox="0 0 24 14"
    fill="none"
    aria-hidden
    style={{ display: "block" }}
  >
    {level === 0 && (
      /* Architect: perfectly straight diagonal line */
      <line
        x1="3"
        y1="11"
        x2="21"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    )}
    {level === 1 && (
      /* Artist: gently wavy line */
      <path
        d="M2 7 Q6 3 10 7 Q14 11 18 7 Q20 5 22 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    )}
    {level === 2 && (
      /* Cartoon: jagged zigzag */
      <polyline
        points="2,11 6,3 10,11 14,3 18,11 22,3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    )}
  </svg>
);

const ROUGHNESS_OPTIONS = [
  { value: 0 as const, label: "Architect" },
  { value: 1 as const, label: "Artist" },
  { value: 2 as const, label: "Cartoon" },
];

/**
 * Stroke-width preview icon — diagonal line at visibly different weight so
 * the button reads as "a stroke of this thickness," not a divider.
 * lineH values (1/2/3/5) are mapped to scaled SVG stroke-widths.
 */
const StrokeWidthIcon = ({ lineH }: { lineH: number }) => {
  const svgW = lineH <= 1 ? 1.25 : lineH <= 2 ? 2.5 : lineH <= 3 ? 4 : 6.5;
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" aria-hidden style={{ display: "block" }}>
      <line x1="3" y1="15" x2="15" y2="3" stroke="currentColor" strokeWidth={svgW} strokeLinecap="round" />
    </svg>
  );
};

/**
 * Edge sharpness icons — L-corner glyphs that read unambiguously as
 * "sharp corner" vs "rounded corner," rather than two similar rectangles.
 */
const SharpnessIcon = ({ type }: { type: "sharp" | "round" }) => (
  <svg
    width={22}
    height={22}
    viewBox="0 0 22 22"
    fill="none"
    aria-hidden
    style={{ display: "block" }}
  >
    {type === "sharp" ? (
      /* Sharp: two lines meeting at a right-angle — clearly a sharp corner */
      <path d="M5 17 L5 5 L17 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="miter" />
    ) : (
      /* Round: arc from vertical to horizontal — clearly a rounded corner */
      <path d="M5 17 L5 9 Q5 5 9 5 L17 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    )}
  </svg>
);

const ROUNDNESS_OPTIONS: { value: "sharp" | "round"; label: string }[] = [
  { value: "sharp", label: "Sharp" },
  { value: "round", label: "Round" },
];

/**
 * Custom opacity slider — thumb is flush at both 0% and 100%.
 *
 * Native range inputs have browser-specific track padding that prevents exact
 * flush at extremes; this custom component places the thumb at
 *   left = (value/100) * (trackWidth − thumbWidth)
 * guaranteeing flush left at 0 and flush right at 100 in all browsers.
 * Fully keyboard-accessible (role=slider, arrow/Home/End keys).
 */
function WbSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const computeValue = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    return Math.round(Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onChange(computeValue(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    onChange(computeValue(e.clientX));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label="Stroke opacity"
      tabIndex={0}
      className="mynk-wb-slider-custom"
      data-testid="wb-opacity-slider"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(0, value - 1));
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(100, value + 1));
        } else if (e.key === "Home") {
          e.preventDefault();
          onChange(0);
        } else if (e.key === "End") {
          e.preventDefault();
          onChange(100);
        }
      }}
    >
      <div className="mynk-wb-slider-custom__track" />
      <div
        className="mynk-wb-slider-custom__thumb"
        data-testid="wb-opacity-slider-thumb"
        style={{ left: `calc(${value / 100} * (100% - 16px))` }}
      />
    </div>
  );
}

export function WbStrokePropsPanel({
  strokeColor,
  strokeWidth,
  opacity,
  roughness,
  roundness,
  moreStylesOpen,
  inkHex,
  onStrokeChange,
  onMoreStylesToggle,
  onRoughnessChange,
  onRoundnessChange,
}: WbStrokePropsPanelProps) {
  return (
    <div className="mynk-wb-props-panel-inner">
      {/* ── Stroke color ── always visible */}
      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-title">Stroke color</div>
        <div className="mynk-wb-props-swatches">
          {WB_STROKE_PRESETS.map((p) => {
            const isInk = p.hex === WB_INK_ADAPTIVE_SENTINEL;
            // Display hex: adaptive (white in dark / dark in light) for visual preview only.
            const displayHex = isInk ? inkHex : p.hex;
            // Stored hex: ink always stores EXCALIDRAW_STROKE_HEX (#1e293b).
            // Excalidraw's dark-mode canvas filter inverts it to white automatically.
            // Never store #ffffff — it would invert to black.
            const storeHex = isInk ? EXCALIDRAW_STROKE_HEX : p.hex;
            const isActive = strokeColor === storeHex;
            return (
              <button
                key={p.hex}
                type="button"
                className={`mynk-wb-swatch${isActive ? " mynk-wb-swatch--active" : ""}`}
                style={{ backgroundColor: displayHex }}
                aria-label={p.label}
                aria-pressed={isActive}
                onClick={() => onStrokeChange({ color: storeHex })}
              />
            );
          })}
        </div>
      </div>

      {/* ── Stroke width ── always visible */}
      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-title">Stroke width</div>
        <div className="mynk-wb-props-widths">
          {WB_STROKE_WIDTHS.map((w) => (
            <button
              key={w.value}
              type="button"
              className={`mynk-wb-width-btn${strokeWidth === w.value ? " mynk-wb-width-btn--active" : ""}`}
              aria-label={w.label}
              aria-pressed={strokeWidth === w.value}
              onClick={() => onStrokeChange({ width: w.value })}
            >
              <StrokeWidthIcon lineH={w.lineH} />
            </button>
          ))}
        </div>
      </div>

      {/* ── Opacity ── always visible */}
      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-header">
          <div className="mynk-wb-props-section-title">Opacity</div>
          <span className="mynk-wb-props-opacity-val">{opacity}%</span>
        </div>
        <div className="mynk-wb-slider-wrap">
          <WbSlider value={opacity} onChange={(v) => onStrokeChange({ opacity: v })} />
        </div>
      </div>

      <div className="mynk-wb-popover-sep" />

      <button
        type="button"
        className="mynk-wb-chip mynk-wb-more-styles-btn"
        onClick={onMoreStylesToggle}
        aria-expanded={moreStylesOpen}
      >
        {moreStylesOpen ? "▴ Less styles" : "▾ More styles"}
      </button>

      {moreStylesOpen && (
        <div className="mynk-wb-more-styles-area">
          {/* ── Roughness ── icon buttons with title tooltips */}
          <div className="mynk-wb-props-section">
            <div className="mynk-wb-props-section-title">Roughness</div>
            <div className="mynk-wb-props-chips mynk-wb-roughness-chips">
              {ROUGHNESS_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`mynk-wb-chip mynk-wb-roughness-chip${roughness === r.value ? " mynk-wb-chip--active" : ""}`}
                  title={r.label}
                  aria-label={r.label}
                  aria-pressed={roughness === r.value}
                  onClick={() => onRoughnessChange(r.value)}
                >
                  <RoughnessIcon level={r.value} />
                </button>
              ))}
            </div>
          </div>

          {/* ── Edge sharpness ── icon buttons with title tooltip, no text labels */}
          <div className="mynk-wb-props-section">
            <div className="mynk-wb-props-section-title">Edge sharpness</div>
            <div className="mynk-wb-props-chips mynk-wb-roughness-chips">
              {ROUNDNESS_OPTIONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={`mynk-wb-chip mynk-wb-roughness-chip mynk-wb-sharpness-chip${roundness === r.value ? " mynk-wb-chip--active" : ""}`}
                  title={r.label}
                  aria-label={r.label}
                  aria-pressed={roundness === r.value}
                  onClick={() => onRoundnessChange(r.value)}
                >
                  <SharpnessIcon type={r.value} />
                </button>
              ))}
            </div>
          </div>

          {/* ── Z-order ── */}
          <div className="mynk-wb-props-section mynk-wb-zorder-section">
            <div className="mynk-wb-props-section-title">Z-order</div>
            <div className="mynk-wb-props-chips" style={{ marginBottom: 8 }}>
              {[
                { label: "Send to back", fn: triggerSendToBack },
                { label: "Send backward", fn: triggerSendBackward },
                { label: "Bring forward", fn: triggerBringForward },
                { label: "Bring to front", fn: triggerBringToFront },
              ].map(({ label, fn }) => (
                <button key={label} type="button" className="mynk-wb-zorder-btn" onClick={() => fn()}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="mynk-wb-delete-btn"
            onClick={() => triggerDeleteSelected()}
          >
            Delete selected
          </button>
        </div>
      )}
    </div>
  );
}
