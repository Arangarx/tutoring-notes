/**
 * ChunkLoadError detection + one-shot reload loop guard.
 */

const reloadMock = jest.fn();

beforeEach(() => {
  reloadMock.mockReset();
  Object.defineProperty(global, "location", {
    configurable: true,
    value: { reload: reloadMock },
  });

  const store = new Map<string, string>();
  Object.defineProperty(global, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });

  jest.resetModules();
});

describe("isChunkLoadError()", () => {
  it.each([
    [new Error("Loading chunk 42 failed"), true],
    [Object.assign(new Error("x"), { name: "ChunkLoadError" }), true],
    [
      new Error("Failed to fetch dynamically imported module: https://app/_next/static/chunks/foo.js"),
      true,
    ],
    ["Loading chunk 99 failed", true],
    [new Error("NetworkError when attempting to fetch resource"), false],
    [new TypeError("Cannot read properties of undefined"), false],
    [null, false],
  ])("classifies %p as %s", async (error, expected) => {
    const { isChunkLoadError } = await import("@/lib/deploy/chunk-load-error");
    expect(isChunkLoadError(error)).toBe(expected);
  });
});

describe("attemptChunkRecoveryReload()", () => {
  it("sets sessionStorage flag and reloads on first call", async () => {
    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const { attemptChunkRecoveryReload } = await import("@/lib/deploy/chunk-load-error");

    expect(attemptChunkRecoveryReload()).toBe(true);
    expect(sessionStorage.getItem("deploy-chunk-recovery-reload")).toBe("1");
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith("[dfr] action=reload_commit source=chunk deferred=false");
    consoleSpy.mockRestore();
  });

  it("returns false and does not reload again (loop guard)", async () => {
    const { attemptChunkRecoveryReload } = await import("@/lib/deploy/chunk-load-error");

    expect(attemptChunkRecoveryReload()).toBe(true);
    reloadMock.mockClear();

    expect(attemptChunkRecoveryReload()).toBe(false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("defers reload while capture is active and reloads when defer clears", async () => {
    const consoleSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    const { setCaptureDeferActive } = await import("@/lib/deploy/capture-defer-registry");
    const { attemptChunkRecoveryReload } = await import("@/lib/deploy/chunk-load-error");

    setCaptureDeferActive("wwc", true);
    expect(attemptChunkRecoveryReload()).toBe(true);
    expect(reloadMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("deploy-chunk-recovery-reload")).toBeNull();

    setCaptureDeferActive("wwc", false);

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("deploy-chunk-recovery-reload")).toBe("1");
    expect(consoleSpy).toHaveBeenCalledWith("[dfr] action=reload_commit source=chunk deferred=true");
    consoleSpy.mockRestore();
  });
});

describe("clearDeferredChunkRecovery()", () => {
  it("clears pending latch and unsubscribes so defer-clear does not reload", async () => {
    const { setCaptureDeferActive } = await import("@/lib/deploy/capture-defer-registry");
    const { attemptChunkRecoveryReload, clearDeferredChunkRecovery } = await import(
      "@/lib/deploy/chunk-load-error"
    );

    setCaptureDeferActive("wwc", true);
    expect(attemptChunkRecoveryReload()).toBe(true);
    expect(reloadMock).not.toHaveBeenCalled();

    clearDeferredChunkRecovery();
    reloadMock.mockClear();

    setCaptureDeferActive("wwc", false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("allows a fresh deferred attempt after clear on simulated remount", async () => {
    const { setCaptureDeferActive } = await import("@/lib/deploy/capture-defer-registry");
    const {
      attemptChunkRecoveryReload,
      clearDeferredChunkRecovery,
      clearChunkRecoveryFlag,
    } = await import("@/lib/deploy/chunk-load-error");

    setCaptureDeferActive("wwc", true);
    attemptChunkRecoveryReload();
    clearDeferredChunkRecovery();
    clearChunkRecoveryFlag();

    setCaptureDeferActive("wwc", true);
    reloadMock.mockClear();
    expect(attemptChunkRecoveryReload()).toBe(true);
    expect(reloadMock).not.toHaveBeenCalled();

    setCaptureDeferActive("wwc", false);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});

describe("clearChunkRecoveryFlag()", () => {
  it("removes the loop-guard key so a later attempt can reload", async () => {
    const { attemptChunkRecoveryReload, clearChunkRecoveryFlag } = await import(
      "@/lib/deploy/chunk-load-error"
    );

    attemptChunkRecoveryReload();
    reloadMock.mockClear();

    clearChunkRecoveryFlag();
    expect(sessionStorage.getItem("deploy-chunk-recovery-reload")).toBeNull();

    expect(attemptChunkRecoveryReload()).toBe(true);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
