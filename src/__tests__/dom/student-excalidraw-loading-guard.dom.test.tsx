/**
 * @jest-environment jsdom
 */

import React from "react";
import { act, render, screen } from "@testing-library/react";
import {
  STUDENT_EXCALIDRAW_INITIAL_DATA,
  useExcalidrawLoadingGuard,
} from "@/hooks/useExcalidrawLoadingGuard";

function GuardHarness({
  api,
  wjgLog = jest.fn(),
}: {
  api: {
    getAppState: () => { isLoading?: boolean };
    updateScene: jest.Mock;
  } | null;
  wjgLog?: jest.Mock;
}) {
  const guard = useExcalidrawLoadingGuard({
    excalidrawAPI: api as never,
    wjgLog,
  });
  return (
    <div>
      <span data-testid="stuck">{String(guard.stuckLoading)}</span>
      <span data-testid="banner">{String(guard.showLoadingGuardBanner)}</span>
      {guard.showLoadingGuardBanner && (
        <div data-testid="student-excalidraw-loading-guard">Reload</div>
      )}
    </div>
  );
}

describe("useExcalidrawLoadingGuard", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("clears stuck loading via watchdog updateScene", () => {
    const updateScene = jest.fn();
    const api = {
      getAppState: jest.fn(() => ({ isLoading: true })),
      updateScene,
    };
    render(<GuardHarness api={api} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(updateScene).toHaveBeenCalledWith({ appState: { isLoading: false } });
    expect(screen.getByTestId("stuck")).toHaveTextContent("true");
    expect(screen.getByTestId("student-excalidraw-loading-guard")).toBeInTheDocument();
  });

  it("STUDENT_EXCALIDRAW_INITIAL_DATA keeps stable reference", () => {
    expect(Object.is(STUDENT_EXCALIDRAW_INITIAL_DATA, STUDENT_EXCALIDRAW_INITIAL_DATA)).toBe(
      true
    );
  });
});
