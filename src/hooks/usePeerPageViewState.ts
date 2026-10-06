"use client";

import { useEffect, useState } from "react";
import type { WhiteboardSyncClient, WhiteboardWirePageViewStateMsg } from "@/lib/whiteboard/sync-client";

export type PeerPageViewState = WhiteboardWirePageViewStateMsg;

/**
 * Latest viewport wire from the opposite role (for VP-01 ghost overlay).
 */
export function usePeerPageViewState(
  sync: WhiteboardSyncClient | null,
  viewerRole: "tutor" | "student"
): PeerPageViewState | null {
  const [peerView, setPeerView] = useState<PeerPageViewState | null>(null);

  useEffect(() => {
    if (!sync || typeof sync.onRemotePageViewState !== "function") {
      setPeerView(null);
      return;
    }
    const wantRole = viewerRole === "tutor" ? "student" : "tutor";
    const off = sync.onRemotePageViewState((_from, msg) => {
      if (msg.role !== wantRole) return;
      setPeerView(msg);
    });
    const offPeers =
      typeof sync.onRoomPeersChange === "function"
        ? sync.onRoomPeersChange((peers) => {
            const hasPeer = peers.some((p) => p.role === wantRole);
            if (!hasPeer) setPeerView(null);
          })
        : () => undefined;
    return () => {
      off();
      offPeers();
      setPeerView(null);
    };
  }, [sync, viewerRole]);

  return peerView;
}
