"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { unlockChildPinAction } from "./actions";

export function UnlockPinButton({ learnerProfileId }: { learnerProfileId: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlock() {
    setBusy(true);
    setError(null);
    try {
      const result = await unlockChildPinAction(learnerProfileId);
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error ?? "unknown");
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-green-700 dark:text-green-400" role="status">
        {"Account unlocked — your child can try signing in again."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {"Your child's account has been locked due to too many failed sign-in attempts."}
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleUnlock}
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? "Unlocking…" : "Unlock account"}
      </Button>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {"Something went wrong. Please refresh and try again."}
        </p>
      )}
    </div>
  );
}
