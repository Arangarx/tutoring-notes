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
import {
  WbStrokePropsPanel,
  RoughnessIcon,
  SharpnessIcon,
} from "@/components/whiteboard/chrome/WbStrokePropsPanel";
import { WbTopBarCamControl } from "@/components/whiteboard/chrome/WbTopBarCamControl";
import { WbTopBarMicControlLive } from "@/components/whiteboard/chrome/WbTopBarMicControlLive";
import { WbToolBtn } from "@/components/whiteboard/chrome/WbToolBtn";
import {
  WbActionSheet,
  WbActionSheetBackdrop,
} from "@/components/whiteboard/chrome/WbActionSheet";
import { WbChromeErrorBoundary } from "@/components/whiteboard/chrome/WbChromeErrorBoundary";
import {
  shapeIconFor,
  WbIconCamera,
  WbIconCollapse,
  WbIconEraser,
  WbIconMore,
  WbIconPencil,
  WbIconRedo,
  WbIconSelect,
  WbIconStyles,
  WbIconText,
  WbIconUndo,
  WbIconWand,
  WB_SHAPE_TOOLS,
  StrokeWidthIcon,
  type WbShapeToolType,
} from "@/components/whiteboard/chrome/wb-icons";
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
  triggerSendToBack,
  triggerSendBackward,
  triggerBringForward,
  triggerBringToFront,
  triggerDeleteSelected,
} from "@/lib/whiteboard/undo-redo";
import { laserColorForRole } from "@/lib/whiteboard/laser-colors";
import { computeResizeScroll } from "@/lib/whiteboard/scene-paint";
import {
  EXCALIDRAW_STROKE_DARK_HEX,
  EXCALIDRAW_STROKE_HEX,
  inkDisplayHex,
  WB_STROKE_WIDTHS,
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

type StudentOpenMenu =
  | "view"
  | "shapes"
  | "more"
  | "props"
  | "theme"
  | "topbar-more"
  | null;

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
  const { resolvedTheme: excalidrawTheme, mode: themeMode, setMode: setThemeMode } =
    useTheme();
  const { layoutMode, orientation } = useWbLayoutMode();
  const touchLayout = isTouchLayout(layoutMode);

  const [hasLeft, setHasLeft] = useState(false);
  const [joinUnavailableReason, setJoinUnavailableReason] =
    useState<JoinUnavailableReason | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [keyMissing, setKeyMissing] = useState(false);
  const [syncClient, setSyncClient] = useState<WhiteboardSyncClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [selectedShapeTool, setSelectedShapeTool] =
    useState<WbShapeToolType>("line");
  const [openMenu, setOpenMenu] = useState<StudentOpenMenu>(null);
  const viewMenuOpen = openMenu === "view";
  const shapesDropdownOpen = openMenu === "shapes";
  const morePopoverOpen = openMenu === "more";
  const propsCompactOpen = openMenu === "props";
  const topbarMoreOpen = openMenu === "topbar-more";
  const toggleMenu = (
    menu: Exclude<StudentOpenMenu, null>
  ) => setOpenMenu((p) => (p === menu ? null : menu));
  const dismissTouchSheets = useCallback(() => {
    setOpenMenu(null);
  }, []);
  const touchSheetOpen =
    openMenu === "props" ||
    openMenu === "shapes" ||
    openMenu === "more" ||
    openMenu === "topbar-more";
  const wbCanvasRef = useRef<HTMLDivElement>(null);
  const prevWbWidthRef = useRef<number | null>(null);
  const prevWbHeightRef = useRef<number | null>(null);
  const pointerThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerEmitRef = useRef<number>(0);
  const hasAutoRequestedAvRef = useRef(false);

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
    selectStudentPage: _selectStudentPage,
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
    api.setActiveTool?.({ type, locked: type !== "selection" });
    activeToolTypeRef.current = type;
    setActiveToolType(type);
    if (WB_SHAPE_TOOLS.some((s) => s.type === type)) {
      setSelectedShapeTool(type as WbShapeToolType);
    }
    setOpenMenu(null);
  }, []);

  const toggleGrid = useCallback((enabled: boolean) => {
    setGridEnabled(enabled);
    const api = excalidrawAPIRef.current as WbChromeApiExt | null;
    api?.updateScene?.({ appState: { gridModeEnabled: enabled } });
  }, []);

  const handleAcquireMic = useCallback(async () => {
    if (!liveAv.localAudioStream) {
      await liveAv.requestMic();
    }
  }, [liveAv]);

  const handleTopBarCam = useCallback(async () => {
    if (!liveAv.localVideoStream) {
      await liveAv.requestCam();
      return;
    }
    liveAv.toggleCam();
  }, [liveAv]);

  const handlePointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      if (!syncClient || !capabilities.canBroadcastLaser) return;
      if (activeToolTypeRef.current !== "laser") return;
      if (payload.pointer.tool !== "laser") return;

      const now = Date.now();
      const elapsed = now - lastPointerEmitRef.current;
      const MIN_INTERVAL_MS = 16;

      const emit = () => {
        lastPointerEmitRef.current = Date.now();
        syncClient.broadcastPointer({
          pageId: studentActivePageIdRef.current,
          x: payload.pointer.x,
          y: payload.pointer.y,
          tool: "laser",
          button: payload.button,
          color: laserColorForRole("student"),
        });
      };

      if (elapsed >= MIN_INTERVAL_MS) {
        if (pointerThrottleRef.current !== null) {
          clearTimeout(pointerThrottleRef.current);
          pointerThrottleRef.current = null;
        }
        emit();
      } else if (pointerThrottleRef.current === null) {
        pointerThrottleRef.current = setTimeout(() => {
          pointerThrottleRef.current = null;
          emit();
        }, MIN_INTERVAL_MS - elapsed);
      }
    },
    [syncClient, capabilities.canBroadcastLaser, studentActivePageIdRef]
  );

  useEffect(() => {
    if (hasAutoRequestedAvRef.current) return;
    hasAutoRequestedAvRef.current = true;
    void liveAv.requestCam();
    void liveAv.requestMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (liveAv.hasCamPermission !== "granted") return;
    if (liveAv.localVideoStream) return;
    if (!capabilities.defaultShowLocalVideo) return;
    void liveAv.requestCam();
  }, [
    capabilities.defaultShowLocalVideo,
    liveAv.hasCamPermission,
    liveAv.localVideoStream,
    liveAv,
  ]);

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
    await handleTopBarCam();
  }, [handleTopBarCam]);

  useEffect(() => {
    const container = wbCanvasRef.current;
    if (!container) return;

    prevWbWidthRef.current = null;
    prevWbHeightRef.current = null;

    const handleResize = () => {
      const rect = container.getBoundingClientRect();
      if (!(rect.width > 0 && rect.height > 0)) return;

      const prevW = prevWbWidthRef.current;
      const prevH = prevWbHeightRef.current;

      if (
        prevW !== null &&
        prevH !== null &&
        prevW > 0 &&
        prevH > 0 &&
        (rect.width !== prevW || rect.height !== prevH)
      ) {
        const api = excalidrawAPIRef.current as WbChromeApiExt | null;
        try {
          if (api) {
            const st = api.getAppState() as {
              scrollX?: number;
              scrollY?: number;
              zoom?: { value?: number };
            };
            const z = typeof st.zoom?.value === "number" ? st.zoom.value : 1;
            const scrollX = typeof st.scrollX === "number" ? st.scrollX : 0;
            const scrollY = typeof st.scrollY === "number" ? st.scrollY : 0;
            const newScroll = computeResizeScroll({
              scrollX,
              scrollY,
              zoom: z,
              oldWidth: prevW,
              oldHeight: prevH,
              newWidth: rect.width,
              newHeight: rect.height,
            });
            api.updateScene?.({
              appState: {
                scrollX: newScroll.scrollX,
                scrollY: newScroll.scrollY,
                zoom: { value: z },
              },
            });
          }
        } catch {
          //
        }
      }

      prevWbWidthRef.current = rect.width;
      prevWbHeightRef.current = rect.height;
    };

    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const showPropsChrome =
    activeToolType !== "selection" &&
    activeToolType !== "hand" &&
    activeToolType !== "laser";

  const roughnessLabel =
    roughness === 0 ? "Architect" : roughness === 1 ? "Artist" : "Cartoon";
  const roundnessLabel = roundness === "sharp" ? "Sharp" : "Round";

  const renderSidebarPropsCompact = () => (
    <div
      className={`mynk-wb-props-sidebar mynk-wb-props-compact${propsCompactOpen ? " mynk-wb-props-compact--open" : ""}`}
      data-testid="wb-props-popover"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="mynk-wb-props-compact__summary"
        aria-label="Stroke properties — click to expand"
        aria-expanded={propsCompactOpen}
        data-testid="wb-props-compact-trigger"
        onClick={(e) => {
          e.stopPropagation();
          toggleMenu("props");
        }}
      >
        <span
          className="mynk-wb-summary-swatch"
          style={{
            backgroundColor: inkDisplayHex(strokeColor, excalidrawTheme),
          }}
        />
        <span className="mynk-wb-summary-stroke" aria-hidden>
          <StrokeWidthIcon
            lineH={
              WB_STROKE_WIDTHS.find((w) => w.value === strokeWidth)?.lineH ?? 2
            }
          />
        </span>
        <span
          className="mynk-wb-summary-chip"
          title={roughnessLabel}
          aria-label={roughnessLabel}
          style={{ padding: "2px 4px", background: "transparent" }}
        >
          <RoughnessIcon level={roughness as 0 | 1 | 2} />
        </span>
        <span
          className="mynk-wb-summary-chip"
          title={roundnessLabel}
          aria-label={roundnessLabel}
          style={{ padding: "2px 4px", background: "transparent" }}
        >
          <SharpnessIcon type={roundness} />
        </span>
      </button>
      {propsCompactOpen && (
        <div className="mynk-wb-props-compact__panel">
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
  );

  const renderOverflowMenuItems = (closeAfterAction: boolean) => (
    <>
      {touchLayout && (
        <>
          <button
            type="button"
            className="mynk-wb-menu-item"
            onClick={() => {
              selectTool("text");
              if (closeAfterAction) setOpenMenu(null);
            }}
          >
            <span>Text</span>
            <span className="mynk-wb-menu-item__kbd">T</span>
          </button>
          <div className="mynk-wb-popover-sep" />
        </>
      )}
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerSendToBack();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>Send to back</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerSendBackward();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>↓ Send backward</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerBringForward();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>↑ Bring forward</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          triggerBringToFront();
          if (closeAfterAction) setOpenMenu(null);
        }}
      >
        <span>Bring to front</span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <button
        type="button"
        className="mynk-wb-menu-item mynk-wb-menu-item--destructive"
        onClick={() => {
          triggerDeleteSelected();
          setOpenMenu(null);
        }}
        aria-label="Delete selected elements"
      >
        <span>Delete selected</span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <button
        type="button"
        className="mynk-wb-menu-item"
        onClick={() => {
          selectTool("hand");
          setOpenMenu(null);
        }}
      >
        <span>Hand / pan</span>
        <span className="mynk-wb-menu-item__kbd">H</span>
      </button>
    </>
  );

  const renderTopBarOverflowItems = () => (
    <div className="mynk-wb-action-sheet__menu-list">
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={!connected}
        onClick={() => {
          triggerUndo();
        }}
        data-testid="wb-overflow-undo"
      >
        <WbIconUndo />
        <span>Undo</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={!connected}
        onClick={() => {
          triggerRedo();
        }}
        data-testid="wb-overflow-redo"
      >
        <WbIconRedo />
        <span>Redo</span>
      </button>
      <button
        type="button"
        className="mynk-wb-menu-item"
        disabled={
          !connected ||
          liveAv.hasCamPermission === "denied" ||
          (liveAv.videoDevices?.length ?? 1) === 0
        }
        onClick={() => {
          void handleTopBarCam();
        }}
        data-testid="wb-overflow-cam"
      >
        <WbIconCamera size={14} />
        <span>
          {liveAv.isCamMuted ? "Turn camera on" : "Turn camera off"}
        </span>
      </button>
      <div className="mynk-wb-popover-sep" />
      <label className="mynk-wb-view-item mynk-wb-menu-item">
        <input
          type="checkbox"
          checked={gridEnabled}
          onChange={(e) => toggleGrid(e.target.checked)}
        />
        Show canvas grid
      </label>
      <div className="mynk-wb-popover-sep" />
      <div className="mynk-wb-topbar-overflow-theme" role="group" aria-label="Theme">
        {(
          [
            { mode: "light" as const, label: "Light theme" },
            { mode: "dark" as const, label: "Dark theme" },
            { mode: "system" as const, label: "System theme" },
          ] as const
        ).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            className={`mynk-wb-menu-item${themeMode === mode ? " mynk-wb-menu-item--active" : ""}`}
            aria-pressed={themeMode === mode}
            onClick={() => setThemeMode(mode)}
          >
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderMoreOverflowMenu = (iconSize = 16) => (
    <div className="mynk-wb-more-menu">
      <WbToolBtn
        icon={<WbIconMore size={iconSize} />}
        label="More — z-order, delete, hand"
        active={morePopoverOpen}
        onClick={() => toggleMenu("more")}
      />
      {!touchLayout && morePopoverOpen && (
        <div
          className="mynk-wb-more-popover"
          role="dialog"
          aria-label="More drawing options"
          data-testid="wb-more-popover"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {renderOverflowMenuItems(false)}
        </div>
      )}
    </div>
  );

  const renderShapesSheetItems = () => (
    <div className="mynk-wb-action-sheet__shapes-list" role="menu">
      {WB_SHAPE_TOOLS.map(({ type, label, Icon }) => (
        <button
          key={type}
          type="button"
          role="menuitem"
          className={`mynk-wb-shapes-item${
            (activeToolType === type || selectedShapeTool === type) &&
            WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
              ? " mynk-wb-shapes-item--active"
              : selectedShapeTool === type
                ? " mynk-wb-shapes-item--active"
                : ""
          }`}
          onClick={() => selectTool(type)}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  );

  const renderShapesMenu = (iconSize: number) => (
    <div className="mynk-wb-shapes-menu">
      <WbToolBtn
        icon={shapeIconFor(
          WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
            ? activeToolType
            : selectedShapeTool,
          iconSize
        )}
        label="Shapes"
        active={WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)}
        onClick={() => {
          const shapeActive = WB_SHAPE_TOOLS.some((s) => s.type === activeToolType);
          if (touchLayout && shapeActive) {
            toggleMenu("shapes");
            return;
          }
          selectTool(selectedShapeTool);
        }}
        pulldown={!touchLayout}
        onPulldown={touchLayout ? undefined : () => toggleMenu("shapes")}
      />
      {!touchLayout && shapesDropdownOpen && (
        <div className="mynk-wb-shapes-dropdown" role="menu">
          {WB_SHAPE_TOOLS.map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className={`mynk-wb-shapes-item${
                (activeToolType === type || selectedShapeTool === type) &&
                WB_SHAPE_TOOLS.some((s) => s.type === activeToolType)
                  ? " mynk-wb-shapes-item--active"
                  : selectedShapeTool === type
                    ? " mynk-wb-shapes-item--active"
                    : ""
              }`}
              onClick={() => selectTool(type)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const renderToolStripButtons = (large = false) => {
    const iconSize = large ? 18 : 16;
    const coreTools = (
      <>
        <WbToolBtn
          icon={<WbIconSelect size={iconSize} />}
          label="Select (V)"
          active={activeToolType === "selection"}
          onClick={() => selectTool("selection")}
          disabled={!connected}
        />
        <WbToolBtn
          icon={<WbIconPencil size={iconSize} />}
          label="Pencil (P)"
          active={activeToolType === "freedraw"}
          onClick={() => selectTool("freedraw")}
          disabled={!connected}
        />
        <WbToolBtn
          icon={<WbIconEraser size={iconSize} />}
          label="Eraser (E)"
          active={activeToolType === "eraser"}
          onClick={() => selectTool("eraser")}
          disabled={!connected}
        />
      </>
    );
    const textTool = (
      <WbToolBtn
        icon={<WbIconText size={iconSize} />}
        label="Text (T)"
        active={activeToolType === "text"}
        onClick={() => selectTool("text")}
        disabled={!connected}
      />
    );
    const stylesTool = (
      <WbToolBtn
        icon={<WbIconStyles size={iconSize} />}
        label="Styles"
        active={openMenu === "props"}
        onClick={() => toggleMenu("props")}
        disabled={!connected}
      />
    );
    const wandTool = (
      <WbToolBtn
        icon={<WbIconWand size={iconSize} />}
        label="Pointer wand (K)"
        active={activeToolType === "laser"}
        onClick={() => selectTool("laser")}
        accent
        disabled={!connected}
      />
    );

    if (touchLayout) {
      return (
        <>
          {coreTools}
          {renderShapesMenu(iconSize)}
          {stylesTool}
          {wandTool}
          {renderMoreOverflowMenu(iconSize)}
        </>
      );
    }

    return (
      <>
        {coreTools}
        {textTool}
        {wandTool}
        {renderShapesMenu(iconSize)}
        {renderMoreOverflowMenu(iconSize)}
      </>
    );
  };

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

          <button
            type="button"
            className="mynk-wb-toolbar-toggle"
            data-testid="wb-student-toolbar-toggle"
            aria-pressed={toolbarHidden}
            title={toolbarHidden ? "Show tools" : "Hide tools"}
            onClick={(e) => {
              e.stopPropagation();
              setToolbarHidden((hidden) => !hidden);
            }}
          >
            <span className="mynk-wb-toolbar-toggle__label">
              {toolbarHidden ? "Show tools" : "Hide tools"}
            </span>
            <span className="mynk-wb-toolbar-toggle__chev" aria-hidden>
              {toolbarHidden ? "▴" : "▾"}
            </span>
          </button>

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
                  aria-label="Follow tutor view"
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
                Match tutor&apos;s view
              </button>
            </div>
          )}

          <div className="mynk-wb-topbar__zone" onClick={(e) => e.stopPropagation()}>
            <WbTopBarMicControlLive
              isMicMuted={liveAv.isMicMuted}
              hasMicPermission={liveAv.hasMicPermission}
              hasMicStream={liveAv.localAudioStream !== null}
              onToggleMute={liveAv.toggleMic}
              onAcquireMic={handleAcquireMic}
              onMicDeviceChange={(deviceId) => void liveAv.setMicDevice(deviceId)}
              disabled={!connected}
            />
            <WbTopBarCamControl
              isCamMuted={liveAv.isCamMuted}
              hasCamPermission={liveAv.hasCamPermission}
              onToggleCam={() => void handleTopBarCam()}
              videoDevices={liveAv.videoDevices ?? []}
              selectedPickerSlot={liveAv.pickedVideoCameraSlot}
              onPickCameraSlot={(slot) => void liveAv.setVideoCameraBySlot(slot)}
              isLive={!liveAv.isCamMuted && !!liveAv.localVideoStream}
              disabled={!connected}
            />

            <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

            <button
              type="button"
              className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              disabled={!connected}
              data-testid="wb-student-undo"
              onClick={() => triggerUndo()}
            >
              <WbIconUndo />
            </button>
            <button
              type="button"
              className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              disabled={!connected}
              data-testid="wb-student-redo"
              onClick={() => triggerRedo()}
            >
              <WbIconRedo />
            </button>

            <span className="mynk-wb-topbar__sep mynk-wb-topbar__desktop-only" aria-hidden />

            <div className="mynk-wb-view-menu mynk-wb-topbar__desktop-only">
              <button
                type="button"
                className="mynk-wb-tb-btn mynk-wb-tb-btn--icon"
                title="View options"
                aria-label="View options"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMenu("view");
                }}
              >
                <WbIconMore size={14} />
              </button>
              {viewMenuOpen && (
                <div
                  className="mynk-wb-view-dropdown"
                  role="menu"
                  aria-label="View options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="mynk-wb-view-item">
                    <input
                      type="checkbox"
                      checked={gridEnabled}
                      onChange={(e) => toggleGrid(e.target.checked)}
                    />
                    Show canvas grid
                  </label>
                </div>
              )}
            </div>

            <div className="mynk-wb-topbar__desktop-only">
              <WbThemeToggle
                open={openMenu === "theme"}
                onOpenChange={(open) => setOpenMenu(open ? "theme" : null)}
              />
            </div>
          </div>

          <div className="mynk-wb-topbar__zone mynk-wb-topbar__zone--trailing">
            {touchLayout && (
              <button
                type="button"
                className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__overflow-btn"
                title="More session options"
                aria-label="More session options"
                aria-expanded={topbarMoreOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMenu("topbar-more");
                }}
                data-testid="wb-student-topbar-overflow"
              >
                <WbIconMore size={14} />
              </button>
            )}
            {capabilities.showLeaveInsteadOfEnd && (
              <button
                type="button"
                className="mynk-wb-tb-btn mynk-wb-tb-btn--leave"
                data-testid="wb-student-exit"
                onClick={() => setHasLeft(true)}
              >
                Exit
              </button>
            )}
          </div>
        </header>
      }
      toolStrip={
        <nav
          className={`mynk-wb-strip bg-card border-r border-border${stripCollapsed ? " mynk-wb-strip--collapsed" : ""}`}
          aria-label={stripCollapsed ? "Drawing tools (collapsed)" : "Drawing tools"}
          data-testid={
            stripCollapsed ? "wb-student-tool-strip-collapsed" : "wb-student-tool-strip"
          }
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mynk-wb-strip__tools">
            {renderToolStripButtons()}
            {showPropsChrome && !touchLayout && renderSidebarPropsCompact()}
          </div>
          <div className="mynk-wb-strip__spacer" />
          <div className="mynk-wb-strip__sep" aria-hidden />
          <WbToolBtn
            icon={
              <span
                className="mynk-wb-strip__collapse-icon"
                style={{
                  display: "inline-flex",
                  transform: stripCollapsed ? "rotate(180deg)" : undefined,
                }}
              >
                <WbIconCollapse size={14} />
              </span>
            }
            label={stripCollapsed ? "Expand tools" : "Collapse tools"}
            active={false}
            collapseControl
            onClick={() => setStripCollapsed((c) => !c)}
          />
        </nav>
      }
      canvas={
        <div
          ref={wbCanvasRef}
          className="mynk-wb-canvas"
          data-testid="student-whiteboard-canvas-mount"
          onClick={() => setOpenMenu(null)}
        >
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
            onPointerUpdate={handlePointerUpdate}
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
        touchLayout && showPropsChrome ? (
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
                  aria-label="Follow tutor view"
                  data-testid="wb-student-follow-toggle-mobile"
                  onChange={(e) => setIndependentView(!e.target.checked)}
                />
                Follow tutor
              </label>
            )}
            <button
              type="button"
              className="mynk-wb-props-mobile-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleMenu("props");
              }}
              aria-label="Stroke properties — tap to expand"
            >
              <span
                className="mynk-wb-summary-swatch"
                style={{
                  backgroundColor: inkDisplayHex(strokeColor, excalidrawTheme),
                }}
              />
              <span className="mynk-wb-summary-stroke" aria-hidden>
                <StrokeWidthIcon
                  lineH={
                    WB_STROKE_WIDTHS.find((w) => w.value === strokeWidth)?.lineH ?? 2
                  }
                />
              </span>
            </button>
          </div>
        ) : undefined
      }
      bottomToolbar={
        touchLayout ? (
          <nav
            className="mynk-wb-bottom-toolbar"
            aria-label="Drawing tools"
            data-testid="wb-student-bottom-toolbar"
            onClick={(e) => e.stopPropagation()}
          >
            {renderToolStripButtons(true)}
          </nav>
        ) : undefined
      }
      boardTabStrip={
        <footer className="mynk-wb-pagestrip bg-card border-t border-border">
          <BoardTabStrip
            pageList={pageList}
            activePageId={studentActivePageId}
            readOnly
            testId="wb-student-page-strip"
          />
        </footer>
      }
      actionSheets={
        touchLayout ? (
          <WbChromeErrorBoundary>
            <>
              <WbActionSheetBackdrop
                open={touchSheetOpen}
                onDismiss={dismissTouchSheets}
              />
              <WbActionSheet
                open={openMenu === "props"}
                onDismiss={dismissTouchSheets}
                ariaLabel="Stroke properties"
                testId="wb-student-props-sheet"
              >
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
              </WbActionSheet>
              <WbActionSheet
                open={openMenu === "shapes"}
                onDismiss={dismissTouchSheets}
                ariaLabel="Shape tools"
                testId="wb-student-shapes-sheet"
              >
                {renderShapesSheetItems()}
              </WbActionSheet>
              <WbActionSheet
                open={openMenu === "more"}
                onDismiss={dismissTouchSheets}
                ariaLabel="More drawing options"
                testId="wb-student-more-sheet"
              >
                <div className="mynk-wb-action-sheet__menu-list">
                  {renderOverflowMenuItems(true)}
                </div>
              </WbActionSheet>
              <WbActionSheet
                open={openMenu === "topbar-more"}
                onDismiss={dismissTouchSheets}
                ariaLabel="More session options"
                testId="wb-student-topbar-more-sheet"
              >
                {renderTopBarOverflowItems()}
              </WbActionSheet>
            </>
          </WbChromeErrorBoundary>
        ) : null
      }
    />
  );
}
