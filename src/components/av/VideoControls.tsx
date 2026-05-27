"use client";

/**
 * Camera device picker for live A/V — mirrors the MicControls device row
 * (chrome + layout) without gain/meter/chimes.
 *
 * Option `value`s are enumerate **indices**, not bare `deviceId`s, because some
 * Android OEM rows share a bogus duplicate `deviceId`; the hook resolves the
 * row → `MediaDeviceInfo` (+ `groupId`) at pick time.
 */

export type VideoControlsProps = {
  devices: ReadonlyArray<MediaDeviceInfo>;
  /** Index into {@link devices} — unique per enumerated row / label. */
  selectedPickerSlot: number;
  onPickCameraSlot: (slotIndex: number) => void;
  /** True when camera stream is active — picker options populate after permission. */
  isLive: boolean;
  disabled?: boolean;
};

export default function VideoControls({
  devices,
  selectedPickerSlot,
  onPickCameraSlot,
  isLive,
  disabled = false,
}: VideoControlsProps) {
  const pickerDisabled =
    disabled || (isLive ? false : devices.length === 0);
  const safeSlot =
    devices.length === 0
      ? 0
      : Math.min(Math.max(0, selectedPickerSlot), devices.length - 1);
  const selectedLabel = devices[safeSlot]?.label ?? "";

  return (
    <div
      data-testid="video-controls"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 12,
        background: "var(--surface-inset)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            minWidth: 92,
            fontSize: 13,
            color: "var(--muted)",
            fontWeight: 500,
          }}
        >
          Camera:
        </span>
        <select
          data-testid="video-device-select"
          aria-label="Camera device"
          value={devices.length === 0 ? "" : String(safeSlot)}
          disabled={pickerDisabled}
          onChange={(e) => {
            const idx = Number(e.target.value);
            if (Number.isFinite(idx)) onPickCameraSlot(idx);
          }}
          title={selectedLabel || undefined}
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: "100%",
            width: "auto",
            padding: "6px 10px",
            fontSize: 13,
            margin: 0,
            borderRadius: 6,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {devices.length === 0 ? (
            <option value="">
              {isLive
                ? "(default camera)"
                : "(allow camera access to choose)"}
            </option>
          ) : (
            devices.map((d, i) => (
              <option
                key={`${d.groupId}|${d.deviceId}|${i}`}
                value={String(i)}
              >
                {d.label || `Camera ${i + 1}`}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}
