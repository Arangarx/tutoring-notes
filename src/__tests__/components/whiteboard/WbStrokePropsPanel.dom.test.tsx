/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WbStrokePropsPanel } from "@/components/whiteboard/chrome/WbStrokePropsPanel";

const baseProps = {
  strokeColor: "#1e293b",
  strokeWidth: 1,
  opacity: 100,
  roughness: 0 as const,
  roundness: "sharp" as const,
  moreStylesOpen: true,
  inkHex: "#1e293b",
  onStrokeChange: jest.fn(),
  onMoreStylesToggle: jest.fn(),
  onRoughnessChange: jest.fn(),
  onRoundnessChange: jest.fn(),
};

describe("WbStrokePropsPanel — WS-R visibility flags", () => {
  test("defaults (showRoughness/showRoundness true) render both more-styles sections", () => {
    render(<WbStrokePropsPanel {...baseProps} />);

    expect(screen.getByTestId("wb-roughness-section")).toBeTruthy();
    expect(screen.getByTestId("wb-roundness-section")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Architect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sharp" })).toBeTruthy();
  });

  test("showRoughness={false} hides roughness section", () => {
    render(<WbStrokePropsPanel {...baseProps} showRoughness={false} />);

    expect(screen.queryByTestId("wb-roughness-section")).toBeNull();
    expect(screen.queryByRole("button", { name: "Architect" })).toBeNull();
    expect(screen.getByTestId("wb-roundness-section")).toBeTruthy();
  });

  test("showRoundness={false} hides edge-sharpness section", () => {
    render(<WbStrokePropsPanel {...baseProps} showRoundness={false} />);

    expect(screen.getByTestId("wb-roughness-section")).toBeTruthy();
    expect(screen.queryByTestId("wb-roundness-section")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sharp" })).toBeNull();
  });

  test("roughness chip still invokes onRoughnessChange when visible", async () => {
    const user = userEvent.setup();
    const onRoughnessChange = jest.fn();
    render(
      <WbStrokePropsPanel {...baseProps} onRoughnessChange={onRoughnessChange} />
    );

    await user.click(screen.getByRole("button", { name: "Cartoon" }));
    expect(onRoughnessChange).toHaveBeenCalledWith(2);
  });
});
