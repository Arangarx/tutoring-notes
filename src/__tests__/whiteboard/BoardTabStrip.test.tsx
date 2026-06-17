/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { BoardTabStrip } from "@/components/whiteboard/chrome/BoardTabStrip";

const pages = [
  { id: "p1", title: "Board 1", section: "board" as const },
  { id: "p2", title: "Board 2", section: "board" as const },
];

describe("BoardTabStrip", () => {
  it("readOnly renders display-only tabs (student canSwitchPage:false path)", () => {
    render(
      <BoardTabStrip pageList={pages} activePageId="p1" readOnly testId="wb-student-page-strip" />
    );

    expect(screen.getByRole("tab", { name: "Board 1" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Board 2" })).toBeDisabled();
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
});
