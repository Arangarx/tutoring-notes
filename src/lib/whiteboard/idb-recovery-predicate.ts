/**
 * WS-D — pure helpers for Section F IDB vs server recovery decisions.
 */

import type { WBEventLog } from "@/lib/whiteboard/event-log";
import type { WhiteboardBoardDocumentV1 } from "@/lib/whiteboard/board-document-snapshot";
import type { InitialPersistedWhiteboardState } from "@/lib/whiteboard/assemble-persisted-state";

/**
 * True when server persistence fully covers the IndexedDB checkpoint — safe to
 * suppress the IDB recovery prompt and hydrate from server alone.
 *
 * `idbEventCount` is `checkpoint.log.events.length` (0 when no IDB row).
 */
export function shouldSuppressIdbPrompt(params: {
  serverLastPersistedToIndex: number;
  idbEventCount: number;
}): boolean {
  const { serverLastPersistedToIndex, idbEventCount } = params;
  if (idbEventCount <= 0) return true;
  return serverLastPersistedToIndex >= idbEventCount - 1;
}

export type IdbCheckpointPayload = {
  log: WBEventLog;
  boardDocument?: WhiteboardBoardDocumentV1;
};

/**
 * Merge server-hydrated state with the IDB tail beyond `lastPersistedToIndex`.
 * Zero-loss: server prefix + unpersisted IDB events; no double-apply because
 * tail starts strictly after the server cursor.
 */
export function mergeServerStateWithIdbTail(
  serverState: InitialPersistedWhiteboardState,
  idbPayload: IdbCheckpointPayload
): { mergedLog: WBEventLog; boardDocument?: WhiteboardBoardDocumentV1 } {
  const tailStart = serverState.lastPersistedToIndex + 1;
  const idbEvents = idbPayload.log.events;

  if (tailStart >= idbEvents.length) {
    return {
      mergedLog: serverState.log,
      boardDocument:
        serverState.boardDocument ?? idbPayload.boardDocument ?? undefined,
    };
  }

  const tail = idbEvents.slice(tailStart);
  const mergedLog: WBEventLog = {
    ...serverState.log,
    events: [...serverState.log.events, ...tail],
  };
  const last = mergedLog.events[mergedLog.events.length - 1];
  if (last && last.t > mergedLog.durationMs) {
    mergedLog.durationMs = last.t;
  }

  // IDB is ahead — prefer its board document (captures strokes after last persist).
  const boardDocument =
    idbPayload.boardDocument ?? serverState.boardDocument ?? undefined;

  return { mergedLog, boardDocument };
}
