"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { registerWhiteboardSessionAudioSegmentAction } from "@/app/admin/students/[id]/whiteboard/actions";

type Props = {
  studentId: string;
  whiteboardSessionId: string;
  userWantsRecording: boolean;
  recordingActive: boolean;
};

export type WhiteboardWorkspaceAudioBridgeHandle = {
  waitForPendingUploads: () => Promise<void>;
};

/**
 * Headless bridge: same Blob upload as the main recorder (`uploadAudioDirect`
 * inside `useAudioRecorder`), then registers each segment via
 * `registerWhiteboardSessionAudioSegmentAction` so note generation can find
 * audio for this whiteboard session.
 *
 * Presence: when `recordingActive` toggles false while the tutor still wants
 * recording (student dropped), we **pause** the MediaRecorder; when active
 * again we **resume**. Manual Pause clears `userWantsRecording` and we
 * `stopAndUpload("final")`.
 */
export const WhiteboardWorkspaceAudioBridge = forwardRef<
  WhiteboardWorkspaceAudioBridgeHandle,
  Props
>(function WhiteboardWorkspaceAudioBridge(
  { studentId, whiteboardSessionId, userWantsRecording, recordingActive },
  ref
) {
  const pendingRef = useRef<Promise<void>[]>([]);

  const onRecorded = useCallback(
    async (
      audio: {
        blobUrl: string;
        mimeType: string;
        sizeBytes: number;
      },
      _meta?: { autoRollover?: boolean }
    ) => {
      const task = (async () => {
        const result = await registerWhiteboardSessionAudioSegmentAction(
          whiteboardSessionId,
          {
            blobUrl: audio.blobUrl,
            mimeType: audio.mimeType,
            sizeBytes: audio.sizeBytes,
          }
        );
        if (!result.ok) {
          console.error(
            `[WhiteboardWorkspaceAudioBridge] register segment failed wbsid=${whiteboardSessionId}`,
            result.error,
            result.debugId ?? ""
          );
        }
      })();
      pendingRef.current.push(task);
      try {
        await task;
      } finally {
        pendingRef.current = pendingRef.current.filter((p) => p !== task);
      }
    },
    [whiteboardSessionId]
  );

  const audio = useAudioRecorder({ studentId, onRecorded });

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
        const pending = [...pendingRef.current];
        await Promise.all(pending);
      },
    }),
    []
  );

  return null;
});
