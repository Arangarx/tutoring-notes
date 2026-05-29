/**
 * @jest-environment jsdom
 */
/**
 * `useTutorLiveDocumentWire` — tutor→student live broadcast CADENCE.
 *
 * The tutor's live document broadcast is the ONLY vehicle for tutor→student
 * strokes, moves, AND the follow/viewport payload (they ride the same wire).
 * The student direction works because the student/recorder path uses a
 * trailing THROTTLE (`DIFF_INTERVAL_MS`, arm-if-null) that keeps firing during
 * a continuous gesture. The tutor path must behave the same way: a tutor
 * drawing continuously (pointer never still ≥ THROTTLE_MS) must still produce
 * periodic broadcasts so the student sees the strokes live — NOT only after the
 * tutor pauses or switches pages (a page switch force-flushes, which is what
 * masked this in manual smokes).
 */
import { renderHook, act } from "@testing-library/react";
import { useTutorLiveDocumentWire } from "@/hooks/useTutorLiveDocumentWire";
import type { WhiteboardSyncClient } from "@/lib/whiteboard/sync-client";

function makeWire(broadcastDocument: jest.Mock, flushPendingBroadcast: jest.Mock) {
  const sync = {
    broadcastDocument,
    flushPendingBroadcast,
  } as unknown as WhiteboardSyncClient;
  return renderHook(() =>
    useTutorLiveDocumentWire({
      enabled: true,
      sync,
      getPagesSnapshot: () => ({ p1: [] }),
      getPageListAndActive: () => ({
        pageList: [{ id: "p1", title: "Page 1" }],
        activePageId: "p1",
      }),
      getFollow: () => ({ centerSceneX: 0, centerSceneY: 0, zoom: 1 }),
    })
  );
}

describe("useTutorLiveDocumentWire cadence", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("broadcasts PERIODICALLY during a continuous gesture (throttle, not debounce)", () => {
    const broadcastDocument = jest.fn();
    const flushPendingBroadcast = jest.fn();
    const { result } = makeWire(broadcastDocument, flushPendingBroadcast);

    // Continuous drawing: a scene change every 20 ms for 200 ms. The pointer is
    // never still for the full throttle window, exactly like a real freehand
    // stroke / sustained mouse movement. A debounce (clear+reset each tick)
    // never fires here → student sees nothing. A trailing throttle fires
    // ~every THROTTLE_MS (50 ms) → student sees the stroke grow live.
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.scheduleDocumentBroadcast();
        jest.advanceTimersByTime(20);
      }
    });

    expect(broadcastDocument.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("still emits a trailing broadcast after the gesture ends", () => {
    const broadcastDocument = jest.fn();
    const flushPendingBroadcast = jest.fn();
    const { result } = makeWire(broadcastDocument, flushPendingBroadcast);

    act(() => {
      result.current.scheduleDocumentBroadcast();
      jest.advanceTimersByTime(100);
    });

    expect(broadcastDocument).toHaveBeenCalled();
  });

  it("flushDocumentBroadcastNow emits immediately and flushes the relay", () => {
    const broadcastDocument = jest.fn();
    const flushPendingBroadcast = jest.fn();
    const { result } = makeWire(broadcastDocument, flushPendingBroadcast);

    act(() => {
      result.current.flushDocumentBroadcastNow();
    });

    expect(broadcastDocument).toHaveBeenCalledTimes(1);
    expect(flushPendingBroadcast).toHaveBeenCalledTimes(1);
  });
});
