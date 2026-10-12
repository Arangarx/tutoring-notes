/**
 * Screen-space ghost freeze while the viewer pans or zooms.
 * The clock is the `now` argument so tests can step time without timers.
 *
 * A camera change (scroll or zoom beyond 0.01) holds the last painted
 * screen box. The hold ends 250ms after the last change when the peer
 * is independent or unknown. A locked peer stays held after that until
 * a peer message arrives that is newer than the one in hand at the last
 * camera change (peerSeq increased, peerAt at or after that change),
 * and never longer than 500ms. A page reset drops the hold so a
 * board-switch camera restore is not a gesture.
 */

export type GhostScreenBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type GhostCamera = {
  scrollX: number;
  scrollY: number;
  zoom: number;
};

/** Locked student, independent student, or a sender that omitted the flag. */
export type GhostViewLock = "locked" | "independent" | "unknown";

type GhostFreezePhase = "tracking" | "gesturing" | "settling";

export type GhostFreezeState = {
  phase: GhostFreezePhase;
  camera: GhostCamera | null;
  painted: GhostScreenBox | null;
  held: GhostScreenBox | null;
  lastMoveAt: number | null;
  /** peerSeq in hand at the last camera change. */
  peerSeqAtMove: number | null;
  /** Camera changes before this time stay in tracking (board-switch restore). */
  suppressGestureUntil: number | null;
};

export type GhostFreezeInput = {
  now: number;
  camera: GhostCamera;
  projected: GhostScreenBox | null;
  lock: GhostViewLock;
  /** Increments when a new peer view message is applied. */
  peerSeq: number;
  /** Arrival time of the peer message currently in hand. */
  peerAt: number | null;
};

export type GhostFreezeDecision = {
  state: GhostFreezeState;
  box: GhostScreenBox | null;
  holding: boolean;
};

const CAMERA_EPSILON = 0.01;
const GESTURE_END_MS = 250;
const HOLD_CAP_MS = 500;
/** Saved-camera restore can land a few frames after the page id changes. */
const PAGE_RESTORE_GRACE_MS = 500;

export function createGhostFreezeState(): GhostFreezeState {
  return {
    phase: "tracking",
    camera: null,
    painted: null,
    held: null,
    lastMoveAt: null,
    peerSeqAtMove: null,
    suppressGestureUntil: null,
  };
}

export function resetGhostFreeze(now = 0): GhostFreezeState {
  return {
    ...createGhostFreezeState(),
    suppressGestureUntil: now + PAGE_RESTORE_GRACE_MS,
  };
}

function copyCamera(camera: GhostCamera): GhostCamera {
  return { scrollX: camera.scrollX, scrollY: camera.scrollY, zoom: camera.zoom };
}

function copyBox(box: GhostScreenBox): GhostScreenBox {
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

function cameraMoved(prev: GhostCamera, next: GhostCamera): boolean {
  return (
    Math.abs(prev.scrollX - next.scrollX) > CAMERA_EPSILON ||
    Math.abs(prev.scrollY - next.scrollY) > CAMERA_EPSILON ||
    Math.abs(prev.zoom - next.zoom) > CAMERA_EPSILON
  );
}

function release(camera: GhostCamera, projected: GhostScreenBox | null): GhostFreezeDecision {
  const painted = projected ? copyBox(projected) : null;
  return {
    state: {
      phase: "tracking",
      camera: copyCamera(camera),
      painted,
      held: null,
      lastMoveAt: null,
      peerSeqAtMove: null,
      suppressGestureUntil: null,
    },
    box: painted,
    holding: false,
  };
}

function hold(
  camera: GhostCamera,
  anchor: GhostScreenBox,
  lastMoveAt: number,
  peerSeqAtMove: number
): GhostFreezeDecision {
  return {
    state: {
      phase: "gesturing",
      camera: copyCamera(camera),
      painted: anchor,
      held: anchor,
      lastMoveAt,
      peerSeqAtMove,
      suppressGestureUntil: null,
    },
    box: anchor,
    holding: true,
  };
}

function lockedPeerCaughtUp(
  lastMoveAt: number,
  seqAtMove: number | null,
  input: GhostFreezeInput
): boolean {
  if (input.peerAt === null || seqAtMove === null) return false;
  return input.peerSeq > seqAtMove && input.peerAt >= lastMoveAt;
}

export function stepGhostFreeze(
  prev: GhostFreezeState,
  input: GhostFreezeInput
): GhostFreezeDecision {
  const { now, camera, projected, lock, peerSeq } = input;

  if (
    prev.camera === null ||
    (prev.suppressGestureUntil !== null && now < prev.suppressGestureUntil)
  ) {
    const painted = projected ? copyBox(projected) : null;
    return {
      state: {
        phase: "tracking",
        camera: copyCamera(camera),
        painted,
        held: null,
        lastMoveAt: null,
        peerSeqAtMove: null,
        suppressGestureUntil: prev.suppressGestureUntil,
      },
      box: painted,
      holding: false,
    };
  }

  if (cameraMoved(prev.camera, camera)) {
    const anchor = prev.held ?? prev.painted;
    if (!anchor) return release(camera, projected);
    return hold(camera, anchor, now, peerSeq);
  }

  if (
    (prev.phase === "gesturing" || prev.phase === "settling") &&
    prev.lastMoveAt !== null
  ) {
    const sinceMove = now - prev.lastMoveAt;
    if (sinceMove < GESTURE_END_MS) {
      return {
        state: { ...prev, phase: "gesturing", camera: copyCamera(camera) },
        box: prev.held,
        holding: true,
      };
    }
    const releaseLocked =
      sinceMove >= HOLD_CAP_MS ||
      lockedPeerCaughtUp(prev.lastMoveAt, prev.peerSeqAtMove, input);
    if (lock !== "locked" || releaseLocked) {
      return release(camera, projected);
    }
    return {
      state: {
        ...prev,
        phase: "settling",
        camera: copyCamera(camera),
      },
      box: prev.held,
      holding: true,
    };
  }

  const painted = projected ? copyBox(projected) : null;
  return {
    state: {
      ...prev,
      phase: "tracking",
      camera: copyCamera(camera),
      painted,
      held: null,
      peerSeqAtMove: null,
    },
    box: painted,
    holding: false,
  };
}
