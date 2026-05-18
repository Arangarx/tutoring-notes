/**
 * Replay event-log parsing kept separate from the React player so lightweight
 * Jest tests (`replay.test.ts`) never import `@excalidraw/excalidraw` ESM.
 */

import {
  WB_EVENT_LOG_SCHEMA_VERSION,
  type WBEventLog,
} from "@/lib/whiteboard/event-log";

/**
 * Schema-version dispatch. Every `schemaVersion` we accept must appear in this
 * switch — adding a new version is a deliberate code change so an old player
 * can never silently misinterpret a future log format.
 */
export function parseEventLogBySchema(raw: unknown): WBEventLog {
  const candidate = raw as { schemaVersion?: unknown };
  switch (candidate.schemaVersion) {
    case 1:
      return validateV1Shape(candidate);
    default:
      throw new Error(
        `Unsupported whiteboard events schemaVersion: ${String(candidate.schemaVersion)}. ` +
          `This player understands schemaVersion=${WB_EVENT_LOG_SCHEMA_VERSION}.`
      );
  }
}

function validateV1Shape(raw: unknown): WBEventLog {
  const v = raw as Partial<WBEventLog>;
  if (typeof v.startedAt !== "string") {
    throw new Error("Events file missing `startedAt`.");
  }
  if (typeof v.durationMs !== "number") {
    throw new Error("Events file missing `durationMs`.");
  }
  if (!Array.isArray(v.events)) {
    throw new Error("Events file missing `events` array.");
  }
  return v as WBEventLog;
}
