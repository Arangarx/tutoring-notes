"use client";

/**
 * Camera device picker for live A/V — mirrors the MicControls device row
 * (chrome + layout) without gain/meter/chimes.
 */

export type VideoControlsProps = {
  devices: ReadonlyArray<MediaDeviceInfo>;
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  /** True when camera stream is active — picker options populate after permission. */
  isLive: boolean;
  disabled?: boolean;
};

export default function VideoControls({
  devices,
  selectedDeviceId,
  onDeviceChange,
  isLive,
  disabled = false,
}: VideoControlsProps) {
  const pickerDisabled =
    disabled || (isLive ? false : devices.length === 0);
  const selectedLabel =
    devices.find((d) => d.deviceId === selectedDeviceId)?.label ?? "";

  return (
    <div
      data-testid="video-controls"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: "12px 14px",
        marginBottom: 12,
        background: "rgba(255, 255, 255, 0.04)",
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
          value={selectedDeviceId}
          disabled={pickerDisabled}
          onChange={(e) => onDeviceChange(e.target.value)}
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
              <option key={d.deviceId || `video-${i}`} value={d.deviceId}>
                {d.label || `Camera ${i + 1}`}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}
