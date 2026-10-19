"use client";

import { createContext, useContext, type ReactNode } from "react";

const LiveIceServersContext = createContext<ReadonlyArray<RTCIceServer> | null>(null);

/**
 * Carries the server-issued TURN servers (`getTurnIceServers`) from the live
 * room's server page to `useLiveAV`. `iceServers={null}` means STUN only.
 */
export function LiveIceServersProvider({
  iceServers,
  children,
}: {
  iceServers: ReadonlyArray<RTCIceServer> | null;
  children: ReactNode;
}) {
  return (
    <LiveIceServersContext.Provider value={iceServers}>
      {children}
    </LiveIceServersContext.Provider>
  );
}

export function useLiveIceServers(): ReadonlyArray<RTCIceServer> | null {
  return useContext(LiveIceServersContext);
}
