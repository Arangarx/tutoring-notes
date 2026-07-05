/**
 * @jest-environment jsdom
 */

/**
 * P2-J4 / SHARE-03 client — SeenTracker viewport → mark-seen POST.
 *
 * Behavior oracle: when the tracked element intersects the viewport
 * (IntersectionObserver `isIntersecting: true`), a fire-and-forget POST
 * fires to `/api/share/mark-seen` with `{ token, noteId }`. When it does
 * NOT intersect, no POST.
 *
 * Pairs with P1-J1 server contract (`share-mark-seen-route.integration.test.ts`).
 *
 * RED-BEFORE (2026-07-05): asserting POST on non-intersect or wrong payload
 * shape fails before correcting to the real component contract.
 */

import { act, render, waitFor } from "@testing-library/react";

import { SeenTracker } from "@/app/s/[token]/SeenTracker";

type IoCallback = (
  entries: IntersectionObserverEntry[],
  observer: IntersectionObserver
) => void;

let ioCallback: IoCallback | null = null;
let ioOptions: IntersectionObserverInit | undefined;
const disconnectSpy = jest.fn();

class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(callback: IoCallback, options?: IntersectionObserverInit) {
    ioCallback = callback;
    ioOptions = options;
  }

  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = disconnectSpy;
}

const NOTE_ID = "note-abc-123";
const SHARE_TOKEN = "share-token-xyz";

const originalFetch = global.fetch;
const originalIo = global.IntersectionObserver;

function triggerIntersection(isIntersecting: boolean) {
  if (!ioCallback) throw new Error("IntersectionObserver callback not registered");
  ioCallback(
    [{ isIntersecting } as IntersectionObserverEntry],
    { disconnect: disconnectSpy } as unknown as IntersectionObserver
  );
}

describe("SeenTracker — mark-seen client (P2-J4)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ioCallback = null;
    ioOptions = undefined;
    disconnectSpy.mockClear();
    global.IntersectionObserver =
      MockIntersectionObserver as unknown as typeof IntersectionObserver;
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.IntersectionObserver = originalIo;
  });

  it("registers IntersectionObserver at 30% visibility threshold", async () => {
    render(<SeenTracker noteId={NOTE_ID} token={SHARE_TOKEN} />);
    await waitFor(() => expect(ioCallback).not.toBeNull());
    expect(ioOptions).toEqual({ threshold: 0.3 });
  });

  it("POSTs /api/share/mark-seen with token + noteId when card intersects", async () => {
    render(<SeenTracker noteId={NOTE_ID} token={SHARE_TOKEN} />);
    await waitFor(() => expect(ioCallback).not.toBeNull());

    await act(async () => {
      triggerIntersection(true);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/share/mark-seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: SHARE_TOKEN, noteId: NOTE_ID }),
    });
    expect(disconnectSpy).toHaveBeenCalled();
  });

  it("does NOT POST when the card is not intersecting", async () => {
    render(<SeenTracker noteId={NOTE_ID} token={SHARE_TOKEN} />);
    await waitFor(() => expect(ioCallback).not.toBeNull());

    await act(async () => {
      triggerIntersection(false);
    });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(disconnectSpy).not.toHaveBeenCalled();
  });
});
