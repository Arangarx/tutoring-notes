import { useEffect, useRef, type MutableRefObject } from "react";

import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { UseLiveAVReturn } from "@/hooks/useLiveAV";
import type { WbParticipantRole } from "@/components/whiteboard/chrome/wb-role";

/**
 * useLiveAvCoordinator — owns the post-`useLiveAV` A/V reconcile effects that
 * were previously inline in `WhiteboardWorkspaceClient`. This is a
 * behavior-preserving extraction (see the whiteboard-reliability remaining-work
 * plan, p1b-av-coordinator): each effect was first stabilized in-place to read
 * the live A/V handle through `liveAvRef.current` (rather than depending on the
 * whole `liveAv` object), then moved here unchanged.
 *
 * Stable-primitive contract: every effect depends only on primitives
 * (`role`/`sync`/`studentSyncClient`/`peerCount`/`whiteboardSessionId`) plus
 * refs. No effect depends on a whole hook-return object.
 *
 * This first slice houses the symmetric sync-reconnect mesh-restart effects
 * (student + tutor), the tutor roster-rejoin restart, and the per-session latch
 * reset. Further A/V reconcile effects (student bootstrap, device-list refresh,
 * lifecycle-participant debounce, bothPartiesInRoom gate, mount diagnostics,
 * camera auto-request, mic/cam callbacks) move here in subsequent slices.
 */
export type UseLiveAvCoordinatorArgs = {
  role: WbParticipantRole;
  /** Tutor sync client (null for students / before connect). */
  sync: WhiteboardSyncClient | null;
  /** Student sync client (null for tutors / before key ready). */
  studentSyncClient: WhiteboardSyncClient | null;
  /** Tutor sync roster peer count. */
  peerCount: number;
  whiteboardSessionId: string;
  /** Latest `useLiveAV` return — read via `.current`, never depended-on. */
  liveAvRef: MutableRefObject<UseLiveAVReturn>;
  /**
   * Shared with the workspace render body (Start latch); reset on session
   * change here so a 2nd session re-arms cleanly.
   */
  studentHasConnectedOnceRef: MutableRefObject<boolean>;
};

export function useLiveAvCoordinator({
  role,
  sync,
  studentSyncClient,
  peerCount,
  whiteboardSessionId,
  liveAvRef,
  studentHasConnectedOnceRef,
}: UseLiveAvCoordinatorArgs): void {
  // Student reconnect: replay ICE for all peers after sync reconnect.
  const sawStudentDisconnectRef = useRef(false);
  useEffect(() => {
    if (role !== "student" || !studentSyncClient) {
      sawStudentDisconnectRef.current = false;
      return;
    }
    const offConnect = studentSyncClient.onConnect(() => {
      const shouldRestart = sawStudentDisconnectRef.current;
      sawStudentDisconnectRef.current = false;
      if (!shouldRestart) return;
      for (const p of liveAvRef.current.participants) {
        try {
          liveAvRef.current.reconnectPeer(p.peerId);
        } catch {
          //
        }
      }
    });
    const offDisconnect = studentSyncClient.onDisconnect(() => {
      sawStudentDisconnectRef.current = true;
    });
    return () => {
      offConnect();
      offDisconnect();
    };
  }, [role, studentSyncClient, liveAvRef]);

  // Tutor reconnect: on sync disconnect→reconnect, mesh.restart every current
  // peer. We track "saw a disconnect since the last connect" rather than raw
  // connected state because the FIRST `onConnect` after mount is the natural
  // socket handshake (peer-mesh is being set up for the first time; there's no
  // prior in-flight negotiation to recover). Only disconnect→reconnect needs it.
  const sawDisconnectSinceLastConnectRef = useRef(false);
  useEffect(() => {
    if (!sync) {
      sawDisconnectSinceLastConnectRef.current = false;
      return;
    }
    const offConnect = sync.onConnect(() => {
      const shouldRestart = sawDisconnectSinceLastConnectRef.current;
      sawDisconnectSinceLastConnectRef.current = false;
      if (!shouldRestart) return;
      const current = liveAvRef.current.participants;
      if (current.length === 0) return;
      console.log(
        `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId} sync-reconnect peers=${current.length}`
      );
      for (const p of current) {
        try {
          liveAvRef.current.reconnectPeer(p.peerId);
        } catch (err) {
          console.warn(
            `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} mesh.restart threw peer=${p.peerId}`,
            err
          );
        }
      }
    });
    const offDisconnect = sync.onDisconnect(() => {
      sawDisconnectSinceLastConnectRef.current = true;
    });
    return () => {
      offConnect();
      offDisconnect();
    };
  }, [sync, whiteboardSessionId, liveAvRef]);

  // Tutor: when sync roster gains a student (0→≥1), restart mesh for stale PCs
  // (e.g. student exit→rejoin with same sessionStorage peerId).
  const prevSyncPeerCountRef = useRef(0);
  useEffect(() => {
    if (role !== "tutor") return;
    const prev = prevSyncPeerCountRef.current;
    prevSyncPeerCountRef.current = peerCount;
    if (prev !== 0 || peerCount < 1) return;
    const current = liveAvRef.current.participants;
    if (current.length === 0) return;
    console.log(
      `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId}` +
        ` event=sync-roster-rejoin peers=${current.length}`
    );
    for (const p of current) {
      try {
        liveAvRef.current.reconnectPeer(p.peerId);
      } catch (err) {
        console.warn(
          `[WhiteboardWorkspaceClient] wbsid=${whiteboardSessionId} sync-roster-rejoin threw peer=${p.peerId}`,
          err
        );
      }
    }
  }, [role, peerCount, whiteboardSessionId, liveAvRef]);

  // Reset per-session latches when whiteboardSessionId changes so a 2nd session
  // starts with a clean slate. Both are idempotent latches that only move
  // false→true in normal flow; resetting re-arms them for the new session.
  useEffect(() => {
    studentHasConnectedOnceRef.current = false;
    prevSyncPeerCountRef.current = 0;
  }, [whiteboardSessionId, studentHasConnectedOnceRef]);
}
