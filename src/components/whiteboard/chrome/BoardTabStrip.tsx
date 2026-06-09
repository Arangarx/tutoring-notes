"use client";

import type { PageStripRow } from "@/components/whiteboard/PageStrip";

export type BoardTabStripProps = {
  pageList: PageStripRow[];
  activePageId: string;
  disabled?: boolean;
  maxPages?: number;
  onSelectPage?: (id: string) => void | Promise<void>;
  onAddPage?: () => void;
  testId?: string;
};

/** SR-14 ΓÇö Chrome/Google-Sheets-style board tabs; user-facing "Board N". */
export function BoardTabStrip({
  pageList,
  activePageId,
  disabled,
  maxPages = 20,
  onSelectPage,
  onAddPage,
  testId = "wb-tutor-page-strip",
}: BoardTabStripProps) {
  return (
    <div className="mynk-wb-board-tabs" data-testid={testId} role="tablist" aria-label="Boards">
      {pageList.map((page, index) => {
        const boardLabel = `Board ${index + 1}`;
        const active = page.id === activePageId;
        return (
          <button
            key={page.id}
            type="button"
            role="tab"
            className={`mynk-wb-board-tab${active ? " mynk-wb-board-tab--active" : ""}`}
            aria-selected={active}
            aria-label={boardLabel}
            disabled={disabled || active}
            onClick={() => {
              if (!active && onSelectPage) void onSelectPage(page.id);
            }}
          >
            {active && <span className="mynk-wb-board-tab__dot" aria-hidden />}
            {boardLabel}
          </button>
        );
      })}
      {onAddPage && (
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
