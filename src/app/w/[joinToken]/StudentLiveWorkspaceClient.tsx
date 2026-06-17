"use client";

/**
 * P2 — Student live workspace on unified Mynk chrome (flag-gated via page.tsx).
 * Copy-adapted from StudentWhiteboardClient; legacy path remains fallback.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useWindowScrollToTopOnMount } from "@/hooks/useWindowScrollToTopOnMount";
import {
  useExcalidrawLoadingGuard,
  excalidrawBoardBgHex,
} from "@/hooks/useExcalidrawLoadingGuard";
import { useLiveAV } from "@/hooks/useLiveAV";
import { useStudentWhiteboardCanvas } from "@/hooks/useStudentWhiteboardCanvas";
import { useCollaboratorPointers } from "@/hooks/useCollaboratorPointers";
import {
  useWbLayoutMode,
  isTouchLayout,
} from "@/components/whiteboard/chrome/useWbLayoutMode";
import { LiveBoardChrome } from "@/components/whiteboard/chrome/LiveBoardChrome";
import {
  WbRoleProvider,
  useWbCapabilities,
} from "@/components/whiteboard/chrome/wb-role";
import { WbAVCluster } from "@/components/whiteboard/chrome/WbAVCluster";
import { WbThemeToggle } from "@/components/whiteboard/chrome/WbThemeToggle";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";
import { WbStrokePropsPanel } from "@/components/whiteboard/chrome/WbStrokePropsPanel";
import {
  WbIconEraser,
  WbIconPencil,
  WbIconRedo,
  WbIconUndo,
} from "@/components/whiteboard/chrome/wb-icons";
import { AVPermissionsPrompt } from "@/components/av/AVPermissionsPrompt";
import { ExcalidrawDynamic } from "@/components/whiteboard/ExcalidrawDynamic";
import {
  GraphEmbeddable,
  warmJsxGraphModule,
} from "@/components/whiteboard/GraphEmbeddable";
import { WhiteboardDebugHud } from "@/components/whiteboard/WhiteboardDebugHud";
import { validateExcalidrawEmbeddable } from "@/lib/whiteboard/validate-embeddable";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import { getOrCreateLocalPeerId } from "@/lib/whiteboard/local-peer-id";
import {
  createWhiteboardSyncClient,
  type WhiteboardSyncClient,
} from "@/lib/whiteboard/sync-client";
import {
  ACTIVE_PING_STALE_MS,
  computeDisplayActiveMs,
} from "@/lib/whiteboard/active-time";
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
import {
  joinUnavailableCopy,
  type JoinUnavailableReason,
} from "@/lib/whiteboard/join-unavailable-copy";
import { triggerRedo, triggerUndo } from "@/lib/whiteboard/undo-redo";
import {
  EXCALIDRAW_STROKE_DARK_HEX,
  EXCALIDRAW_STROKE_HEX,
} from "@/styles/token-values";
import "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/whiteboard-chrome.css";

export type StudentLiveWorkspaceClientProps = {
  whiteboardSessionId: string;
  studentId: string;
  joinToken: string;
  syncUrl: string;
  tutorName: string;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
};

function formatTimerMinutesOnly(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / 60000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
  return `${totalMin}m`;
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

function wjgPrefix(joinToken: string): string {
  return joinToken.slice(0, 8);
}

function WbStudentToolBtn({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`mynk-wb-tool-btn${active ? " mynk-wb-tool-btn--active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

export function StudentLiveWorkspaceClient(props: StudentLiveWorkspaceClientProps) {
  return (
    <WbRoleProvider role="student">
      <StudentLiveWorkspaceInner {...props} />
    </WbRoleProvider>
  );
}

function StudentLiveWorkspaceInner({
  whiteboardSessionId,
  studentId,
  joinToken: joinTokenFromServer,
  syncUrl,
  tutorName,
  initialActiveMs,
  initialLastActiveAtIso,
}: StudentLiveWorkspaceClientProps) {
  const params = useParams<{ joinToken: string }>();
  const joinToken =
    typeof params?.joinToken === "string" ? params.joinToken : joinTokenFromServer;
  const pathJoinToken = joinToken || joinTokenFromServer;
  const wjgId = wjgPrefix(pathJoinToken);

  const capabilities = useWbCapabilities();
  const { resolvedTheme: excalidrawTheme } = useTheme();
  const { layoutMode, orientation } = useWbLayoutMode();
  const touchLayout = isTouchLayout(layoutMode);

  const [hasLeft, setHasLeft] = useState(false);
  const [joinUnavailableReason, setJoinUnavailableReason] =
    useState<JoinUnavailableReason | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [syncClient, setSyncClient] = useState<WhiteboardSyncClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [toolbarHidden] = useState(false);
  const [openMenu, setOpenMenu] = useState<"props" | "theme" | null>(null);

  const localPeerId = useMemo(
    () => getOrCreateLocalPeerId(whiteboardSessionId, "student"),
    [whiteboardSessionId]
  );
  const localTileLabel = "You";
  const syncPresenceLabel = useMemo(() => {
    const compact = localPeerId.replace(/-/g, "");
    const short = compact.slice(0, 6) || "join";
    return `Student · ${short}`;
  }, [localPeerId]);

  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawApiLike | null>(null);
  const excalidrawAPIRef = useRef<ExcalidrawApiLike | null>(null);
  const followDebugTelemetry = useMemo(() => createWbFollowDebugTelemetry(), []);
  const [otherPeerCount, setOtherPeerCount] = useState(0);
  const [serverActiveMs, setServerActiveMs] = useState(Math.max(0, initialActiveMs));
  const [serverLastActiveAtMs, setServerLastActiveAtMs] = useState<number | null>(
    initialLastActiveAtIso ? new Date(initialLastActiveAtIso).getTime() : null
  );
  const [now, setNow] = useState(() => Date.now());

  const [activeToolType, setActiveToolType] = useState("freedraw");
  const activeToolTypeRef = useRef("freedraw");
  const [strokeColor, setStrokeColor] = useState(EXCALIDRAW_STROKE_HEX);
  const [strokeWidth, setStrokeWidth] = useState(0.5);
  const [opacity, setOpacity] = useState(100);
  const [roughness, setRoughness] = useState(0);
  const [roundness, setRoundness] = useState<"sharp" | "round">("sharp");
  const [moreStylesOpen, setMoreStylesOpen] = useState(false);

  const wjgLog = useCallback(
    (action: string, extra?: Record<string, string | number>) => {
      const tail = extra
        ? ` ${Object.entries(extra)
            .map(([k, v]) => `${k}=${v}`)
            .join(" ")}`
        : "";
      console.info(
        `[wjg] wjg=${wjgId} wbsid=${whiteboardSessionId} action=${action}${tail}`
      );
    },
    [wjgId, whiteboardSessionId]
  );

  const {
    initialData,
    stuckLoading,
    showLoadingGuardBanner,
    dismissStuckLoading,
    reloadFromGuard,
    markLoadingCleared,
  } = useExcalidrawLoadingGuard({ excalidrawAPI, wjgLog });

  useWindowScrollToTopOnMount();

  useEffect(() => {
    wjgLog("mount", { role: "student" });
  }, [wjgLog]);

  useEffect(() => {
    const k = readKeyFromHash();
    if (!k) {
      setKeyMissing(true);
      wjgLog("key_missing");
      return;
    }
    setEncryptionKey(k);
    wjgLog("key_ok");
  }, [wjgLog]);

  useEffect(() => {
    if (!encryptionKey) return;
    if (joinUnavailableReason !== null) return;
    const client = createWhiteboardSyncClient({
      url: syncUrl,
      roomId: whiteboardSessionId,
      encryptionKeyBase64Url: encryptionKey,
      role: "student",
      peerId: localPeerId,
      localPeerLabel: syncPresenceLabel,
    });
    setSyncClient(client);
    setConnected(client.isConnected());
    wjgLog("sync_connect");
    const offConnect = client.onConnect(() => {
      setConnected(true);
      wjgLog("sync_connect");
    });
    const offDisconnect = client.onDisconnect(() => {
      setConnected(false);
      wjgLog("sync_disconnect");
    });
    const offPeers = client.onPeerCountChange((n) => setOtherPeerCount(n));
    const offRemote = client.onRemoteScene(() => undefined);
    return () => {
      offConnect();
      offDisconnect();
      offPeers();
      offRemote();
      client.disconnect();
      setSyncClient(null);
      setConnected(false);
      wjgLog("sync_disconnect");
    };
  }, [
    encryptionKey,
    syncUrl,
    whiteboardSessionId,
    joinUnavailableReason,
    localPeerId,
    syncPresenceLabel,
    wjgLog,
  ]);

  const liveAv = useLiveAV({
    syncClient,
    localPeerId,
    sessionId: whiteboardSessionId,
  });

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
      for (const p of liveAv.participants) {
        try {
          liveAv.reconnectPeer(p.peerId);
        } catch {
          //
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
  }, [syncClient, liveAv]);

  const callConnected = liveAv.reachableParticipants.length >= 1;
  const bothPresentForTimer = connected && callConnected;

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
          wjgLog("session_ended", { reason: mapped });
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
        //
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), 3_500);
    return () => clearInterval(t);
  }, [pathJoinToken, whiteboardSessionId, joinUnavailableReason, wjgLog]);

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

  const [materialNotice, setMaterialNotice] = useState<"none" | "load" | "missing">("none");
  const [dismissedMaterialNotice, setDismissedMaterialNotice] = useState(false);
  const [dismissedBoardWaitNotice, setDismissedBoardWaitNotice] = useState(false);
  const [boardWaitElapsed, setBoardWaitElapsed] = useState(false);
  const [independentView, setIndependentView] = useState(false);

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

  const {
    onCanvasChange: studentSyncOnCanvas,
    syncActivePageElements,
    snapToTutorView,
    getPageBroadcastExtras,
    pageList,
    activePageId: studentActivePageId,
    activePageIdRef: studentActivePageIdRef,
    applyingRemoteRef: studentApplyingRemoteRef,
    selectStudentPage,
    tutorStreamReady,
  } = useStudentWhiteboardCanvas(syncClient, excalidrawAPI, onRemoteHydrateResult, {
    joinToken: pathJoinToken,
    whiteboardSessionId,
    followTutorView: !independentView,
    followDebugTelemetry,
  });

  useCollaboratorPointers(
    syncClient,
    excalidrawAPI,
    studentApplyingRemoteRef,
    studentActivePageIdRef
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
      studentSyncOnCanvas(api.getSceneElements());
    });
  }, [studentSyncOnCanvas]);

  useEffect(() => {
    if (!connected) return;
    warmJsxGraphModule();
  }, [connected]);

  type WbChromeApiExt = ExcalidrawApiLike & {
    setActiveTool?: (tool: { type: string; locked?: boolean }) => void;
    updateScene?: (data: {
      elements?: ReadonlyArray<unknown>;
      appState?: Record<string, unknown>;
    }) => void;
  };

  const selectTool = useCallback((type: string) => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    api.setActiveTool?.({ type, locked: true });
    activeToolTypeRef.current = type;
    setActiveToolType(type);
    setOpenMenu(null);
  }, []);

  const updateStrokeStyle = useCallback(
    (updates: {
      color?: string;
      width?: number;
      opacity?: number;
      roughness?: number;
    }) => {
      const api = excalidrawAPIRef.current as WbChromeApiExt | null;
      if (!api) return;
      const appState: Record<string, unknown> = {};
      if (updates.color !== undefined) {
        appState.currentItemStrokeColor = updates.color;
        setStrokeColor(updates.color);
      }
      if (updates.width !== undefined) {
        appState.currentItemStrokeWidth = updates.width;
        setStrokeWidth(updates.width);
      }
      if (updates.opacity !== undefined) {
        appState.currentItemOpacity = updates.opacity;
        setOpacity(updates.opacity);
      }
      if (updates.roughness !== undefined) {
        appState.currentItemRoughness = updates.roughness;
        setRoughness(updates.roughness);
      }
      api.updateScene?.({ appState });
    },
    []
  );

  const updateRoundness = useCallback((value: "sharp" | "round") => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    api.updateScene?.({ appState: { currentItemRoundness: value } });
    setRoundness(value);
  }, []);

  const handleExcalidrawChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      _appState?: unknown,
      files?: Readonly<Record<string, unknown>>
    ) => {
      studentSyncOnCanvas(elements, _appState, files);
      markLoadingCleared("remote_scene");
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
            files: files as Record<string, BinaryFileFromExcalidraw> | undefined,
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
              syncActivePageElements(patched as ReadonlyArray<ExcalidrawLikeElement>);
              live.updateScene({ elements: patched });
              syncClient?.broadcastScene(
                patched as ReadonlyArray<ExcalidrawLikeElement>,
                getPageBroadcastExtras()
              );
            }
          }
        } catch {
          //
        }
      })();
    },
    [
      studentSyncOnCanvas,
      syncActivePageElements,
      whiteboardSessionId,
      studentId,
      pathJoinToken,
      syncClient,
      getPageBroadcastExtras,
      markLoadingCleared,
    ]
  );

  const renderGraphEmbeddable = useCallback((element: unknown) => {
    const el = element as { link?: string; customData?: { wbType?: string } };
    if (el.link === GRAPH_EMBED_LINK || el.customData?.wbType === "graph") {
      return (
        <GraphEmbeddable
          element={
            element as {
              id?: string;
              width?: number;
              height?: number;
              customData?: Record<string, unknown>;
            }
          }
          readOnly
        />
      );
    }
    return undefined;
  }, []);

  const handleToggleCam = useCallback(async () => {
    if (!liveAv.localVideoStream) {
      await liveAv.requestCam();
      return;
    }
    liveAv.toggleCam();
  }, [liveAv]);

  useEffect(() => {
    if (
      capabilities.defaultShowLocalVideo &&
      liveAv.hasCamPermission === "granted" &&
      !liveAv.localVideoStream
    ) {
      void liveAv.requestCam();
    }
  }, [capabilities.defaultShowLocalVideo, liveAv]);

  const iconSize = touchLayout ? 18 : 16;
  const showBoardWaitBanner =
    boardWaitElapsed && !dismissedBoardWaitNotice && !stuckLoading;

  useEffect(() => {
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    if (!api) return;
    api.updateScene?.({
      appState: {
        viewBackgroundColor: excalidrawBoardBgHex(excalidrawTheme),
      },
    });
  }, [excalidrawTheme]);

  const renderStudentTools = (compact?: boolean) => (
    <>
      <WbStudentToolBtn
        icon={<WbIconPencil size={iconSize} />}
        label="Draw"
        active={activeToolType === "freedraw"}
        onClick={() => selectTool("freedraw")}
        disabled={!connected}
      />
      <WbStudentToolBtn
        icon={<WbIconEraser size={iconSize} />}
        label="Eraser"
        active={activeToolType === "eraser"}
        onClick={() => selectTool("eraser")}
        disabled={!connected}
      />
      {compact && (
        <>
          <WbStudentToolBtn
            icon={<WbIconUndo size={iconSize} />}
            label="Undo"
            active={false}
            onClick={() => triggerUndo()}
            disabled={!connected}
          />
          <WbStudentToolBtn
            icon={<WbIconRedo size={iconSize} />}
            label="Redo"
            active={false}
            onClick={() => triggerRedo()}
            disabled={!connected}
          />
        </>
      )}
    </>
  );

  if (hasLeft) {
    return (
      <div className="container" style={{ maxWidth: 720, padding: 24 }}>
        <div className="card" role="status">
          <h1 style={{ marginTop: 0 }}>You left the session</h1>
          <p style={{ marginBottom: 0 }}>
            You can close this tab. If you need to rejoin, ask {tutorName} for the
            link again.
          </p>
        </div>
      </div>
    );
  }

  if (keyMissing) {
    return (
      <div className="container" style={{ maxWidth: 720, padding: 24 }}>
        <div className="card">
          <h1 style={{ marginTop: 0 }}>Whiteboard link is incomplete</h1>
          <p>
            This link is missing the encryption key. Please ask {tutorName} for a
            fresh link.
          </p>
        </div>
      </div>
    );
  }

  if (joinUnavailableReason) {
    const { title, body } = joinUnavailableCopy(joinUnavailableReason, tutorName);
    return (
      <div className="container" style={{ maxWidth: 720, padding: 24 }}>
        <div className="card" role="status">
          <h1 style={{ marginTop: 0 }}>{title}</h1>
          <p style={{ marginBottom: 0 }}>{body}</p>
        </div>
      </div>
    );
  }

  return (
    <LiveBoardChrome
      layoutMode={layoutMode}
      orientation={orientation}
      role="student"
      toolbarHidden={toolbarHidden}
      onChromeClick={() => setOpenMenu(null)}
      nonVisualMounts={
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
      }
      topBar={
        <header
          className="mynk-wb-topbar bg-card border-b border-border"
          role="toolbar"
          aria-label="Session controls"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mynk-wb-wordmark" aria-label="Mynk">
            Mynk<span className="mynk-wb-wordmark__dot">·</span>
          </span>
          <span className="mynk-wb-topbar__sep" aria-hidden />
          <div className="mynk-wb-topbar__zone mynk-wb-student-title">
            <span className="mynk-wb-student-tutor-name">{tutorName}</span>
            <span
              className="mynk-wb-student-disclosure"
              data-testid="wb-student-recording-disclosure"
            >
              This session is being recorded by your tutor. What you draw is visible
              live.
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }} />
          <div className="mynk-wb-topbar__zone">
            <span
              className={`mynk-wb-status-pill${connected ? " mynk-wb-status-pill--ok" : " mynk-wb-status-pill--warn"}`}
              data-testid="wb-student-sync-pill"
            >
              {connected ? "Connected" : "Joining…"}
            </span>
            {connected && liveAv.participants.length > 0 && (
              <span
                className={`mynk-wb-status-pill${callConnected ? " mynk-wb-status-pill--ok" : " mynk-wb-status-pill--warn"}`}
                data-testid="wb-student-call-pill"
              >
                {callConnected ? "Call connected" : "Call reconnecting…"}
              </span>
            )}
            <span className="mynk-wb-timer" data-testid="wb-student-timer">
              {showWaitingForOther
                ? `${formatTimerMinutesOnly(liveTimerMs)} (waiting)`
                : formatTimerMinutesOnly(liveTimerMs)}
            </span>
          </div>
          {capabilities.showFollowControls && !touchLayout && (
            <div className="mynk-wb-topbar__zone mynk-wb-student-follow">
              <label className="mynk-wb-follow-toggle">
                <input
                  type="checkbox"
                  checked={!independentView}
                  data-testid="wb-student-follow-toggle"
                  onChange={(e) => setIndependentView(!e.target.checked)}
                />
                Follow tutor view
              </label>
              <button
                type="button"
                className="mynk-wb-tb-btn"
                data-testid="wb-student-match-view"
                onClick={() => snapToTutorView()}
              >
                Match view
              </button>
            </div>
          )}
          <WbThemeToggle
            open={openMenu === "theme"}
            onOpenChange={(open) => setOpenMenu(open ? "theme" : null)}
          />
          {capabilities.showLeaveInsteadOfEnd && (
            <button
              type="button"
              className="mynk-wb-tb-btn mynk-wb-tb-btn--leave"
              data-testid="wb-student-leave"
              onClick={() => setHasLeft(true)}
            >
              Leave
            </button>
          )}
        </header>
      }
      toolStrip={
        !touchLayout ? (
          <nav
            className="mynk-wb-strip bg-card border-r border-border"
            aria-label="Drawing tools"
            data-testid="wb-student-tool-strip"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mynk-wb-strip__tools">{renderStudentTools()}</div>
            <div className="mynk-wb-strip__props">
              <WbStrokePropsPanel
                strokeColor={strokeColor}
                strokeWidth={strokeWidth}
                opacity={opacity}
                roughness={roughness}
                roundness={roundness}
                moreStylesOpen={moreStylesOpen}
                inkHex={
                  excalidrawTheme === "dark"
                    ? EXCALIDRAW_STROKE_DARK_HEX
                    : EXCALIDRAW_STROKE_HEX
                }
                onStrokeChange={updateStrokeStyle}
                onMoreStylesToggle={() => setMoreStylesOpen((p) => !p)}
                onRoughnessChange={(r) => updateStrokeStyle({ roughness: r })}
                onRoundnessChange={updateRoundness}
              />
            </div>
          </nav>
        ) : null
      }
      canvas={
        <div className="mynk-wb-canvas" data-testid="student-whiteboard-canvas-mount">
          {showLoadingGuardBanner && (
            <div
              role="alert"
              className="mynk-wb-canvas-banner"
              data-testid="student-excalidraw-loading-guard"
            >
              <p>Board is taking too long to load.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={reloadFromGuard}>
                  Reload
                </button>
                <button type="button" className="btn" onClick={dismissStuckLoading}>
                  Dismiss
                </button>
              </div>
            </div>
          )}
          {showBoardWaitBanner && (
            <div
              role="status"
              className="mynk-wb-canvas-banner"
              data-testid="student-board-sync-wait-banner"
            >
              <p>The board is still empty after several seconds.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => window.location.reload()}
                >
                  Reload
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
              className="mynk-wb-canvas-banner mynk-wb-canvas-banner--warn"
              data-testid="student-material-safeguards-banner"
            >
              <p>
                {materialNotice === "load"
                  ? "We couldn't load a worksheet or image."
                  : "Ask your tutor to insert materials using the toolbar."}
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setDismissedMaterialNotice(true)}
              >
                Dismiss
              </button>
            </div>
          )}
          <ExcalidrawDynamic
            style={{ width: "100%", height: "100%" }}
            zenModeEnabled
            onChange={handleExcalidrawChange}
            excalidrawAPI={(api: unknown) => {
              const like = api as ExcalidrawApiLike;
              excalidrawAPIRef.current = like;
              setExcalidrawAPI(like);
              registerWbE2eSceneBridge("student", like);
              selectTool("freedraw");
            }}
            theme={excalidrawTheme}
            initialData={initialData}
            UIOptions={{
              canvasActions: { saveToActiveFile: false, loadScene: false },
            }}
            validateEmbeddable={validateExcalidrawEmbeddable}
            renderEmbeddable={renderGraphEmbeddable}
            isCollaborating={Boolean(syncClient)}
          />
          <WhiteboardDebugHud
            role="student"
            syncOn={!independentView}
            activePageId={studentActivePageId}
            excalidrawAPI={excalidrawAPI}
            telemetry={followDebugTelemetry}
          />
          <WbAVCluster
            layoutMode={layoutMode}
            isMicMuted={liveAv.isMicMuted}
            isCamMuted={liveAv.isCamMuted}
            onToggleMic={liveAv.toggleMic}
            onToggleCam={() => void handleToggleCam()}
            disabled={!liveAv.isActive}
            camDisabled={
              liveAv.hasCamPermission === "denied" ||
              (liveAv.videoDevices?.length ?? 1) === 0
            }
            participants={liveAv.participants}
            localTile={
              capabilities.defaultShowLocalVideo || liveAv.localVideoStream
                ? {
                    peerId: localPeerId,
                    role: "student",
                    label: localTileLabel,
                    audioStream: liveAv.localAudioStream,
                    videoStream: liveAv.localVideoStream,
                    isMicMuted: liveAv.isMicMuted,
                    isCamMuted: liveAv.isCamMuted,
                  }
                : undefined
            }
            onReconnect={liveAv.reconnectPeer}
            testId="wb-student-av-cluster"
          />
        </div>
      }
      propsMobileBar={
        touchLayout ? (
          <div
            className="mynk-wb-props-mobile-bar"
            data-testid="wb-student-props-mobile"
            onClick={(e) => e.stopPropagation()}
          >
            {capabilities.showFollowControls && (
              <label className="mynk-wb-follow-toggle">
                <input
                  type="checkbox"
                  checked={!independentView}
                  data-testid="wb-student-follow-toggle-mobile"
                  onChange={(e) => setIndependentView(!e.target.checked)}
                />
                Follow tutor
              </label>
            )}
            <button
              type="button"
              className="mynk-wb-tb-btn"
              onClick={() => setOpenMenu(openMenu === "props" ? null : "props")}
            >
              Stroke
            </button>
            {openMenu === "props" && (
              <div className="mynk-wb-props-mobile-popover">
                <WbStrokePropsPanel
                  strokeColor={strokeColor}
                  strokeWidth={strokeWidth}
                  opacity={opacity}
                  roughness={roughness}
                  roundness={roundness}
                  moreStylesOpen={moreStylesOpen}
                  inkHex={
                    excalidrawTheme === "dark"
                      ? EXCALIDRAW_STROKE_DARK_HEX
                      : EXCALIDRAW_STROKE_HEX
                  }
                  onStrokeChange={updateStrokeStyle}
                  onMoreStylesToggle={() => setMoreStylesOpen((p) => !p)}
                  onRoughnessChange={(r) => updateStrokeStyle({ roughness: r })}
                  onRoundnessChange={updateRoundness}
                />
              </div>
            )}
          </div>
        ) : undefined
      }
      bottomToolbar={
        touchLayout ? (
          <div
            className="mynk-wb-bottom-toolbar"
            data-testid="wb-student-bottom-toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            {renderStudentTools(true)}
          </div>
        ) : (
          <div
            className="mynk-wb-bottom-toolbar mynk-wb-bottom-toolbar--desktop-undo"
            data-testid="wb-student-bottom-toolbar"
          >
            <WbStudentToolBtn
              icon={<WbIconUndo size={16} />}
              label="Undo"
              active={false}
              onClick={() => triggerUndo()}
              disabled={!connected}
            />
            <WbStudentToolBtn
              icon={<WbIconRedo size={16} />}
              label="Redo"
              active={false}
              onClick={() => triggerRedo()}
              disabled={!connected}
            />
          </div>
        )
      }
      boardTabStrip={
        <footer className="mynk-wb-pagestrip bg-card border-t border-border">
          <BoardTabStrip
            pageList={pageList}
            activePageId={studentActivePageId}
            disabled={!connected}
            onSelectPage={(id) => void selectStudentPage(id)}
            testId="wb-student-page-strip"
          />
        </footer>
      }
    />
  );
}
