"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";

/** After an invite accept approves a waitlisted tutor, refresh the JWT immediately. */
export function OrgInviteSessionRefresh({ refresh }: { refresh: boolean }) {
  const { update } = useSession();
  useEffect(() => {
    if (refresh) void update();
  }, [refresh, update]);
  return null;
}
