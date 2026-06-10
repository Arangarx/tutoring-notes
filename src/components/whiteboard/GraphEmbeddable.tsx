"use client";

/**
 * Self-hosted JSXGraph coordinate plane rendered inside an Excalidraw
 * embeddable via the `renderEmbeddable` prop (tutor workspace Phase 1).
 */

import { useEffect, useRef } from "react";
import {
  extractGraphStateFromElement,
  parseGraphStateJson,
  type GraphState,
} from "@/lib/whiteboard/graph-state";

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
  ) => unknown;
};

type Props = {
  element: EmbeddableElementLike;
};

const JSXGRAPH_CSS_ID = "mynk-jsxgraph-css";

function ensureJxgStylesheet(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(JSXGRAPH_CSS_ID)) return;
  const link = document.createElement("link");
  link.id = JSXGRAPH_CSS_ID;
  link.rel = "stylesheet";
  link.href = "/jsxgraph/jsxgraph.css";
  document.head.appendChild(link);
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

  const expressions = graphState.expressions ?? [];
  for (const expr of expressions) {
    const trimmed = expr.trim();
    if (!trimmed) continue;
    try {
      board.create(
        "functiongraph",
        [trimmed],
        { strokeColor: "var(--accent)", strokeWidth: 2 }
      );
    } catch {
      // Phase 1: skip expressions the parser cannot plot.
    }
  }

  // TODO Phase 2: write state back — persist bbox + expressions to
  // element.customData.graphStateJson on pan/zoom/edit.

  return board;
}

export function GraphEmbeddable({ element }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<JxgBoard | null>(null);
  const graphStateJson =
    typeof element.customData?.graphStateJson === "string"
      ? element.customData.graphStateJson
      : JSON.stringify(extractGraphStateFromElement(element));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const graphState = parseGraphStateJson(graphStateJson);
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
      board = mountGraphBoard(hostRef.current, graphState, JXG);
      boardRef.current = board;

      const syncSize = () => {
        if (!hostRef.current || !boardRef.current) return;
        const { clientWidth, clientHeight } = hostRef.current;
        if (clientWidth > 0 && clientHeight > 0) {
          boardRef.current.resizeContainer(clientWidth, clientHeight);
          boardRef.current.update();
        }
      };

      syncSize();
      observer = new ResizeObserver(syncSize);
      observer.observe(hostRef.current);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
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
    };
  }, [element.id, graphStateJson]);

  return (
    <div
      ref={hostRef}
      data-testid="wb-graph-embed-host"
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--surface-base)",
        touchAction: "none",
      }}
    />
  );
}
