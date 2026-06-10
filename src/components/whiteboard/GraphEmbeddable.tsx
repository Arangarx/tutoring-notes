"use client";

/**
 * Self-hosted JSXGraph coordinate plane rendered inside an Excalidraw
 * embeddable via the `renderEmbeddable` prop (tutor workspace).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addGraphExpression,
  cloneGraphState,
  parseGraphStateJson,
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
  update: () => void;
  create: (
    type: string,
    parents: unknown[],
    attributes?: Record<string, unknown>
  ) => { id?: string };
  removeObject: (obj: { id?: string }) => void;
  getBoundingBox: () => GraphBbox;
  on: (event: string, handler: () => void) => void;
  off: (event: string, handler: () => void) => void;
};

type Props = {
  element: EmbeddableElementLike;
  excalidrawAPI?: GraphPersistApiLike | null;
};

const JSXGRAPH_CSS_ID = "mynk-jsxgraph-css";
const BBOX_PERSIST_MS = 400;

function ensureJxgStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(JSXGRAPH_CSS_ID)) return;
  const link = document.createElement("link");
  link.id = JSXGRAPH_CSS_ID;
  link.rel = "stylesheet";
  link.href = "/jsxgraph/jsxgraph.css";
  document.head.appendChild(link);
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
    try {
      const obj = board.create("functiongraph", [trimmed], {
        strokeColor: "var(--accent)",
        strokeWidth: 2,
      });
      plotRefs.push(obj);
      errors.push("");
    } catch {
      errors.push("Could not plot this expression.");
    }
  }
  return errors;
}

function mountGraphBoard(
  container: HTMLDivElement,
  graphState: GraphState,
  JXG: { JSXGraph: { initBoard: (...args: unknown[]) => JxgBoard } }
): JxgBoard {
  const bbox = graphState.bbox ?? [-10, 10, 10, -10];
  const board = JXG.JSXGraph.initBoard(container, {
    boundingbox: bbox,
    axis: true,
    grid: true,
    showCopyright: false,
    showNavigation: false,
    pan: { enabled: true },
    zoom: { factor: 1.2 },
    resize: { enabled: true },
    keepaspectratio: false,
  });
  return board;
}

function stopEmbedDrag(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

export function GraphEmbeddable({ element, excalidrawAPI }: Props) {
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

  const elementId = element.id ?? "";

  const persistState = useCallback(
    (state: GraphState) => {
      graphStateRef.current = state;
      if (!excalidrawAPI || !elementId) return;
      persistGraphElementState({
        excalidrawAPI,
        elementId,
        graphState: state,
      });
    },
    [excalidrawAPI, elementId]
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

    let cancelled = false;
    let board: JxgBoard | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      ensureJxgStylesheet();
      const jxgMod = await import("jsxgraph");
      if (cancelled || !hostRef.current) return;

      const JXG = jxgMod.default as unknown as {
        JSXGraph: {
          initBoard: (...args: unknown[]) => JxgBoard;
          freeBoard: (board: JxgBoard) => void;
        };
      };
      board = mountGraphBoard(hostRef.current, initialState, JXG);
      boardRef.current = board;

      const initialExprs = initialState.expressions ?? [];
      const errors = plotExpressions(board, initialExprs, plotRefsRef.current);
      if (!cancelled) setExprErrors(errors);

      const syncSize = () => {
        if (!hostRef.current || !boardRef.current) return;
        const { clientWidth, clientHeight } = hostRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          boardRef.current.resizeContainer(clientWidth, clientHeight, true);
          boardRef.current.update();
        }
      };

      syncSize();
      observer = new ResizeObserver(syncSize);
      observer.observe(hostRef.current);

      const onBboxChange = () => scheduleBboxPersist();
      bboxHandlerRef.current = onBboxChange;
      board.on("up", onBboxChange);
    })();

    return () => {
      cancelled = true;
      if (bboxPersistTimerRef.current) {
        clearTimeout(bboxPersistTimerRef.current);
        bboxPersistTimerRef.current = null;
      }
      observer?.disconnect();
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
    // Board lifecycle follows element identity only — graphStateJson updates from
    // our own persist must not remount JSXGraph (would reset pan/zoom mid-edit).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: element.id only
  }, [element.id, scheduleBboxPersist]);

  const handleAddExpression = () => {
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
    <div className="wb-graph-root" data-wb-graph="true" data-testid="wb-graph-embed-host">
      <div ref={hostRef} className="wb-graph-board-host" />
      <div
        className="wb-graph-expr-panel"
        onPointerDown={stopEmbedDrag}
        onMouseDown={stopEmbedDrag}
      >
        <button
          type="button"
          className="wb-graph-expr-toggle"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          data-testid="wb-graph-expr-toggle"
        >
          ƒ Expressions
          <span aria-hidden>{panelOpen ? "▾" : "▸"}</span>
        </button>
        {panelOpen && (
          <div className="wb-graph-expr-body" data-testid="wb-graph-expr-panel">
            {expressions.length === 0 && (
              <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                Add an expression to plot (e.g. x^2, sin(x)).
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
                placeholder="e.g. 2*x+1"
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
                onClick={handleAddExpression}
                data-testid="wb-graph-expr-add"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
