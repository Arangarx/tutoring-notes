/**
 * @jest-environment jsdom
 *
 * Spec: the peer-view ghost re-renders when the box moves, not on every
 * animation frame while nothing changes (it is mounted for the whole session).
 */

import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { WbGhostViewportOverlay } from "@/components/whiteboard/chrome/WbGhostViewportOverlay";

let frames: FrameRequestCallback[] = [];
function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    const due = frames;
    frames = [];
    act(() => due.forEach((cb) => cb(performance.now())));
  }
}

beforeEach(() => {
  frames = [];
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("a still view stays quiet across frames once the box is shown; a pan commits again", () => {
  const appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0 };
  const api = { getAppState: () => appState } as never;
  let commits = 0;
  render(
    <Profiler id="ghost" onRender={() => (commits += 1)}>
      <WbGhostViewportOverlay
        excalidrawAPI={api}
        activePageId="p1"
        peerView={{ pageId: "p1", panX: 0, panY: 0, zoom: 1, viewportWidth: 800, viewportHeight: 600 } as never}
        label="Tutor view"
      />
    </Profiler>
  );
  runFrames(1);
  expect(screen.getByTestId("wb-ghost-viewport-rect")).toBeTruthy();
  // React may render once more before bailing out of a same-state update.
  runFrames(2);
  const settled = commits;

  runFrames(30);
  expect(commits).toBe(settled);

  appState.scrollX = 50;
  runFrames(1);
  expect(commits).toBeGreaterThan(settled);
  const afterPan = commits;
  runFrames(30);
  expect(commits).toBeLessThanOrEqual(afterPan + 1);
});

it("places the ghost inside the overlay when Excalidraw's offset is the page offset", () => {
  const appState = {
    scrollX: 0,
    scrollY: 0,
    zoom: { value: 1 },
    offsetLeft: 120,
    offsetTop: 80,
  };
  const api = { getAppState: () => appState } as never;
  const orig = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function () {
    if ((this as HTMLElement).classList?.contains("mynk-wb-ghost-viewport")) {
      return {
        x: 120,
        y: 80,
        left: 120,
        top: 80,
        right: 520,
        bottom: 380,
        width: 400,
        height: 300,
        toJSON() {
          return {};
        },
      } as DOMRect;
    }
    return orig.call(this);
  };
  try {
    render(
      <WbGhostViewportOverlay
        excalidrawAPI={api}
        activePageId="p1"
        peerView={
          {
            pageId: "p1",
            panX: 0,
            panY: 0,
            zoom: 1,
            viewportWidth: 200,
            viewportHeight: 100,
          } as never
        }
        label="Student view"
      />
    );
    runFrames(2);
    const rect = screen.getByTestId("wb-ghost-viewport-rect");
    expect(rect.style.left).toBe("0px");
    expect(rect.style.top).toBe("0px");
    expect(parseFloat(rect.style.width)).toBeCloseTo(200, 0);
    expect(parseFloat(rect.style.height)).toBeCloseTo(100, 0);
  } finally {
    HTMLElement.prototype.getBoundingClientRect = orig;
  }
});
