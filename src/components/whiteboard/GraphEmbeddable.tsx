"use client";

/**
 * Self-hosted JSXGraph coordinate plane rendered inside an Excalidraw
 * embeddable via the `renderEmbeddable` prop (tutor workspace).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  addGraphExpression,
  cloneGraphState,
  DEFAULT_GRAPH_BBOX,
  fitGraphBboxToSquareUnits,
  parseGraphStateJson,
  preprocessGraphExpression,
  recomputeBboxForResize,
  removeGraphExpression,
  updateGraphExpression,
  withGraphBbox,
  type GraphBbox,
  type GraphState,
} from "@/lib/whiteboard/graph-state";
import {
  persistGraphElementState,
  type GraphPersistApiLike,
} from "@/lib/whiteboard/graph-persist";
import "./graph-embeddable.css";

type EmbeddableElementLike = {
  id?: string;
  width?: number;
  height?: number;
  customData?: Record<string, unknown>;
};

type JxgBoard = {
  resizeContainer: (width: number, height: number, dontUpdate?: boolean) => void;
  setBoundingBox: (bbox: GraphBbox, keep?: boolean) => void;
  update: () => void;
  create: (
    type: string,
    parents: unknown[],
    attributes?: Record<string, unknown>
  ) => { id?: string };
  removeObject: (obj: { id?: string }) => void;
  getBoundingBox: () => GraphBbox;
  zoomIn: (x?: number, y?: number) => JxgBoard;
  zoomOut: (x?: number, y?: number) => JxgBoard;
  clickLeftArrow: () => JxgBoard;
  clickRightArrow: () => JxgBoard;
  clickUpArrow: () => JxgBoard;
  clickDownArrow: () => JxgBoard;
  defaultAxes: {
    x: { setAttribute: (attrs: Record<string, unknown>) => void };
    y: { setAttribute: (attrs: Record<string, unknown>) => void };
  };
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
};

type Props = {
  element: EmbeddableElementLike;
  excalidrawAPI?: GraphPersistApiLike | null;
  /** Prefer ref when state may lag behind the imperative API (live workspace). */
  excalidrawAPIRef?: RefObject<GraphPersistApiLike | null>;
  /** Replay / strict read-only: no edits, no controls, tutor sync replots board state. */
  readOnly?: boolean;
  /**
   * Live workspace: re-plots from element `graphStateJson` when peer sync updates it.
   * With `excalidrawAPI` (or ref), local edits also persist back to the board.
   */
  syncFromBoard?: boolean;
  /** Fired after graphStateJson is written to the Excalidraw scene (live sync path). */
  onAfterPersist?: () => void;
};

const JSXGRAPH_CSS_ID = "mynk-jsxgraph-css";
const BBOX_PERSIST_MS = 400;
const PARSE_ERROR_MSG = "Couldn't understand this expression.";

export function ensureJxgStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(JSXGRAPH_CSS_ID)) return;
  const link = document.createElement("link");
  link.id = JSXGRAPH_CSS_ID;
  link.rel = "stylesheet";
  link.href = "/jsxgraph/jsxgraph.css";
  document.head.appendChild(link);
}

/** Idempotent client-only warm: inject CSS + prime dynamic import cache. */
export function warmJsxGraphModule(): void {
  if (typeof window === "undefined") return;
  ensureJxgStylesheet();
  void import("jsxgraph").catch((err) => {
    console.warn(
      "[GraphEmbeddable] jsxgraph prefetch failed:",
      (err as Error)?.message ?? String(err)
    );
  });
}

function pickCssToken(style: CSSStyleDeclaration, name: string): string {
  const local = style.getPropertyValue(name).trim();
  if (local) return local;
  if (typeof document !== "undefined") {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  return "";
}

function readGraphJxgColors(host: HTMLElement | null): {
  label: string;
  axis: string;
  grid: string;
} {
  const root = host ?? document.documentElement;
  const style = getComputedStyle(root);
  return {
    label: pickCssToken(style, "--text-strong"),
    axis: pickCssToken(style, "--border-default"),
    grid: pickCssToken(style, "--border-subtle"),
  };
}

function applyBoardTheme(board: JxgBoard, host: HTMLElement | null): void {
  const colors = readGraphJxgColors(host);
  const axisAttrs = {
    strokeColor: colors.axis,
    ticks: {
      strokeColor: colors.axis,
      label: { strokeColor: colors.label },
    },
  };
  try {
    board.defaultAxes.x.setAttribute(axisAttrs);
    board.defaultAxes.y.setAttribute(axisAttrs);
  } catch {
    // ignore if axes not ready during teardown
  }
}

function plotExpressions(
  board: JxgBoard,
  expressions: string[],
  plotRefs: Array<{ id?: string }>
): string[] {
  for (const obj of plotRefs) {
    try {
      board.removeObject(obj);
    } catch {
      // ignore stale handles
    }
  }
  plotRefs.length = 0;

  const errors: string[] = [];
  for (const expr of expressions) {
    const trimmed = expr.trim();
    if (!trimmed) {
      errors.push("");
      continue;
    }
    const parsed = preprocessGraphExpression(trimmed);
    try {
      const obj = board.create("functiongraph", [parsed], {
        strokeColor: "var(--accent)",
        strokeWidth: 2,
      });
      plotRefs.push(obj);
      errors.push("");
    } catch {
      errors.push(PARSE_ERROR_MSG);
    }
  }
  return errors;
}

function mountGraphBoard(
  container: HTMLDivElement,
  graphState: GraphState,
  JXG: { JSXGraph: { initBoard: (...args: unknown[]) => JxgBoard } },
  options?: { interactive?: boolean }
): JxgBoard {
  const interactive = options?.interactive !== false;
  const bbox = graphState.bbox ?? DEFAULT_GRAPH_BBOX;
  const colors = readGraphJxgColors(container);
  const board = JXG.JSXGraph.initBoard(container, {
    boundingbox: bbox,
    axis: {
      strokeColor: colors.axis,
      ticks: {
        strokeColor: colors.axis,
        label: { strokeColor: colors.label },
      },
    },
    grid: {
      strokeColor: colors.grid,
      strokeOpacity: 0.65,
    },
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: interactive, needTwoFingers: false, needShift: false },
    zoom: { wheel: interactive, needShift: false, factor: 1.2 },
    resize: { enabled: true },
    // Manual square-unit bbox math (fitGraphBboxToSquareUnits / recomputeBboxForResize)
    // drives px-per-unit on both axes; keepaspectratio would fight that and skew units.
    keepaspectratio: false,
  });
  return board;
}

function stopEmbedDrag(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

/** Block Excalidraw embeddable drag from control hits (capture phase). */
function stopEmbedDragCapture(event: React.SyntheticEvent): void {
  event.stopPropagation();
  if ("stopImmediatePropagation" in event.nativeEvent) {
    event.nativeEvent.stopImmediatePropagation();
  }
}

export function GraphEmbeddable({
  element,
  excalidrawAPI,
  excalidrawAPIRef,
  readOnly = false,
  syncFromBoard = false,
  onAfterPersist,
}: Props) {
  const { resolvedTheme } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<JxgBoard | null>(null);
  const plotRefsRef = useRef<Array<{ id?: string }>>([]);
  const graphStateRef = useRef<GraphState>(
    parseGraphStateJson(
      typeof element.customData?.graphStateJson === "string"
        ? element.customData.graphStateJson
        : null
    )
  );
  const containerSizeRef = useRef<{ width: number; height: number } | null>(null);
  const bboxPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bboxHandlerRef = useRef<(() => void) | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [expressions, setExpressions] = useState<string[]>(
    () => graphStateRef.current.expressions ?? []
  );
  const [exprErrors, setExprErrors] = useState<string[]>([]);
  const [draftExpr, setDraftExpr] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const elementId = element.id ?? "";

  const graphStateJsonRaw =
    typeof element.customData?.graphStateJson === "string"
      ? element.customData.graphStateJson
      : null;

  const persistState = useCallback(
    (state: GraphState) => {
      if (readOnly) return;
      graphStateRef.current = state;
      const api = excalidrawAPIRef?.current ?? excalidrawAPI;
      if (!api || !elementId) return;
      const changed = persistGraphElementState({
        excalidrawAPI: api,
        elementId,
        graphState: state,
      });
      if (changed) onAfterPersist?.();
    },
    [excalidrawAPI, excalidrawAPIRef, elementId, onAfterPersist, readOnly]
  );

  const replot = useCallback(
    (nextExpressions: string[], commit: boolean) => {
      const board = boardRef.current;
      if (!board) return;
      const errors = plotExpressions(board, nextExpressions, plotRefsRef.current);
      setExprErrors(errors);
      setExpressions(nextExpressions);
      if (commit) {
        const nextState = cloneGraphState(graphStateRef.current);
        nextState.expressions = nextExpressions;
        try {
          nextState.bbox = board.getBoundingBox();
        } catch {
          // keep prior bbox
        }
        persistState(nextState);
      }
    },
    [persistState]
  );

  const scheduleBboxPersist = useCallback(() => {
    if (bboxPersistTimerRef.current) {
      clearTimeout(bboxPersistTimerRef.current);
    }
    bboxPersistTimerRef.current = setTimeout(() => {
      bboxPersistTimerRef.current = null;
      const board = boardRef.current;
      if (!board) return;
      try {
        const bbox = board.getBoundingBox();
        const prev = graphStateRef.current.bbox;
        if (
          prev &&
          prev[0] === bbox[0] &&
          prev[1] === bbox[1] &&
          prev[2] === bbox[2] &&
          prev[3] === bbox[3]
        ) {
          return;
        }
        persistState(withGraphBbox(graphStateRef.current, bbox));
      } catch {
        // ignore read errors during teardown
      }
    }, BBOX_PERSIST_MS);
  }, [persistState]);

  const persistBboxNow = useCallback(() => {
    if (bboxPersistTimerRef.current) {
      clearTimeout(bboxPersistTimerRef.current);
      bboxPersistTimerRef.current = null;
    }
    const board = boardRef.current;
    if (!board) return;
    try {
      const bbox = board.getBoundingBox();
      const prev = graphStateRef.current.bbox;
      if (
        prev &&
        prev[0] === bbox[0] &&
        prev[1] === bbox[1] &&
        prev[2] === bbox[2] &&
        prev[3] === bbox[3]
      ) {
        return;
      }
      persistState(withGraphBbox(graphStateRef.current, bbox));
    } catch {
      // ignore read errors during teardown
    }
  }, [persistState]);

  const runBoardViewAction = useCallback(
    (action: (board: JxgBoard) => void) => {
      const board = boardRef.current;
      if (!board) return;
      try {
        action(board);
        board.update();
        persistBboxNow();
      } catch {
        // ignore during teardown
      }
    },
    [persistBboxNow]
  );

  const handleZoomIn = useCallback(() => {
    runBoardViewAction((board) => {
      board.zoomIn();
    });
  }, [runBoardViewAction]);

  const handleZoomOut = useCallback(() => {
    runBoardViewAction((board) => {
      board.zoomOut();
    });
  }, [runBoardViewAction]);

  const handlePanUp = useCallback(() => {
    runBoardViewAction((board) => {
      board.clickUpArrow();
    });
  }, [runBoardViewAction]);

  const handlePanDown = useCallback(() => {
    runBoardViewAction((board) => {
      board.clickDownArrow();
    });
  }, [runBoardViewAction]);

  const handlePanLeft = useCallback(() => {
    runBoardViewAction((board) => {
      board.clickLeftArrow();
    });
  }, [runBoardViewAction]);

  const handlePanRight = useCallback(() => {
    runBoardViewAction((board) => {
      board.clickRightArrow();
    });
  }, [runBoardViewAction]);

  const resetView = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    try {
      if (bboxPersistTimerRef.current) {
        clearTimeout(bboxPersistTimerRef.current);
        bboxPersistTimerRef.current = null;
      }
      board.setBoundingBox(DEFAULT_GRAPH_BBOX, true);
      board.update();
      persistState(withGraphBbox(graphStateRef.current, DEFAULT_GRAPH_BBOX));
    } catch {
      // ignore during teardown
    }
  }, [persistState]);

  useEffect(() => {
    const board = boardRef.current;
    const host = hostRef.current;
    if (!board || !host) return;
    applyBoardTheme(board, host);
    board.update();
  }, [resolvedTheme]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const initialState = parseGraphStateJson(
      typeof element.customData?.graphStateJson === "string"
        ? element.customData.graphStateJson
        : null
    );
    graphStateRef.current = initialState;
    setExpressions(initialState.expressions ?? []);
    setLoadError(null);

    let cancelled = false;
    let board: JxgBoard | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      try {
        ensureJxgStylesheet();
        const jxgMod = await import("jsxgraph");
        if (cancelled || !hostRef.current) return;

        const JXG = jxgMod.default as unknown as {
          JSXGraph: {
            initBoard: (...args: unknown[]) => JxgBoard;
            freeBoard: (board: JxgBoard) => void;
          };
        };
        board = mountGraphBoard(hostRef.current, initialState, JXG, {
          interactive: !readOnly,
        });
        boardRef.current = board;

        const initialExprs = initialState.expressions ?? [];
        const errors = plotExpressions(board, initialExprs, plotRefsRef.current);
        if (!cancelled) setExprErrors(errors);

        const syncSize = () => {
          if (!hostRef.current || !boardRef.current) return;
          const { clientWidth, clientHeight } = hostRef.current;
          if (clientWidth <= 0 || clientHeight <= 0) return;

          const prev = containerSizeRef.current;
          const boardNow = boardRef.current;

          try {
            const currentBbox = boardNow.getBoundingBox();
            const nextBbox = prev
              ? recomputeBboxForResize({
                  bbox: currentBbox,
                  prevWidthPx: prev.width,
                  prevHeightPx: prev.height,
                  nextWidthPx: clientWidth,
                  nextHeightPx: clientHeight,
                })
              : fitGraphBboxToSquareUnits(
                  currentBbox,
                  clientWidth,
                  clientHeight
                );
            boardNow.setBoundingBox(nextBbox, true);
          } catch {
            // keep current bbox on read errors
          }

          boardNow.resizeContainer(clientWidth, clientHeight, true);
          boardNow.update();
          containerSizeRef.current = { width: clientWidth, height: clientHeight };
        };

        syncSize();
        observer = new ResizeObserver(syncSize);
        observer.observe(hostRef.current);

        if (!readOnly) {
          const onBboxChange = () => scheduleBboxPersist();
          bboxHandlerRef.current = onBboxChange;
          board.on("up", onBboxChange);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn(
            "[GraphEmbeddable] jsxgraph load/mount failed:",
            (err as Error)?.message ?? String(err)
          );
          setLoadError(
            "Couldn't load the graph tool — check your connection"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (bboxPersistTimerRef.current) {
        clearTimeout(bboxPersistTimerRef.current);
        bboxPersistTimerRef.current = null;
      }
      observer?.disconnect();
      containerSizeRef.current = null;
      if (board && bboxHandlerRef.current) {
        try {
          board.off("up", bboxHandlerRef.current);
        } catch {
          // ignore
        }
      }
      if (board) {
        const activeBoard = board;
        void import("jsxgraph").then((jxgMod) => {
          (
            jxgMod.default as unknown as {
              JSXGraph: { freeBoard: (b: JxgBoard) => void };
            }
          ).JSXGraph.freeBoard(activeBoard);
        });
      }
      boardRef.current = null;
      plotRefsRef.current = [];
    };
    // Board lifecycle keys on element.id only — intentional for tutor (interactive):
    // graphStateRef holds live edit state; remounting on every graphStateJson change
    // would reset pan/zoom mid-edit. Our own persist updates graphStateJson but must
    // NOT trigger remount.
    //
    // STALENESS TRAP (V1 assumption: only the tutor edits graphs): if graphStateJson
    // changes externally while the tutor has this embed open (e.g. future multi-editor
    // sync or a second device applying tutor state), the interactive board will NOT
    // re-hydrate from the new JSON — graphStateRef and the mounted board stay on the
    // stale snapshot until remount (element.id change). The readOnly student path has a
    // separate effect that re-plots on graphStateJsonRaw; add an equivalent external-
    // resync seam here before enabling multi-editor graph edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: element.id only
  }, [element.id, readOnly, scheduleBboxPersist]);

  /** Tutor sync / replay: re-plot when board element graphStateJson changes. */
  useLayoutEffect(() => {
    if (!readOnly && !syncFromBoard) return;
    const board = boardRef.current;
    if (!board) return;

    const synced = parseGraphStateJson(graphStateJsonRaw);
    graphStateRef.current = synced;
    setExpressions(synced.expressions ?? []);

    const errors = plotExpressions(
      board,
      synced.expressions ?? [],
      plotRefsRef.current
    );
    setExprErrors(errors);

    try {
      board.setBoundingBox(synced.bbox ?? DEFAULT_GRAPH_BBOX, true);
      board.update();
    } catch {
      // ignore during teardown
    }
  }, [readOnly, syncFromBoard, graphStateJsonRaw]);

  const handleAddExpression = () => {
    if (readOnly) return;
    const trimmed = draftExpr.trim();
    if (!trimmed) return;
    const nextState = addGraphExpression(graphStateRef.current, trimmed);
    const nextExprs = nextState.expressions ?? [];
    setDraftExpr("");
    replot(nextExprs, true);
  };

  const commitEdit = (index: number) => {
    const nextState = updateGraphExpression(
      graphStateRef.current,
      index,
      editingDraft
    );
    const nextExprs = nextState.expressions ?? [];
    setEditingIndex(null);
    setEditingDraft("");
    replot(nextExprs, true);
  };

  const handleRemove = (index: number) => {
    const nextState = removeGraphExpression(graphStateRef.current, index);
    const nextExprs = nextState.expressions ?? [];
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingDraft("");
    }
    replot(nextExprs, true);
  };

  return (
    <div
      className="wb-graph-root"
      data-wb-graph="true"
      data-read-only={readOnly ? "true" : undefined}
      data-testid="wb-graph-embed-host"
    >
      {loadError ? (
        <div
          className="wb-graph-load-error"
          role="alert"
          data-testid="wb-graph-load-error"
        >
          {loadError}
        </div>
      ) : (
        <div
          ref={hostRef}
          className="wb-graph-board-host"
          onPointerDown={readOnly ? undefined : stopEmbedDrag}
          onMouseDown={readOnly ? undefined : stopEmbedDrag}
          onWheel={readOnly ? undefined : stopEmbedDrag}
        />
      )}
      {!readOnly && (
      <div
        className="wb-graph-controls"
        onPointerDownCapture={stopEmbedDragCapture}
        onMouseDownCapture={stopEmbedDragCapture}
      >
        <div className="wb-graph-controls-strip">
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-reset-view"
            onClick={resetView}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Reset view to default range"
            data-testid="wb-graph-reset-view"
          >
            Reset view
          </button>
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-expr-toggle"
            onClick={() => setPanelOpen((open) => !open)}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            aria-expanded={panelOpen}
            data-testid="wb-graph-expr-toggle"
          >
            ƒ Expressions
            <span aria-hidden>{panelOpen ? "▾" : "▸"}</span>
          </button>
        </div>
        {panelOpen && (
          <div
            className="wb-graph-expr-body"
            data-testid="wb-graph-expr-panel"
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
          >
            {expressions.length === 0 && (
              <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                Add an expression to plot (e.g. x^2, sin(x), 5x).
              </p>
            )}
            {expressions.map((expr, index) => (
              <div key={`${index}-${expr}`} className="wb-graph-expr-row">
                {editingIndex === index ? (
                  <input
                    className="wb-graph-expr-input"
                    value={editingDraft}
                    onChange={(e) => setEditingDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitEdit(index);
                      }
                      if (e.key === "Escape") {
                        setEditingIndex(null);
                        setEditingDraft("");
                      }
                    }}
                    onBlur={() => commitEdit(index)}
                    autoFocus
                    data-testid={`wb-graph-expr-edit-${index}`}
                  />
                ) : (
                  <div className="wb-graph-expr-actions">
                    <button
                      type="button"
                      className="wb-graph-expr-input"
                      style={{ textAlign: "left", cursor: "text" }}
                      onPointerDown={stopEmbedDrag}
                      onMouseDown={stopEmbedDrag}
                      onClick={() => {
                        setEditingIndex(index);
                        setEditingDraft(expr);
                      }}
                      data-testid={`wb-graph-expr-display-${index}`}
                    >
                      {expr || "(empty)"}
                    </button>
                    <button
                      type="button"
                      className="wb-graph-expr-btn wb-graph-expr-btn--danger"
                      aria-label={`Remove expression ${index + 1}`}
                      onPointerDown={stopEmbedDrag}
                      onMouseDown={stopEmbedDrag}
                      onClick={() => handleRemove(index)}
                      data-testid={`wb-graph-expr-remove-${index}`}
                    >
                      ×
                    </button>
                  </div>
                )}
                {exprErrors[index] ? (
                  <div
                    className="wb-graph-expr-error"
                    role="alert"
                    data-testid={`wb-graph-expr-error-${index}`}
                  >
                    {exprErrors[index]}
                  </div>
                ) : null}
              </div>
            ))}
            <div className="wb-graph-expr-add">
              <input
                className="wb-graph-expr-input"
                placeholder="e.g. 2*x+1 or 5x"
                value={draftExpr}
                onChange={(e) => setDraftExpr(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddExpression();
                  }
                }}
                data-testid="wb-graph-expr-new"
              />
              <button
                type="button"
                className="wb-graph-expr-btn"
                onPointerDown={stopEmbedDrag}
                onMouseDown={stopEmbedDrag}
                onClick={handleAddExpression}
                data-testid="wb-graph-expr-add"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
      )}
      {!readOnly && (
      <div
        className="wb-graph-nav"
        onPointerDownCapture={stopEmbedDragCapture}
        onMouseDownCapture={stopEmbedDragCapture}
      >
        <div className="wb-graph-nav-zoom">
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handleZoomIn}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Zoom in"
            aria-label="Zoom in"
            data-testid="wb-graph-zoom-in"
          >
            +
          </button>
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handleZoomOut}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Zoom out"
            aria-label="Zoom out"
            data-testid="wb-graph-zoom-out"
          >
            −
          </button>
        </div>
        <div className="wb-graph-nav-pan" role="group" aria-label="Pan graph">
          <span className="wb-graph-nav-pad" aria-hidden />
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handlePanUp}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Pan up"
            aria-label="Pan up"
            data-testid="wb-graph-pan-up"
          >
            ↑
          </button>
          <span className="wb-graph-nav-pad" aria-hidden />
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handlePanLeft}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Pan left"
            aria-label="Pan left"
            data-testid="wb-graph-pan-left"
          >
            ←
          </button>
          <span className="wb-graph-nav-pad wb-graph-nav-pad--center" aria-hidden />
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handlePanRight}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Pan right"
            aria-label="Pan right"
            data-testid="wb-graph-pan-right"
          >
            →
          </button>
          <span className="wb-graph-nav-pad" aria-hidden />
          <button
            type="button"
            className="wb-graph-strip-btn wb-graph-nav-btn"
            onClick={handlePanDown}
            onPointerDown={stopEmbedDrag}
            onMouseDown={stopEmbedDrag}
            title="Pan down"
            aria-label="Pan down"
            data-testid="wb-graph-pan-down"
          >
            ↓
          </button>
          <span className="wb-graph-nav-pad" aria-hidden />
        </div>
      </div>
      )}
    </div>
  );
}
