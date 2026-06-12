"use client";

import { Button } from "@/components/ui/button";
import { formatDuration } from "./format-duration";

export type DoneCardProps = {
  /** Last segment's duration (shown on the green success card). */
  doneSegmentSeconds: number;
  /** Click handler for the Re-record button — typically `r.handleReset`. */
  onReset: () => void;
};

/**
 * Success card shown after Stop & save. Pure presentational; the recorder hook
 * owns the state that drives `doneSegmentSeconds` + the reset action.
 */
export default function DoneCard({ doneSegmentSeconds, onReset }: DoneCardProps) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-md border border-success/30 bg-success/10 px-3.5 py-2.5"
      data-testid="audio-record-done"
    >
      <span className="text-sm font-semibold text-success">
        ✓ Recording saved ({formatDuration(doneSegmentSeconds)})
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="ml-auto shrink-0 whitespace-nowrap"
        onClick={onReset}
      >
        Re-record
      </Button>
    </div>
  );
}
