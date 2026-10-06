"use client";

/**
 * Inbound live cursors (separate wire from laser). Merges into the same
 * Excalidraw collaborators map as laser via shared applyCollaborators helper.
 * Cursor entries hide locally after ~5s without movement; laser untouched.
 */

import { useEffect, useRef } from "react";
import type React from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  buildCollaboratorCursorEntry,
  buildCollaboratorLaserEntry,
} from "@/lib/whiteboard/laser-colors";

export const REMOTE_CURSOR_STALE_MS = 5000;

type CollaboratorEntry = {
  pointer?: {
    x: number;
    y: number;
    tool: "pointer" | "laser";
    renderCursor?: boolean;
    laserColor?: string;
  };
  button?: "up" | "down";
  username?: string | null;
  color?: { background: string; stroke: string };
};

type OverlayKind = "laser" | "cursor";

function applyCollaborators(
  api: ExcalidrawApiLike,
  applyingRemoteRef: React.MutableRefObject<boolean>,
  map: Map<string, CollaboratorEntry>
): void {
  applyingRemoteRef.current = true;
  try {
    api.updateScene({
      collaborators: new Map(map),
      captureUpdate: "NEVER",
    });
  } finally {
    applyingRemoteRef.current = false;
  }
}

/**
 * Wire laser (pointer wire) + live cursor (cursor wire) into one overlay map.
 * Pass the same applyingRemoteRef used by the canvas remote-apply guard.
 */
export function useCollaboratorLiveCursors(
  sync: WhiteboardSyncClient | null,
  excalidrawAPI: ExcalidrawApiLike | null,
  applyingRemoteRef: React.MutableRefObject<boolean>,
  activePageIdRef: React.MutableRefObject<string>
): void {
  const overlayKindRef = useRef<Map<string, OverlayKind>>(new Map());
  const cursorLastSeenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!sync) return;

    const collaboratorMap = new Map<string, CollaboratorEntry>();

    const refreshScene = () => {
      const api = excalidrawAPI;
      if (!api) return;
      applyCollaborators(api, applyingRemoteRef, collaboratorMap);
    };

    const offLaser = sync.onRemotePointer((fromPeerId, msg) => {
      const api = excalidrawAPI;
      if (!api) return;
      if (msg.pageId !== activePageIdRef.current) return;

      overlayKindRef.current.set(fromPeerId, "laser");
      collaboratorMap.set(
        fromPeerId,
        buildCollaboratorLaserEntry({
          role: msg.role,
          x: msg.x,
          y: msg.y,
          button: msg.button,
        })
      );
      refreshScene();
    });

    const offCursor =
      typeof sync.onRemoteCursor === "function"
        ? sync.onRemoteCursor((fromPeerId, msg) => {
            const api = excalidrawAPI;
            if (!api) return;
            if (msg.pageId !== activePageIdRef.current) return;

            overlayKindRef.current.set(fromPeerId, "cursor");
            cursorLastSeenRef.current.set(fromPeerId, Date.now());
            collaboratorMap.set(
              fromPeerId,
              buildCollaboratorCursorEntry({
                role: msg.role,
                x: msg.x,
                y: msg.y,
                button: msg.button,
              })
            );
            refreshScene();
          })
        : () => {};

    const offPeers =
      typeof sync.onRoomPeersChange === "function"
        ? sync.onRoomPeersChange((peers) => {
            const live = new Set(peers.map((p) => p.peerId));
            let changed = false;
            for (const pid of collaboratorMap.keys()) {
              if (!live.has(pid)) {
                collaboratorMap.delete(pid);
                overlayKindRef.current.delete(pid);
                cursorLastSeenRef.current.delete(pid);
                changed = true;
              }
            }
            if (changed) refreshScene();
          })
        : () => {};

    const staleTimer = window.setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [pid, kind] of overlayKindRef.current.entries()) {
        if (kind !== "cursor") continue;
        const last = cursorLastSeenRef.current.get(pid) ?? 0;
        if (now - last > REMOTE_CURSOR_STALE_MS) {
          collaboratorMap.delete(pid);
          overlayKindRef.current.delete(pid);
          cursorLastSeenRef.current.delete(pid);
          changed = true;
        }
      }
      if (changed) refreshScene();
    }, 500);

    return () => {
      offLaser();
      offCursor();
      offPeers();
      window.clearInterval(staleTimer);
      const api = excalidrawAPI;
      if (api && collaboratorMap.size > 0) {
        collaboratorMap.clear();
        overlayKindRef.current.clear();
        cursorLastSeenRef.current.clear();
        applyCollaborators(api, applyingRemoteRef, collaboratorMap);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, excalidrawAPI]);
}
