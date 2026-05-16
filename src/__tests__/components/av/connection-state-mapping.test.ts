import {
  getConnectionStatePill,
  SELF_STATE,
  shouldHidePill,
} from "@/components/av/connection-state-mapping";

describe("getConnectionStatePill — Phase 4d polish mapping", () => {
  test("self → 'You' (grey), no retry, no pill hidden — local tiles always show their own marker", () => {
    const pill = getConnectionStatePill(SELF_STATE, SELF_STATE);
    expect(pill.label).toBe("You");
    expect(pill.color).toBe("grey");
    expect(pill.showRetry).toBe(false);
    expect(pill.kind).toBe("self");
    expect(shouldHidePill(pill)).toBe(false);
  });

  test("connected → renders no pill (shouldHidePill === true) — clean steady-state UI", () => {
    const pill = getConnectionStatePill("connected", "connected");
    expect(pill.kind).toBe("connected");
    expect(shouldHidePill(pill)).toBe(true);
    expect(pill.showRetry).toBe(false);
  });

  test("connecting + new → blue 'Connecting…', no retry", () => {
    for (const pc of ["connecting", "new"] as const) {
      const pill = getConnectionStatePill(pc, "new");
      expect(pill.label).toBe("Connecting…");
      expect(pill.color).toBe("blue");
      expect(pill.showRetry).toBe(false);
      expect(pill.kind).toBe("connecting");
    }
  });

  test("disconnected → amber 'Reconnecting…', NO retry (ICE will self-heal)", () => {
    // Try every ICE substate; the user-facing copy must never
    // leak the raw ICE string.
    for (const ice of [
      "new",
      "checking",
      "connected",
      "completed",
      "disconnected",
      "failed",
      "closed",
    ] as const) {
      const pill = getConnectionStatePill("disconnected", ice);
      expect(pill.label).toBe("Reconnecting…");
      expect(pill.color).toBe("amber");
      expect(pill.showRetry).toBe(false);
      expect(pill.kind).toBe("reconnecting");
    }
  });

  test("failed → red 'Connection failed' WITH retry — auto-restart already exhausted", () => {
    const pill = getConnectionStatePill("failed", "failed");
    expect(pill.label).toBe("Connection failed");
    expect(pill.color).toBe("red");
    expect(pill.showRetry).toBe(true);
    expect(pill.kind).toBe("failed");
    expect(shouldHidePill(pill)).toBe(false);
  });

  test("closed → red 'Disconnected', no retry (peer left; restart can't bring them back)", () => {
    const pill = getConnectionStatePill("closed", "closed");
    expect(pill.label).toBe("Disconnected");
    expect(pill.color).toBe("red");
    expect(pill.showRetry).toBe(false);
    expect(pill.kind).toBe("closed");
  });

  test("only 'failed' surfaces the Retry affordance — closed/reconnecting/connecting do NOT", () => {
    const states: RTCPeerConnectionState[] = [
      "new",
      "connecting",
      "connected",
      "disconnected",
      "closed",
    ];
    for (const pc of states) {
      const pill = getConnectionStatePill(pc, "new");
      expect(pill.showRetry).toBe(false);
    }
    expect(getConnectionStatePill("failed", "new").showRetry).toBe(true);
  });

  test("connected pill is the ONLY hidden state — every other state renders SOMETHING", () => {
    const pcStates: ReadonlyArray<RTCPeerConnectionState> = [
      "new",
      "connecting",
      "connected",
      "disconnected",
      "failed",
      "closed",
    ];
    const hidden = pcStates.filter((pc) =>
      shouldHidePill(getConnectionStatePill(pc, "new"))
    );
    expect(hidden).toEqual(["connected"]);
    // Self is rendered too (returns kind="self", not "connected").
    expect(shouldHidePill(getConnectionStatePill(SELF_STATE, SELF_STATE))).toBe(
      false
    );
  });

  test("unknown PC value falls back to a defensive amber non-retry pill (no throw)", () => {
    // Cast to bypass the type-system — defends against future
    // browsers adding a new RTCPeerConnectionState we haven't
    // mapped.
    const pill = getConnectionStatePill(
      "future-state" as unknown as RTCPeerConnectionState,
      "new"
    );
    expect(pill.color).toBe("amber");
    expect(pill.showRetry).toBe(false);
  });
});
