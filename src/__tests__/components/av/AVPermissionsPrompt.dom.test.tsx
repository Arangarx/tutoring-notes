/**
 * @jest-environment jsdom
 */

import React from "react";
import {
  render,
  cleanup,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";

import { AVPermissionsPrompt } from "@/components/av/AVPermissionsPrompt";
import type {
  AvAcquireError,
  AvPermissionState,
} from "@/hooks/useLiveAV";

afterEach(() => {
  cleanup();
});

type Props = React.ComponentProps<typeof AVPermissionsPrompt>;

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    hasMicPermission: "prompt",
    hasCamPermission: "prompt",
    hasMicStream: false,
    hasCamStream: false,
    error: null,
    videoError: null,
    requestMic: jest.fn().mockResolvedValue(undefined),
    requestCam: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("AVPermissionsPrompt — initial render", () => {
  test("shows the prompt when both mic + cam are 'prompt' and no streams", () => {
    render(<AVPermissionsPrompt {...baseProps()} />);
    expect(screen.getByTestId("av-permissions-prompt")).toBeTruthy();
    expect(screen.getByTestId("av-permissions-allow-mic")).toBeTruthy();
    expect(screen.getByTestId("av-permissions-allow-cam")).toBeTruthy();
  });

  test("shows the prompt even when state is 'unknown' (Safari camera-throw fallback)", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({ hasCamPermission: "unknown" })}
      />
    );
    expect(screen.getByTestId("av-permissions-allow-cam")).toBeTruthy();
  });

  test("auto-hides when both mic + cam streams are present (granted)", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "granted",
          hasCamPermission: "granted",
          hasMicStream: true,
          hasCamStream: true,
        })}
      />
    );
    expect(screen.queryByTestId("av-permissions-prompt")).toBeNull();
  });

  test("shows prompt with one row granted + the other pending", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "granted",
          hasMicStream: true,
          hasCamPermission: "prompt",
          hasCamStream: false,
        })}
      />
    );
    expect(screen.getByTestId("av-permissions-prompt")).toBeTruthy();
    const micRow = screen.getByTestId("av-permissions-row-mic");
    const camRow = screen.getByTestId("av-permissions-row-cam");
    expect(micRow.getAttribute("data-status")).toBe("granted");
    expect(camRow.getAttribute("data-status")).toBe("request");
    expect(screen.getByTestId("av-permissions-allow-cam")).toBeTruthy();
    expect(screen.queryByTestId("av-permissions-allow-mic")).toBeNull();
  });
});

describe("AVPermissionsPrompt — independent request buttons", () => {
  test("clicking Allow microphone calls requestMic only (not requestCam)", async () => {
    const props = baseProps();
    render(<AVPermissionsPrompt {...props} />);
    fireEvent.click(screen.getByTestId("av-permissions-allow-mic"));
    await waitFor(() => {
      expect(props.requestMic).toHaveBeenCalledTimes(1);
    });
    expect(props.requestCam).not.toHaveBeenCalled();
  });

  test("clicking Allow camera calls requestCam only (not requestMic)", async () => {
    const props = baseProps();
    render(<AVPermissionsPrompt {...props} />);
    fireEvent.click(screen.getByTestId("av-permissions-allow-cam"));
    await waitFor(() => {
      expect(props.requestCam).toHaveBeenCalledTimes(1);
    });
    expect(props.requestMic).not.toHaveBeenCalled();
  });

  test("button shows 'Requesting…' state while requestMic is in flight", async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const props = baseProps({ requestMic: () => pending });

    render(<AVPermissionsPrompt {...props} />);
    fireEvent.click(screen.getByTestId("av-permissions-allow-mic"));
    // Async state setter is queued; flush to settle the in-flight tick.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("av-permissions-requesting-mic")).toBeTruthy();

    await act(async () => {
      resolve();
      await pending;
    });
  });
});

describe("AVPermissionsPrompt — denied + retry affordance (4b deferral)", () => {
  const denyError: AvAcquireError = {
    type: "permission-denied",
    message: "Microphone access denied. Open site settings to allow.",
    raw: null,
  };

  test("renders Try-again button when hasMicPermission='denied'", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "denied" as AvPermissionState,
          error: denyError,
        })}
      />
    );
    expect(screen.getByTestId("av-permissions-retry-mic")).toBeTruthy();
    // Error copy is surfaced (4d will polish; 4c just shows the
    // raw classifier message).
    expect(
      screen.getByTestId("av-permissions-row-mic").textContent
    ).toMatch(/Microphone access denied/);
  });

  test("clicking Try again re-invokes requestMic", async () => {
    const requestMic = jest.fn().mockResolvedValue(undefined);
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "denied",
          error: denyError,
          requestMic,
        })}
      />
    );
    fireEvent.click(screen.getByTestId("av-permissions-retry-mic"));
    await waitFor(() => {
      expect(requestMic).toHaveBeenCalledTimes(1);
    });
  });

  test("denied row is independent — mic denied + cam still pending shows both states", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "denied",
          error: denyError,
          hasCamPermission: "prompt",
        })}
      />
    );
    expect(screen.getByTestId("av-permissions-retry-mic")).toBeTruthy();
    expect(screen.getByTestId("av-permissions-allow-cam")).toBeTruthy();
    expect(
      screen.getByTestId("av-permissions-row-mic").getAttribute("data-status")
    ).toBe("denied");
    expect(
      screen.getByTestId("av-permissions-row-cam").getAttribute("data-status")
    ).toBe("request");
  });

  test("does not auto-hide while one row is denied (user can retry later)", () => {
    render(
      <AVPermissionsPrompt
        {...baseProps({
          hasMicPermission: "granted",
          hasMicStream: true,
          hasCamPermission: "denied",
          videoError: {
            type: "permission-denied",
            message: "Camera denied",
            raw: null,
          },
        })}
      />
    );
    // Prompt still visible because cam is denied and we surface the
    // "Try again" affordance.
    expect(screen.getByTestId("av-permissions-prompt")).toBeTruthy();
    expect(screen.getByTestId("av-permissions-retry-cam")).toBeTruthy();
  });
});
