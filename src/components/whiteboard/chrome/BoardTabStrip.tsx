"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { PageStripRow } from "@/components/whiteboard/PageStrip";
import { isPdfBoardSection } from "@/lib/whiteboard/page-strip-pdf";
import { WbIconPdf } from "@/components/whiteboard/chrome/wb-icons";
import { Button } from "@/components/ui/button";

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

type ScrollState = {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

function readScrollState(el: HTMLElement): ScrollState {
  const hasOverflow = el.scrollWidth > el.clientWidth + 1;
  if (!hasOverflow) {
    return { hasOverflow: false, canScrollLeft: false, canScrollRight: false };
  }
  return {
    hasOverflow: true,
    canScrollLeft: el.scrollLeft > 1,
    canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  };
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollState, setScrollState] = useState<ScrollState>({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const canDelete = !readOnly && pageList.length > 1 && !!onDeletePage;
  const tabDisabled = disabled || readOnly;

  const refreshScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollState(readScrollState(el));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    refreshScrollState();

    const onScroll = () => refreshScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => refreshScrollState());
      ro.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [pageList.length, refreshScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const activeWrap = el.querySelector<HTMLElement>(".mynk-wb-board-tab-wrap--active");
    if (activeWrap && typeof activeWrap.scrollIntoView === "function") {
      activeWrap.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }
    refreshScrollState();
  }, [activePageId, pageList.length, refreshScrollState]);

  const scrollByPage = useCallback((direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = direction * Math.max(el.clientWidth * 0.75, 80);
    el.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  return (
    <div className="mynk-wb-board-tabs-outer" data-testid={testId}>
      {scrollState.hasOverflow && scrollState.canScrollLeft ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mynk-wb-board-tabs-scroll mynk-wb-board-tabs-scroll--left"
          aria-label="Scroll board tabs left"
          data-testid="wb-board-tabs-scroll-left"
          disabled={disabled}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
      ) : null}
      <div
        ref={scrollRef}
        className="mynk-wb-board-tabs"
        role="tablist"
        aria-label="Boards"
      >
        {pageList.map((page, index) => {
          const boardLabel = `Board ${index + 1}`;
          const isPdf = page.isPdf ?? isPdfBoardSection(page.section);
          const active = page.id === activePageId;
          const confirming = confirmDeleteId === page.id;
          const tabClassName = `mynk-wb-board-tab${active ? " mynk-wb-board-tab--active" : ""}${readOnly && !active ? " mynk-wb-board-tab--read-only-inactive" : ""}${readOnly && active ? " mynk-wb-board-tab--read-only-active" : ""}`;
          return (
            <div
              key={page.id}
              className={`mynk-wb-board-tab-wrap${active ? " mynk-wb-board-tab-wrap--active" : ""}${!canDelete ? " mynk-wb-board-tab-wrap--no-delete" : ""}${readOnly ? " mynk-wb-board-tab-wrap--read-only" : ""}`}
            >
              {readOnly ? (
                <span
                  role="tab"
                  className={tabClassName}
                  aria-selected={active}
                  aria-current={active ? "page" : undefined}
                  aria-label={boardLabel}
                  aria-disabled="true"
                >
                  {active && <span className="mynk-wb-board-tab__dot" aria-hidden />}
                  {isPdf && (
                    <span className="mynk-wb-board-tab__pdf-icon" aria-hidden>
                      <WbIconPdf size={12} />
                    </span>
                  )}
                  {boardLabel}
                </span>
              ) : (
                <button
                  type="button"
                  role="tab"
                  className={tabClassName}
                  aria-selected={active}
                  aria-label={boardLabel}
                  disabled={tabDisabled || active}
                  onClick={() => {
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
              )}
              {canDelete &&
                (confirming ? (
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
                ))}
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
      {scrollState.hasOverflow && scrollState.canScrollRight ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="mynk-wb-board-tabs-scroll mynk-wb-board-tabs-scroll--right"
          aria-label="Scroll board tabs right"
          data-testid="wb-board-tabs-scroll-right"
          disabled={disabled}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
