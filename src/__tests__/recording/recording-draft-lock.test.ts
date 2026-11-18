/**
 * @jest-environment node
 *
 * Live-owner check for a recording draft. The workspace scan calls
 * `recoverDraftIfNotLive`; these pin the two answers it can give.
 */

import { DRAFT_TIMESLICE_MS } from "@/lib/recording/recording-draft-store";
import {
  DRAFT_FRESH_WINDOW_MS,
  draftLockName,
  draftRescanDelayMs,
  recoverDraftIfNotLive,
} from "@/lib/recording/recording-draft-lock";

const ROW = {
  sessionId: "wbs-1",
  streamId: "tutor:mic",
  segmentId: "seg-live",
  checkpointedAt: 1_000,
};

function installLocks(held: Set<string>) {
  const locks = {
    request: async (
      name: string,
      optionsOrCb: { ifAvailable?: boolean } | ((lock: unknown) => unknown),
      maybeCb?: (lock: unknown) => unknown
    ) => {
      const options = typeof optionsOrCb === "function" ? {} : optionsOrCb;
      const cb = (
        typeof optionsOrCb === "function" ? optionsOrCb : maybeCb
      ) as (lock: unknown) => unknown;
      if (options.ifAvailable && held.has(name)) return cb(null);
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        return await cb({ name, mode: "exclusive" });
      } finally {
        held.delete(name);
      }
    },
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { locks },
  });
  return held;
}

describe("recording-draft-lock", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
  });

  test("freshness window is about three timeslices", () => {
    expect(DRAFT_TIMESLICE_MS).toBe(5_000);
    expect(DRAFT_FRESH_WINDOW_MS).toBe(DRAFT_TIMESLICE_MS * 3);
  });

  test("a held lock means the draft is live: recover is not called", async () => {
    const name = draftLockName(ROW.sessionId, ROW.streamId, ROW.segmentId);
    installLocks(new Set([name]));
    const recover = jest.fn(async () => "audio");
    const outcome = await recoverDraftIfNotLive(ROW, recover);
    expect(outcome).toEqual({ status: "live" });
    expect(recover).not.toHaveBeenCalled();
    expect(draftRescanDelayMs(ROW.checkpointedAt)).toBeNull();
  });

  test("a free lock lets the scan recover, and holds the lock for the duration of recover", async () => {
    const held = installLocks(new Set());
    let heldDuringRecover = false;
    const recover = jest.fn(async () => {
      heldDuringRecover = held.has(draftLockName(ROW.sessionId, ROW.streamId, ROW.segmentId));
      return "audio";
    });
    const outcome = await recoverDraftIfNotLive(ROW, recover);
    expect(outcome).toEqual({ status: "recovered", value: "audio" });
    expect(heldDuringRecover).toBe(true);
    expect(held.size).toBe(0);
  });

  test("without Web Locks a fresh checkpoint is live and a stale one is recovered", async () => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    const now = 50_000;
    const fresh = await recoverDraftIfNotLive(
      { ...ROW, checkpointedAt: now - DRAFT_FRESH_WINDOW_MS + 1 },
      async () => "nope",
      now
    );
    expect(fresh.status).toBe("live");
    expect(draftRescanDelayMs(now - DRAFT_FRESH_WINDOW_MS + 1, now)).toBe(1);

    const recover = jest.fn(async () => "audio");
    const stale = await recoverDraftIfNotLive(
      { ...ROW, checkpointedAt: now - DRAFT_FRESH_WINDOW_MS },
      recover,
      now
    );
    expect(stale).toEqual({ status: "recovered", value: "audio" });
    expect(draftRescanDelayMs(now - DRAFT_FRESH_WINDOW_MS, now)).toBeNull();
  });
});
