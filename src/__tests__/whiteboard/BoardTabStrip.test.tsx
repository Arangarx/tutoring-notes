/**
 * @jest-environment jsdom
 *
 * Board-tab overflow scroll controls + active-tab-into-view live in
 * tests/integration/wb-board-tab-overflow.spec.ts (WS-O).
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";

const pages = [
  { id: "p1", title: "Board 1", section: "board" as const },
  { id: "p2", title: "Board 2", section: "board" as const },
];

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

  it("shows a custom title and keeps the page id when renamed", () => {
    const onRenamePage = jest.fn();
    render(
      <BoardTabStrip
        pageList={[{ id: "p1", title: "Quadratics", section: "img-1", isImage: true }]}
        activePageId="p1"
        onRenamePage={onRenamePage}
        onSelectPage={jest.fn()}
      />
    );
    expect(screen.getByRole("tab", { name: "Quadratics" })).toBeInTheDocument();
    expect(screen.getByTestId("wb-board-tab-image-icon")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rename Quadratics" }));
    fireEvent.change(screen.getByTestId("wb-board-rename-input-0"), {
      target: { value: "Homework" },
    });
    fireEvent.keyDown(screen.getByTestId("wb-board-rename-input-0"), { key: "Enter" });
    expect(onRenamePage).toHaveBeenCalledWith("p1", "Homework");
  });

  it("rename is not a delete control, and the last board has no delete button", () => {
    const { container } = render(
      <BoardTabStrip
        pageList={[{ id: "p1", title: "Board 1", section: "board" as const }]}
        activePageId="p1"
        onRenamePage={jest.fn()}
        onDeletePage={jest.fn()}
        onSelectPage={jest.fn()}
      />
    );
    const rename = screen.getByTestId("wb-board-rename-0");
    expect(rename.className.split(/\s+/)).not.toContain("mynk-wb-board-tab-del");
    expect(container.querySelector(".mynk-wb-board-tab-del")).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Board 1" })).not.toBeInTheDocument();
  });
});
