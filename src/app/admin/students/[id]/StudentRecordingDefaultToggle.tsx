"use client";

import { useState, useTransition } from "react";
import { setStudentRecordingDefault } from "./actions";
import { cn } from "@/lib/utils";

/**
 * Per-student "default to recording on" toggle for the whiteboard
 * workspace. Sarah's pilot ask (Apr 2026): some students decline
 * recording, and re-unticking the Start checkbox every time is a
 * paper cut. This switch biases the initial state of the workspace's
 * `userWantsRecording` toggle so those students ship Start-unticked
 * by default; the tutor can still flip per session.
 *
 * Implementation notes:
 *
 *   - Optimistic UI: we flip local state immediately and revert on
 *     error so the click feels instant. The action is cheap (single
 *     row update) but we still surface an error inline if it fails
 *     so the tutor knows the next session won't reflect the change.
 *
 *   - `useTransition` wraps the action call so React can show the
 *     "saving" state without blocking input.
 *
 *   - Revalidate is server-side via `revalidatePath` in the action;
 *     no manual router.refresh() needed here.
 */

export function StudentRecordingDefaultToggle({
  studentId,
  initialEnabled,
}: {
  studentId: string;
  initialEnabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        await setStudentRecordingDefault(studentId, next);
      } catch (err) {
        setEnabled(previous);
        setError(
          err instanceof Error ? err.message : "Could not save the change."
        );
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label
        htmlFor={`record-default-${studentId}`}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm",
          pending && "cursor-wait opacity-70"
        )}
      >
        <input
          id={`record-default-${studentId}`}
          type="checkbox"
          checked={enabled}
          onChange={(e) => handleChange(e.target.checked)}
          disabled={pending}
          data-testid="student-recording-default-toggle"
          className="size-4 shrink-0 rounded border border-input"
        />
        <span className="text-foreground">
          Start whiteboard recording on by default
          <span className="ml-2 text-xs text-muted-foreground">({enabled ? "on" : "off"})</span>
        </span>
      </label>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
