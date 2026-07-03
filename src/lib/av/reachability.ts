/**
 * Pure reachability predicate for live-A/V peers — used by `useLiveAV`
 * when deriving `reachableParticipants`.
 *
 * ICE `connected`/`completed` is the reliable "media can flow" signal.
 * Aggregate `connectionState` is consulted only to exclude terminal
 * failure (`failed`/`closed`). This is robust to WebKit/Safari holding
 * the aggregate at `"connecting"` while ICE is connected and media
 * flows.
 */

export function isPeerReachable(s: {
  peerConnectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}): boolean {
  const iceOk =
    s.iceConnectionState === "connected" ||
    s.iceConnectionState === "completed";
  const pcDead =
    s.peerConnectionState === "failed" || s.peerConnectionState === "closed";
  return iceOk && !pcDead;
}
