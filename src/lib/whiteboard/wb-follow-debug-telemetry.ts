"use client";

import type { MutableRefObject } from "react";
import type { WhiteboardWireFollow } from "@/lib/whiteboard/sync-client";

export type WbFollowBroadcastTrigger = "pan" | "zoom" | "other";

export type WbFollowDebugTelemetry = {
  lastSentFollow: MutableRefObject<WhiteboardWireFollow | null>;
  lastSentAt: MutableRefObject<number>;
  lastSentTrigger: MutableRefObject<WbFollowBroadcastTrigger>;
  lastRecvFollow: MutableRefObject<WhiteboardWireFollow | null>;
  lastRecvAt: MutableRefObject<number>;
  lastAppliedCenter: MutableRefObject<{ x: number; y: number } | null>;
  lastAppliedAt: MutableRefObject<number>;
};

export function createWbFollowDebugTelemetry(): WbFollowDebugTelemetry {
  return {
    lastSentFollow: { current: null },
    lastSentAt: { current: 0 },
    lastSentTrigger: { current: "other" },
    lastRecvFollow: { current: null },
    lastRecvAt: { current: 0 },
    lastAppliedCenter: { current: null },
    lastAppliedAt: { current: 0 },
  };
}

const CENTER_EPS = 3;

export function formatSceneCenter(x: number, y: number): string {
  return `(${x.toFixed(1)},${y.toFixed(1)})`;
}

export function centerMatchLabel(
  my: { x: number; y: number } | null,
  recv: { x: number; y: number } | null
): string {
  if (!my || !recv) return "n/a";
  const dx = my.x - recv.x;
  const dy = my.y - recv.y;
  if (Math.abs(dx) <= CENTER_EPS && Math.abs(dy) <= CENTER_EPS) {
    return "MATCH";
  }
  return `OFF by (${dx.toFixed(1)},${dy.toFixed(1)})`;
}

export function ageMs(since: number): string {
  if (!since) return "n/a";
  return String(Math.max(0, Date.now() - since));
}

export function inferBroadcastTrigger(
  prev: WhiteboardWireFollow | null,
  next: WhiteboardWireFollow
): WbFollowBroadcastTrigger {
  if (!prev || !hasCenter(prev) || !hasCenter(next)) return "other";
  const zoomChanged = Math.abs(prev.zoom - next.zoom) > 1e-4;
  const panChanged =
    Math.abs((prev.centerSceneX ?? 0) - next.centerSceneX) > 0.5 ||
    Math.abs((prev.centerSceneY ?? 0) - next.centerSceneY) > 0.5;
  if (zoomChanged && !panChanged) return "zoom";
  if (panChanged && !zoomChanged) return "pan";
  if (panChanged || zoomChanged) return "other";
  return "other";
}

function hasCenter(f: WhiteboardWireFollow): boolean {
  return (
    Number.isFinite(f.centerSceneX) &&
    Number.isFinite(f.centerSceneY) &&
    Number.isFinite(f.zoom)
  );
}
