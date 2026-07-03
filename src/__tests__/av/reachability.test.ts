import { isPeerReachable } from "@/lib/av/reachability";

describe("isPeerReachable", () => {
  test("ICE connected + PC connecting → true (Safari aggregate lag)", () => {
    expect(
      isPeerReachable({
        peerConnectionState: "connecting",
        iceConnectionState: "connected",
      })
    ).toBe(true);
  });

  test("ICE completed + PC connected → true", () => {
    expect(
      isPeerReachable({
        peerConnectionState: "connected",
        iceConnectionState: "completed",
      })
    ).toBe(true);
  });

  test("ICE connected + PC new → true (stale aggregate snapshot)", () => {
    expect(
      isPeerReachable({
        peerConnectionState: "new",
        iceConnectionState: "connected",
      })
    ).toBe(true);
  });

  test.each([
    ["checking", "connected"],
    ["checking", "new"],
    ["new", "connecting"],
    ["new", "new"],
    ["failed", "checking"],
  ] as const)(
    "ICE %s + PC %s → false (ICE not ready)",
    (iceConnectionState, peerConnectionState) => {
      expect(
        isPeerReachable({ peerConnectionState, iceConnectionState })
      ).toBe(false);
    }
  );

  test("ICE connected + PC failed → false", () => {
    expect(
      isPeerReachable({
        peerConnectionState: "failed",
        iceConnectionState: "connected",
      })
    ).toBe(false);
  });

  test("ICE completed + PC closed → false", () => {
    expect(
      isPeerReachable({
        peerConnectionState: "closed",
        iceConnectionState: "completed",
      })
    ).toBe(false);
  });
});
