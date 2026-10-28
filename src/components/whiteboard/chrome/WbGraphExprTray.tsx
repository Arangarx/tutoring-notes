"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isPhoneLayout,
  useWbLayoutMode,
} from "@/components/whiteboard/chrome/useWbLayoutMode";
import { GRAPH_EMBED_LINK } from "@/lib/whiteboard/insert-asset";
import {
  readVisualViewportBox,
  readVisualViewportEdges,
  subscribeVisualViewport,
} from "@/lib/whiteboard/visible-viewport";
import "./WbGraphExprTray.css";

export type GraphTrayEntry = {
  id: string;
  /** Index among graph embeddables on the current board, in scene order. */
  order: number;
};

type GraphPhoneTrayContextValue = {
  graphs: GraphTrayEntry[];
  register: (entry: GraphTrayEntry) => void;
  unregister: (id: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Recompute every registered graph's board order from the live scene. */
  syncOrders: (elements: readonly unknown[]) => void;
  /** Graph whose expression fields belong in the open tray. */
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  slot: HTMLDivElement | null;
  setSlot: (el: HTMLDivElement | null) => void;
  launcherRef: RefObject<HTMLButtonElement | null>;
  trayRef: RefObject<HTMLDivElement | null>;
  focusLauncherAfterCloseRef: RefObject<boolean>;
};

const GraphPhoneTrayContext = createContext<GraphPhoneTrayContextValue | null>(null);

export function useGraphPhoneTray(): GraphPhoneTrayContextValue | null {
  return useContext(GraphPhoneTrayContext);
}

type SceneGraphLike = {
  id?: string;
  isDeleted?: boolean;
  link?: string | null;
  customData?: { wbType?: string };
};

/** Board order of one graph among the current scene's graph embeddables. */
export function readGraphBoardOrder(
  elements: ReadonlyArray<unknown>,
  elementId: string
): number {
  let order = 0;
  for (const raw of elements) {
    const el = raw as SceneGraphLike;
    if (!el || el.isDeleted) continue;
    const isGraph = el.link === GRAPH_EMBED_LINK || el.customData?.wbType === "graph";
    if (!isGraph) continue;
    if (el.id === elementId) return order;
    order += 1;
  }
  return order;
}

function sameGraphs(a: GraphTrayEntry[], b: GraphTrayEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].order !== b[i].order) return false;
  }
  return true;
}

export function GraphPhoneTrayProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef<Map<string, GraphTrayEntry>>(new Map());
  const [graphs, setGraphs] = useState<GraphTrayEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [slot, setSlotState] = useState<HTMLDivElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const trayRef = useRef<HTMLDivElement | null>(null);
  const focusLauncherAfterCloseRef = useRef(false);

  const publish = useCallback(() => {
    const next = [...entriesRef.current.values()].sort(
      (a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
    setGraphs((prev) => (sameGraphs(prev, next) ? prev : next));
  }, []);

  const register = useCallback(
    (entry: GraphTrayEntry) => {
      const prev = entriesRef.current.get(entry.id);
      if (prev && prev.order === entry.order) return;
      entriesRef.current.set(entry.id, entry);
      publish();
    },
    [publish]
  );

  const unregister = useCallback(
    (id: string) => {
      if (!entriesRef.current.delete(id)) return;
      publish();
    },
    [publish]
  );

  const setSlot = useCallback((el: HTMLDivElement | null) => {
    setSlotState((prev) => (prev === el ? prev : el));
  }, []);

  const syncOrders = useCallback(
    (elements: readonly unknown[]) => {
      let changed = false;
      for (const [id, entry] of entriesRef.current) {
        const order = readGraphBoardOrder(elements, id);
        if (entry.order !== order) {
          entriesRef.current.set(id, { id, order });
          changed = true;
        }
      }
      if (changed) publish();
    },
    [publish]
  );

  const selectedId = graphs.some((g) => g.id === pickedId)
    ? pickedId
    : (graphs[0]?.id ?? null);

  const value = useMemo(
    () => ({
      graphs,
      register,
      unregister,
      open,
      setOpen,
      syncOrders,
      selectedId,
      setSelectedId: setPickedId,
      slot,
      setSlot,
      launcherRef,
      trayRef,
      focusLauncherAfterCloseRef,
    }),
    [graphs, register, unregister, open, syncOrders, selectedId, slot, setSlot]
  );

  return (
    <GraphPhoneTrayContext.Provider value={value}>
      {children}
    </GraphPhoneTrayContext.Provider>
  );
}

const PLACE_GAP = 8;

function shownRect(el: Element | null, allowPointerNone = false): DOMRect | null {
  if (!(el instanceof HTMLElement)) return null;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return null;
  if (!allowPointerNone && style.pointerEvents === "none") return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return rect;
}

function intersects(
  a: { left: number; top: number; right: number; bottom: number },
  b: DOMRect,
  gap: number
): boolean {
  return (
    a.left < b.right + gap &&
    a.right > b.left - gap &&
    a.top < b.bottom + gap &&
    a.bottom > b.top - gap
  );
}

/**
 * Pin the launcher to the visible viewport, in the free band above the bottom
 * toolbar (or to the right of the landscape rail) and clear of other chrome.
 */
function placeGraphExprLauncher(root: HTMLElement) {
  const box = root.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return;

  const edges = readVisualViewportEdges();
  if (!edges) return;
  let leftBound = edges.left;
  let topBound = edges.top;
  let rightBound = edges.right;
  let bottomBound = edges.bottom;

  const toolbar = shownRect(document.querySelector("[data-testid='wb-bottom-toolbar']"));
  if (toolbar) {
    const mid = (leftBound + rightBound) / 2;
    const leftRail = toolbar.height > toolbar.width && toolbar.right <= mid;
    if (leftRail) leftBound = Math.max(leftBound, toolbar.right);
    else bottomBound = Math.min(bottomBound, toolbar.top);
  }
  const strip = shownRect(document.querySelector(".mynk-wb-pagestrip"));
  if (strip) bottomBound = Math.min(bottomBound, strip.top);
  const topbar = shownRect(document.querySelector("header.mynk-wb-topbar"));
  if (topbar) topBound = Math.max(topBound, topbar.bottom);

  const width = box.width;
  const height = box.height;
  let left = rightBound - PLACE_GAP - width;
  let top = bottomBound - PLACE_GAP - height;

  const chat = shownRect(document.querySelector("[data-testid='wb-session-chat']"));
  if (chat) {
    left = chat.left - PLACE_GAP - width;
    top = Math.min(top, chat.bottom - height);
  }

  left = Math.min(Math.max(left, leftBound + PLACE_GAP), rightBound - PLACE_GAP - width);
  top = Math.min(Math.max(top, topBound + PLACE_GAP), bottomBound - PLACE_GAP - height);

  const obstacles = [
    toolbar,
    strip,
    topbar,
    chat,
    shownRect(document.querySelector("[data-testid='wb-view-locked-indicator']")),
    shownRect(document.querySelector(".mynk-wb-av-cluster")),
  ].filter((rect): rect is DOMRect => rect !== null);

  for (let step = 0; step < 6; step++) {
    const candidate = { left, top, right: left + width, bottom: top + height };
    const hit = obstacles.find((rect) => intersects(candidate, rect, 2));
    if (!hit) break;
    const above = hit.top - PLACE_GAP - height;
    if (above >= topBound + PLACE_GAP) {
      top = above;
      continue;
    }
    const beside = hit.left - PLACE_GAP - width;
    if (beside >= leftBound + PLACE_GAP) {
      left = beside;
      top = Math.min(top, bottomBound - PLACE_GAP - height);
      continue;
    }
    break;
  }

  const currentLeft = Number.parseFloat(root.style.left);
  const currentTop = Number.parseFloat(root.style.top);
  if (
    Number.isFinite(currentLeft) &&
    Number.isFinite(currentTop) &&
    Math.abs(currentLeft - left) < 0.5 &&
    Math.abs(currentTop - top) < 0.5
  ) {
    return;
  }
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.right = "auto";
  root.style.bottom = "auto";
}

/** How much of the layout viewport the soft keyboard currently covers. */
function useKeyboardOverlapPx(enabled: boolean): number {
  const [overlap, setOverlap] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const box = readVisualViewportBox();
      const next = box ? Math.max(0, window.innerHeight - box.top - box.height) : 0;
      setOverlap((prev) => (Math.abs(prev - next) < 0.5 ? prev : next));
    };
    update();
    return subscribeVisualViewport(update);
  }, [enabled]);
  return enabled ? overlap : 0;
}

/**
 * One phone-only expression launcher for the current board, fixed to the
 * viewport. One graph edits directly; several graphs pick inside the sheet.
 */
export function WbGraphExprTray() {
  const tray = useGraphPhoneTray();
  const { layoutMode } = useWbLayoutMode();
  const phone = isPhoneLayout(layoutMode);
  const keyboardOverlap = useKeyboardOverlapPx(phone);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const graphs = tray?.graphs ?? [];
  const show = phone && graphs.length > 0 && tray !== null;

  useEffect(() => {
    if (!tray?.open) return;
    if (!phone || graphs.length === 0) tray.setOpen(false);
  }, [phone, graphs.length, tray]);

  useEffect(() => {
    if (!tray?.open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target;
      const trayEl = tray.trayRef.current;
      if (!(target instanceof Node) || !trayEl?.contains(target)) return;
      const inField =
        target instanceof Element && Boolean(target.closest("input, textarea"));
      if (inField) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      tray.focusLauncherAfterCloseRef.current = true;
      tray.setOpen(false);
      requestAnimationFrame(() => tray.launcherRef.current?.focus());
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [tray]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !show) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => placeGraphExprLauncher(anchor));
    };
    schedule();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const watch = () => {
      if (!ro) return;
      for (const el of [
        document.querySelector("[data-testid='wb-bottom-toolbar']"),
        document.querySelector(".mynk-wb-pagestrip"),
        document.querySelector("header.mynk-wb-topbar"),
        document.querySelector("[data-testid='wb-session-chat']"),
        document.querySelector(".mynk-wb-av-cluster"),
        anchor,
        anchor.closest(".mynk-wb-chrome"),
      ]) {
        if (el instanceof Element) ro.observe(el);
      }
    };
    watch();
    const unsubscribeViewport = subscribeVisualViewport(schedule);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      unsubscribeViewport();
      window.removeEventListener("resize", schedule);
    };
  }, [show, graphs.length]);

  if (!show || !tray) return null;

  const labels = graphs.map((graph, index) => ({
    ...graph,
    label: `Graph ${index + 1}`,
  }));

  return (
    <>
      <div ref={anchorRef} className="wb-graph-phone-expr-launcher">
        <Button
          ref={tray.launcherRef}
          type="button"
          variant="secondary"
          size="sm"
          aria-expanded={tray.open}
          aria-controls="wb-graph-expr-tray"
          data-testid="wb-graph-phone-expr-launcher"
          onClick={() => tray.setOpen(true)}
        >
          Expressions
        </Button>
      </div>
      <Sheet
        open={tray.open}
        onOpenChange={(next) => {
          tray.setOpen(next);
          if (!next && tray.focusLauncherAfterCloseRef.current) {
            tray.focusLauncherAfterCloseRef.current = false;
            requestAnimationFrame(() => tray.launcherRef.current?.focus());
          }
        }}
      >
        <SheetContent
          ref={tray.trayRef}
          id="wb-graph-expr-tray"
          tabIndex={-1}
          side="bottom"
          className="wb-graph-expr-tray"
          data-testid="wb-graph-expr-tray"
          style={{ bottom: keyboardOverlap, zIndex: 80 }}
          onEscapeKeyDown={(event) => {
            const target = event.target;
            const inField =
              target instanceof Element && Boolean(target.closest("input, textarea"));
            if (inField) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            tray.focusLauncherAfterCloseRef.current = true;
          }}
        >
          <SheetHeader>
            <SheetTitle>Expressions</SheetTitle>
            <SheetDescription>
              {labels.length > 1
                ? "Choose a graph, then edit the expressions plotted on it."
                : "Edit the expressions plotted on this graph."}
            </SheetDescription>
          </SheetHeader>
          {labels.length > 1 ? (
            <Tabs
              value={tray.selectedId ?? undefined}
              onValueChange={tray.setSelectedId}
            >
              <TabsList
                className="wb-graph-expr-picker"
                data-testid="wb-graph-expr-picker"
              >
                {labels.map((graph, index) => (
                  <TabsTrigger
                    key={graph.id}
                    value={graph.id}
                    data-testid={`wb-graph-expr-pick-${index + 1}`}
                  >
                    {graph.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : null}
          <div ref={tray.setSlot} className="wb-graph-expr-tray-slot" />
        </SheetContent>
      </Sheet>
    </>
  );
}
