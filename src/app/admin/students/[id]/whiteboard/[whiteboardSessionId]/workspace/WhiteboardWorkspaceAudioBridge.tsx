"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { UseAudioRecorderReturn } from "@/hooks/useAudioRecorder";
import RecordingControlPanel from "@/components/recording/RecordingControlPanel";

export type WhiteboardWorkspaceAudioBridgeState = {
  kind: "idle" | "recording" | "uploading" | "registering";
  inFlightCount: number;
  lastError: string | null;
};

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
  getState: () => WhiteboardWorkspaceAudioBridgeState;
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
      getState: (): WhiteboardWorkspaceAudioBridgeState => {
        const a = audioRef.current;
        const inFlightCount = pendingSegmentTasksRef.current.length;
        const lastError: string | null = a.error ?? null;
        if (a.state === "recording") {
          return { kind: "recording", inFlightCount, lastError };
        }
        if (a.state === "uploading") {
          return { kind: "uploading", inFlightCount, lastError };
        }
        if (inFlightCount > 0) {
          return { kind: "registering", inFlightCount, lastError };
        }
        return { kind: "idle", inFlightCount: 0, lastError };
      },
    }),
    [pendingSegmentTasksRef]
  );

  return (
    <RecordingControlPanel recorder={audio} disabled={panelDisabled} />
  );
});
