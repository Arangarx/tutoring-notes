"use client";

import { WhiteboardReplayInFrame } from "@/components/whiteboard/replay/WhiteboardReplayInFrame";
import type { ReplayAudioSegment } from "@/lib/whiteboard/replay-helpers";
import "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/whiteboard-chrome.css";

export type ShareWhiteboardReplayPlayerProps = {
  eventsBlobUrl: string;
  audioSegments?: readonly ReplayAudioSegment[] | null;
  canonicalAudioBlobUrl?: string | null;
  canonicalAudioMimeType?: string | null;
  canonicalDurationSeconds?: number | null;
  whiteboardSessionId: string;
  studentName: string;
  durationSeconds?: number | null;
};

/** Share-scoped in-frame replay — no TutorNotesSection, no hide-to-hero affordance. */
export function ShareWhiteboardReplayPlayer({
  eventsBlobUrl,
  audioSegments,
  canonicalAudioBlobUrl,
  canonicalAudioMimeType,
  canonicalDurationSeconds,
  whiteboardSessionId,
  studentName,
  durationSeconds,
}: ShareWhiteboardReplayPlayerProps) {
  return (
    <WhiteboardReplayInFrame
      embedded
      isReviewActive
      eventsBlobUrl={eventsBlobUrl}
      audioSegments={audioSegments}
      canonicalAudioBlobUrl={canonicalAudioBlobUrl}
      canonicalAudioMimeType={canonicalAudioMimeType}
      canonicalDurationSeconds={canonicalDurationSeconds}
      whiteboardSessionId={whiteboardSessionId}
      studentName={studentName}
      durationSeconds={durationSeconds}
    />
  );
}
