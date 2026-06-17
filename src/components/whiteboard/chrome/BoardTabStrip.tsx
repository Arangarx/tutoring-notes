"use client";

import { useState } from "react";
import type { PageStripRow } from "@/components/whiteboard/PageStrip";
import { isPdfBoardSection } from "@/lib/whiteboard/page-strip-pdf";
import { WbIconPdf } from "@/components/whiteboard/chrome/wb-icons";

export type BoardTabStripProps = {
  pageList: PageStripRow[];
  activePageId: string;
  disabled?: boolean;
  /** When true, tabs are display-only (student read-only page indicator). */
  readOnly?: boolean;
  maxPages?: number;
  onSelectPage?: (id: string) => void | Promise<void>;
  onAddPage?: () => void;
  onDeletePage?: (id: string) => void;
  testId?: string;
};

/** SR-14 — Chrome/Google-Sheets-style board tabs; user-facing "Board N". */
export function BoardTabStrip({
  pageList,
  activePageId,
  disabled,
  readOnly,
  maxPages = 20,
  onSelectPage,
  onAddPage,
  onDeletePage,
  testId = "wb-tutor-page-strip",
}: BoardTabStripProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const canDelete = !readOnly && pageList.length > 1 && !!onDeletePage;
  const tabDisabled = disabled || readOnly;

  return (
    <div className="mynk-wb-board-tabs" data-testid={testId} role="tablist" aria-label="Boards">
      {pageList.map((page, index) => {
        const boardLabel = `Board ${index + 1}`;
        const isPdf = page.isPdf ?? isPdfBoardSection(page.section);
        const active = page.id === activePageId;
        const confirming = confirmDeleteId === page.id;
        return (
          <div
            key={page.id}
            className={`mynk-wb-board-tab-wrap${active ? " mynk-wb-board-tab-wrap--active" : ""}${!canDelete ? " mynk-wb-board-tab-wrap--no-delete" : ""}`}
          >
            <button
              type="button"
              role="tab"
              className={`mynk-wb-board-tab${active ? " mynk-wb-board-tab--active" : ""}`}
              aria-selected={active}
              aria-label={boardLabel}
              disabled={tabDisabled || active}
              onClick={() => {
                if (readOnly) return;
                if (!active && onSelectPage) void onSelectPage(page.id);
                setConfirmDeleteId(null);
              }}
            >
              {active && <span className="mynk-wb-board-tab__dot" aria-hidden />}
              {isPdf && (
                <span className="mynk-wb-board-tab__pdf-icon" aria-hidden>
                  <WbIconPdf size={12} />
                </span>
              )}
              {boardLabel}
            </button>
            {canDelete && (
              confirming ? (
                <>
                  <button
                    type="button"
                    className="mynk-wb-board-tab-del mynk-wb-board-tab-del--confirm"
                    title={`Confirm delete ${boardLabel}`}
                    aria-label={`Confirm delete ${boardLabel}`}
                    data-testid={`wb-board-delete-confirm-${index}`}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePage(page.id);
                      setConfirmDeleteId(null);
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="mynk-wb-board-tab-del mynk-wb-board-tab-del--cancel"
                    title="Cancel"
                    aria-label="Cancel delete"
                    data-testid={`wb-board-delete-cancel-${index}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(null);
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="mynk-wb-board-tab-del"
                  title={`Delete ${boardLabel}`}
                  aria-label={`Delete ${boardLabel}`}
                  data-testid={`wb-board-delete-${index}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(page.id);
                  }}
                >
                  &times;
                </button>
              )
            )}
          </div>
        );
      })}
      {!readOnly && onAddPage && (
        <button
          type="button"
          className="mynk-wb-board-tab mynk-wb-board-tab--add"
          title="Add board"
          aria-label="Add board"
          disabled={disabled || pageList.length >= maxPages}
          onClick={onAddPage}
        >
          +
        </button>
      )}
    </div>
  );
}
