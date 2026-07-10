"use client";

/**
 * Toolbar button + dialog for inserting a self-hosted JSXGraph embed
 * into the live whiteboard (tutor workspace).
 */

import { useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import { WbIconGraph } from "@/components/whiteboard/chrome/wb-icons";
import {
  insertGraphOnCanvas,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  disabled?: boolean;
  chrome?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open"; mode: "blank" | "expr"; expression: string; error: string | null };

export function GraphInsertButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
  chrome,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dialogMode = state.kind === "open" ? state.mode : null;

  useEffect(() => {
    if (dialogMode === "expr") {
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [dialogMode]);

  function open(mode: "blank" | "expr") {
    setState({ kind: "open", mode, expression: "", error: null });
  }

  function close() {
    setState({ kind: "closed" });
  }

  function handleInsertBlank() {
    if (!excalidrawAPI) return;
    const result = insertGraphOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
    });
    if (!result.ok) {
      setState({
        kind: "open",
        mode: "blank",
        expression: "",
        error: result.reason,
      });
      return;
    }
    close();
  }

  function handleInsertWithExpression() {
    if (state.kind !== "open" || state.mode !== "expr") return;
    if (!excalidrawAPI) return;
    const expr = state.expression.trim();
    if (!expr) {
      setState({ ...state, error: "Enter an expression to plot." });
      return;
    }
    const result = insertGraphOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
      initialExpressions: [expr],
    });
    if (!result.ok) {
      setState({ ...state, error: result.reason });
      return;
    }
    close();
  }

  return (
    <>
      <button
        type="button"
        className={chrome ? "mynk-wb-tb-btn mynk-wb-tb-btn--icon" : "btn"}
        onClick={() => open("blank")}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-graph"
        title="Insert graph"
        aria-label="Insert graph"
      >
        {chrome ? <WbIconGraph /> : "Insert graph"}
      </button>

      {state.kind === "open" && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wb-graph-dialog-title"
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--surface-overlay)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              className="card"
              style={{
                width: "min(520px, 92vw)",
                padding: 20,
                background: "var(--surface-drawer)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 id="wb-graph-dialog-title" style={{ margin: 0, fontSize: 16 }}>
                  Insert a graph
                </h3>
                <button
                  type="button"
                  className="btn"
                  onClick={close}
                  aria-label="Close"
                  style={{ padding: "2px 10px" }}
                >
                  ×
                </button>
              </div>

              <div className="row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className={state.mode === "blank" ? "btn primary" : "btn"}
                  onClick={() => setState({ ...state, mode: "blank", error: null })}
                  data-testid="wb-graph-mode-blank"
                >
                  New blank graph
                </button>
                <button
                  type="button"
                  className={state.mode === "expr" ? "btn primary" : "btn"}
                  onClick={() => setState({ ...state, mode: "expr", error: null })}
                >
                  Plot expression
                </button>
              </div>

              {state.mode === "blank" && (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  Inserts a coordinate plane with labeled axes. Pan and zoom
                  with the graph controls; add expressions via Plot expression.
                </p>
              )}

              {state.mode === "expr" && (
                <div style={{ display: "grid", gap: 8 }}>
                  <label htmlFor="wb-graph-expr" style={{ fontSize: 13, fontWeight: 600 }}>
                    Expression
                  </label>
                  <input
                    ref={inputRef}
                    id="wb-graph-expr"
                    type="text"
                    value={state.expression}
                    onChange={(e) =>
                      setState({ ...state, expression: e.target.value, error: null })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleInsertWithExpression();
                      }
                    }}
                    placeholder="e.g. x^2, sin(x)"
                    style={{
                      padding: "8px 10px",
                      border: "1px solid var(--border-default)",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                    data-testid="wb-graph-expr-input"
                  />
                  <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                    Uses standard function notation (x as the variable).
                  </p>
                </div>
              )}

              {state.error && (
                <div
                  role="alert"
                  style={{
                    background: "var(--error-soft)",
                    border: "1px solid var(--error-border)",
                    borderRadius: 6,
                    padding: "8px 10px",
                    fontSize: 13,
                    color: "var(--sign-out)",
                  }}
                >
                  {state.error}
                </div>
              )}

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={
                    state.mode === "blank" ? handleInsertBlank : handleInsertWithExpression
                  }
                  data-testid="wb-graph-insert"
                >
                  Insert
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
