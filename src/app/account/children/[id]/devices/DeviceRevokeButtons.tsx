"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type DeviceRevokeButtonsProps =
  | { learnerProfileId: string; sessionId: string; mode: "one"; label: string }
  | { learnerProfileId: string; sessionId?: undefined; mode: "all"; label: string };

export function DeviceRevokeButtons({
  learnerProfileId,
  sessionId,
  mode,
  label,
}: DeviceRevokeButtonsProps) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleRevoke() {
    setBusy(true);
    try {
      const url =
        mode === "one"
          ? `/api/learner-profiles/${learnerProfileId}/device-sessions/${sessionId}/revoke`
          : `/api/learner-profiles/${learnerProfileId}/device-sessions/revoke-all`;

      await fetch(url, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRevoke}
      disabled={busy}
      aria-busy={busy}
      className="shrink-0"
    >
      {busy ? "Revoking…" : label}
    </Button>
  );
}
