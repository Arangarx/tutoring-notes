"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";

type Props = {
  /** Shared `useAudioRecorder` instance — same hook feeds this bridge and the visible panel. */
  audio: UseAudioRecorderReturn;
  /** Pending `registerWhiteboardSessionAudioSegmentAction` tasks; mirrored for `waitForPendingUploads`. */
  pendingSegmentTasksRef: React.MutableRefObject<Promise<void>[]>;
  userWantsRecording: boolean;
  recordingActive: boolean;
  /** Disables standalone Start (etc.) — e.g. until the workspace toolbar arms recording. */
  panelDisabled?: boolean;
};

export type WhiteboardWorkspaceAudioBridgeHandle = {
  waitForPendingUploads: () => Promise<void>;
};

/**
 * Whiteboard audio: orchestrates pause/resume/start against presence flags using
 * the host's `useAudioRecorder` instance, renders the same `RecordingControlPanel`
 * as the recorder tab, and tracks in-flight segment registration for end-session.
 */
export const WhiteboardWorkspaceAudioBridge = forwardRef<
  WhiteboardWorkspaceAudioBridgeHandle,
  Props
>(function WhiteboardWorkspaceAudioBridge(
  {
    audio,
    pendingSegmentTasksRef,
    userWantsRecording,
    recordingActive,
    panelDisabled,
  },
  ref
) {
  const audioRef = useRef(audio);
  audioRef.current = audio;

  useEffect(() => {
    const a = audioRef.current;
    if (!userWantsRecording) {
      if (a.state === "recording" || a.state === "paused") {
        a.stopAndUpload("final");
      }
      return;
    }
    if (!recordingActive) {
      if (a.state === "recording") {
        a.pauseRecording();
      }
      return;
    }
    if (a.state === "ready") {
      void a.handleStartRecording();
    } else if (a.state === "paused") {
      a.resumeRecording();
    } else if (a.state === "done" || a.state === "error") {
      a.handleReset();
    }
  }, [userWantsRecording, recordingActive, audio.state]);

  useImperativeHandle(
    ref,
    () => ({
      waitForPendingUploads: async () => {
        const pending = [...pendingSegmentTasksRef.current];
        await Promise.all(pending);
      },
    }),
    [pendingSegmentTasksRef]
  );

  return (
    <RecordingControlPanel recorder={audio} disabled={panelDisabled} />
  );
});
