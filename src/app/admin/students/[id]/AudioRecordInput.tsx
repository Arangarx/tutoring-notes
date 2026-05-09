"use client";

import {
  useAudioRecorder,
  type RecordedAudio,
} from "@/hooks/useAudioRecorder";
import DoneCard from "@/components/recording/DoneCard";
import ErrorCard from "@/components/recording/ErrorCard";
import MainPanel from "@/components/recording/MainPanel";
import UploadingPanel from "@/components/recording/UploadingPanel";
import type { MicControlsProps } from "@/components/recording/MicControls";

export type { RecordedAudio };

type Props = {
  studentId: string;
  /** `autoRollover` when a segment was auto-saved mid-session; parent should append without remounting the recorder. */
  onRecorded: (audio: RecordedAudio, meta?: { autoRollover?: boolean }) => void;
  /** Called whenever the recording active state changes (acquiring/ready/recording/paused/uploading = true). */
  onRecordingActive?: (active: boolean) => void;
  disabled?: boolean;
};

/**
 * Thin shell over `useAudioRecorder`. Owns ZERO recording logic — picks one
 * of {DoneCard, UploadingPanel, ErrorCard, MainPanel} based on `state` +
 * `uploadMode` from the hook. Each subcomponent lives in `@/components/recording/`.
 */
export default function AudioRecordInput({
  studentId,
  onRecorded,
  onRecordingActive,
  disabled,
}: Props) {
  const r = useAudioRecorder({ studentId, onRecorded, onRecordingActive });

  const micControls: MicControlsProps = {
    meterBarRef: r.meterBarRef,
    devices: r.devices,
    selectedDeviceId: r.selectedDeviceId,
    onDeviceChange: r.handleDeviceChange,
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
