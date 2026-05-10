/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react";
import {
  useWhiteboardRecorder,
} from "@/hooks/useWhiteboardRecorder";
import type { ExcalidrawLikeElement } from "@/lib/whiteboard/excalidraw-adapter";
import type { WBEventLog } from "@/lib/whiteboard/event-log";

const ADMIN = "admin-lc";
const STUDENT = "student-lc";
const SESSION = "wb-lifecycle-1";

function makeRect(id: string, x: number, y: number): ExcalidrawLikeElement {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 50,
    strokeColor: "#000",
  };
}

type Bag = { now: number };

function props(bag: Bag, overrides?: Partial<Parameters<typeof useWhiteboardRecorder>[0]>) {
  return {
    whiteboardSessionId: SESSION,
    adminUserId: ADMIN,
    studentId: STUDENT,
    startedAtIso: "2026-05-09T10:00:00.000Z",
    getAudioMs: () => bag.now,
    recordingActive: true,
    sync: null,
    localClientId: "local-tutor",
    ...overrides,
  };
}

describe("useWhiteboardRecorder lifecycle (Phase 0c)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("stroke flushed before Start → snapshot on Start includes that stroke", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook(
      (active: boolean) =>
        useWhiteboardRecorder(props(bag, { recordingActive: active })),
      { initialProps: false }
    );

    bag.now = 50;
    act(() => {
      result.current.onCanvasChange([makeRect("a", 1, 1)]);
    });
    act(() => {
      jest.advanceTimersByTime(120);
    });

    bag.now = 200;
    act(() => {
      rerender(true);
    });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    expect(log.events[0]?.type).toBe("snapshot");
    if (log.events[0]?.type === "snapshot") {
      expect(log.events[0].elements.length).toBeGreaterThanOrEqual(1);
      expect(log.events[0].elements.some((e) => e.id === "a")).toBe(true);
    }
  });

  test("stroke before Start without waiting for throttle → snapshot still includes stroke", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook(
      (active: boolean) =>
        useWhiteboardRecorder(props(bag, { recordingActive: active })),
      { initialProps: false }
    );

    bag.now = 80;
    act(() => {
      result.current.onCanvasChange([makeRect("early", 2, 2)]);
    });
    act(() => {
      rerender(true);
    });

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    expect(log.events[0]?.type).toBe("snapshot");
    if (log.events[0]?.type === "snapshot") {
      expect(log.events[0].elements.some((e) => e.id === "early")).toBe(true);
    }
  });

  test("stroke during recording → diff events capture it", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook(
      (active: boolean) =>
        useWhiteboardRecorder(props(bag, { recordingActive: active })),
      { initialProps: false }
    );

    act(() => rerender(true));
    bag.now = 300;
    act(() => {
      result.current.onCanvasChange([makeRect("r1", 10, 10)]);
    });
    act(() => jest.advanceTimersByTime(120));

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    expect(log.events.some((e) => e.type === "add" || e.type === "snapshot")).toBe(
      true
    );
    const hasRect =
      log.events.some(
        (e) =>
          e.type === "add" &&
          "element" in e &&
          e.element.id === "r1"
      ) ||
      log.events.some(
        (e) =>
          e.type === "snapshot" &&
          e.elements.some((el) => el.id === "r1")
      );
    expect(hasRect).toBe(true);
  });

  test("stroke while paused → snapshot on Resume includes it", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook(
      (p: { active: boolean }) =>
        useWhiteboardRecorder(props(bag, { recordingActive: p.active })),
      { initialProps: { active: true } }
    );

    act(() => rerender({ active: false }));
    bag.now = 400;
    act(() => {
      result.current.onCanvasChange([makeRect("during-pause", 3, 3)]);
    });
    act(() => jest.advanceTimersByTime(120));

    bag.now = 500;
    act(() => rerender({ active: true }));

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    const resumeSnap = log.events.filter((e) => e.type === "snapshot").pop();
    expect(resumeSnap?.type).toBe("snapshot");
    if (resumeSnap?.type === "snapshot") {
      expect(resumeSnap.elements.some((e) => e.id === "during-pause")).toBe(true);
    }
  });

  test("no stroke before Start → snapshot is empty", () => {
    jest.useFakeTimers();
    const bag: Bag = { now: 0 };
    const { result, rerender } = renderHook(
      (active: boolean) =>
        useWhiteboardRecorder(props(bag, { recordingActive: active })),
      { initialProps: false }
    );

    bag.now = 100;
    act(() => rerender(true));

    const log = JSON.parse(result.current.buildFinalEventsJson()) as WBEventLog;
    expect(log.events[0]).toEqual(
      expect.objectContaining({ type: "snapshot", elements: [] })
    );
  });
});
