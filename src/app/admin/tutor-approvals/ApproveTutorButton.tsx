"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveTutorAction } from "./actions";

export function ApproveTutorButton({ adminUserId }: { adminUserId: string }) {
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      const result = await approveTutorAction(adminUserId);
      if (result.ok) {
        setDone(true);
      } else {
        setError(result.error);
      }
    });
  }

  if (done) {
    return (
      <span className="text-xs font-medium text-green-600 dark:text-green-400">Approved</span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="default"
        onClick={handleApprove}
        disabled={isPending}
      >
        {isPending ? "Approving…" : "Approve"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
