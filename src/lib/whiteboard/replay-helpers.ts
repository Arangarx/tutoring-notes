import type { WBElement, WBEventLog } from "@/lib/whiteboard/event-log";
import type { ReplayAudioTimeline } from "@/lib/whiteboard/replay-audio-timeline";
import { buildReplayAudioTimeline } from "@/lib/whiteboard/replay-audio-timeline";
import { maxEventTimestampMs } from "@/lib/whiteboard/event-log";

/** Walk the log and collect every distinct `assetUrl` for pre-warm. */
export function collectReplayAssetUrls(log: WBEventLog): string[] {
  const urls = new Set<string>();
  function visit(el: WBElement) {
    if (el.assetUrl) urls.add(el.assetUrl);
  }
  for (const event of log.events) {
    if (event.type === "snapshot") {
      for (const el of event.elements) visit(el);
    } else if (event.type === "add") {
      visit(event.element);
    } else if (event.type === "update") {
      const patchUrl = (event.patch as { assetUrl?: string }).assetUrl;
      if (patchUrl) urls.add(patchUrl);
    }
  }
  return Array.from(urls);
}

export function credentialsForReplayFetch(url: string): RequestCredentials {
  if (typeof window === "undefined") return "omit";
  if (url.startsWith("/")) return "include";
  try {
    const resolved = new URL(url, window.location.href);
    if (resolved.origin === window.location.origin) return "include";
  } catch {
    // ignore
  }
  return "omit";
}

export async function readReplayJsonError(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    const parsed = JSON.parse(text) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof (parsed as { error: unknown }).error === "string"
    ) {
      return (parsed as { error: string }).error;
    }
  } catch {
    return null;
  }
  return null;
}

export function formatReplayDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Authoritative replay timeline ceiling (B1 fix).
 * Independent oracle for tests — not back-derived from hook internals.
 */
export function computeReplayTotalMs(args: {
  log: WBEventLog | null;
  hasAudio: boolean;
  measuredAudioTotalMs: number;
  storedAudioTotalMs: number;
}): number {
  const { log, hasAudio, measuredAudioTotalMs, storedAudioTotalMs } = args;
  const eventMax = log ? maxEventTimestampMs(log) : 0;
  const logDuration = log?.durationMs ?? 0;
  if (hasAudio) {
    const audioBound =
      measuredAudioTotalMs > 0 ? measuredAudioTotalMs : storedAudioTotalMs;
    return Math.max(audioBound, eventMax, logDuration, 1);
  }
  return Math.max(eventMax, logDuration, 1);
}

/** Scrubber max — same strategy as legacy WhiteboardReplay with totalMs oracle. */
export function computeScrubberMax(args: {
  hasAudio: boolean;
  totalMs: number;
  log: WBEventLog | null;
  noAudioMaxMs: number;
}): number {
  const { hasAudio, totalMs, log, noAudioMaxMs } = args;
  if (!hasAudio) return noAudioMaxMs;
  const eventMax = log ? maxEventTimestampMs(log) : 0;
  const logDuration = log?.durationMs ?? 0;
  return Math.max(totalMs, eventMax, logDuration, 1);
}

export function computeNoAudioMaxMs(log: WBEventLog): number {
  return Math.max(maxEventTimestampMs(log), log.durationMs, 1);
}

export function stableHashReplayFileId(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = (h * 33 + url.charCodeAt(i)) | 0;
  return `f_${(h >>> 0).toString(36)}`;
}

export type ReplayApi = {
  updateScene: (data: {
    elements?: ReadonlyArray<unknown>;
    appState?: Record<string, unknown>;
  }) => void;
  getAppState?: () => Record<string, unknown>;
  refresh?: () => void;
  addFiles: (
    files: Array<{
      id: string;
      mimeType:
        | "image/png"
        | "image/jpeg"
        | "image/svg+xml"
        | "image/webp"
        | "image/gif";
      dataURL: string;
      created: number;
    }>
  ) => void;
};

export type ReplayAudioSegment = {
  url: string;
  mimeType?: string | null;
  durationSeconds?: number | null;
};

export type ReplayLoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; log: WBEventLog }
  | { kind: "error"; message: string };

export type ReplayTimelineControllerInput = {
  eventsBlobUrl: string;
  audioSegments?: readonly ReplayAudioSegment[] | null;
  audioBlobUrl?: string | null;
  audioMimeType?: string | null;
  whiteboardSessionId?: string;
};

export function resolveEffectiveSegments(
  input: ReplayTimelineControllerInput
): ReplayAudioSegment[] {
  const { audioSegments, audioBlobUrl, audioMimeType } = input;
  if (audioSegments && audioSegments.length > 0) {
    return [...audioSegments];
  }
  if (audioBlobUrl) {
    return [
      {
        url: audioBlobUrl,
        mimeType: audioMimeType ?? null,
        durationSeconds: null,
      },
    ];
  }
  return [];
}

export function buildAudioTimelineFromSegments(
  segments: readonly ReplayAudioSegment[]
): ReplayAudioTimeline {
  return buildReplayAudioTimeline(segments.map((s) => s.durationSeconds));
}
