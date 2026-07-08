"use client";

/**
 * Microphone device picker for live A/V — mirrors {@link VideoControls}.
 *
 * Option `value`s are enumerate **indices**, not bare `deviceId`s, because some
 * OEM rows share a duplicate `deviceId`; the hook resolves the row at pick time.
 */

export type AudioControlsProps = {
  devices: ReadonlyArray<MediaDeviceInfo>;
  /** Index into {@link devices} — unique per enumerated row / label. */
  selectedPickerSlot: number;
  onPickMicSlot: (slotIndex: number) => void;
  /** True when mic stream is active — picker options populate after permission. */
  isLive: boolean;
  disabled?: boolean;
};

export default function AudioControls({
  devices,
  selectedPickerSlot,
  onPickMicSlot,
  isLive,
  disabled = false,
}: AudioControlsProps) {
  const pickerDisabled =
    disabled || (isLive ? false : devices.length === 0);
  const safeSlot =
    devices.length === 0
      ? 0
      : Math.min(Math.max(0, selectedPickerSlot), devices.length - 1);
  const selectedLabel = devices[safeSlot]?.label ?? "";

  return (
    <div
      data-testid="audio-controls"
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
          Microphone:
        </span>
        <select
          data-testid="audio-device-select"
          className="mynk-wb-native-select"
          aria-label="Microphone device"
          value={devices.length === 0 ? "" : String(safeSlot)}
          disabled={pickerDisabled}
          onChange={(e) => {
            const idx = Number(e.target.value);
            if (Number.isFinite(idx)) onPickMicSlot(idx);
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
                ? "(default microphone)"
                : "(allow microphone access to choose)"}
            </option>
          ) : (
            devices.map((d, i) => (
              <option
                key={`${d.groupId}|${d.deviceId}|${i}`}
                value={String(i)}
              >
                {d.label || `Microphone ${i + 1}`}
              </option>
            ))
          )}
        </select>
      </div>
    </div>
  );
}
