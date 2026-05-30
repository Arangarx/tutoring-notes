"use client";

import { useEffect, useState } from "react";
import type { ExcalidrawApiLike } from "@/lib/whiteboard/insert-asset";
import {
  viewportSceneCenterFromScroll,
  readViewportSizeFromAppState,
} from "@/lib/whiteboard/viewport-align";
import type { WhiteboardWireFollow } from "@/lib/whiteboard/sync-client";
import { useWbDebugEnabled } from "@/lib/whiteboard/use-wb-debug-enabled";
import {
  ageMs,
  centerMatchLabel,
  formatSceneCenter,
  type WbFollowDebugTelemetry,
} from "@/lib/whiteboard/wb-follow-debug-telemetry";

const TICK_MS = 120;

export type WhiteboardDebugHudProps = {
  role: "tutor" | "student";
  /** Follow / sync on (`!independentView` on student). */
  syncOn: boolean;
  activePageId: string;
  excalidrawAPI: ExcalidrawApiLike | null;
  telemetry: WbFollowDebugTelemetry;
};

type AppStateSlice = {
  scrollX: number;
  scrollY: number;
  zoom: { value: number };
  width?: number;
  height?: number;
  offsetLeft?: number;
  offsetTop?: number;
};

function readAppStateSlice(api: ExcalidrawApiLike | null): AppStateSlice | null {
  if (!api) return null;
  try {
    const st = api.getAppState() as AppStateSlice;
    if (!st || typeof st !== "object") return null;
    return st;
  } catch {
    return null;
  }
}

function zoomValue(st: AppStateSlice | null): number | null {
  const z = st?.zoom?.value;
  return typeof z === "number" && Number.isFinite(z) ? z : null;
}

/** HUD reads live appState on every tick — only render when safe to read. */
function isHudAppStateReady(st: AppStateSlice | null): boolean {
  if (!st) return false;
  if (!Number.isFinite(st.scrollX) || !Number.isFinite(st.scrollY)) return false;
  if (zoomValue(st) === null) return false;
  return readViewportSizeFromAppState(st) !== null;
}

function myCenterFromAppState(st: AppStateSlice | null): { x: number; y: number } | null {
  if (!isHudAppStateReady(st)) return null;
  const size = readViewportSizeFromAppState(st);
  const zoom = zoomValue(st);
  if (!size || zoom === null) return null;
  const offsetLeft =
    typeof st!.offsetLeft === "number" && Number.isFinite(st!.offsetLeft)
      ? st!.offsetLeft
      : 0;
  const offsetTop =
    typeof st!.offsetTop === "number" && Number.isFinite(st!.offsetTop)
      ? st!.offsetTop
      : 0;
  return viewportSceneCenterFromScroll(
    st!.scrollX,
    st!.scrollY,
    zoom,
    size.viewportWidth,
    size.viewportHeight,
    offsetLeft,
    offsetTop
  );
}

function followCenter(f: WhiteboardWireFollow | null): { x: number; y: number } | null {
  if (!f || !Number.isFinite(f.centerSceneX) || !Number.isFinite(f.centerSceneY)) {
    return null;
  }
  return { x: f.centerSceneX, y: f.centerSceneY };
}

function HudLines({
  role,
  syncOn,
  activePageId,
  st,
  myCenter,
  telemetry,
}: {
  role: "tutor" | "student";
  syncOn: boolean;
  activePageId: string;
  st: AppStateSlice | null;
  myCenter: { x: number; y: number } | null;
  telemetry: WbFollowDebugTelemetry;
}) {
  const zoom = zoomValue(st);
  const sent = telemetry.lastSentFollow.current;
  const recv = telemetry.lastRecvFollow.current;
  const applied = telemetry.lastAppliedCenter.current;

  return (
    <div data-testid="whiteboard-debug-hud">
      <div>role={role}</div>
      <div>sync={syncOn ? "on" : "off"}</div>
      <div>pvs={activePageId || "n/a"}</div>
      <div>
        scroll=({st ? st.scrollX.toFixed(1) : "n/a"},{st ? st.scrollY.toFixed(1) : "n/a"})
      </div>
      <div>zoom={typeof zoom === "number" ? zoom.toFixed(3) : "n/a"}</div>
      <div>
        viewportW={st?.width ?? "n/a"} viewportH={st?.height ?? "n/a"}
      </div>
      <div>
        offsetL={st?.offsetLeft ?? 0} offsetT={st?.offsetTop ?? 0}
      </div>
      <div>
        myCenter=
        {myCenter ? formatSceneCenter(myCenter.x, myCenter.y) : "n/a"}
      </div>
      {role === "tutor" ? (
        <>
          <div>
            sentCenter=
            {followCenter(sent)
              ? formatSceneCenter(sent!.centerSceneX, sent!.centerSceneY)
              : "n/a"}
          </div>
          <div>sentZoom={sent?.zoom ?? "n/a"}</div>
          <div>age={ageMs(telemetry.lastSentAt.current)}ms</div>
          <div>trigger={telemetry.lastSentTrigger.current}</div>
        </>
      ) : (
        <>
          <div>
            recvCenter=
            {followCenter(recv)
              ? formatSceneCenter(recv!.centerSceneX, recv!.centerSceneY)
              : "n/a"}
          </div>
          <div>recvZoom={recv?.zoom ?? "n/a"}</div>
          <div>age={ageMs(telemetry.lastRecvAt.current)}ms</div>
          <div>
            appliedCenter=
            {applied ? formatSceneCenter(applied.x, applied.y) : "n/a"}
          </div>
          <div>
            match=
            {centerMatchLabel(myCenter, followCenter(recv))}
          </div>
        </>
      )}
    </div>
  );
}

export function WhiteboardDebugHud(props: WhiteboardDebugHudProps) {
  const enabled = useWbDebugEnabled();
  const [, tick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => tick((n) => n + 1), TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const st = readAppStateSlice(props.excalidrawAPI);
  if (!isHudAppStateReady(st)) return null;

  const myCenter = myCenterFromAppState(st);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 4,
        left: 4,
        zIndex: 40,
        pointerEvents: "none",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 10,
        lineHeight: 1.35,
        color: "var(--text-inverse)",
        background: "var(--surface-overlay)",
        padding: "6px 8px",
        borderRadius: 4,
        maxWidth: "min(96vw, 320px)",
        whiteSpace: "pre-wrap",
        userSelect: "none",
      }}
    >
      <HudLines
        role={props.role}
        syncOn={props.syncOn}
        activePageId={props.activePageId}
        st={st}
        myCenter={myCenter}
        telemetry={props.telemetry}
      />
    </div>
  );
}
