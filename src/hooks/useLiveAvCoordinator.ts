import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";
import type { UseLiveAVReturn } from "@/hooks/useLiveAV";
import type { WbParticipantRole } from "@/components/whiteboard/chrome/wb-role";
import { isTouchPrimaryDevice } from "@/components/whiteboard/chrome/useWbLayoutMode";

// Debounce window for reachability-loss transitions. Mirrors the value that
// previously lived in WhiteboardWorkspaceClient — long enough to survive normal
// ICE keepalive hysteresis (~8s), short enough that a true drop loses only
// bounded audio. Drives both the lifecycle-participant removal debounce and the
// bothPartiesInRoom loss debounce.
const REACHABLE_LOSS_DEBOUNCE_MS = 8_000;

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
  /** Student join-gate reason (null = joinable); blocks A/V bootstrap. */
  joinUnavailableReason: string | null;
  /** Student has left the session (blocks A/V bootstrap). */
  hasLeft: boolean;
  /** Currently-open chrome menu (student overflow triggers device refresh). */
  openMenu: string | null;
  /** Browser camera permission state (drives camera-on-by-default). */
  hasCamPermission: UseLiveAVReturn["hasCamPermission"];
  /**
   * Tutor recorder first-acquire finished (AUDIO-1 #4). When `role === "tutor"`,
   * auto-`requestCam` waits until this is true so cam GUM cannot race
   * `useAudioRecorder.acquireMic`. Students ignore this (pass `true`).
   */
  tutorMicAcquireSettled: boolean;
  /**
   * Stable sorted key of reachable peerIds (memoized in the component from
   * `liveAv.reachableParticipants`). Sole change-trigger for the
   * lifecycle-participant debounce — the effect reads the participant objects
   * via `liveAvRef.current`.
   */
  reachablePeerIdsKey: string;
  /** `liveAv.reachableParticipants.length` (reactive primitive for the gate). */
  reachableParticipantsCount: number;
  /** Tutor's own sync socket connected (always false for students). */
  tutorSyncConnected: boolean;
  /** Student's own sync socket connected. */
  studentConnected: boolean;
  /**
   * Setter for the debounced FSM-input participant set (state stays in the
   * component so the FSM eval in the render body reads it).
   */
  setLifecycleParticipants: Dispatch<SetStateAction<ReadonlySet<string>>>;
  /** Setter for the WebRTC-reachable both-parties gate (state in component). */
  setBothPartiesInRoom: Dispatch<SetStateAction<boolean>>;
};

export function useLiveAvCoordinator({
  role,
  sync,
  studentSyncClient,
  peerCount,
  whiteboardSessionId,
  liveAvRef,
  studentHasConnectedOnceRef,
  joinUnavailableReason,
  hasLeft,
  openMenu,
  hasCamPermission,
  tutorMicAcquireSettled,
  reachablePeerIdsKey,
  reachableParticipantsCount,
  tutorSyncConnected,
  studentConnected,
  setLifecycleParticipants,
  setBothPartiesInRoom,
}: UseLiveAvCoordinatorArgs): void {
  // Student A/V bootstrap: run when sync connects (and on refresh reconnect),
  // not only when the client object exists — pickers must work before sync is up.
  useEffect(() => {
    if (role !== "student") return;
    if (!studentSyncClient) return;
    if (joinUnavailableReason !== null || hasLeft) return;

    const bootstrapAv = () => {
      void (async () => {
        if (
          !liveAvRef.current.localAudioStream &&
          !liveAvRef.current.localVideoStream
        ) {
          // Bundled GUM is for touch only (facingMode + single negotiation).
          // Desktop webcams fail OverconstrainedError on facingMode:user and
          // break mic+cam entirely (Andrew 2026-06-24 wife desktop smoke).
          if (isTouchPrimaryDevice()) {
            await liveAvRef.current.requestMicAndCam();
          } else {
            await liveAvRef.current.requestMic();
            await liveAvRef.current.requestCam();
          }
          return;
        }
        if (!liveAvRef.current.localAudioStream) {
          await liveAvRef.current.requestMic();
        }
        if (!liveAvRef.current.localVideoStream) {
          await liveAvRef.current.requestCam();
        }
      })();
    };

    if (studentSyncClient.isConnected()) {
      bootstrapAv();
    }

    const offConnect = studentSyncClient.onConnect(() => {
      bootstrapAv();
    });
    return () => {
      offConnect();
    };
  }, [role, studentSyncClient, joinUnavailableReason, hasLeft, liveAvRef]);

  // Refresh device lists when student opens overflow (touch has no top-bar
  // ▾ popover).
  useEffect(() => {
    if (role !== "student") return;
    if (openMenu !== "topbar-more" && openMenu !== "more") return;
    void liveAvRef.current.refreshAudioDeviceList();
    void liveAvRef.current.refreshVideoDeviceList();
  }, [role, openMenu, liveAvRef]);

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

  // Camera-on-by-default: auto-enable the camera when the browser Permissions
  // API confirms it was already granted (e.g. a subsequent session in the same
  // browser). Runs at most once per mount. Does NOT nag if denied or unknown.
  //
  // Tutor: wait for recorder first-acquire to settle (AUDIO-1 #4). Concurrent
  // cam+mic GUM on Windows Brio latched a silent mic while video still painted.
  const hasAutoRequestedCamRef = useRef(false);
  useEffect(() => {
    if (hasCamPermission !== "granted") return;
    if (liveAvRef.current.localVideoStream) return;
    if (hasAutoRequestedCamRef.current) return;
    if (role === "tutor" && !tutorMicAcquireSettled) return;
    hasAutoRequestedCamRef.current = true;
    void liveAvRef.current.requestCam();
  }, [hasCamPermission, liveAvRef, role, tutorMicAcquireSettled]);

  // Lifecycle-participant debounce (FSM input): mirror reachable ADDs
  // immediately (recovery is prompt) but debounce peer REMOVAL by
  // REACHABLE_LOSS_DEBOUNCE_MS so a transient ICE blip doesn't pause recording.
  // Output feeds the FSM via setLifecycleParticipants; the participant objects
  // are read from liveAvRef.current (reachablePeerIdsKey is the change-trigger).
  const lifecycleParticipantsRef = useRef<Set<string>>(new Set<string>());
  const lcpRemovalTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const lcpDisposedRef = useRef(false);

  useEffect(() => {
    lcpDisposedRef.current = false;
    const timers = lcpRemovalTimersRef.current;
    return () => {
      lcpDisposedRef.current = true;
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    if (lcpDisposedRef.current) return;
    const timers = lcpRemovalTimersRef.current;
    const nowReachableIds = new Set(
      liveAvRef.current.reachableParticipants.map((p) => p.peerId)
    );
    for (const [id, timer] of [...timers]) {
      if (nowReachableIds.has(id)) {
        clearTimeout(timer);
        timers.delete(id);
      }
    }
    const current = lifecycleParticipantsRef.current;
    const next = new Set(current);
    let addedAny = false;
    for (const id of nowReachableIds) {
      if (!next.has(id)) {
        next.add(id);
        addedAny = true;
        console.log(
          `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
            ` event=lifecycle-participant-added peer=${id}`
        );
      }
    }
    if (addedAny) {
      lifecycleParticipantsRef.current = next;
      setLifecycleParticipants(next);
    }
    for (const id of next) {
      if (!nowReachableIds.has(id) && !timers.has(id)) {
        timers.set(
          id,
          setTimeout(() => {
            if (lcpDisposedRef.current) return;
            timers.delete(id);
            lifecycleParticipantsRef.current.delete(id);
            setLifecycleParticipants(new Set(lifecycleParticipantsRef.current));
            console.log(
              `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
                ` event=lifecycle-participant-drop-debounced peer=${id} windowMs=${REACHABLE_LOSS_DEBOUNCE_MS}`
            );
          }, REACHABLE_LOSS_DEBOUNCE_MS)
        );
        console.log(
          `[WhiteboardWorkspaceClient] avx=${whiteboardSessionId} wbsid=${whiteboardSessionId}` +
            ` event=lifecycle-participant-removal-scheduled peer=${id} delayMs=${REACHABLE_LOSS_DEBOUNCE_MS}`
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reachablePeerIdsKey is a stable useMemo of liveAv.reachableParticipants; whiteboardSessionId is session-lifetime stable
  }, [reachablePeerIdsKey]);

  // bothPartiesInRoom — WebRTC-reachable gate (split-brain fix). Sync-connected
  // signal is role-specific: tutor uses tutorSyncConnected, student uses
  // studentConnected (tutorSyncConnected is always false for students, which
  // would otherwise lock the student overlay on "Connecting…").
  const reachableLossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  useEffect(() => {
    const syncConnectedForRole =
      role === "tutor" ? tutorSyncConnected : studentConnected;
    const nowReachable = syncConnectedForRole && reachableParticipantsCount >= 1;
    if (nowReachable) {
      if (reachableLossTimerRef.current !== null) {
        clearTimeout(reachableLossTimerRef.current);
        reachableLossTimerRef.current = null;
      }
      setBothPartiesInRoom(true);
    } else {
      if (reachableLossTimerRef.current === null) {
        reachableLossTimerRef.current = setTimeout(() => {
          reachableLossTimerRef.current = null;
          setBothPartiesInRoom(false);
        }, REACHABLE_LOSS_DEBOUNCE_MS);
      }
    }
    return () => {
      if (reachableLossTimerRef.current !== null) {
        clearTimeout(reachableLossTimerRef.current);
        reachableLossTimerRef.current = null;
      }
    };
  }, [role, tutorSyncConnected, studentConnected, reachableParticipantsCount]);
}
