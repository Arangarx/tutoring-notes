import type { ReplayAudioSegment } from "@/lib/whiteboard/replay-helpers";

export type SessionRecordingReplayRow = {
  id: string;
  mimeType: string;
  durationSeconds: number | null;
};

export type BuildReplayAudioPayloadArgs = {
  whiteboardSessionId: string;
  concatBlobUrl: string | null;
  concatDurationSeconds: number | null;
  audioRecordings: readonly SessionRecordingReplayRow[];
  audience: "admin" | "share" | "learner";
  shareToken?: string;
};

export type ReplayAudioPayload = {
  audioSegments: ReplayAudioSegment[];
  canonicalAudioBlobUrl: string | null;
  canonicalAudioMimeType: string | null;
  canonicalDurationSeconds: number | null;
  hasAudio: boolean;
};

/**
 * WS-G — build replay audio props for SSR / review payload loaders.
 * When `concatBlobUrl` is present, returns a single canonical segment;
 * otherwise falls back to per-`SessionRecording` proxy URLs.
 */
export function buildReplayAudioPayload(
  args: BuildReplayAudioPayloadArgs
): ReplayAudioPayload {
  const { whiteboardSessionId, concatBlobUrl, concatDurationSeconds, audioRecordings } =
    args;

  const concatUrl =
    args.audience === "share"
      ? `/api/whiteboard/${whiteboardSessionId}/public-concat-audio?token=${encodeURIComponent(args.shareToken ?? "")}`
      : args.audience === "learner"
        ? `/api/whiteboard/${whiteboardSessionId}/public-concat-audio`
        : `/api/whiteboard/${whiteboardSessionId}/concat-audio`;
  const recordingUrl = (recordingId: string) =>
    args.audience === "share"
      ? `/api/audio/${recordingId}?token=${encodeURIComponent(args.shareToken ?? "")}`
      : args.audience === "learner"
        ? `/api/audio/${recordingId}`
        : `/api/audio/admin/${recordingId}`;

  if (concatBlobUrl) {
    const canonicalUrl = concatUrl;

    return {
      hasAudio: true,
      canonicalAudioBlobUrl: canonicalUrl,
      canonicalAudioMimeType: "audio/webm",
      canonicalDurationSeconds: concatDurationSeconds,
      audioSegments: [
        {
          url: canonicalUrl,
          mimeType: "audio/webm",
          durationSeconds: concatDurationSeconds,
        },
      ],
    };
  }

  const audioSegments: ReplayAudioSegment[] = audioRecordings.map((rec) => ({
    url: recordingUrl(rec.id),
    mimeType: rec.mimeType,
    durationSeconds: rec.durationSeconds,
  }));

  return {
    hasAudio: audioSegments.length > 0,
    canonicalAudioBlobUrl: null,
    canonicalAudioMimeType: null,
    canonicalDurationSeconds: null,
    audioSegments,
  };
}
