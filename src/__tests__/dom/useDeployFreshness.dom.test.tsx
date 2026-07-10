/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";

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

beforeEach(() => {
  reloadMock.mockReset();
  toastMock.mockReset();
  pathnameMock.mockReturnValue("/admin");
  delete (window as Window & { __TN_PW_CLIENT_SHA__?: string }).__TN_PW_CLIENT_SHA__;
  setCaptureDeferActive("wwc", false);
  setCaptureDeferActive("note-recording", false);
  jest.spyOn(console, "info").mockImplementation(() => {});

  process.env.NEXT_PUBLIC_BUILD_SHA = "abc123fullsha0000000000000000000000";
  process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST = undefined;
});

afterEach(() => {
  setCaptureDeferActive("wwc", false);
  setCaptureDeferActive("note-recording", false);
  jest.restoreAllMocks();
});

describe("useDeployFreshness", () => {
  it("does not poll or reload when client SHA is development", async () => {
    process.env.NEXT_PUBLIC_BUILD_SHA = "development";
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    const { unmount } = renderHook(() => useDeployFreshness());
    document.dispatchEvent(new Event("visibilitychange"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
    unmount();
  });

  it("reloads immediately on mismatch when capture is not deferred", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: "remote-new-sha" }),
    });

    const { unmount } = renderHook(() => useDeployFreshness());

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(console.info).toHaveBeenCalledWith("[dfr] action=reload_commit source=poll deferred=false");
    unmount();
  });

  it("shows toast once and defers reload until capture defer clears", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: "remote-new-sha" }),
    });

    setCaptureDeferActive("wwc", true);

    const { unmount } = renderHook(() => useDeployFreshness());

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        "A new version is ready — it'll apply automatically when your session ends.",
      );
    });
    expect(reloadMock).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(toastMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      setCaptureDeferActive("wwc", false);
    });

    await waitFor(() => {
      expect(reloadMock).toHaveBeenCalledTimes(1);
    });
    expect(console.info).toHaveBeenCalledWith("[dfr] action=reload_commit source=poll deferred=true");
    unmount();
  });

  it("polls again on visibilitychange when tab becomes visible", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: "abc123fullsha0000000000000000000000" }),
    });
    global.fetch = fetchMock;

    const { unmount } = renderHook(() => useDeployFreshness());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
  });

  it("polls on pathname change", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sha: "abc123fullsha0000000000000000000000" }),
    });
    global.fetch = fetchMock;

    const { rerender, unmount } = renderHook(() => useDeployFreshness());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fetchMock.mockClear();
    pathnameMock.mockReturnValue("/admin/students/1");
    rerender();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
  });
});
