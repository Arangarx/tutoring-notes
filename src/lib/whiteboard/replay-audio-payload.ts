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

export type ReplayProxyAudience = "admin" | "share" | "learner";

/**
 * One URL for replay event logs, concat audio, and per-recording audio.
 * Share appends the token. Learner and admin rely on their own session.
 */
export function replayProxyUrl(args: {
  resource: "events" | "concat-audio" | "recording";
  whiteboardSessionId: string;
  recordingId?: string;
  audience: ReplayProxyAudience;
  shareToken?: string;
}): string {
  const tokenQuery =
    args.audience === "share"
      ? `?token=${encodeURIComponent(args.shareToken ?? "")}`
      : "";
  if (args.resource === "recording") {
    const id = args.recordingId ?? "";
    if (args.audience === "admin") return `/api/audio/admin/${id}`;
    return `/api/audio/${id}${tokenQuery}`;
  }
  if (args.resource === "events") {
    return `/api/whiteboard/${args.whiteboardSessionId}/public-events${tokenQuery}`;
  }
  if (args.audience === "admin") {
    return `/api/whiteboard/${args.whiteboardSessionId}/concat-audio`;
  }
  return `/api/whiteboard/${args.whiteboardSessionId}/public-concat-audio${tokenQuery}`;
}

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

  const concatUrl = replayProxyUrl({
    resource: "concat-audio",
    whiteboardSessionId,
    audience: args.audience,
    shareToken: args.shareToken,
  });
  const recordingUrl = (recordingId: string) =>
    replayProxyUrl({
      resource: "recording",
      whiteboardSessionId,
      recordingId,
      audience: args.audience,
      shareToken: args.shareToken,
    });

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
