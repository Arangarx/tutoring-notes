import {
  createGhostFreezeState,
  resetGhostFreeze,
  stepGhostFreeze,
  type GhostFreezeState,
} from "@/lib/whiteboard/ghost-freeze";

const rest = { left: 12, top: 24, width: 200, height: 120 };
const slid = { left: 340, top: 90, width: 200, height: 120 };
const resized = { left: 40, top: 30, width: 280, height: 160 };
const cam0 = { scrollX: 0, scrollY: 0, zoom: 1 };

function at(
  state: GhostFreezeState,
  patch: Partial<Parameters<typeof stepGhostFreeze>[1]> &
    Pick<Parameters<typeof stepGhostFreeze>[1], "now" | "camera">
) {
  return stepGhostFreeze(state, {
    projected: rest,
    lock: "independent",
    peerSeq: 1,
    peerAt: 0,
    ...patch,
  });
}

function baseline() {
  return at(createGhostFreezeState(), { now: 0, camera: cam0, projected: rest });
}

describe("ghost freeze", () => {
  it("starts a hold on the first camera change and keeps that screen box", () => {
    const first = baseline();
    expect(first.holding).toBe(false);
    expect(first.box).toEqual(rest);

    const started = at(first.state, {
      now: 10,
      camera: { scrollX: 40, scrollY: -25, zoom: 1 },
      projected: slid,
    });
    expect(started.holding).toBe(true);
    expect(started.box).toEqual(rest);

    const held = at(started.state, {
      now: 40,
      camera: { scrollX: 90, scrollY: 10, zoom: 1.2 },
      projected: resized,
    });
    expect(held.holding).toBe(true);
    expect(held.box).toEqual(rest);
  });

  it("ignores camera noise within 0.01 and treats a larger zoom change as a gesture", () => {
    const first = baseline();
    const noise = at(first.state, {
      now: 5,
      camera: { scrollX: 0.01, scrollY: -0.01, zoom: 1 },
      projected: slid,
    });
    expect(noise.holding).toBe(false);
    expect(noise.box).toEqual(slid);

    const zoom = at(noise.state, {
      now: 6,
      camera: { scrollX: 0.01, scrollY: -0.01, zoom: 1.02 },
      projected: resized,
    });
    expect(zoom.holding).toBe(true);
    expect(zoom.box).toEqual(slid);
  });

  it("ends an independent hold 250ms after the last camera change", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 0,
      camera: { scrollX: 30, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "independent",
    });
    const again = at(started.state, {
      now: 200,
      camera: { scrollX: 80, scrollY: 0, zoom: 1 },
      projected: resized,
    });
    expect(again.box).toEqual(rest);

    const almost = at(again.state, {
      now: 449,
      camera: { scrollX: 80, scrollY: 0, zoom: 1 },
      projected: resized,
      peerSeq: 1,
      peerAt: 0,
    });
    expect(almost.holding).toBe(true);
    expect(almost.box).toEqual(rest);

    const ended = at(almost.state, {
      now: 450,
      camera: { scrollX: 80, scrollY: 0, zoom: 1 },
      projected: resized,
    });
    expect(ended.holding).toBe(false);
    expect(ended.box).toEqual(resized);
  });

  it("releases an unknown lock at 250ms with no new peer message", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 0,
      camera: { scrollX: 22, scrollY: 4, zoom: 1 },
      projected: slid,
      lock: "unknown",
      peerSeq: 1,
      peerAt: 0,
    });
    const still = at(started.state, {
      now: 249,
      camera: { scrollX: 22, scrollY: 4, zoom: 1 },
      projected: resized,
      lock: "unknown",
      peerSeq: 1,
      peerAt: 0,
    });
    expect(still.holding).toBe(true);
    expect(still.box).toEqual(rest);

    const released = at(still.state, {
      now: 250,
      camera: { scrollX: 22, scrollY: 4, zoom: 1 },
      projected: resized,
      lock: "unknown",
      peerSeq: 1,
      peerAt: 0,
    });
    expect(released.holding).toBe(false);
    expect(released.box).toEqual(resized);
  });

  it("releases a locked hold at 500ms when no newer peer message arrives", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 20,
      camera: { scrollX: 15, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "locked",
      peerSeq: 1,
      peerAt: 20,
    });
    const atGestureEnd = at(started.state, {
      now: 20 + 250,
      camera: { scrollX: 15, scrollY: 0, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 1,
      peerAt: 20,
    });
    expect(atGestureEnd.holding).toBe(true);
    expect(atGestureEnd.box).toEqual(rest);

    const waiting = at(atGestureEnd.state, {
      now: 20 + 499,
      camera: { scrollX: 15, scrollY: 0, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 1,
      peerAt: 20,
    });
    expect(waiting.holding).toBe(true);
    expect(waiting.box).toEqual(rest);

    const capped = at(waiting.state, {
      now: 20 + 500,
      camera: { scrollX: 15, scrollY: 0, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 1,
      peerAt: 20,
    });
    expect(capped.holding).toBe(false);
    expect(capped.box).toEqual(resized);
  });

  it("releases a locked hold before 500ms when a newer peer message arrives after the last camera change", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 0,
      camera: { scrollX: 50, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "locked",
      peerSeq: 2,
      peerAt: 0,
    });
    const messageAfterStop = at(started.state, {
      now: 100,
      camera: { scrollX: 50, scrollY: 0, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 3,
      peerAt: 100,
    });
    expect(messageAfterStop.holding).toBe(true);
    expect(messageAfterStop.box).toEqual(rest);

    const released = at(messageAfterStop.state, {
      now: 250,
      camera: { scrollX: 50, scrollY: 0, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 3,
      peerAt: 100,
    });
    expect(released.holding).toBe(false);
    expect(released.box).toEqual(resized);
  });

  it("does not release a locked hold for a peer message that arrived during the gesture", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 0,
      camera: { scrollX: 10, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "locked",
      peerSeq: 1,
      peerAt: 0,
    });
    const midMessage = at(started.state, {
      now: 30,
      camera: { scrollX: 10, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "locked",
      peerSeq: 4,
      peerAt: 30,
    });
    expect(midMessage.holding).toBe(true);
    expect(midMessage.box).toEqual(rest);

    const lastMove = at(midMessage.state, {
      now: 80,
      camera: { scrollX: 70, scrollY: 12, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 4,
      peerAt: 30,
    });
    expect(lastMove.holding).toBe(true);
    expect(lastMove.box).toEqual(rest);

    const afterGesture = at(lastMove.state, {
      now: 80 + 250,
      camera: { scrollX: 70, scrollY: 12, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 4,
      peerAt: 30,
    });
    expect(afterGesture.holding).toBe(true);
    expect(afterGesture.box).toEqual(rest);

    const still = at(afterGesture.state, {
      now: 80 + 499,
      camera: { scrollX: 70, scrollY: 12, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 4,
      peerAt: 30,
    });
    expect(still.holding).toBe(true);
    expect(still.box).toEqual(rest);

    const capped = at(still.state, {
      now: 80 + 500,
      camera: { scrollX: 70, scrollY: 12, zoom: 1 },
      projected: resized,
      lock: "locked",
      peerSeq: 4,
      peerAt: 30,
    });
    expect(capped.holding).toBe(false);
    expect(capped.box).toEqual(resized);
  });

  it("drops a hold when the page resets, so the next camera is not a gesture", () => {
    const first = baseline();
    const started = at(first.state, {
      now: 5,
      camera: { scrollX: 100, scrollY: 80, zoom: 1.5 },
      projected: slid,
      lock: "locked",
    });
    expect(started.holding).toBe(true);

    const reset = resetGhostFreeze(1000);
    const duringRestore = at(reset, {
      now: 1200,
      camera: { scrollX: -800, scrollY: 640, zoom: 0.5 },
      projected: resized,
      lock: "locked",
    });
    expect(duringRestore.holding).toBe(false);
    expect(duringRestore.box).toEqual(resized);

    const restored = at(duringRestore.state, {
      now: 1400,
      camera: { scrollX: 20, scrollY: 0, zoom: 1 },
      projected: rest,
      lock: "locked",
    });
    expect(restored.holding).toBe(false);
    expect(restored.box).toEqual(rest);

    const afterGrace = at(restored.state, {
      now: 1500,
      camera: { scrollX: 90, scrollY: 0, zoom: 1 },
      projected: slid,
      lock: "locked",
    });
    expect(afterGrace.holding).toBe(true);
    expect(afterGrace.box).toEqual(rest);
  });

  it("does not start a hold for a camera move inside the page-restore grace, and does after it", () => {
    const resetAt = 1000;
    const seeded = at(resetGhostFreeze(resetAt), {
      now: resetAt,
      camera: cam0,
      projected: rest,
    });
    expect(seeded.holding).toBe(false);

    const duringGrace = at(seeded.state, {
      now: resetAt + 499,
      camera: { scrollX: 40, scrollY: 0, zoom: 1 },
      projected: slid,
    });
    expect(duringGrace.holding).toBe(false);
    expect(duringGrace.box).toEqual(slid);

    const afterGrace = at(duringGrace.state, {
      now: resetAt + 500,
      camera: { scrollX: 90, scrollY: 0, zoom: 1 },
      projected: resized,
    });
    expect(afterGrace.holding).toBe(true);
    expect(afterGrace.box).toEqual(slid);
  });
});
