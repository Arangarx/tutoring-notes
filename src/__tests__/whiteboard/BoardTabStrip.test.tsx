/**
 * @jest-environment jsdom
 */

import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";

const pages = [
  { id: "p1", title: "Board 1", section: "board" as const },
  { id: "p2", title: "Board 2", section: "board" as const },
];

const manyPages = Array.from({ length: 12 }, (_, index) => ({
  id: `p${index + 1}`,
  title: `Board ${index + 1}`,
  section: "board" as const,
}));

function mockScrollOverflow(
  scrollEl: HTMLElement,
  opts: { scrollWidth: number; clientWidth: number; scrollLeft?: number }
) {
  Object.defineProperty(scrollEl, "scrollWidth", {
    configurable: true,
    value: opts.scrollWidth,
  });
  Object.defineProperty(scrollEl, "clientWidth", {
    configurable: true,
    value: opts.clientWidth,
  });
  Object.defineProperty(scrollEl, "scrollLeft", {
    configurable: true,
    writable: true,
    value: opts.scrollLeft ?? 0,
  });
}

function getBoardTabsScrollEl(container: HTMLElement) {
  const el = container.querySelector(".mynk-wb-board-tabs");
  if (!el) throw new Error("board tabs scroll container not found");
  return el as HTMLElement;
}

describe("BoardTabStrip", () => {
  it("readOnly renders display-only tabs with active highlight (student indicator)", () => {
    render(
      <BoardTabStrip pageList={pages} activePageId="p1" readOnly testId="wb-student-page-strip" />
    );

    const active = screen.getByRole("tab", { name: "Board 1" });
    const inactive = screen.getByRole("tab", { name: "Board 2" });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive).toHaveAttribute("aria-selected", "false");
    expect(screen.queryByRole("button", { name: "Add board" })).not.toBeInTheDocument();
  });

  it("interactive when readOnly is false (tutor canSwitchPage:true path)", () => {
    render(
      <BoardTabStrip
        pageList={pages}
        activePageId="p1"
        readOnly={false}
        onSelectPage={jest.fn()}
        onAddPage={jest.fn()}
        onDeletePage={jest.fn()}
        testId="wb-tutor-page-strip"
      />
    );

    expect(screen.getByRole("tab", { name: "Board 2" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Add board" })).toBeInTheDocument();
  });

  it("hides scroll controls when tabs fit (no overflow)", async () => {
    const { container } = render(
      <BoardTabStrip
        pageList={pages}
        activePageId="p1"
        onSelectPage={jest.fn()}
        onAddPage={jest.fn()}
        testId="wb-tutor-page-strip"
      />
    );

    const scrollEl = getBoardTabsScrollEl(container);
    mockScrollOverflow(scrollEl, { scrollWidth: 200, clientWidth: 200 });
    fireEvent.scroll(scrollEl);

    await waitFor(() => {
      expect(screen.queryByTestId("wb-board-tabs-scroll-left")).not.toBeInTheDocument();
      expect(screen.queryByTestId("wb-board-tabs-scroll-right")).not.toBeInTheDocument();
    });
  });

  it("shows scroll-right control when tabs overflow and user is at start", async () => {
    const { container } = render(
      <BoardTabStrip
        pageList={manyPages}
        activePageId="p1"
        onSelectPage={jest.fn()}
        onAddPage={jest.fn()}
        testId="wb-tutor-page-strip"
      />
    );

    const scrollEl = getBoardTabsScrollEl(container);
    mockScrollOverflow(scrollEl, { scrollWidth: 1200, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(scrollEl);

    await waitFor(() => {
      expect(screen.queryByTestId("wb-board-tabs-scroll-left")).not.toBeInTheDocument();
      expect(screen.getByTestId("wb-board-tabs-scroll-right")).toBeInTheDocument();
    });
  });

  it("shows scroll-left control when overflowed and scrolled away from start", async () => {
    const { container } = render(
      <BoardTabStrip
        pageList={manyPages}
        activePageId="p6"
        onSelectPage={jest.fn()}
        onAddPage={jest.fn()}
        testId="wb-tutor-page-strip"
      />
    );

    const scrollEl = getBoardTabsScrollEl(container);
    mockScrollOverflow(scrollEl, { scrollWidth: 1200, clientWidth: 300, scrollLeft: 120 });
    fireEvent.scroll(scrollEl);

    await waitFor(() => {
      expect(screen.getByTestId("wb-board-tabs-scroll-left")).toBeInTheDocument();
    });
  });

  it("clicking a scroll control invokes horizontal scroll on the tab strip", async () => {
    const { container } = render(
      <BoardTabStrip
        pageList={manyPages}
        activePageId="p1"
        onSelectPage={jest.fn()}
        onAddPage={jest.fn()}
        testId="wb-tutor-page-strip"
      />
    );

    const scrollEl = getBoardTabsScrollEl(container);
    mockScrollOverflow(scrollEl, { scrollWidth: 1200, clientWidth: 300, scrollLeft: 0 });
    const scrollBy = jest.fn();
    scrollEl.scrollBy = scrollBy;
    fireEvent.scroll(scrollEl);

    const scrollRight = await screen.findByTestId("wb-board-tabs-scroll-right");
    fireEvent.click(scrollRight);

    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: "smooth" })
    );
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0);
  });

  it("changing the active tab scrolls it into view", async () => {
    const scrollIntoView = jest.fn();
    const orig = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const { rerender } = render(
        <BoardTabStrip
          pageList={manyPages}
          activePageId="p1"
          onSelectPage={jest.fn()}
          onAddPage={jest.fn()}
          testId="wb-tutor-page-strip"
        />
      );

      rerender(
        <BoardTabStrip
          pageList={manyPages}
          activePageId="p8"
          onSelectPage={jest.fn()}
          onAddPage={jest.fn()}
          testId="wb-tutor-page-strip"
        />
      );

      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({
          inline: "nearest",
          block: "nearest",
          behavior: "smooth",
        });
      });
    } finally {
      HTMLElement.prototype.scrollIntoView = orig;
    }
  });
});
