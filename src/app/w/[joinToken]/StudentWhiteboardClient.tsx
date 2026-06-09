"use client";

/**
 * Student-side live whiteboard: encryption key from hash, encrypted
 * sync to the same room as the tutor, and a real Excalidraw surface
 * so the student can draw with the tutor in real time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
import { useExcalidrawThemeFromSystem } from "@/hooks/useExcalidrawThemeFromSystem";
import { useParams } from "next/navigation";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
import { useLiveAV } from "@/hooks/useLiveAV";
import { AVPermissionsPrompt } from "@/components/av/AVPermissionsPrompt";
import { AVTilesPanel } from "@/components/av/AVTilesPanel";
import { AVControls } from "@/components/av/AVControls";
import VideoControls from "@/components/av/VideoControls";
import {
  ACTIVE_PING_STALE_MS,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import { WhiteboardDebugHud } from "@/components/whiteboard/WhiteboardDebugHud";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { getOrCreateLocalPeerId } from "@/lib/whiteboard/local-peer-id";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import { UndoRedoButtons } from "@/components/whiteboard/UndoRedoButtons";
import { PageStrip } from "@/components/whiteboard/PageStrip";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { HydrateRemoteImageFilesResult } from "@/lib/whiteboard/hydrate-remote-files";
import { ensureNativeImageAssetUrlsForSync } from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import type { BinaryFileFromExcalidraw } from "@/lib/whiteboard/ensure-native-image-asset-urls-for-sync";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import {
  registerWbE2eSceneBridge,
  registerWbE2eSceneMutationHook,
} from "@/lib/whiteboard/wb-e2e-scene-bridge";
import { createWbFollowDebugTelemetry } from "@/lib/whiteboard/wb-follow-debug-telemetry";

type JoinUnavailableReason =
  | "session_ended"
  | "token_revoked"
  | "token_expired"
  | "link_invalid";

function joinUnavailableCopy(
  reason: JoinUnavailableReason,
  tutorName: string
): { title: string; body: string } {
  switch (reason) {
    case "session_ended":
      return {
        title: "Session has ended",
        body: `Your tutor ended this whiteboard. You can close this tab. If you still need something from the lesson, reach out to ${tutorName}.`,
      };
    case "token_revoked":
      return {
        title: "This invite link was closed",
        body: `Ask ${tutorName} for a new whiteboard link if you still need the room.`,
      };
    case "token_expired":
      return {
        title: "This invite link has expired",
        body: `Ask ${tutorName} for a new link.`,
      };
    default:
      return {
        title: "This link isnΓÇÖt usable anymore",
        body: `The session may have ended, or the link was copied incorrectly. Ask ${tutorName} for a fresh link.`,
      };
  }
}

type Props = {
  whiteboardSessionId: string;
  /** For namespaced Vercel Blob paths + native image upload (paste/drop). */
  studentId: string;
  joinToken: string;
  syncUrl: string;
  tutorName: string;
  /** Server snapshot for the pill ΓÇö mirrors tutor workspace hydration. */
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
};

function formatSessionDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function readKeyFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return null;
  const params = new URLSearchParams(
    hash.startsWith("#") ? hash.slice(1) : hash
  );
  const k = params.get("k");
  return k && k.length >= 16 ? k : null;
}

export function StudentWhiteboardClient({
  whiteboardSessionId,
  studentId,
  joinToken: joinTokenFromServer,
  syncUrl,
  tutorName,
  initialActiveMs,
  initialLastActiveAtIso,
}: Props) {
  const params = useParams<{ joinToken: string }>();
  const joinToken =
    typeof params?.joinToken === "string" ? params.joinToken : "";
  const pathJoinToken = joinToken || joinTokenFromServer;

  const [joinUnavailableReason, setJoinUnavailableReason] = useState<
    JoinUnavailableReason | null
  >(null);

  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [syncClient, setSyncClient] = useState<WhiteboardSyncClient | null>(
    null
  );
  const [connected, setConnected] = useState(false);

  // Phase 4c: one stable peer id per student mount. Phase 4d Commit
  // 4: persisted in `sessionStorage[wb-peer-id:<sessionId>]` so a
  // tab reload reuses the SAME id and the peer-mesh idempotency
  // path absorbs the rejoin (no duplicate-tile bug). Threaded into
  // BOTH `createWhiteboardSyncClient({peerId})` and
  // `useLiveAV({localPeerId})` so the wire-envelope peerId and the
  // peer-mesh + signaling identity match. Same pattern as the tutor
  // workspace; see `WhiteboardWorkspaceClient.tsx` for the
  // architectural rationale.
  const localPeerId = useMemo(
    () => getOrCreateLocalPeerId(whiteboardSessionId, "student"),
    [whiteboardSessionId]
  );
  /**
   * Shown only on this student's own tile. Must NOT be sent on the
   * sync `presence` wire ΓÇö that label is visible to the tutor and
   * other peers (e.g. recording moderation).
   */
  const localTileLabel = "You";
  /** Distinct per tab; travels in encrypted presence for remote UI. */
  const syncPresenceLabel = useMemo(() => {
    const compact = localPeerId.replace(/-/g, "");
    const short = compact.slice(0, 6) || "join";
    return `Student ┬╖ ${short}`;
  }, [localPeerId]);
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(
    null
  );
  const excalidrawAPIRef = useRef<ExcalidrawApiLike | null>(null);
  const followDebugTelemetry = useMemo(() => createWbFollowDebugTelemetry(), []);
  const [otherPeerCount, setOtherPeerCount] = useState(0);
  const [relayShowsCollaborator, setRelayShowsCollaborator] =
    useState(false);
  const [serverActiveMs, setServerActiveMs] = useState(
    Math.max(0, initialActiveMs)
  );
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<
    number | null
  >(
    initialLastActiveAtIso
      ? new Date(initialLastActiveAtIso).getTime()
      : null
  );
  const [now, setNow] = useState(() => Date.now());
  const excalidrawTheme = useExcalidrawThemeFromSystem();

  useWindowScrollToTopOnMount();

  useEffect(() => {
    const k = readKeyFromHash();
    if (!k) {
      setKeyMissing(true);
      return;
    }
    setEncryptionKey(k);
  }, []);

  useEffect(() => {
    if (!encryptionKey) return;
    if (joinUnavailableReason !== null) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "student",
      // Phase 4c: same peerId threaded into useLiveAV below.
      peerId: localPeerId,
      localPeerLabel: syncPresenceLabel,
    });
    setSyncClient(client);
    setConnected(client.isConnected());
    const offConnect = client.onConnect(() => setConnected(true));
    const offDisconnect = client.onDisconnect(() => {
      setConnected(false);
      setRelayShowsCollaborator(false);
    });
    const offPeers = client.onPeerCountChange((n) => setOtherPeerCount(n));
    const offRemote = client.onRemoteScene(() => setRelayShowsCollaborator(true));
    return () => {
      offConnect();
      offDisconnect();
      offPeers();
      offRemote();
      client.disconnect();
      setSyncClient(null);
      setConnected(false);
    };
  }, [
    encryptionKey,
    syncUrl,
    whiteboardSessionId,
    joinUnavailableReason,
    localPeerId,
    syncPresenceLabel,
  ]);

  // Phase 4c: live A/V hook. INERT until `requestMic()` / `requestCam()`
  // are called from the AVPermissionsPrompt below. Identical contract
  // to the tutor side; no recorder instantiation and no FSM on the
  // student side ΓÇö the student is a receive-only consumer of remote
  // tracks.
  const liveAv = useLiveAV({
    syncClient,
    localPeerId,
    sessionId: whiteboardSessionId,
  });

  // Phase 4c: sync-reconnect ΓåÆ mesh.restart for every current peer.
  // Identical pattern to the workspace client; see that file for the
  // rationale around suppressing the first-mount onConnect.
  const sawDisconnectSinceLastConnectRef = useRef(false);
  useEffect(() => {
    if (!syncClient) {
      sawDisconnectSinceLastConnectRef.current = false;
      return;
    }
    const offConnect = syncClient.onConnect(() => {
      const shouldRestart = sawDisconnectSinceLastConnectRef.current;
      sawDisconnectSinceLastConnectRef.current = false;
      if (!shouldRestart) return;
      const current = liveAv.participants;
      if (current.length === 0) return;
      console.log(
        `[StudentWhiteboardClient] wbsid=${whiteboardSessionId} avx=${whiteboardSessionId} sync-reconnect peers=${current.length}`
      );
      for (const p of current) {
        try {
          liveAv.reconnectPeer(p.peerId);
        } catch (err) {
          console.warn(
            `[StudentWhiteboardClient] wbsid=${whiteboardSessionId} mesh.restart threw peer=${p.peerId}`,
            err
          );
        }
      }
    });
    const offDisconnect = syncClient.onDisconnect(() => {
      sawDisconnectSinceLastConnectRef.current = true;
    });
    return () => {
      offConnect();
      offDisconnect();
    };
  }, [syncClient, liveAv, whiteboardSessionId]);

  // callConnected: at least one remote peer is WebRTC-reachable
  // (peerConnectionState=connected AND iceConnectionState Γêê {connected,completed}).
  // Used for the call-quality indicator and the timer gate.
  const callConnected = liveAv.reachableParticipants.length >= 1;

  // Timer gate: require BOTH sync presence AND WebRTC reachability.
  // Previously keyed on sync-presence alone ΓÇö the split-brain fix: if
  // the relay socket is up but WebRTC is dead, the timer must pause.
  const bothPresentForTimer =
    connected && callConnected;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pathJoinToken) return;
    if (joinUnavailableReason !== null) return;
    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/whiteboard/${encodeURIComponent(whiteboardSessionId)}/join-timer?token=${encodeURIComponent(pathJoinToken)}`,
          { cache: "no-store", credentials: "same-origin" }
        );
        if (!res.ok) {
          if (res.status === 404) {
            setJoinUnavailableReason((prev) => prev ?? "link_invalid");
          }
          return;
        }
        const data = (await res.json()) as {
          live?: boolean;
          reason?: string;
          activeMs?: number;
          lastActiveAt?: string | null;
        };
        if (data.live === false) {
          const r = data.reason;
          const mapped: JoinUnavailableReason =
            r === "token_expired"
              ? "token_expired"
              : r === "token_revoked"
                ? "token_revoked"
                : r === "session_ended"
                  ? "session_ended"
                  : "link_invalid";
          setJoinUnavailableReason(mapped);
          return;
        }
        const treatAsLive =
          data.live === true ||
          (data.live === undefined && typeof data.activeMs === "number");
        if (!treatAsLive) return;
        if (typeof data.activeMs === "number") setServerActiveMs(data.activeMs);
        if (data.lastActiveAt !== undefined) {
          setServerLastActiveAtMs(
            data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : null
          );
        }
      } catch {
        // ignore; next tick retries
      }
    };
    void refresh();
    // Poll often enough that the student's session pill advances smoothly
    // between tutor heartbeats (~10 s); tutor UI ticks locally from server
    // `lastActiveAt` but the student's server snapshot was only 10 s behind.
    const POLL_MS = 3_500;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [pathJoinToken, whiteboardSessionId, joinUnavailableReason]);

  const liveTimerMs = useMemo(
    () =>
      computeDisplayActiveMs({
        nowMs: now,
        serverActiveMs,
        serverLastActiveAtMs,
        clientActiveNow: bothPresentForTimer,
        staleThresholdMs: ACTIVE_PING_STALE_MS,
      }),
    [now, serverActiveMs, serverLastActiveAtMs, bothPresentForTimer]
  );

  const showWaitingForOther =
    serverActiveMs === 0 && !bothPresentForTimer && connected;

  const [materialNotice, setMaterialNotice] = useState<
    "none" | "load" | "missing"
  >("none");
  const [dismissedMaterialNotice, setDismissedMaterialNotice] = useState(false);
  const [dismissedBoardWaitNotice, setDismissedBoardWaitNotice] = useState(false);
  const [boardWaitElapsed, setBoardWaitElapsed] = useState(false);

  const studentNativeImageFileIdToAssetUrlRef = useRef(new Map<string, string>());
  const studentNativeImageUploadInFlightRef = useRef(new Set<string>());

  const onRemoteHydrateResult = useCallback(
    (result: HydrateRemoteImageFilesResult) => {
      if (result.fetchFailed.length > 0) {
        setMaterialNotice("load");
        setDismissedMaterialNotice(false);
        return;
      }
      if (result.missingAssetUrlFileIds.length > 0) {
        setMaterialNotice((prev) => (prev === "load" ? "load" : "missing"));
        setDismissedMaterialNotice(false);
      }
    },
    []
  );

  const [independentView, setIndependentView] = useState(false);

  const {
    onCanvasChange: studentSyncOnCanvas,
    syncActivePageElements,
    snapToTutorView,
    getPageBroadcastExtras,
    pageList,
    sectionsRegistry,
    activePageId: studentActivePageId,
    selectStudentPage,
    tutorStreamReady,
  } = useStudentWhiteboardCanvas(
    syncClient,
    excalidrawAPI,
    onRemoteHydrateResult,
    {
      joinToken: pathJoinToken,
      whiteboardSessionId,
      followTutorView: !independentView,
      followDebugTelemetry,
    }
  );

  useEffect(() => {
    if (!connected || otherPeerCount < 1) {
      setBoardWaitElapsed(false);
      return;
    }
    if (tutorStreamReady) {
      setBoardWaitElapsed(false);
      return;
    }
    const t = window.setTimeout(() => setBoardWaitElapsed(true), 8000);
    return () => clearTimeout(t);
  }, [connected, otherPeerCount, tutorStreamReady]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_WB_E2E_SCENE_HOOK !== "1") return;
    registerWbE2eSceneMutationHook("student", () => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      studentSyncOnCanvas(elements);
    });
  }, [studentSyncOnCanvas]);

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, unknown>>
    ) => {
      studentSyncOnCanvas(elements, _appState, files);
      if (!pathJoinToken) return;
      void (async () => {
        try {
          const api = excalidrawAPIRef.current;
          if (!api) return;
          const getFiles = (): Record<string, BinaryFileFromExcalidraw> => {
            const raw = api.getFiles?.();
            return raw && typeof raw === "object"
              ? (raw as Record<string, BinaryFileFromExcalidraw>)
              : {};
          };
          const patched = await ensureNativeImageAssetUrlsForSync({
            elements,
            files: files as
              | Record<string, BinaryFileFromExcalidraw>
              | undefined,
            getFiles,
            whiteboardSessionId,
            studentId,
            joinToken: pathJoinToken,
            fileIdToAssetUrl: studentNativeImageFileIdToAssetUrlRef.current,
            inFlight: studentNativeImageUploadInFlightRef.current,
          });
          if (patched) {
            const live = excalidrawAPIRef.current;
            if (live) {
              syncActivePageElements(
                patched as ReadonlyArray<ExcalidrawLikeElement>
              );
              live.updateScene({ elements: patched });
              syncClient?.broadcastScene(
                patched as ReadonlyArray<ExcalidrawLikeElement>,
                getPageBroadcastExtras()
              );
            }
          }
        } catch (err) {
          console.warn(
            "[StudentWhiteboardClient] native image asset back-fill failed:",
            (err as Error)?.message ?? String(err)
          );
        }
      })();
    },
    [studentSyncOnCanvas, syncActivePageElements, whiteboardSessionId, studentId, pathJoinToken, syncClient, getPageBroadcastExtras]
  );

  if (keyMissing) {
    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard link is incomplete</h1>
          <p>
            This link is missing the encryption key needed to join the
            whiteboard. Please ask {tutorName} for a fresh link.
          </p>
          <p className="muted" style={{ fontSize: 12 }}>
            Whiteboard links look like
            <code style={{ marginLeft: 6 }}>/w/&lt;token&gt;#k=&lt;key&gt;</code>.
            The part after <code>#</code> is required and never gets sent to
            the server, so it can&apos;t be recovered.
          </p>
        </div>
      </div>
    );
  }

  if (joinUnavailableReason) {
    const { title: closedTitle, body: closedBody } = joinUnavailableCopy(
      joinUnavailableReason,
      tutorName
    );
    return (
      <div className="container" style={{ maxWidth: 720 }}>
        <div className="card" role="status">
          <h1 style={{ marginTop: 0 }}>{closedTitle}</h1>
          <p style={{ marginBottom: 0 }}>{closedBody}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Whiteboard with {tutorName}</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            This session is being recorded by your tutor. What you draw is
            visible live.{" "}
            {otherPeerCount === 0
              ? "Waiting for others to join this room (besides you)."
              : `Others in this room (not counting you): ${otherPeerCount}.`}
          </p>
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 12, maxWidth: 640 }}>
            Worksheets and images your tutor insert from the toolbar should
            appear here. If something is missing, check your connection, refresh
            the page, or ask your tutor to re-insert the page.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {/* Sync-socket presence pill */}
          <div
            aria-live="polite"
            aria-label={connected ? "Connected to room" : "Connecting to room"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: connected
                ? "var(--success-soft)"
                : "var(--warning-soft)",
              color: connected ? "var(--success)" : "var(--warning)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: connected ? "var(--success)" : "var(--warning)",
              }}
            />
            {connected ? "Connected" : "JoiningΓÇª"}
          </div>
          {/* Call-quality pill: only shown when peers are present.
              Distinguishes "sync connected" from "WebRTC call connected"
              so the student knows if audio/video is actually flowing. */}
          {connected && liveAv.participants.length > 0 && (
            <div
              aria-live="polite"
              aria-label={callConnected ? "Call connected" : "Call reconnecting"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                background: callConnected
                  ? "var(--success-soft)"
                  : "var(--warning-soft)",
                color: callConnected ? "var(--success)" : "var(--warning)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: callConnected ? "var(--success)" : "var(--warning)",
                }}
              />
              {callConnected ? "Call connected" : "Call reconnectingΓÇª"}
            </div>
          )}
          <div
            aria-label="Session time"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--info-soft)",
              color: "var(--info)",
            }}
          >
            {showWaitingForOther
              ? `Session: ${formatSessionDuration(liveTimerMs)} (waiting)`
              : `Session: ${formatSessionDuration(liveTimerMs)}`}
          </div>
        </div>
        <div
          style={{
            width: "100%",
            flexBasis: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            fontSize: 13,
            marginTop: 4,
          }}
        >
          <label
            style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={!independentView}
              onChange={(e) => setIndependentView(!e.target.checked)}
            />
            Keep pan &amp; zoom synced to tutor
          </label>
          <button
            type="button"
            onClick={() => snapToTutorView()}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--border-default)",
              background: "var(--surface-tile)",
              cursor: "pointer",
            }}
          >
            Match tutorΓÇÖs view now
          </button>
        </div>
      </div>

      {/* Phase 4c: live A/V (inert until the user clicks Allow) */}
      <AVPermissionsPrompt
        hasMicPermission={liveAv.hasMicPermission}
        hasCamPermission={liveAv.hasCamPermission}
        hasMicStream={liveAv.localAudioStream !== null}
        hasCamStream={liveAv.localVideoStream !== null}
        error={liveAv.error}
        videoError={liveAv.videoError}
        requestMic={liveAv.requestMic}
        requestCam={liveAv.requestCam}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <AVTilesPanel
          participants={liveAv.participants}
          localTile={{
            peerId: localPeerId,
            role: "student",
            label: localTileLabel,
            audioStream: liveAv.localAudioStream,
            videoStream: liveAv.localVideoStream,
            isMicMuted: liveAv.isMicMuted,
            isCamMuted: liveAv.isCamMuted,
          }}
          onReconnect={liveAv.reconnectPeer}
        />
        <AVControls
          isMicMuted={liveAv.isMicMuted}
          isCamMuted={liveAv.isCamMuted}
          toggleMic={liveAv.toggleMic}
          toggleCam={liveAv.toggleCam}
          disabled={!liveAv.isActive}
        />
        {liveAv.isActive && (
          <VideoControls
            devices={liveAv.videoDevices}
            selectedPickerSlot={liveAv.pickedVideoCameraSlot}
            onPickCameraSlot={(i) => void liveAv.setVideoCameraBySlot(i)}
            isLive={liveAv.localVideoStream !== null}
            disabled={!liveAv.isActive}
          />
        )}
      </div>

      <div
        className="card"
        data-testid="student-board-pages-strip"
        style={{
          marginTop: 4,
          padding: "10px 14px",
          background: "var(--success-soft)",
          border: "1px solid var(--success-border)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          Board pages
        </div>
        <p
          className="muted"
          style={{ margin: "6px 0 8px", fontSize: 12, lineHeight: 1.45, maxWidth: 720 }}
        >
          These tabs mirror your tutorΓÇÖs board. The highlighted page is the one
          youΓÇÖre working on; your lines stay on that page and wonΓÇÖt overwrite the
          tutorΓÇÖs other tabs.
        </p>
        <div data-testid="student-board-pages-strip">
          <PageStrip
            variant="student"
            sessionId={whiteboardSessionId}
            pageList={pageList}
            sections={sectionsRegistry}
            activePageId={studentActivePageId}
            onSelectPage={(id) => void selectStudentPage(id)}
          />
        </div>
      </div>

      {boardWaitElapsed && !dismissedBoardWaitNotice && (
        <div
          role="status"
          className="card"
          data-testid="student-board-sync-wait-banner"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "var(--info-soft)",
            border: "1px solid var(--info-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <p style={{ margin: 0, fontSize: 13, maxWidth: 720 }}>
            The board is still empty after several seconds. That usually means
            the live link didn&apos;t resync (for example, after a refresh). Try
            reload ΓÇö or ask your tutor to draw or switch a page, which
            re-sends the full board.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn"
              onClick={() => window.location.reload()}
            >
              Reload this page
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setDismissedBoardWaitNotice(true)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {materialNotice !== "none" && !dismissedMaterialNotice && (
        <div
          role="status"
          className="card"
          data-testid="student-material-safeguards-banner"
          style={{
            marginTop: 10,
            padding: "10px 14px",
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13 }}>
            {materialNotice === "load" ? (
              <>
                We couldn&apos;t load a worksheet or image. Check your network,
                try refreshing the page, or ask your tutor to re-insert the file
                from the PDF/image buttons.
              </>
            ) : (
              <>
                A drawing on the board can&apos;t be shared with a file link
                (for example, a pasted image). Ask your tutor to add the
                material using the insert buttons so you both see the same
                thing.
              </>
            )}
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => setDismissedMaterialNotice(true)}
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}

      <div
        className="row"
        style={{ marginTop: 8, flexWrap: "wrap", gap: 8, alignItems: "center" }}
      >
        <UndoRedoButtons disabled={!connected} />
      </div>

      <div
        className="card"
        data-testid="student-whiteboard-canvas-mount"
        style={{
          marginTop: 12,
          padding: 0,
          minHeight: 420,
          height: "max(420px, calc(100vh - 260px))",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 360,
            width: "100%",
            position: "relative",
          }}
        >
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
              registerWbE2eSceneBridge("student", like);
            }}
            theme={excalidrawTheme}
            UIOptions={{
              canvasActions: { saveToActiveFile: false, loadScene: false },
            }}
            validateEmbeddable={validateExcalidrawEmbeddable}
          />
          <WhiteboardDebugHud
            role="student"
            syncOn={!independentView}
            activePageId={studentActivePageId}
            excalidrawAPI={excalidrawAPI}
            telemetry={followDebugTelemetry}
          />
        </div>
      </div>
    </div>
  );
}
