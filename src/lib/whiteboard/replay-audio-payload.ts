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
  audience: "admin" | "share";
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

  if (concatBlobUrl) {
    const canonicalUrl =
      args.audience === "share"
        ? `/api/whiteboard/${whiteboardSessionId}/public-concat-audio?token=${encodeURIComponent(args.shareToken ?? "")}`
        : `/api/whiteboard/${whiteboardSessionId}/concat-audio`;

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
    url:
      args.audience === "share"
        ? `/api/audio/${rec.id}?token=${encodeURIComponent(args.shareToken ?? "")}`
        : `/api/audio/admin/${rec.id}`,
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
