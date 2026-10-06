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
