/** @jest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import {
  WbActionSheet,
  WbActionSheetBackdrop,
} from "@/components/whiteboard/chrome/WbActionSheet";

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

describe("WbActionSheetBackdrop — pointer event guard", () => {
  it("stopPropagation on pointerdown so Excalidraw canvas does not start a draw action", () => {
    const onDismiss = jest.fn();
    const { container } = render(
      <WbActionSheetBackdrop open onDismiss={onDismiss} />
    );
    const backdrop = container.firstChild as HTMLElement;

    // Attach a listener on a parent that would be hit if propagation wasn't stopped
    const parentPointerDownSpy = jest.fn();
    document.addEventListener("pointerdown", parentPointerDownSpy);

    fireEvent.pointerDown(backdrop);
    expect(parentPointerDownSpy).not.toHaveBeenCalled();

    document.removeEventListener("pointerdown", parentPointerDownSpy);
  });

  it("stopPropagation on pointerup so Excalidraw canvas does not finalize a draw action", () => {
    const onDismiss = jest.fn();
    const { container } = render(
      <WbActionSheetBackdrop open onDismiss={onDismiss} />
    );
    const backdrop = container.firstChild as HTMLElement;

    const parentPointerUpSpy = jest.fn();
    document.addEventListener("pointerup", parentPointerUpSpy);

    fireEvent.pointerUp(backdrop);
    expect(parentPointerUpSpy).not.toHaveBeenCalled();

    document.removeEventListener("pointerup", parentPointerUpSpy);
  });

  it("onClick still calls onDismiss after pointerdown is stopped", () => {
    const onDismiss = jest.fn();
    const { container } = render(
      <WbActionSheetBackdrop open onDismiss={onDismiss} />
    );
    const backdrop = container.firstChild as HTMLElement;

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
