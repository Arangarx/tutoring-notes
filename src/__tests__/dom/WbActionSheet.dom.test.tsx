/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { WbActionSheet } from "@/components/whiteboard/chrome/WbActionSheet";

describe("WbActionSheet close button", () => {
  it("calls onDismiss on mouse click even when handle row uses pointer capture", () => {
    const onDismiss = jest.fn();
    render(
      <WbActionSheet open onDismiss={onDismiss} ariaLabel="Test sheet">
        <p>Body</p>
      </WbActionSheet>
    );

    const handleRow = document.querySelector(".mynk-wb-action-sheet__handle-row")!;
    const closeBtn = screen.getByRole("button", { name: "Dismiss" });

    const setPointerCapture = jest.fn();
    handleRow.addEventListener("pointerdown", (e) => {
      Object.defineProperty(e.currentTarget, "setPointerCapture", {
        value: setPointerCapture,
      });
    });

    fireEvent.pointerDown(handleRow, { pointerId: 1, clientY: 10 });
    expect(setPointerCapture).toHaveBeenCalled();

    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
