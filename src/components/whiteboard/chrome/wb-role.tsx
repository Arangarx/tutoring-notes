"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

/** Participant role for the live board chrome (§7.2 / §7.5.1). */
export type WbParticipantRole = "tutor" | "student";

/** Session timer display format — tutor shows minutes-only per design. */
export type WbTimerFormat = "minutes";

/**
 * Capability flags implied by role (design §7.2 control-set table + §7.5.1).
 * Consumers gate chrome affordances; tutor values reproduce current behavior.
 */
export interface WbCapabilities {
  canEndSession: boolean;
  canShareLink: boolean;
  canInsertAssets: boolean;
  canBroadcastLaser: boolean;
  canAddPage: boolean;
  canDeletePage: boolean;
  showFollowControls: boolean;
  defaultShowLocalVideo: boolean;
  timerFormat: WbTimerFormat;
  showLeaveInsteadOfEnd: boolean;
}

/** Derive chrome capabilities from participant role. */
export function deriveWbCapabilities(role: WbParticipantRole): WbCapabilities {
  if (role === "tutor") {
    return {
      canEndSession: true,
      canShareLink: true,
      canInsertAssets: true,
      canBroadcastLaser: true,
      canAddPage: true,
      canDeletePage: true,
      showFollowControls: false,
      defaultShowLocalVideo: true,
      timerFormat: "minutes",
      showLeaveInsteadOfEnd: false,
    };
  }

  return {
    canEndSession: false,
    canShareLink: false,
    canInsertAssets: false,
    canBroadcastLaser: false,
    canAddPage: false,
    canDeletePage: false,
    showFollowControls: true,
    defaultShowLocalVideo: true,
    timerFormat: "minutes",
    showLeaveInsteadOfEnd: true,
  };
}

interface WbRoleContextValue {
  role: WbParticipantRole;
  capabilities: WbCapabilities;
}

const WbRoleContext = createContext<WbRoleContextValue | null>(null);

export function WbRoleProvider({
  role,
  children,
}: {
  role: WbParticipantRole;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ role, capabilities: deriveWbCapabilities(role) }),
    [role]
  );
  return (
    <WbRoleContext.Provider value={value}>{children}</WbRoleContext.Provider>
  );
}

export function useWbRole(): WbParticipantRole {
  const ctx = useContext(WbRoleContext);
  if (!ctx) {
    throw new Error("useWbRole must be used within WbRoleProvider");
  }
  return ctx.role;
}

export function useWbCapabilities(): WbCapabilities {
  const ctx = useContext(WbRoleContext);
  if (!ctx) {
    throw new Error("useWbCapabilities must be used within WbRoleProvider");
  }
  return ctx.capabilities;
}
