/**
 * @jest-environment jsdom
 *
 * F1 — WWC defer effect must not flicker false between deferred lifecycle
 * transitions while a deploy-freshness reload is latched.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";

import { useDeployFreshness } from "@/hooks/useDeployFreshness";
import { setCaptureDeferActive } from "@/lib/deploy/capture-defer-registry";

const reloadMock = jest.fn();
const toastMock = jest.fn();
const pathnameMock = jest.fn(() => "/admin");

jest.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

jest.mock("sonner", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

jest.mock("@/lib/deploy/capture-defer-registry", () => {
  const actual = jest.requireActual<typeof import("@/lib/deploy/capture-defer-registry")>(
    "@/lib/deploy/capture-defer-registry",
  );
  return {
    ...actual,
    triggerDeployReload: () => reloadMock(),
  };
});

const DEFERRED_LIFECYCLE = ["recording", "paused", "stopping", "uploading"] as const;
type DeferredLifecycle = (typeof DEFERRED_LIFECYCLE)[number];

function isDeferredLifecycleState(state: string): boolean {
  return (DEFERRED_LIFECYCLE as readonly string[]).includes(state);
}

/** Pre-fix single effect — cleanup sets defer false on every dep change. */
function useBuggyWwcDeferEffect(lifecycleState: DeferredLifecycle, role = "tutor") {
  useEffect(() => {
    if (role !== "tutor") return;
    const shouldDefer = isDeferredLifecycleState(lifecycleState);
    setCaptureDeferActive("wwc", shouldDefer);
    return () => setCaptureDeferActive("wwc", false);
  }, [role, lifecycleState]);
}

/** Post-fix split effects — no cleanup-to-false between transitions. */
function useFixedWwcDeferEffect(lifecycleState: DeferredLifecycle, role = "tutor") {
  useEffect(() => {
    if (role !== "tutor") {
      setCaptureDeferActive("wwc", false);
      return;
    }
    const shouldDefer = isDeferredLifecycleState(lifecycleState);
    setCaptureDeferActive("wwc", shouldDefer);
  }, [role, lifecycleState]);

  useEffect(() => {
    return () => setCaptureDeferActive("wwc", false);
  }, []);
}

beforeEach(() => {
  reloadMock.mockReset();
  toastMock.mockReset();
  pathnameMock.mockReturnValue("/admin");
  setCaptureDeferActive("wwc", false);
  setCaptureDeferActive("note-recording", false);
  process.env.NEXT_PUBLIC_BUILD_SHA = "abc123fullsha0000000000000000000000";
});

afterEach(() => {
  setCaptureDeferActive("wwc", false);
  setCaptureDeferActive("note-recording", false);
});

async function latchPendingDeployReload(): Promise<{ unmountFreshness: () => void }> {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sha: "remote-new-sha" }),
  });

  setCaptureDeferActive("wwc", true);

  const { unmount: unmountFreshness } = renderHook(() => useDeployFreshness());

  await waitFor(() => {
    expect(toastMock).toHaveBeenCalled();
  });
  expect(reloadMock).not.toHaveBeenCalled();

  return { unmountFreshness };
}

describe("WWC capture-defer effect (F1 defer-flicker)", () => {
  it("red-before: buggy single-effect recording→stopping flicker commits latched reload", async () => {
    const { unmountFreshness } = await latchPendingDeployReload();

    const { rerender, unmount: unmountDefer } = renderHook(
      ({ state }: { state: DeferredLifecycle }) => useBuggyWwcDeferEffect(state),
      { initialProps: { state: "recording" as DeferredLifecycle } },
    );

    await act(async () => {
      rerender({ state: "stopping" });
    });

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });

    unmountDefer();
    unmountFreshness();
  });

  it("green-after: split-effect recording→stopping keeps defer latched — no reload", async () => {
    const { unmountFreshness } = await latchPendingDeployReload();

    const { rerender, unmount: unmountDefer } = renderHook(
      ({ state }: { state: DeferredLifecycle }) => useFixedWwcDeferEffect(state),
      { initialProps: { state: "recording" as DeferredLifecycle } },
    );

    await act(async () => {
      rerender({ state: "stopping" });
    });

    expect(reloadMock).not.toHaveBeenCalled();

    unmountDefer();
    unmountFreshness();
    setCaptureDeferActive("wwc", false);
  });
});
