/**
 * Pure mapping from `RTCPeerConnectionState` + `RTCIceConnectionState`
 * to the user-facing tile state pill — Phase 4d polish.
 *
 * Centralized here so the mapping is testable in isolation (no jsdom,
 * no React) and so future copy / colour tweaks land in one place
 * covered by the unit suite. Replaces the inline `statePillFor`
 * stub that lived in `AVTile.tsx` through 4c.
 *
 * Mapping (per Phase 4d bootstrapper Group A item 1):
 *
 *   self           → "You" (grey), no retry.
 *   connected      → null  — tile renders no pill at all (cleanest
 *                            "things are working" state; avoids the
 *                            "green badge fatigue" UX).
 *   connecting/new → "Connecting…" (blue), no retry.
 *   disconnected   → "Reconnecting…" (amber), no retry. ICE will
 *                    self-heal via the polite-side auto-restart;
 *                    surfacing a retry button here would race the
 *                    automatic recovery and confuse the tutor.
 *   failed         → "Connection failed" (red), retry shown.
 *                    `mesh.restart(peerId)` is the explicit
 *                    recovery path — the polite-side auto-restart
 *                    has already been exhausted by the time we hit
 *                    failed, so a manual retry is the right
 *                    affordance.
 *   closed         → "Disconnected" (red), no retry. The peer
 *                    explicitly left; reconnecting from this side
 *                    can't bring them back.
 */

export type ConnectionStateColor = "green" | "amber" | "red" | "grey" | "blue";

export type ConnectionStatePill = {
  /**
   * User-facing label. Always non-empty when `kind !== "connected"`.
   * Use the `kind` field for code-level branching; this is for the
   * UI string only.
   */
  label: string;
  color: ConnectionStateColor;
  /**
   * When true, the tile should render a "Retry" button that, when
   * clicked, invokes the caller's `onReconnect` callback (which
   * eventually wires to `mesh.restart(peerId)` via
   * `useLiveAV.reconnectPeer`).
   */
  showRetry: boolean;
  /**
   * Coarse semantic kind. Easier to switch on than the label string
   * and stable across copy edits.
   */
  kind:
    | "self"
    | "connected"
    | "connecting"
    | "reconnecting"
    | "failed"
    | "closed";
};

/**
 * Sentinel value indicating the local-tile case — no `peerConnectionState`
 * exists for the tile that's "us" (we don't have a PC to ourselves).
 */
export const SELF_STATE = "self" as const;
export type SelfState = typeof SELF_STATE;

/**
 * Compute the pill descriptor for one tile.
 *
 * The local tile passes `pc = "self"` and any `ice` value (ignored
 * for self). The local self pill is rendered for accessibility / dev
 * affordance; it never shows Retry.
 */
export function getConnectionStatePill(
  pc: RTCPeerConnectionState | SelfState,
  ice: RTCIceConnectionState | SelfState
): ConnectionStatePill {
  if (pc === SELF_STATE) {
    return { label: "You", color: "grey", showRetry: false, kind: "self" };
  }
  if (pc === "connected") {
    return {
      label: "Connected",
      color: "green",
      showRetry: false,
      kind: "connected",
    };
  }
  if (pc === "failed") {
    return {
      label: "Connection failed",
      color: "red",
      showRetry: true,
      kind: "failed",
    };
  }
  if (pc === "closed") {
    return {
      label: "Disconnected",
      color: "red",
      showRetry: false,
      kind: "closed",
    };
  }
  if (pc === "disconnected") {
    // ICE is the recoverable boundary — distinct copy from the
    // initial "Connecting…" state so the tutor can tell apart
    // "we never got there" from "we lost the connection".
    void ice;
    return {
      label: "Reconnecting…",
      color: "amber",
      showRetry: false,
      kind: "reconnecting",
    };
  }
  if (pc === "connecting" || pc === "new") {
    return {
      label: "Connecting…",
      color: "blue",
      showRetry: false,
      kind: "connecting",
    };
  }
  return {
    label: String(pc),
    color: "amber",
    showRetry: false,
    kind: "connecting",
  };
}

/**
 * Whether the `connected` pill should render at all. Surfaced as a
 * separate predicate so callers don't have to know that "no pill"
 * is encoded as `kind === "connected"`.
 */
export function shouldHidePill(pill: ConnectionStatePill): boolean {
  return pill.kind === "connected";
}
