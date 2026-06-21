"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import {
  hydrateRemoteImageFilesForScene,
  type HydrateRemoteImageFilesResult,
} from "@/lib/whiteboard/hydrate-remote-files";
import { mergeScenesReconciled } from "@/lib/whiteboard/apply-reconciled-remote-scene";
import type {
  WhiteboardSyncClient,
  WhiteboardWireFollow,
  WhiteboardWirePage,
  WhiteboardWireBroadcastExtras,
  WhiteboardWireRemoteDetails,
} from "@/lib/whiteboard/sync-client";
import type { PageViewState } from "@/lib/whiteboard/board-document-snapshot";
import { useSyncTombstonedElementIds } from "@/hooks/useSyncTombstonedElementIds";
import { resolveWhiteboardAssetReadUrl } from "@/lib/whiteboard/resolve-asset-read-url";
import {
  applyViewportAligned,
  hasFollowSceneCenter,
  viewportSceneCenterFromScroll,
  readViewportSizeFromAppState,
} from "@/lib/whiteboard/viewport-align";
import type { WbFollowDebugTelemetry } from "@/lib/whiteboard/wb-follow-debug-telemetry";

function wireRowViewState(
  p: WhiteboardWirePage["pageList"][number]
): PageViewState | undefined {
  const vs = (p as { viewState?: unknown }).viewState;
  if (!vs || typeof vs !== "object") return undefined;
  const o = vs as { panX?: unknown; panY?: unknown; zoom?: unknown };
  if (
    typeof o.panX === "number" &&
    Number.isFinite(o.panX) &&
    typeof o.panY === "number" &&
    Number.isFinite(o.panY) &&
    typeof o.zoom === "number" &&
    Number.isFinite(o.zoom)
  ) {
    return { panX: o.panX, panY: o.panY, zoom: o.zoom };
  }
  return undefined;
}

function nextApplyId(counter: { current: number }): string {
  counter.current += 1;
  return String(counter.current);
}

/**
 * Wires the student Excalidraw to sync with the tutor, including
 * per-board-page routing so student strokes for page 1 are not merged
 * into the tutor's open tab on page 2.
 */
export function useStudentWhiteboardCanvas(
  sync: WhiteboardSyncClient | null,
  excalidrawAPI: ExcalidrawApiLike | null,
  onHydrateResult?: (result: HydrateRemoteImageFilesResult) => void,
  options?: {
    joinToken: string;
    whiteboardSessionId?: string;
    followTutorView?: boolean;
    onTutorPageMeta?: (page: WhiteboardWirePage) => void;
    /** Observability only — HUD reads these refs; does not affect apply path. */
    followDebugTelemetry?: WbFollowDebugTelemetry;
  }
) {
  const joinToken = options?.joinToken ?? "";
  const wbsid = options?.whiteboardSessionId ?? "";
  const wbsidTag = wbsid ? `wbsid=${wbsid} ` : "";
  const followTutorView = options?.followTutorView === true;
  const followTutorViewRef = useRef(followTutorView);
  useEffect(() => {
    followTutorViewRef.current = followTutorView;
    if (!followTutorView) {
      followLockedViewportRef.current = null;
    }
  }, [followTutorView]);
  const onTutorPageMeta = options?.onTutorPageMeta;
  const followDebugTelemetry = options?.followDebugTelemetry;

  const recordRecvFollow = useCallback(
    (f: WhiteboardWireFollow) => {
      if (!followDebugTelemetry) return;
      followDebugTelemetry.lastRecvFollow.current = f;
      followDebugTelemetry.lastRecvAt.current = Date.now();
    },
    [followDebugTelemetry]
  );
  const { onLocalElementSnapshot, shouldDropRemoteElement } =
    useSyncTombstonedElementIds();
  const applyingRemoteRef = useRef(false);
  const pageSwitchProgrammaticRef = useRef(0);
  const wbaCounterRef = useRef(0);
  const lastTutorFollowRef = useRef<WhiteboardWireFollow | null>(null);
  /** While follow is ON, tutor-applied scroll/zoom — user pan/zoom reverts to this. */
  const followLockedViewportRef = useRef<{
    scrollX: number;
    scrollY: number;
    zoom: number;
  } | null>(null);
  const viewportRevertInProgressRef = useRef(false);
  /**
   * Set to `true` in `applyViewportToCanvas` (before the rAF is scheduled)
   * and cleared only after `onApplied` or `onHold` fires.  This keeps
   * `onCanvasChange` suppressed for the full duration of a tutor viewport
   * apply — including the window after `runV3Apply`'s `finally` block
   * prematurely clears `applyingRemoteRef` but before the rAF has written
   * the new appState.  Without this guard, the stale lock at the previous
   * position triggers a spurious revert during the rAF write.
   */
  const tutorViewportApplyRef = useRef(false);
  const loadedRemoteFileIdsRef = useRef(new Set<string>());
  const giveUpFileIdsRef = useRef(new Set<string>());
  const warnDedupeRef = useRef(new Set<string>());

  const [pageList, setPageList] = useState<
    { id: string; title: string; section?: string; viewState?: PageViewState }[]
  >([{ id: "p1", title: "Page 1" }]);
  const pageListRef = useRef(pageList);
  useEffect(() => {
    pageListRef.current = pageList;
  }, [pageList]);

  const commitPageList = useCallback(
    (
      rows: {
        id: string;
        title: string;
        section?: string;
        viewState?: PageViewState;
      }[]
    ) => {
      pageListRef.current = rows;
      setPageList(rows);
    },
    []
  );

  const [sectionsRegistry, setSectionsRegistry] = useState<
    Record<string, { label: string }>
  >({});
  const sectionsRegistryRef = useRef(sectionsRegistry);
  useEffect(() => {
    sectionsRegistryRef.current = sectionsRegistry;
  }, [sectionsRegistry]);

  const [activePageId, setActivePageId] = useState("p1");
  const activePageIdRef = useRef("p1");

  const pageDataRef = useRef<Record<string, ReadonlyArray<ExcalidrawLikeElement>>>(
    Object.create(null)
  );
  const lastTutorV3RevRef = useRef(0);
  const v3ApplyChainRef = useRef(Promise.resolve());
  const [tutorStreamReady, setTutorStreamReady] = useState(false);
  const prevOtherPeersForRevResetRef = useRef(-1);
  const hadDisconnectRef = useRef(false);

  const excalidrawApiRef = useRef<ExcalidrawApiLike | null>(null);
  excalidrawApiRef.current = excalidrawAPI;
  useEffect(() => {
    excalidrawApiRef.current = excalidrawAPI;
  }, [excalidrawAPI]);

  const pendingV3Ref = useRef<{
    rev: number;
    details: WhiteboardWireRemoteDetails;
  } | null>(null);

  const applyViewportToCanvas = useCallback(
    (
      api: ExcalidrawApiLike,
      follow: WhiteboardWireFollow,
      logCtx: { wba: string; pageId: string; source: string }
    ) => {
      applyingRemoteRef.current = true;
      // Mark the full rAF-apply window so onCanvasChange stays suppressed even
      // after runV3Apply's finally block prematurely clears applyingRemoteRef.
      tutorViewportApplyRef.current = true;
      const releaseApplyingRemote = () => {
        applyingRemoteRef.current = false;
        tutorViewportApplyRef.current = false;
      };
      applyViewportAligned(api, follow, {
        wbsid: wbsid || undefined,
        wba: logCtx.wba,
        pageId: logCtx.pageId,
        onDefer: (retry) => {
          console.info(
            `[student-apply] ${wbsidTag}wba=${logCtx.wba} action=viewport-align-defer reason=zero-dimensions retry=${retry} source=${logCtx.source}`
          );
        },
        onApplied: (scrollX, scrollY, zoom) => {
          console.info(
            `[student-apply] ${wbsidTag}pvs=${logCtx.pageId} wba=${logCtx.wba} action=viewport-align-applied panX=${scrollX} panY=${scrollY} zoom=${zoom} source=${logCtx.source}`
          );
          if (followTutorViewRef.current) {
            // Read actual post-apply appState — Excalidraw may clamp scroll at
            // extreme pan/zoom, so the actual state can differ from the requested
            // (scrollX/Y) values passed to updateScene.  Locking to the actual
            // state prevents a spurious revert the next time onChange fires with
            // the clamped values.
            const actual = api.getAppState() as {
              scrollX?: number;
              scrollY?: number;
              zoom?: { value?: number };
            };
            followLockedViewportRef.current = {
              scrollX: typeof actual.scrollX === "number" ? actual.scrollX : scrollX,
              scrollY: typeof actual.scrollY === "number" ? actual.scrollY : scrollY,
              zoom: typeof actual.zoom?.value === "number" ? actual.zoom.value : zoom,
            };
          }
          if (followDebugTelemetry) {
            const studentSize = readViewportSizeFromAppState(api.getAppState());
            const st = api.getAppState() as {
              offsetLeft?: number;
              offsetTop?: number;
            };
            const offsetLeft =
              typeof st.offsetLeft === "number" && Number.isFinite(st.offsetLeft)
                ? st.offsetLeft
                : 0;
            const offsetTop =
              typeof st.offsetTop === "number" && Number.isFinite(st.offsetTop)
                ? st.offsetTop
                : 0;
            if (studentSize) {
              const center = viewportSceneCenterFromScroll(
                scrollX,
                scrollY,
                zoom,
                studentSize.viewportWidth,
                studentSize.viewportHeight,
                offsetLeft,
                offsetTop
              );
              followDebugTelemetry.lastAppliedCenter.current = center;
              followDebugTelemetry.lastAppliedAt.current = Date.now();
            }
          }
          releaseApplyingRemote();
        },
        onHold: (reason) => {
          console.info(
            `[student-apply] ${wbsidTag}wba=${logCtx.wba} action=viewport-follow-hold reason=${reason} source=${logCtx.source}`
          );
          releaseApplyingRemote();
        },
      });
    },
    [followDebugTelemetry, wbsid, wbsidTag]
  );

  const applyTutorFollow = useCallback(
    (f: WhiteboardWireFollow) => {
      const api = excalidrawApiRef.current;
      if (!api || !hasFollowSceneCenter(f)) return;
      const wba = nextApplyId(wbaCounterRef);
      applyViewportToCanvas(api, f, {
        wba,
        pageId: activePageIdRef.current,
        source: "snap-follow",
      });
    },
    [applyViewportToCanvas, wbsidTag]
  );

  const snapToTutorView = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const act = activePageIdRef.current;
    const wireRow = pageListRef.current.find((p) => p.id === act);
    const f = lastTutorFollowRef.current;
    if (f && hasFollowSceneCenter(f)) {
      const vs = wireRow?.viewState;
      const follow: WhiteboardWireFollow = vs
        ? {
            centerSceneX: f.centerSceneX,
            centerSceneY: f.centerSceneY,
            zoom: vs.zoom,
          }
        : f;
      applyTutorFollow(follow);
      return;
    }
    if (f) applyTutorFollow(f);
  }, [applyTutorFollow]);

  const getPageBroadcastExtras = useCallback((): WhiteboardWireBroadcastExtras => {
    const id = activePageIdRef.current;
    return {
      page: {
        activePageId: id,
        pageList: pageListRef.current.map((p) => ({
          id: p.id,
          title: p.title,
          ...(p.section ? { section: p.section } : {}),
          ...(p.viewState
            ? {
                viewState: {
                  panX: p.viewState.panX,
                  panY: p.viewState.panY,
                  zoom: p.viewState.zoom,
                },
              }
            : {}),
        })),
        ...(Object.keys(sectionsRegistryRef.current).length > 0
          ? { sections: { ...sectionsRegistryRef.current } }
          : {}),
      },
      scenePageId: id,
    };
  }, []);

  const rebroadcastActivePageAfterReconnect = useCallback(
    (reason: "reconnect") => {
      if (!sync) return;
      const pageId = activePageIdRef.current;
      const els = pageDataRef.current[pageId];
      if (!els || els.length === 0) return;
      console.info(
        `[student-broadcast] ${wbsidTag}author=student action=broadcast-v2 page=${pageId} elements=${els.length} reason=${reason}`
      );
      try {
        sync.broadcastScene(
          els as ReadonlyArray<ExcalidrawLikeElement>,
          getPageBroadcastExtras()
        );
      } catch (err) {
        console.warn(
          `[useStudentWhiteboardCanvas] ${wbsidTag}reconnect broadcast failed:`,
          (err as Error)?.message ?? String(err)
        );
      }
    },
    [getPageBroadcastExtras, sync, wbsidTag]
  );

  const runV3Apply = useCallback(
    async (api: ExcalidrawApiLike, details: WhiteboardWireRemoteDetails) => {
      const docV3 = details.document;
      const page = details.page;
      if (!docV3 || !page) return;

      const wba = nextApplyId(wbaCounterRef);
      const rev = docV3.rev;
      const pageIds = page.pageList.map((p) => p.id);
      console.info(
        `[student-apply] ${wbsidTag}wba=${wba} author=tutor action=apply-v3-start rev=${rev} activePageId=${activePageIdRef.current} pageIds=[${pageIds.join(",")}]`
      );

      if (details.follow) {
        lastTutorFollowRef.current = details.follow;
        recordRecvFollow(details.follow);
      }
      if (page.pageList && page.pageList.length > 0) {
        commitPageList(
          page.pageList.map((p) => {
            const vs = wireRowViewState(p);
            return {
              id: p.id,
              title: p.title,
              ...(typeof (p as { section?: unknown }).section === "string"
                ? { section: (p as { section: string }).section }
                : {}),
              ...(vs ? { viewState: { ...vs } } : {}),
            };
          })
        );
      }
      if (typeof page.sections !== "undefined") {
        setSectionsRegistry(
          page.sections && typeof page.sections === "object"
            ? { ...page.sections }
            : {}
        );
      }

      const followTarget = page.activePageId;
      const previous = activePageIdRef.current;
      const actAtStart = previous;
      const switchedPage = previous !== followTarget;
      if (switchedPage) {
        console.info(
          `[student-apply] ${wbsidTag}wba=${wba} author=tutor action=page-switch from=${previous} to=${followTarget}`
        );
        if (pageDataRef.current[previous] === undefined) {
          const wirePrev = docV3.pages[previous] as
            | ReadonlyArray<ExcalidrawLikeElement>
            | undefined;
          if (wirePrev) {
            pageDataRef.current[previous] = wirePrev;
          }
        }
        activePageIdRef.current = followTarget;
        setActivePageId(followTarget);
        const prefetched =
          (pageDataRef.current[followTarget] as ExcalidrawLikeElement[] | undefined) ??
          [];
        const apiForSwitch = api as typeof api & {
          updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
          history?: { clear: () => void };
        };
        if (
          pageSwitchProgrammaticRef.current === 0 &&
          prefetched.length > 0
        ) {
          // captureUpdate: "NEVER" — tutor page-switch prefetch must not
          // enter the student's local undo/redo stack.
          apiForSwitch.updateScene({ elements: prefetched as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
        }
        // Scope undo/redo history to the current board — same as the tutor
        // page-switch path (WhiteboardWorkspaceClient selectTutorPage). Without
        // this, student undo after a page switch replays Board N-1 operations
        // and injects those elements into Board N (P0 cross-page contamination).
        apiForSwitch.history?.clear();
      }
      onTutorPageMeta?.(page);

      applyingRemoteRef.current = true;
      try {
        const appState = api.getAppState() as unknown;
        for (const pageId of pageIds) {
          const base = (docV3.pages[pageId] ?? []) as ReadonlyArray<ExcalidrawLikeElement>;
          const remoteCopy = base.map((e) => ({ ...e }) as ExcalidrawLikeElement);
          const hydrate = await hydrateRemoteImageFilesForScene(
            api,
            remoteCopy,
            loadedRemoteFileIdsRef.current,
            {
              logContext: "student",
              giveUpFileIds: giveUpFileIdsRef.current,
              warnDedupe: warnDedupeRef.current,
              resolveReadUrl:
                joinToken.length > 0
                  ? (u) =>
                      resolveWhiteboardAssetReadUrl(u, {
                        kind: "student",
                        joinToken,
                      })
                  : undefined,
            }
          );
          onHydrateResult?.(hydrate);

          const local: ExcalidrawLikeElement[] =
            (pageDataRef.current[pageId] as ExcalidrawLikeElement[] | undefined) ??
            [];

          const merged = await mergeScenesReconciled(
            local,
            remoteCopy,
            appState,
            { shouldDropRemoteElement }
          );
          pageDataRef.current[pageId] = merged;

          const stillOnTargetWriteTime =
            activePageIdRef.current === pageId &&
            pageSwitchProgrammaticRef.current === 0;
          if (stillOnTargetWriteTime) {
            // captureUpdate: "NEVER" — tutor-origin per-page sync applies must
            // not enter the student's local undo/redo stack.
            (api as typeof api & {
              updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
            }).updateScene({ elements: merged as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
          }
        }

        const actEnd = activePageIdRef.current;
        const toShow = pageDataRef.current[actEnd];
        let liveWrite = 0;
        if (toShow && pageSwitchProgrammaticRef.current === 0) {
          // captureUpdate: "NEVER" — final active-tab re-paint after v3 apply
          // is tutor-origin data; must not pollute the student's undo stack.
          (api as typeof api & {
            updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
          }).updateScene({ elements: toShow as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
          liveWrite = 1;
        }

        if (followTutorView) {
          const act = activePageIdRef.current;
          const wireRow = page.pageList.find((r) => r.id === act);
          const vs = wireRow ? wireRowViewState(wireRow) : undefined;
          // Prefer `details.follow` (camera on this v3 packet); page-row viewState
          // is debounced on the tutor and can lag pan/zoom during live follow.
          if (details.follow) {
            applyViewportToCanvas(api, details.follow, {
              wba,
              pageId: act,
              source: "wire-v3-follow",
            });
          } else if (
            vs &&
            lastTutorFollowRef.current &&
            hasFollowSceneCenter(lastTutorFollowRef.current)
          ) {
            applyViewportToCanvas(
              api,
              {
                centerSceneX: lastTutorFollowRef.current.centerSceneX,
                centerSceneY: lastTutorFollowRef.current.centerSceneY,
                zoom: vs.zoom,
              },
              {
                wba,
                pageId: act,
                source: "wire-v3-pageViewState",
              }
            );
          }
        }

        const onActive =
          (pageDataRef.current[actEnd] as ExcalidrawLikeElement[] | undefined) ??
          [];
        console.info(
          `[student-apply] ${wbsidTag}wba=${wba} author=tutor action=apply-v3-complete rev=${rev} liveWrite=${liveWrite} elementsOnActiveTab=${onActive.length}`
        );
        setTutorStreamReady(true);
      } catch (err) {
        console.warn(
          `[useStudentWhiteboardCanvas] ${wbsidTag}wba=${wba} v3 document apply failed:`,
          (err as Error)?.message ?? String(err)
        );
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [
      applyViewportToCanvas,
      commitPageList,
      followTutorView,
      joinToken,
      onHydrateResult,
      onTutorPageMeta,
      recordRecvFollow,
      shouldDropRemoteElement,
      wbsidTag,
    ]
  );

  const runV2Apply = useCallback(
    async (
      _api: ExcalidrawApiLike,
      _elements: ReadonlyArray<ExcalidrawLikeElement>,
      _details?: WhiteboardWireRemoteDetails
    ) => {
      const wba = nextApplyId(wbaCounterRef);
      console.warn(
        `[student-apply] ${wbsidTag}wba=${wba} author=tutor action=v2-drop warn reason=inbound-v2-retired`
      );
    },
    [wbsidTag]
  );

  const shouldAcceptTutorRev = useCallback((r: number, last: number): boolean => {
    if (r === last) return false;
    if (r < last && last - r <= 2) return false;
    return true;
  }, []);

  const enqueueV3Apply = useCallback(
    (r: number, details: WhiteboardWireRemoteDetails) => {
      v3ApplyChainRef.current = v3ApplyChainRef.current
        .then(async () => {
          const last = lastTutorV3RevRef.current;
          if (!shouldAcceptTutorRev(r, last)) {
            const wba = nextApplyId(wbaCounterRef);
            console.info(
              `[student-apply] ${wbsidTag}wba=${wba} action=rev-drop reason=stale rev=${r} last=${last}`
            );
            return;
          }
          const apiNow = excalidrawApiRef.current;
          if (!apiNow) {
            const prevB = pendingV3Ref.current;
            if (prevB && !shouldAcceptTutorRev(r, prevB.rev)) {
              return;
            }
            pendingV3Ref.current = { rev: r, details };
            return;
          }
          await runV3Apply(apiNow, details);
          lastTutorV3RevRef.current = Math.max(lastTutorV3RevRef.current, r);
        })
        .catch((err) => {
          console.warn(
            `[useStudentWhiteboardCanvas] ${wbsidTag}v3 apply chain failed:`,
            (err as Error)?.message ?? String(err)
          );
        });
    },
    [runV3Apply, shouldAcceptTutorRev, wbsidTag]
  );

  const selectStudentPage = useCallback(
    async (nextId: string) => {
      const api = excalidrawApiRef.current;
      if (!api || nextId === activePageIdRef.current) return;
      const from = activePageIdRef.current;
      const wba = nextApplyId(wbaCounterRef);
      pageSwitchProgrammaticRef.current += 1;
      try {
        pageDataRef.current[from] = api.getSceneElements() as ExcalidrawLikeElement[];
        const next =
          (pageDataRef.current[nextId] as ExcalidrawLikeElement[] | undefined) ??
          [];
        activePageIdRef.current = nextId;
        setActivePageId(nextId);
        const apiForSwitch = api as typeof api & {
          updateScene: (s: { elements: ReadonlyArray<unknown>; captureUpdate?: string }) => void;
          history?: { clear: () => void };
        };
        // captureUpdate: "NEVER" — student page-switch element load must not
        // create a history entry; same rationale as tutor selectTutorPage.
        apiForSwitch.updateScene({ elements: next as ReadonlyArray<unknown>, captureUpdate: "NEVER" });
        // Scope undo/redo history to the current board so undo does not reach
        // across pages (parity with tutor selectTutorPage history.clear()).
        apiForSwitch.history?.clear();
        console.info(
          `[student-apply] ${wbsidTag}wba=${wba} author=student action=page-switch from=${from} to=${nextId}`
        );
      } finally {
        const dec = () => {
          pageSwitchProgrammaticRef.current = Math.max(
            0,
            pageSwitchProgrammaticRef.current - 1
          );
        };
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(dec);
        } else {
          setTimeout(dec, 0);
        }
      }
    },
    [wbsidTag]
  );

  useEffect(() => {
    if (!excalidrawAPI) return;
    const p3 = pendingV3Ref.current;
    if (p3) {
      pendingV3Ref.current = null;
      enqueueV3Apply(p3.rev, p3.details);
    }
  }, [enqueueV3Apply, excalidrawAPI]);

  useEffect(() => {
    if (!sync) return;
    if (
      typeof sync.onConnect !== "function" ||
      typeof sync.onDisconnect !== "function" ||
      typeof sync.onPeerCountChange !== "function"
    ) {
      return;
    }
    lastTutorV3RevRef.current = 0;
    const offDisconnect = sync.onDisconnect(() => {
      hadDisconnectRef.current = true;
    });
    const offConnect = sync.onConnect(() => {
      lastTutorV3RevRef.current = 0;
      if (hadDisconnectRef.current) {
        hadDisconnectRef.current = false;
        const wba = nextApplyId(wbaCounterRef);
        console.info(
          `[student-apply] ${wbsidTag}wba=${wba} action=rev-reset reason=student-reconnect`
        );
        rebroadcastActivePageAfterReconnect("reconnect");
      }
    });
    const offPeer = sync.onPeerCountChange((n) => {
      const was = prevOtherPeersForRevResetRef.current;
      if (n >= 1 && was <= 0) {
        lastTutorV3RevRef.current = 0;
        const wba = nextApplyId(wbaCounterRef);
        console.info(
          `[student-apply] ${wbsidTag}wba=${wba} action=rev-reset reason=tutor-reconnect`
        );
      }
      prevOtherPeersForRevResetRef.current = n;
    });
    return () => {
      offDisconnect();
      offConnect();
      offPeer();
    };
  }, [rebroadcastActivePageAfterReconnect, sync, wbsidTag]);

  useEffect(() => {
    if (!sync) return;
    const off = sync.onRemoteScene((peerId, elements, details) => {
      const docV3 = details?.document;
      if (docV3) {
        const r = docV3.rev;
        if (!shouldAcceptTutorRev(r, lastTutorV3RevRef.current)) {
          const pending = pendingV3Ref.current;
          if (!pending || !shouldAcceptTutorRev(r, pending.rev)) {
            return;
          }
        }
        enqueueV3Apply(r, details!);
        return;
      }
      if (!excalidrawApiRef.current) {
        console.warn(
          `[student-apply] ${wbsidTag}wba=v2-drop warn author=tutor reason=pending-v2-buffered`
        );
        return;
      }
      void runV2Apply(
        excalidrawApiRef.current,
        elements as ReadonlyArray<ExcalidrawLikeElement>,
        details
      );
    });
    return off;
  }, [enqueueV3Apply, runV2Apply, shouldAcceptTutorRev, sync, wbsidTag]);

  useEffect(() => {
    if (!sync || typeof sync.onRemotePageViewState !== "function") return;
    const off = sync.onRemotePageViewState((_from, msg) => {
      if (msg.role !== "tutor") return;
      setPageList((prev) => {
        const idx = prev.findIndex((p) => p.id === msg.pageId);
        if (idx < 0) return prev;
        const vs: PageViewState = {
          panX: msg.panX,
          panY: msg.panY,
          zoom: msg.zoom,
        };
        const next = [...prev];
        next[idx] = { ...next[idx]!, viewState: vs };
        pageListRef.current = next;
        return next;
      });
      const api = excalidrawApiRef.current;
      if (!followTutorView || !api || msg.pageId !== activePageIdRef.current) {
        return;
      }
      const cached = lastTutorFollowRef.current;
      if (!cached || !hasFollowSceneCenter(cached)) return;
      const wba = nextApplyId(wbaCounterRef);
      applyViewportToCanvas(
        api,
        {
          centerSceneX: cached.centerSceneX,
          centerSceneY: cached.centerSceneY,
          zoom: msg.zoom,
        },
        {
          wba,
          pageId: msg.pageId,
          source: "wire-recv",
        }
      );
    });
    return off;
  }, [applyViewportToCanvas, followTutorView, sync]);

  const syncActivePageElements = useCallback(
    (elements: ReadonlyArray<ExcalidrawLikeElement>) => {
      pageDataRef.current[activePageIdRef.current] = elements;
    },
    []
  );

  const onCanvasChange = useCallback(
    (
      elements: ReadonlyArray<unknown>,
      appState?: unknown,
      _files?: Readonly<Record<string, unknown>>
    ) => {
      // tutorViewportApplyRef covers the rAF window between runV3Apply's finally
      // (which prematurely clears applyingRemoteRef) and onApplied firing.
      if (applyingRemoteRef.current || tutorViewportApplyRef.current) return;

      const api = excalidrawApiRef.current;
      if (
        followTutorViewRef.current &&
        api &&
        appState &&
        !viewportRevertInProgressRef.current
      ) {
        const locked = followLockedViewportRef.current;
        if (locked) {
          const st = appState as {
            scrollX?: unknown;
            scrollY?: unknown;
            zoom?: { value?: unknown };
          };
          const sx = st.scrollX;
          const sy = st.scrollY;
          const z = st.zoom?.value;
          const viewportChanged =
            typeof sx === "number" &&
            typeof sy === "number" &&
            typeof z === "number" &&
            (Math.abs(sx - locked.scrollX) > 0.01 ||
              Math.abs(sy - locked.scrollY) > 0.01 ||
              Math.abs(z - locked.zoom) > 0.0001);
          if (viewportChanged) {
            viewportRevertInProgressRef.current = true;
            try {
              (
                api as ExcalidrawApiLike & {
                  updateScene: (s: {
                    appState?: Record<string, unknown>;
                    captureUpdate?: string;
                  }) => void;
                }
              ).updateScene({
                appState: {
                  scrollX: locked.scrollX,
                  scrollY: locked.scrollY,
                  zoom: { value: locked.zoom },
                },
                captureUpdate: "NEVER",
              });
            } finally {
              viewportRevertInProgressRef.current = false;
            }
            return;
          }
        }
      }

      pageDataRef.current[activePageIdRef.current] = elements as ExcalidrawLikeElement[];
      onLocalElementSnapshot(elements);
      if (!sync) return;
      const pageId = activePageIdRef.current;
      console.info(
        `[student-broadcast] ${wbsidTag}author=student action=broadcast-v2 page=${pageId} elements=${elements.length} reason=onChange`
      );
      try {
        sync.broadcastScene(
          elements as ReadonlyArray<ExcalidrawLikeElement>,
          getPageBroadcastExtras()
        );
      } catch (err) {
        console.warn(
          "[useStudentWhiteboardCanvas] broadcast failed:",
          (err as Error)?.message ?? String(err)
        );
      }
    },
    [getPageBroadcastExtras, onLocalElementSnapshot, sync, wbsidTag]
  );

  return {
    onCanvasChange,
    syncActivePageElements,
    snapToTutorView,
    getPageBroadcastExtras,
    pageList,
    sectionsRegistry,
    activePageId,
    activePageIdRef,
    applyingRemoteRef,
    tutorViewportApplyRef,
    pageSwitchProgrammaticRef,
    selectStudentPage,
    tutorStreamReady,
  };
}
