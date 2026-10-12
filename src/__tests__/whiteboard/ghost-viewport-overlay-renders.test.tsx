/**
 * @jest-environment jsdom
 *
 * Spec: the peer-view ghost re-renders when the box moves, not on every
 * animation frame while nothing changes (it is mounted for the whole session).
 */

import { Profiler } from "react";
import { act, render, screen } from "@testing-library/react";
import { WbGhostViewportOverlay } from "@/components/whiteboard/chrome/WbGhostViewportOverlay";

let nextFrameId = 1;
let frames: { id: number; cb: FrameRequestCallback }[] = [];
function runFrames(n: number) {
  for (let i = 0; i < n; i++) {
    const due = frames;
    frames = [];
    act(() => due.forEach((frame) => frame.cb(performance.now())));
  }
}

beforeEach(() => {
  nextFrameId = 1;
  frames = [];
  jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    const id = nextFrameId++;
    frames.push({ id, cb });
    return id;
  });
  jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames = frames.filter((frame) => frame.id !== id);
  });
});
afterEach(() => jest.restoreAllMocks());

it("a still view stays quiet; a pan holds the screen box until the gesture ends", () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0 };
  const api = { getAppState: () => appState } as never;
  let commits = 0;
  const { rerender } = render(
    <Profiler id="ghost" onRender={() => (commits += 1)}>
      <WbGhostViewportOverlay
        excalidrawAPI={api}
        activePageId="p1"
        peerView={
          {
            pageId: "p1",
            panX: 0,
            panY: 0,
            zoom: 1,
            viewportWidth: 800,
            viewportHeight: 600,
            viewLocked: false,
          } as never
        }
        label="Tutor view"
      />
    </Profiler>
  );
  runFrames(1);
  const rect = screen.getByTestId("wb-ghost-viewport-rect");
  expect(rect).toBeTruthy();
  runFrames(2);
  const settled = commits;

  runFrames(30);
  expect(commits).toBe(settled);

  const leftBefore = rect.style.left;
  appState.scrollX = 80;
  now = 20;
  runFrames(1);
  // Screen box stays put while the camera is moving.
  expect(rect.style.left).toBe(leftBefore);
  runFrames(8);
  expect(rect.style.left).toBe(leftBefore);
  expect(commits).toBe(settled);

  now = 20 + 249;
  runFrames(1);
  expect(rect.style.left).toBe(leftBefore);

  now = 20 + 250;
  runFrames(1);
  expect(parseFloat(rect.style.left)).toBeCloseTo(parseFloat(leftBefore) + 80, 0);

  now = 20 + 250 + 10;
  appState.scrollX = 80;
  rerender(
    <Profiler id="ghost" onRender={() => (commits += 1)}>
      <WbGhostViewportOverlay
        excalidrawAPI={api}
        activePageId="p2"
        peerView={
          {
            pageId: "p2",
            panX: 0,
            panY: 0,
            zoom: 1,
            viewportWidth: 100,
            viewportHeight: 40,
            viewLocked: true,
          } as never
        }
        label="Tutor view"
      />
    </Profiler>
  );
  appState.scrollX = 400;
  runFrames(1);
  // A board switch is a new baseline, not a continuation of the hold.
  const switched = screen.getByTestId("wb-ghost-viewport-rect");
  expect(parseFloat(switched.style.width)).toBeCloseTo(100, 0);
  expect(parseFloat(switched.style.left)).toBeCloseTo(400, 0);
});

it("a pan while the ghost is hidden projects fresh on the first frame it shows again", () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0 };
  const api = { getAppState: () => appState } as never;
  const peer = {
    pageId: "p1",
    panX: 0,
    panY: 0,
    zoom: 1,
    viewportWidth: 800,
    viewportHeight: 600,
    viewLocked: false,
  };
  const { rerender } = render(
    <WbGhostViewportOverlay
      excalidrawAPI={api}
      activePageId="p1"
      peerView={peer as never}
      label="Tutor view"
    />
  );
  runFrames(1);
  const shownLeft = parseFloat(screen.getByTestId("wb-ghost-viewport-rect").style.left);

  rerender(
    <WbGhostViewportOverlay
      excalidrawAPI={api}
      activePageId="p1"
      peerView={{ ...peer, pageId: "p2" } as never}
      label="Tutor view"
    />
  );
  now = 30;
  runFrames(1);
  expect(screen.queryByTestId("wb-ghost-viewport-rect")).toBeNull();

  appState.scrollX = 80;
  now = 40;
  runFrames(1);

  rerender(
    <WbGhostViewportOverlay
      excalidrawAPI={api}
      activePageId="p1"
      peerView={peer as never}
      label="Tutor view"
    />
  );
  now = 50;
  runFrames(1);
  // First shown frame after a hidden pan is the new projection, not the box from before the pan.
  expect(parseFloat(screen.getByTestId("wb-ghost-viewport-rect").style.left)).toBeCloseTo(
    shownLeft + 80,
    0
  );
});

it("holds a locked peer through the gesture end, then releases on a newer view before 500ms", () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0 };
  const api = { getAppState: () => appState } as never;
  const peer = {
    pageId: "p1",
    panX: 0,
    panY: 0,
    zoom: 1,
    viewportWidth: 200,
    viewportHeight: 80,
    viewLocked: true,
  };
  const { rerender } = render(
    <WbGhostViewportOverlay
      excalidrawAPI={api}
      activePageId="p1"
      peerView={peer as never}
      label="Student view"
    />
  );
  runFrames(1);
  const rect = screen.getByTestId("wb-ghost-viewport-rect");
  const leftBefore = rect.style.left;
  appState.scrollX = 60;
  now = 15;
  runFrames(1);
  expect(rect.style.left).toBe(leftBefore);

  now = 15 + 100;
  rerender(
    <WbGhostViewportOverlay
      excalidrawAPI={api}
      activePageId="p1"
      peerView={{ ...peer, panX: -60 } as never}
      label="Student view"
    />
  );
  runFrames(1);
  expect(rect.style.left).toBe(leftBefore);

  now = 15 + 250;
  runFrames(1);
  expect(rect.style.left).not.toBe(leftBefore);
});

it("gives up a locked hold at 500ms when no newer peer view arrives", () => {
  let now = 0;
  jest.spyOn(performance, "now").mockImplementation(() => now);
  const appState = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, offsetLeft: 0, offsetTop: 0 };
  const api = { getAppState: () => appState } as never;
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
          viewportHeight: 80,
          viewLocked: true,
        } as never
      }
      label="Student view"
    />
  );
  runFrames(1);
  const rect = screen.getByTestId("wb-ghost-viewport-rect");
  const leftBefore = rect.style.left;
  appState.scrollX = 60;
  now = 15;
  runFrames(1);
  expect(rect.style.left).toBe(leftBefore);

  now = 15 + 499;
  runFrames(1);
  expect(rect.style.left).toBe(leftBefore);

  now = 15 + 500;
  runFrames(1);
  expect(rect.style.left).not.toBe(leftBefore);
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
