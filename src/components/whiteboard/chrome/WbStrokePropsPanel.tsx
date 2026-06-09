"use client";

import {
  triggerBringForward,
  triggerBringToFront,
  triggerDeleteSelected,
  triggerSendBackward,
  triggerSendToBack,
} from "@/lib/whiteboard/undo-redo";
import { WB_STROKE_PRESETS, WB_STROKE_WIDTHS } from "@/styles/token-values";

export type WbStrokePropsPanelProps = {
  strokeColor: string;
  strokeWidth: number;
  opacity: number;
  roughness: number;
  moreStylesOpen: boolean;
  onStrokeChange: (updates: {
    color?: string;
    width?: number;
    opacity?: number;
    roughness?: number;
  }) => void;
  onMoreStylesToggle: () => void;
  onRoughnessChange: (roughness: number) => void;
};

const ROUGHNESS_OPTIONS = [
  { value: 0, label: "Architect" },
  { value: 1, label: "Artist" },
  { value: 2, label: "Cartoon" },
] as const;

export function WbStrokePropsPanel({
  strokeColor,
  strokeWidth,
  opacity,
  roughness,
  moreStylesOpen,
  onStrokeChange,
  onMoreStylesToggle,
  onRoughnessChange,
}: WbStrokePropsPanelProps) {
  const roughnessLabel =
    ROUGHNESS_OPTIONS.find((r) => r.value === roughness)?.label ?? "Architect";

  return (
    <div className="mynk-wb-props-panel-inner">
      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-title">Stroke color</div>
        <div className="mynk-wb-props-swatches">
          {WB_STROKE_PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              className={`mynk-wb-swatch${strokeColor === p.hex ? " mynk-wb-swatch--active" : ""}`}
              style={{ backgroundColor: p.hex }}
              aria-label={p.label}
              aria-pressed={strokeColor === p.hex}
              onClick={() => onStrokeChange({ color: p.hex })}
            />
          ))}
        </div>
      </div>

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
              <span
                style={{
                  display: "block",
                  width: 16,
                  height: w.lineH,
                  borderRadius: 2,
                  background: "currentColor",
                }}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-header">
          <div className="mynk-wb-props-section-title">Opacity</div>
          <span className="mynk-wb-props-opacity-val">{opacity}%</span>
        </div>
        <input
          type="range"
          className="mynk-wb-slider"
          min={0}
          max={100}
          value={opacity}
          aria-label="Stroke opacity"
          onChange={(e) => onStrokeChange({ opacity: Number(e.target.value) })}
        />
      </div>

      <div className="mynk-wb-props-section">
        <div className="mynk-wb-props-section-title">Roughness</div>
        <div className="mynk-wb-props-chips">
          {ROUGHNESS_OPTIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={`mynk-wb-chip${roughness === r.value ? " mynk-wb-chip--active" : ""}`}
              onClick={() => onRoughnessChange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mynk-wb-popover-sep" />

      <button
        type="button"
        className="mynk-wb-chip mynk-wb-more-styles-btn"
        onClick={onMoreStylesToggle}
        aria-expanded={moreStylesOpen}
      >
        {moreStylesOpen ? "Γû┤ Less styles" : "Γû╛ More styles"}
      </button>

      {moreStylesOpen && (
        <div className="mynk-wb-more-styles-area">
          <div className="mynk-wb-props-section-title">Z-order</div>
          <div className="mynk-wb-props-chips" style={{ marginBottom: 8 }}>
            {[
              { label: "Send to back", fn: triggerSendToBack },
              { label: "Send backward", fn: triggerSendBackward },
              { label: "Bring forward", fn: triggerBringForward },
              { label: "Bring to front", fn: triggerBringToFront },
            ].map(({ label, fn }) => (
              <button key={label} type="button" className="mynk-wb-chip" onClick={() => fn()}>
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="mynk-wb-chip mynk-wb-menu-item--destructive"
            style={{ width: "100%" }}
            onClick={() => triggerDeleteSelected()}
          >
            Delete selected
          </button>
        </div>
      )}

      <p className="mynk-wb-info-note" style={{ marginTop: 8 }}>
        Current: {roughnessLabel}
      </p>
    </div>
  );
}
