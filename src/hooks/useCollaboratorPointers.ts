"use client";

/**
 * useCollaboratorPointers — subscribes to inbound laser/pointer positions
 * from peers and applies them to the Excalidraw canvas via
 * `updateScene({ collaborators, captureUpdate: "NEVER" })`.
 *
 * RELIABILITY SEAMS:
 *   - NEVER enters handleExcalidrawChange / scheduleDocumentBroadcast.
 *     Uses updateScene with captureUpdate: "NEVER" so the collaborator
 *     overlay doesn't enter the undo stack or trigger outbound scene
 *     broadcasts.
 *   - updateScene({ collaborators }) MUST be wrapped in the caller's
 *     remote-apply guard (applyingRemoteRef / applyingRemoteToCanvasRef).
 *     This prevents an echo: Excalidraw fires onChange after updateScene,
 *     which the guard short-circuits before it reaches broadcastScene/Document.
 *   - Pointers are ephemeral — nothing is persisted to pageDataRef,
 *     outbox, or event-log here.
 *
 * Per-role colors via laser-colors.ts (token-values):
 *   tutor  = coral WB_LASER_TUTOR_HEX   (#e27d60, matches --accent)
 *   student = sky  WB_LASER_STUDENT_HEX  (#0891b2)
 * Tutor-local laser uses Excalidraw DEFAULT_LASER_COLOR ("red") — overridden
 * to coral in whiteboard-chrome.css; only remote overlay color is API-set here.
 *
 * B9 pilot fix — makes the tutor wand visible on the student canvas.
 */

import { useEffect } from "react";
import type React from "react";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import { buildCollaboratorLaserEntry } from "@/lib/whiteboard/laser-colors";

/**
 * Wire up inbound pointer/laser messages from the sync client and render
 * them on the Excalidraw canvas using Excalidraw's collaborator overlay.
 *
 * @param sync               Live sync client (null when sync is disabled).
 * @param excalidrawAPI      Excalidraw imperative API (null before first mount).
 * @param applyingRemoteRef  The caller's remote-apply guard ref. MUST be
 *                           set true during updateScene and cleared after so
 *                           Excalidraw's own onChange doesn't echo outbound.
 * @param activePageIdRef    Ref to the current active page id. Using a ref
 *                           (rather than state) avoids stale closures and
 *                           prevents unnecessary re-subscriptions on page turns.
 *                           Cross-page pointers are silently dropped.
 */
export function useCollaboratorPointers(
  sync: WhiteboardSyncClient | null,
  excalidrawAPI: ExcalidrawApiLike | null,
  applyingRemoteRef: React.MutableRefObject<boolean>,
  activePageIdRef: React.MutableRefObject<string>
): void {
  useEffect(() => {
    if (!sync) return;

    const collaboratorMap = new Map<
      string,
      {
        pointer?: { x: number; y: number; tool: "pointer" | "laser"; renderCursor?: boolean; laserColor?: string };
        button?: "up" | "down";
        username?: string | null;
        color?: { background: string; stroke: string };
      }
    >();

    const off = sync.onRemotePointer((fromPeerId, msg) => {
      const api = excalidrawAPI;
      if (!api) return;

      // Drop pointers from a different page — the peer is on a different tab.
      // Read from the ref so we always have the latest active page without
      // needing to re-subscribe every time the student turns a page.
      if (msg.pageId !== activePageIdRef.current) return;

      collaboratorMap.set(
        fromPeerId,
        buildCollaboratorLaserEntry({
          role: msg.role,
          x: msg.x,
          y: msg.y,
          button: msg.button,
        })
      );

      applyingRemoteRef.current = true;
      try {
        api.updateScene({
          collaborators: new Map(collaboratorMap),
          captureUpdate: "NEVER",
        });
      } finally {
        applyingRemoteRef.current = false;
      }
    });

    return () => {
      off();
      // Clear the overlay when we disconnect / unmount.
      const api = excalidrawAPI;
      if (api && collaboratorMap.size > 0) {
        applyingRemoteRef.current = true;
        try {
          api.updateScene({ collaborators: new Map(), captureUpdate: "NEVER" });
        } finally {
          applyingRemoteRef.current = false;
        }
      }
      collaboratorMap.clear();
    };
    // Re-run when sync client or API changes. activePageIdRef and
    // applyingRemoteRef are refs (stable objects) — not deps. We read
    // .current inside the callback, always getting the latest value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, excalidrawAPI]);
}
