"use client";

import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import DoneCard from "./DoneCard";
import ErrorCard from "./ErrorCard";
import MainPanel from "./MainPanel";
import UploadingPanel from "./UploadingPanel";
import type { MicControlsProps } from "./MicControls";

export type RecordingControlPanelProps = {
  recorder: UseAudioRecorderReturn;
  /** Passed to MainPanel — e.g. transcribe-in-progress or workspace guardrails. */
  disabled?: boolean;
  /**
   * When set (e.g. tutor workspace + live A/V), wires mic picker changes to
   * `useLiveAV.setMicDevice` so WebRTC and the recorder graph stay in sync.
   */
  onMicDeviceChange?: (deviceId: string) => void | Promise<void>;
  onPickMicSlot?: (slotIndex: number) => void | Promise<void>;
  /**
   * Live label offset — set when the host already shows prior segments (e.g.
   * pending list) while the hook reset `segmentNumber` to 1 for a new take.
   */
  segmentDisplayBase?: number;
};

/**
 * Presentational shell: maps `useAudioRecorder` state + handlers to the same
 * card/panel tree the standalone recorder tab has always used. No hooks or
 * side-effects — the host owns `useAudioRecorder`.
 */
export default function RecordingControlPanel({
  recorder: r,
  disabled,
  onMicDeviceChange,
  segmentDisplayBase = 0,
  onPickMicSlot,
}: RecordingControlPanelProps) {
  const micControls: MicControlsProps = {
    meterBarRef: r.meterBarRef,
    devices: r.devices,
    selectedPickerSlot: r.pickedMicSlot,
    onPickMicSlot: (slot) => {
      if (onPickMicSlot) {
        void onPickMicSlot(slot);
      } else if (onMicDeviceChange) {
        const id = r.devices[slot]?.deviceId;
        if (id) void onMicDeviceChange(id);
      } else {
        void r.handleMicSlotChange(slot);
      }
    },
    gainLinear: r.gainLinear,
    onGainChange: r.setGainLinear,
    isLive: r.isLive,
    lockDevice: r.lockDevice,
    chimeEnabled: r.chimeEnabled,
    onChimeEnabledChange: r.setChimeEnabled,
    chimeVolume: r.chimeVolume,
    onChimeVolumeChange: r.setChimeVolume,
  };

  if (r.state === "done") {
    return <DoneCard doneSegmentSeconds={r.doneSegmentSeconds} onReset={r.handleReset} />;
  }

  if (r.state === "uploading" && r.uploadMode === "segment") {
    return (
      <UploadingPanel
        mode="segment"
        micControls={{
          ...micControls,
          hint: "Saving this segment — recording will resume automatically.",
        }}
        segmentNumber={r.segmentNumber}
        segmentDisplayBase={segmentDisplayBase}
      />
    );
  }

  if (r.state === "uploading") {
    return <UploadingPanel mode="final" />;
  }

  if (r.state === "error") {
    return <ErrorCard error={r.error} onReset={r.handleReset} />;
  }

  const hint =
    r.state === "idle"
      ? r.permissionState === "denied"
        ? "Microphone access is blocked for this site. Click the icon left of the address bar (lock or sliders), set Microphone to Allow, then reload."
        : "Click Start recording to allow mic access — after that the picker, boost slider, and meter will be live before each session."
      : r.state === "acquiring"
        ? "Requesting microphone access…"
        : undefined;

  return (
    <MainPanel
      state={r.state}
      disabled={disabled}
      segmentNumber={r.segmentNumber}
      segmentDisplayBase={segmentDisplayBase}
      elapsed={r.elapsed}
      isWarning={r.isWarning}
      micControls={{ ...micControls, hint }}
      onStart={r.handleStartRecording}
      onPause={r.pauseRecording}
      onResume={r.resumeRecording}
      onStop={() => r.stopAndUpload("final")}
      onReset={r.handleReset}
    />
  );
}
