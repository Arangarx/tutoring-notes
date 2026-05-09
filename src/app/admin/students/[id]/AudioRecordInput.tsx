"use client";

import {
  useAudioRecorder,
  type RecordedAudio,
} from "@/hooks/useAudioRecorder";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";

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
 * Thin shell over `useAudioRecorder`. Owns ZERO recording logic — delegates
 * to `RecordingControlPanel`, which mirrors the recorder tab DOM tree used by
 * the jsdom RTL suite.
 */
export default function AudioRecordInput({
  studentId,
  onRecorded,
  onRecordingActive,
  disabled,
}: Props) {
  const r = useAudioRecorder({ studentId, onRecorded, onRecordingActive });
  return <RecordingControlPanel recorder={r} disabled={disabled} />;
}
