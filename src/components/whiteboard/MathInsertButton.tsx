"use client";

/**
 * Whiteboard "Insert math" toolbar button + dialog.
 *
 * Flow:
 *
 *   1. Tutor clicks "Insert math" — a modal opens with a MathLive
 *      `<math-field>` (WYSIWYG LaTeX editor).
 *   2. The tutor types/pastes their equation. The dialog also shows
 *      the raw LaTeX in a small read-only field for copy-out.
 *   3. On Insert, we hand the LaTeX to `renderLatexToSvg` (MathJax
 *      via the lite adaptor), upload the SVG asset, register it with
 *      Excalidraw, and drop an image element on the canvas.
 *   4. The image element carries `customData.latex` so the AI note
 *      pipeline + replay both see the original source.
 *
 * MathLive notes:
 *
 *   - We import the `mathlive` package dynamically from `useEffect`.
 *     The package self-registers a `<math-field>` custom element on
 *     window.customElements; we wait for that registration before
 *     mounting the field. Without the wait, React hydrates the
 *     element when it's still an HTMLUnknownElement and value
 *     reads come back empty.
 *   - The MathLive bundle is large (~1MB raw); dynamic-importing it
 *     keeps the workspace shell instant for sessions that never
 *     open the math dialog.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import {
  getInsertCenter,
  insertMathSvgOnCanvas,
  type ExcalidrawApiLike,
} from "@/lib/whiteboard/insert-asset";

/**
 * Client-side wrapper for the `/api/whiteboard/[sessionId]/math/render`
 * route. Replaces the previous direct dynamic import of
 * `@/lib/whiteboard/math-render`, which forced webpack to ship
 * `mathjax-full` (CommonJS) into the browser bundle and threw
 * "require is not defined" on Insert.
 *
 * Returns the same shape the lib helper used to return so the
 * downstream `insertMathSvgOnCanvas` call sees no contract change.
 */
type RenderMathSvgClientResult =
  | {
      ok: true;
      svgBlob: Blob;
      widthPx: number;
      heightPx: number;
    }
  | { ok: false; reason: string };

async function renderLatexToSvgViaRoute(
  whiteboardSessionId: string,
  latex: string,
  displayMode: boolean
): Promise<RenderMathSvgClientResult> {
  let res: Response;
  try {
    res = await fetch(
      `/api/whiteboard/${encodeURIComponent(whiteboardSessionId)}/math/render`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ latex, displayMode }),
      }
    );
  } catch (err) {
    return {
      ok: false,
      reason: `Could not reach the math renderer: ${(err as Error).message}`,
    };
  }
  // 401 / 404 / 5xx — bubble a friendly message; the route returns
  // 200 with `{ ok: false, reason }` for "expected" rejections like
  // empty / oversized input, so any non-200 here is a real failure.
  if (!res.ok) {
    return {
      ok: false,
      reason: `Math renderer failed (HTTP ${res.status}).`,
    };
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, reason: "Math renderer returned malformed JSON." };
  }
  const p = payload as
    | { ok: true; svg: string; widthPx: number; heightPx: number }
    | { ok: false; reason: string }
    | undefined;
  if (!p || typeof p !== "object") {
    return { ok: false, reason: "Math renderer returned an empty response." };
  }
  if (p.ok === false) {
    return { ok: false, reason: p.reason || "Could not render equation." };
  }
  if (!p.ok || typeof p.svg !== "string") {
    return { ok: false, reason: "Math renderer returned an invalid SVG." };
  }
  return {
    ok: true,
    svgBlob: new Blob([p.svg], { type: "image/svg+xml" }),
    widthPx: p.widthPx,
    heightPx: p.heightPx,
  };
}

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  disabled?: boolean;
  /** Compact top-bar treatment — ∑ glyph per session shell mock. */
  chrome?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "rendering" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export function MathInsertButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
  chrome,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const [latex, setLatex] = useState<string>("");
  const [mathLiveReady, setMathLiveReady] = useState(false);
  /** Bumps once per open transition so each dialog open gets a fresh <math-field>. */
  const [openCount, setOpenCount] = useState(0);
  /** True once the portal host div is attached — gates field mount on every open. */
  const [hostReady, setHostReady] = useState(false);
  const fieldHostRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLElement | null>(null);

  const fieldHostCallbackRef = useCallback((node: HTMLDivElement | null) => {
    fieldHostRef.current = node;
    setHostReady(node !== null);
  }, []);

  // True whenever the dialog is visible (open / rendering / error / success).
  // Used as a deps primitive so the field-mount effect only fires when the
  // dialog actually opens or closes — NOT on every internal state transition
  // (open → rendering → success), which would needlessly tear-down and
  // recreate the MathLive custom element and corrupt its singleton keyboard.
  const dialogIsOpen = state.kind !== "closed";

  useEffect(() => {
    if (!dialogIsOpen) setHostReady(false);
  }, [dialogIsOpen]);

  // Lazy-load MathLive when the dialog first opens. Subsequent opens
  // reuse the registered custom element.
  useEffect(() => {
    if (!dialogIsOpen) return;
    if (mathLiveReady) return;
    let cancelled = false;
    void (async () => {
      try {
        const mod = await import("mathlive");
        if (typeof window === "undefined") return;
        // Point mathlive at our self-hosted KaTeX woff2 files served
        // under `public/mathlive-fonts/` (Next serves `public/` at the
        // site root). History:
        //   - mathlive 0.109 ships with the static initializer
        //     `_MathfieldElement._fontsDirectory = "./fonts/"`, so the
        //     fonts would be requested at the page-relative path the
        //     workspace happens to render from — which on Vercel ends
        //     up at `/_next/static/chunks/fonts/KaTeX_*.woff2` (404s,
        //     Next never copies the woff2 files there).
        //   - Smoke-3 attempted a guard `if (!Mf.fontsDirectory)` to
        //     fall back to a jsDelivr CDN; the guard was always false
        //     because the default `"./fonts/"` is truthy, so the CDN
        //     URL was never applied.
        //   - Smoke-4 found that the jsDelivr CDN was unreachable from
        //     Andrew's network (DNS instability that also hit
        //     `github.com` and `wb-mortensen.fly.dev`). Self-hosting
        //     removes the third-party dep entirely — the fonts ship
        //     in `public/mathlive-fonts/` and are served by the same
        //     origin as the app, so they cannot fail independently.
        // CSP `font-src 'self' data: blob: https:` already permits
        // same-origin fonts; no middleware change required.
        const Mf = (
          mod as unknown as {
            MathfieldElement?: { fontsDirectory?: string };
          }
        ).MathfieldElement;
        if (Mf) {
          Mf.fontsDirectory = "/mathlive-fonts/";
        }
        // mathlive 0.109 registers the element synchronously on
        // import, but on slower devices the registration callback
        // can land in a microtask — wait for `customElements.get`
        // to confirm before marking ready.
        if (!window.customElements?.get("math-field")) {
          await new Promise<void>((resolve) => {
            const onDef = () => {
              if (window.customElements?.get("math-field")) resolve();
            };
            // whenDefined returns a promise that resolves when
            // the element is defined.
            window.customElements
              ?.whenDefined("math-field")
              .then(onDef, onDef);
          });
        }
        if (!cancelled) setMathLiveReady(true);
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: `Could not load the math editor: ${(err as Error).message}`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialogIsOpen, mathLiveReady]);

  // Mount the <math-field> after MathLive registers — we create the
  // element imperatively because React's JSX type checker doesn't
  // know about it without a global declaration, and the value-binding
  // story is cleaner via the imperative API anyway.
  //
  // `openCount` increments only on closed→open (button click), not on
  // internal transitions (open→rendering→success), so the field stays
  // mounted while the dialog is visible. On each new open, a fresh
  // <math-field> runs full connectedCallback init and can reclaim
  // MathLive's singleton virtual keyboard (dead on second open without
  // this remount + defensive keyboard hide on teardown).
  useEffect(() => {
    if (!mathLiveReady) return;
    if (!dialogIsOpen) return;
    if (!hostReady) return;
    const host = fieldHostRef.current;
    if (!host) return;
    const field = document.createElement("math-field");
    field.setAttribute("style", "min-height: 60px; font-size: 22px; width: 100%;");
    field.setAttribute("aria-label", "Equation editor");
    if (latex) field.setAttribute("value", latex);
    host.appendChild(field);
    try {
      window.customElements?.upgrade?.(field);
    } catch {
      // ignore — upgrade is belt-and-suspenders after append
    }
    fieldRef.current = field;
    const onInput = () => {
      const v = (field as unknown as { value?: string }).value ?? "";
      setLatex(v);
    };
    field.addEventListener("input", onInput);
    // Move focus into the field so the tutor can start typing.
    requestAnimationFrame(() => {
      try {
        (field as unknown as { focus?: () => void }).focus?.();
      } catch {
        // ignore
      }
    });
    return () => {
      field.removeEventListener("input", onInput);
      try {
        (
          window as unknown as { mathVirtualKeyboard?: { hide?: () => void } }
        ).mathVirtualKeyboard?.hide?.();
      } catch {
        // ignore
      }
      if (host.contains(field)) host.removeChild(field);
      if (fieldRef.current === field) fieldRef.current = null;
    };
    // We intentionally exclude `latex` from the deps: re-mounting on
    // every keystroke would steal focus + lose cursor position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathLiveReady, dialogIsOpen, openCount, hostReady]);

  const close = useCallback(() => {
    setState({ kind: "closed" });
    setLatex("");
    if (fieldHostRef.current) fieldHostRef.current.innerHTML = "";
    fieldRef.current = null;
  }, []);

  const handleInsert = useCallback(async () => {
    if (!excalidrawAPI) {
      setState({ kind: "error", message: "Whiteboard isn't ready yet." });
      return;
    }
    const trimmed = latex.trim();
    if (!trimmed) {
      setState({ kind: "error", message: "Equation is empty." });
      return;
    }
    // Snapshot viewport center before any async work — live-sync updateScene
    // during render/upload can clobber scrollX/scrollY (PDF boards especially).
    const insertCenter = getInsertCenter(excalidrawAPI);
    setState({ kind: "rendering" });
    const render = await renderLatexToSvgViaRoute(
      whiteboardSessionId,
      trimmed,
      true
    );
    if (!render.ok) {
      setState({ kind: "error", message: render.reason });
      return;
    }
    const inserted = await insertMathSvgOnCanvas({
      excalidrawAPI,
      whiteboardSessionId,
      studentId,
      svgBlob: render.svgBlob,
      widthPx: render.widthPx,
      heightPx: render.heightPx,
      latex: trimmed,
      insertCenter,
    });
    if (!inserted.ok) {
      setState({ kind: "error", message: inserted.reason });
      return;
    }
    setState({ kind: "success" });
    setTimeout(() => {
      setState((curr) => (curr.kind === "success" ? { kind: "closed" } : curr));
      setLatex("");
      if (fieldHostRef.current) fieldHostRef.current.innerHTML = "";
      fieldRef.current = null;
    }, 800);
  }, [excalidrawAPI, latex, studentId, whiteboardSessionId]);

  return (
    <>
      <button
        type="button"
        className={chrome ? "mynk-wb-tb-btn" : "btn"}
        onClick={() => {
          setOpenCount((c) => c + 1);
          setState({ kind: "open" });
        }}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-math-btn"
        title="Insert math equation"
        aria-label="Insert math equation"
      >
        {chrome ? "∑" : "Insert math"}
      </button>

      {state.kind !== "closed" && (
        <ModalPortal>
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-math-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--overlay-scrim)",
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
              maxWidth: 620,
              width: "calc(100% - 32px)",
              padding: 24,
              // Solid dark surface — the math field below keeps a white
              // background of its own so equations stay dark-on-white.
              background: "var(--surface-drawer)",
              border: "1px solid var(--border)",
              display: "grid",
              gap: 12,
            }}
            data-testid="wb-math-dialog"
          >
            <h3 id="wb-math-title" style={{ marginTop: 0 }}>
              Insert math equation
            </h3>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              Type or paste an equation in LaTeX or use the on-screen
              keyboard. The equation is added to the canvas as an
              image; the LaTeX source is preserved for AI notes.
            </p>

            {!mathLiveReady && state.kind !== "error" && (
              <div className="muted" style={{ fontSize: 13 }}>
                Loading math editor…
              </div>
            )}

            <div
              ref={fieldHostCallbackRef}
              style={{
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: 8,
                minHeight: 80,
                background: "white",
              }}
              data-testid="wb-math-field-host"
            />

            <details>
              <summary style={{ cursor: "pointer", fontSize: 13 }}>
                LaTeX source
              </summary>
              <textarea
                value={latex}
                onChange={(e) => {
                  const v = e.target.value;
                  setLatex(v);
                  if (fieldRef.current) {
                    (fieldRef.current as unknown as { value?: string }).value =
                      v;
                  }
                }}
                rows={3}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  fontSize: 13,
                  marginTop: 6,
                }}
                data-testid="wb-math-latex-input"
                placeholder="\\frac{a}{b} = c"
              />
            </details>

            {state.kind === "error" && (
              <div
                role="alert"
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--error-soft)",
                  border: "1px solid var(--error-border)",
                }}
              >
                {state.message}
              </div>
            )}

            {state.kind === "success" && (
              <div
                role="status"
                style={{
                  fontSize: 14,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "var(--success-soft)",
                  border: "1px solid var(--success-border)",
                }}
              >
                Equation inserted.
              </div>
            )}

            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleInsert}
                disabled={state.kind === "rendering" || !latex.trim()}
                data-testid="wb-math-insert-btn"
              >
                {state.kind === "rendering" ? "Rendering…" : "Insert"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
