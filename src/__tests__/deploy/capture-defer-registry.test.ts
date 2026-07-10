/**
 * Ref-counted capture-defer registry — contract tests.
 */

describe("capture-defer-registry", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("isCaptureDeferred is false with no active sources", async () => {
    const { isCaptureDeferred } = await import("@/lib/deploy/capture-defer-registry");
    expect(isCaptureDeferred()).toBe(false);
  });

  it("ref-count stacks two independent sources", async () => {
    const { setCaptureDeferActive, isCaptureDeferred } = await import(
      "@/lib/deploy/capture-defer-registry"
    );

    setCaptureDeferActive("wwc", true);
    expect(isCaptureDeferred()).toBe(true);

    setCaptureDeferActive("note-recording", true);
    expect(isCaptureDeferred()).toBe(true);

    setCaptureDeferActive("wwc", false);
    expect(isCaptureDeferred()).toBe(true);

    setCaptureDeferActive("note-recording", false);
    expect(isCaptureDeferred()).toBe(false);
  });

  it("subscribe fires on defer transitions and unsubscribe stops notifications", async () => {
    const { setCaptureDeferActive, subscribeCaptureDefer } = await import(
      "@/lib/deploy/capture-defer-registry"
    );

    const listener = jest.fn();
    const unsub = subscribeCaptureDefer(listener);

    setCaptureDeferActive("a", true);
    expect(listener).toHaveBeenCalledTimes(1);

    setCaptureDeferActive("a", false);
    expect(listener).toHaveBeenCalledTimes(2);

    listener.mockClear();
    unsub();

    setCaptureDeferActive("b", true);
    expect(listener).not.toHaveBeenCalled();

    setCaptureDeferActive("b", false);
  });

  it("cleanup sets source inactive", async () => {
    const { setCaptureDeferActive, isCaptureDeferred } = await import(
      "@/lib/deploy/capture-defer-registry"
    );

    setCaptureDeferActive("wwc", true);
    setCaptureDeferActive("wwc", false);
    expect(isCaptureDeferred()).toBe(false);
  });

  it("logs per-source changes with dfr prefix", async () => {
    const { setCaptureDeferActive } = await import("@/lib/deploy/capture-defer-registry");

    setCaptureDeferActive("wwc", true);
    expect(console.info).toHaveBeenCalledWith("[dfr] source=wwc active=true deferred=true");

    setCaptureDeferActive("wwc", false);
    expect(console.info).toHaveBeenCalledWith("[dfr] source=wwc active=false deferred=false");
  });
});
