/**
 * @jest-environment jsdom
 *
 * Spec: the student's view is sent to the tutor after activity settles,
 * only when the view changed, and an unchanged view is re-sent after a while
 * so a reconnected tutor catches up. Re-rendering the host does not re-arm
 * the listeners or send anything.
 */

import { useRef } from "react";
import { render } from "@testing-library/react";
import { useViewportWireBroadcast } from "@/hooks/useViewportWireBroadcast";

type View = { scrollX: number; scrollY: number; zoom: { value: number } };

function setup() {
  const view: View = { scrollX: 0, scrollY: 0, zoom: { value: 1 } };
  const broadcastPageViewState = jest.fn();
  const sync = { broadcastPageViewState } as never;
  const api = { getAppState: () => ({ ...view, width: 800, height: 600 }) } as never;
  let mount: HTMLDivElement | null = null;

  function Host({ tick }: { tick: number }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const pageRef = useRef("page-1");
    // A fresh args object every render, as the workspace passes it.
    useViewportWireBroadcast({
      enabled: true,
      sync,
      excalidrawAPI: api,
      activePageIdRef: pageRef,
      canvasMountRef: ref,
    });
    return (
      <div
        data-tick={tick}
        ref={(el) => {
          ref.current = el;
          mount = el;
        }}
      />
    );
  }

  const r = render(<Host tick={0} />);
  const move = () => mount!.dispatchEvent(new Event("pointermove"));
  return { view, broadcastPageViewState, move, rerender: (t: number) => r.rerender(<Host tick={t} />) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("useViewportWireBroadcast", () => {
  it("sends once after activity settles", () => {
    const s = setup();
    jest.advanceTimersByTime(250);
    expect(s.broadcastPageViewState).toHaveBeenCalledTimes(1);
    expect(s.broadcastPageViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageId: "page-1", panX: 0, panY: 0, zoom: 1 })
    );
  });

  it("pointer movement without a view change sends nothing more", () => {
    const s = setup();
    jest.advanceTimersByTime(250);
    for (let i = 0; i < 5; i++) {
      s.move();
      jest.advanceTimersByTime(250);
    }
    expect(s.broadcastPageViewState).toHaveBeenCalledTimes(1);
  });

  it("a pan sends the new view", () => {
    const s = setup();
    jest.advanceTimersByTime(250);
    s.view.scrollX = 120;
    s.move();
    jest.advanceTimersByTime(250);
    expect(s.broadcastPageViewState).toHaveBeenCalledTimes(2);
    expect(s.broadcastPageViewState).toHaveBeenLastCalledWith(expect.objectContaining({ panX: 120 }));
  });

  it("an unchanged view is re-sent on activity after a while", () => {
    const s = setup();
    jest.advanceTimersByTime(250);
    jest.advanceTimersByTime(6_000);
    s.move();
    jest.advanceTimersByTime(250);
    expect(s.broadcastPageViewState).toHaveBeenCalledTimes(2);
  });

  it("re-rendering the host does not send", () => {
    const s = setup();
    jest.advanceTimersByTime(250);
    for (let t = 1; t <= 5; t++) {
      s.rerender(t);
      jest.advanceTimersByTime(250);
    }
    expect(s.broadcastPageViewState).toHaveBeenCalledTimes(1);
  });
});
