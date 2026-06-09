"use client";

/**
 * Whiteboard "Insert PDF" toolbar button ΓÇö workbook pages become separate board
 * tabs grouped under the source filename (with Wyzant-style page subset picker).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ModalPortal } from "@/components/ModalPortal";
import {
  ExcalidrawApiLike,
  insertPdfPagesAsBoardPages,
  type InsertPdfBoardPagesIntegrate,
} from "@/lib/whiteboard/insert-asset";
import {
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  isLikelyIOSSafari,
  readPdfFilePageCount,
  renderPdfFileToPngs,
  resolvePdfPagesToRender,
  type PdfRenderProgress,
} from "@/lib/whiteboard/pdf-render";
import {
  formatPdfSelectionPreview,
  parsePdfCustomRanges,
} from "@/lib/whiteboard/pdf-page-selection";
import { WbIconPdf } from "@/components/whiteboard/chrome/wb-icons";

type Props = {
  excalidrawAPI: ExcalidrawApiLike | null;
  whiteboardSessionId: string;
  studentId: string;
  disabled?: boolean;
  integrate: InsertPdfBoardPagesIntegrate;
  /** Icon-only top-bar button matching session shell mock. */
  chrome?: boolean;
};

type DialogState =
  | { kind: "closed" }
  | { kind: "open" }
  | { kind: "inspecting"; file: File }
  | {
      kind: "picking";
      file: File;
      totalPages: number;
      pdfDisplayName: string;
    }
  | { kind: "loading"; message: string }
  | {
      kind: "rendering";
      pageIndex: number;
      totalPages: number;
    }
  | {
      kind: "uploading";
      uploaded: number;
      total: number;
    }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

type PickMode = "all" | "first" | "custom";

const PDF_MIME = "application/pdf";
const ACCEPT_ATTR = PDF_MIME;

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, "").trim() || name || "PDF";
}

export function PdfImageUploadButton({
  excalidrawAPI,
  whiteboardSessionId,
  studentId,
  disabled,
  integrate,
  chrome,
}: Props) {
  const [state, setState] = useState<DialogState>({ kind: "closed" });
  const [pickMode, setPickMode] = useState<PickMode>("all");
  const [firstNPages, setFirstNPages] = useState(1);
  const [customRaw, setCustomRaw] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancellationRef = useRef<{ aborted: boolean }>({ aborted: false });
  // smoke-1 #1: highlighting text in the custom-range field and releasing
  // the mouse outside the input fires `onClick` on the backdrop, dismissing
  // the dialog. Track pointer-down vs up; only close when BOTH occur on
  // the backdrop (real outside-click), not a drag that ended outside.
  const backdropPointerDownTargetRef = useRef<EventTarget | null>(null);

  const showIOSWarning = isLikelyIOSSafari();

  const reset = useCallback(() => {
    cancellationRef.current.aborted = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPickMode("all");
    setFirstNPages(1);
    setCustomRaw("");
  }, []);

  const close = useCallback(() => {
    cancellationRef.current.aborted = true;
    setState({ kind: "closed" });
    reset();
  }, [reset]);

  const pickingDerived = useMemo(() => {
    if (state.kind !== "picking") return null;
    const { totalPages } = state;
    let rawIndices: number[] | undefined;
    let modeTag: string = pickMode;
    if (pickMode === "all") {
      rawIndices = undefined;
      modeTag = "all";
    } else if (pickMode === "first") {
      const n = Math.min(Math.max(1, firstNPages), Math.min(totalPages, PDF_MAX_PAGES));
      rawIndices = Array.from({ length: n }, (_, i) => i + 1);
      modeTag = "first";
    } else {
      const parsed = parsePdfCustomRanges(customRaw, totalPages);
      if (!parsed.ok) {
        return {
          ok: false as const,
          error: parsed.error,
          modeTag,
        };
      }
      rawIndices = parsed.indices;
      modeTag = "custom";
    }

    const planned = resolvePdfPagesToRender({
      totalPagesInPdf: totalPages,
      pageIndices: rawIndices,
    });
    if (!planned.ok) {
      return {
        ok: false as const,
        error: planned.message,
        modeTag,
      };
    }
    return {
      ok: true as const,
      indices: [...planned.indices],
      truncated: planned.truncated,
      count: planned.indices.length,
      preview: formatPdfSelectionPreview(planned.indices),
      modeTag,
    };
  }, [state, pickMode, firstNPages, customRaw]);

  const runRenderAndInsert = useCallback(
    async (
      file: File,
      pageIndices: number[] | undefined,
      modeTag: string,
      selectedCount: number
    ) => {
      if (!excalidrawAPI) return;

      console.info(
        `[whiteboard] wbsid=${whiteboardSessionId} pdf-pick selected=${selectedCount} mode=${modeTag}`
      );

      setState({ kind: "loading", message: "Reading PDFΓÇª" });
      const result = await renderPdfFileToPngs(file, {
        cancellation: cancellationRef.current,
        pageIndices,
        onProgress: (p: PdfRenderProgress) => {
          if (cancellationRef.current.aborted) return;
          if (p.phase === "loading") {
            setState({ kind: "loading", message: "Reading PDFΓÇª" });
          } else if (p.phase === "rendering") {
            setState({
              kind: "rendering",
              pageIndex: p.pageIndex ?? 0,
              totalPages: p.totalPages ?? 0,
            });
          }
        },
      });
      if (!result.ok) {
        setState({ kind: "error", message: result.message });
        return;
      }
      setState({
        kind: "uploading",
        uploaded: 0,
        total: result.pages.length,
      });
      const insertResult = await insertPdfPagesAsBoardPages({
        excalidrawAPI,
        whiteboardSessionId,
        studentId,
        pages: result.pages,
        filename: file.name,
        integrate,
        onProgress: (uploaded, total) => {
          if (cancellationRef.current.aborted) return;
          setState({ kind: "uploading", uploaded, total });
        },
      });
      if (!insertResult.ok) {
        setState({ kind: "error", message: insertResult.message });
        return;
      }
      const truncatedSuffix = result.truncated
        ? ` (first ${result.pages.length} of ${result.totalPagesInPdf} PDF pages)`
        : "";
      setState({
        kind: "success",
        message: `Inserted ${insertResult.pagesInserted} pages as new boards${truncatedSuffix}.`,
      });
      setTimeout(() => {
        setState((current) =>
          current.kind === "success" ? { kind: "closed" } : current
        );
      }, 1800);
    },
    [excalidrawAPI, integrate, studentId, whiteboardSessionId]
  );

  const handleFileChosen = useCallback(
    async (file: File) => {
      if (!excalidrawAPI) {
        setState({
          kind: "error",
          message: "Whiteboard isn't ready yet ΓÇö wait a second and try again.",
        });
        return;
      }
      reset();

      const isPdf =
        file.type === PDF_MIME || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        setState({
          kind: "error",
          message:
            "This chooser is for PDF worksheets only. Use ExcalidrawΓÇÖs image tool in the left toolbar to add a PNG, JPEG, or SVG ΓÇö it uses the same sync path once uploaded.",
        });
        return;
      }

      setState({ kind: "inspecting", file });
      const inspected = await readPdfFilePageCount(file);
      if (!inspected.ok) {
        setState({ kind: "error", message: inspected.message });
        return;
      }
      console.info(
        `[whiteboard] wbsid=${whiteboardSessionId} pdf-inspect totalPages=${inspected.totalPages} filename=${file.name}`
      );
      const tp = inspected.totalPages;
      const cap = Math.min(tp, PDF_MAX_PAGES);
      setFirstNPages(cap);
      setPickMode(tp <= PDF_MAX_PAGES ? "all" : "first");
      setState({
        kind: "picking",
        file,
        totalPages: tp,
        pdfDisplayName: stripPdfExtension(file.name),
      });
    },
    [excalidrawAPI, reset, whiteboardSessionId]
  );

  return (
    <>
      <button
        type="button"
        className={chrome ? "mynk-wb-tb-btn mynk-wb-tb-btn--icon" : "btn"}
        onClick={() => setState({ kind: "open" })}
        disabled={disabled || !excalidrawAPI}
        data-testid="wb-insert-asset-btn"
        title="Insert PDF worksheet"
        aria-label="Insert PDF"
      >
        {chrome ? <WbIconPdf /> : "Insert PDF"}
      </button>

      {state.kind !== "closed" && (
        <ModalPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wb-insert-title"
            style={{
              position: "fixed",
              inset: 0,
              background: "var(--overlay-scrim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
            }}
            onPointerDown={(e) => {
              backdropPointerDownTargetRef.current = e.target;
            }}
            onPointerUp={(e) => {
              const downOnBackdrop =
                backdropPointerDownTargetRef.current === e.currentTarget;
              backdropPointerDownTargetRef.current = null;
              // Both press AND release must land on the backdrop ΓÇö
              // selection drags starting inside the card no longer
              // dismiss the dialog. (smoke-1 #1)
              if (downOnBackdrop && e.target === e.currentTarget) {
                close();
              }
            }}
          >
            <div
              className="card"
              style={{
                maxWidth: 540,
                width: "calc(100% - 32px)",
                padding: 24,
                background: "var(--surface-drawer)",
                border: "1px solid var(--border)",
                display: "grid",
                gap: 12,
              }}
              data-testid="wb-insert-dialog"
            >
              <h3 id="wb-insert-title" style={{ marginTop: 0 }}>
                Insert PDF
              </h3>
              <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                PDFs render as one image per board page (up to{" "}
                <strong>{PDF_MAX_PAGES} pages</strong> per import). Pick which
                pages to include below; each page becomes its own tab, grouped
                under this file. For single images, use ExcalidrawΓÇÖs built-in
                image tool ΓÇö live sync matches after upload.
              </p>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                Maximum file size: <strong>{fmtBytes(PDF_MAX_BYTES)}</strong>.
                File type: <strong>PDF</strong> only in this dialog.
              </p>

              {showIOSWarning && (
                <div
                  role="note"
                  style={{
                    fontSize: 13,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--warning-soft)",
                    border: "1px solid var(--warning-border)",
                  }}
                >
                  <strong>iPhone/iPad note:</strong> Safari on iOS limits memory
                  per tab. Long colour PDFs may exhaust memory mid-render ΓÇö pick
                  a subset of pages when you can.
                </div>
              )}

              {state.kind === "open" && (
                <div
                  className="row"
                  style={{ gap: 8, justifyContent: "flex-end" }}
                >
                  <button type="button" className="btn" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="wb-insert-pick-file"
                  >
                    Choose fileΓÇª
                  </button>
                </div>
              )}

              {state.kind === "inspecting" && (
                <p className="muted" style={{ margin: 0 }}>
                  Inspecting PDFΓÇª
                </p>
              )}

              {state.kind === "picking" && pickingDerived && (
                <PdfPickerPanel
                  pdfDisplayName={state.pdfDisplayName}
                  totalPages={state.totalPages}
                  pickMode={pickMode}
                  setPickMode={setPickMode}
                  firstNPages={firstNPages}
                  setFirstNPages={setFirstNPages}
                  customRaw={customRaw}
                  setCustomRaw={setCustomRaw}
                  pickingDerived={pickingDerived}
                  onBack={() => {
                    reset();
                    setState({ kind: "open" });
                  }}
                  onCancel={close}
                  onContinue={() => {
                    if (!pickingDerived.ok || state.kind !== "picking") return;
                    const idxArg =
                      pickMode === "all" && state.totalPages <= PDF_MAX_PAGES
                        ? undefined
                        : pickingDerived.indices;
                    void runRenderAndInsert(
                      state.file,
                      idxArg,
                      pickingDerived.modeTag,
                      pickingDerived.count
                    );
                  }}
                />
              )}

              {(state.kind === "loading" ||
                state.kind === "rendering" ||
                state.kind === "uploading") && (
                <ProgressStrip state={state} />
              )}

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
                  {state.message}
                </div>
              )}

              {(state.kind === "error" || state.kind === "success") && (
                <div
                  className="row"
                  style={{ gap: 8, justifyContent: "flex-end" }}
                >
                  {state.kind === "error" && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setState({ kind: "open" })}
                    >
                      Try another file
                    </button>
                  )}
                  <button type="button" className="btn" onClick={close}>
                    Close
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleFileChosen(file);
                  }
                }}
                data-testid="wb-insert-file-input"
              />
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

function PdfPickerPanel(props: {
  pdfDisplayName: string;
  totalPages: number;
  pickMode: PickMode;
  setPickMode: (m: PickMode) => void;
  firstNPages: number;
  setFirstNPages: (n: number) => void;
  customRaw: string;
  setCustomRaw: (s: string) => void;
  pickingDerived:
    | { ok: true; count: number; preview: string; truncated: boolean }
    | { ok: false; error: string };
  onBack: () => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const {
    pdfDisplayName,
    totalPages,
    pickMode,
    setPickMode,
    firstNPages,
    setFirstNPages,
    customRaw,
    setCustomRaw,
    pickingDerived,
    onBack,
    onCancel,
    onContinue,
  } = props;

  const allDisabled = totalPages > PDF_MAX_PAGES;
  const continueDisabled = !pickingDerived.ok;
  const maxFirst = Math.min(totalPages, PDF_MAX_PAGES);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        {pdfDisplayName} ┬╖ {totalPages} pages
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="radio"
          name="pdf-pick-mode"
          checked={pickMode === "all"}
          disabled={allDisabled}
          onChange={() => setPickMode("all")}
        />
        <span>
          All pages
          {allDisabled && (
            <span className="muted" style={{ marginLeft: 6 }}>
              (PDF has more than {PDF_MAX_PAGES} pages ΓÇö pick a range)
            </span>
          )}
        </span>
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="radio"
          name="pdf-pick-mode"
          checked={pickMode === "first"}
          onChange={() => setPickMode("first")}
        />
        <span>First</span>
        <input
          type="number"
          min={1}
          max={maxFirst}
          value={firstNPages}
          disabled={pickMode !== "first"}
          onChange={(e) =>
            setFirstNPages(
              Math.min(
                maxFirst,
                Math.max(1, Number.parseInt(e.target.value || "1", 10) || 1)
              )
            )
          }
          // smoke-1 S1: select-on-focus so tutors can just type the new
          // value rather than backspacing through the prefilled default.
          onFocus={(e) => e.currentTarget.select()}
          style={{ width: 72 }}
        />
        <span className="muted">pages</span>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="radio"
            name="pdf-pick-mode"
            checked={pickMode === "custom"}
            onChange={() => setPickMode("custom")}
          />
          <span>Custom range</span>
        </span>
        <input
          type="text"
          placeholder="e.g. 1-5,8,10-12"
          value={customRaw}
          disabled={pickMode !== "custom"}
          onChange={(e) => setCustomRaw(e.target.value)}
          style={{
            marginLeft: 28,
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-overlay)",
            color: "inherit",
          }}
        />
      </label>

      {pickingDerived.ok ? (
        <>
          <p style={{ margin: 0, fontSize: 13 }} data-testid="wb-pdf-pick-preview">
            Will import: {pickingDerived.count} pages (page{" "}
            {pickingDerived.preview})
          </p>
          {pickingDerived.truncated && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Only first {PDF_MAX_PAGES} pages will be imported.
            </p>
          )}
        </>
      ) : (
        <p
          role="alert"
          style={{ margin: 0, fontSize: 13, color: "var(--error)" }}
          data-testid="wb-pdf-pick-error"
        >
          {pickingDerived.error}
        </p>
      )}

      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn primary"
          data-testid="wb-pdf-pick-continue"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function ProgressStrip({ state }: { state: DialogState }) {
  let label = "";
  let percent = 0;
  if (state.kind === "loading") {
    label = state.message;
    percent = 5;
  } else if (state.kind === "rendering") {
    label = `Rendering page ${state.pageIndex} of ${state.totalPages}ΓÇª`;
    percent =
      state.totalPages > 0
        ? Math.min(95, Math.round((state.pageIndex / state.totalPages) * 95))
        : 5;
  } else if (state.kind === "uploading") {
    label = `Uploading page ${state.uploaded} of ${state.total}ΓÇª`;
    percent =
      state.total > 0
        ? Math.round((state.uploaded / state.total) * 100)
        : 0;
  }
  return (
    <div data-testid="wb-insert-progress" style={{ display: "grid", gap: 6 }}>
      <div style={{ fontSize: 13 }}>{label}</div>
      <div
        aria-hidden="true"
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--badge-neutral-bg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: "100%",
            background: "var(--info)",
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}
