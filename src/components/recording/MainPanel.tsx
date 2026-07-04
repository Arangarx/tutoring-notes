"use client";

import {
  formatSessionTimeLeft,
  secondsUntilSessionBillingMilestone,
} from "@/lib/recording/segment-policy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MicControls, { type MicControlsProps } from "./MicControls";
import { formatDuration } from "./format-duration";

export type MainPanelProps = {
  /** FSM state from the hook — drives which sub-section renders. */
  state: "idle" | "acquiring" | "ready" | "recording" | "paused";
  /** External disabled (parent-driven, e.g. transcribe in progress). */
  disabled?: boolean;
  /** 1-based segment index — shown in the recording header. */
  segmentNumber: number;
  /**
   * Added to `segmentNumber` for UI labels only (e.g. AI panel already has
   * segments in the pending list when the hook resets to part 1 after Re-record).
   */
  segmentDisplayBase?: number;
  /** Elapsed seconds of the current segment. */
  elapsed: number;
  /** Session elapsed seconds (pause-aware) for billing-milestone warning. */
  sessionElapsed?: number;
  /** True when approaching an hourly session billing milestone. */
  isWarning: boolean;

  /** All MicControls props passed straight through. */
  micControls: MicControlsProps;

  // Actions
  onStart: () => Promise<void> | void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
};

/**
 * The "live" recorder panel — visible whenever we're not in done/uploading/error.
 * Holds MicControls + either the Start button (idle/acquiring/ready) or the
 * Pause/Resume/Stop/Discard cluster (recording/paused).
 */
export default function MainPanel({
  state,
  disabled,
  segmentNumber,
  segmentDisplayBase = 0,
  elapsed,
  sessionElapsed = 0,
  isWarning,
  micControls,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
}: MainPanelProps) {
  const displayPart = segmentNumber + segmentDisplayBase;
  const sessionTimeLeft = secondsUntilSessionBillingMilestone(sessionElapsed);
  return (
    <div data-testid="audio-record-panel">
      <MicControls {...micControls} />

      {(state === "idle" || state === "acquiring" || state === "ready") && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="accent"
            className="min-h-11 shrink-0 whitespace-nowrap"
            onClick={onStart}
            disabled={disabled || state === "acquiring"}
            aria-label="Start recording"
            data-testid="audio-record-start"
          >
            {state === "acquiring" ? "● Connecting…" : "● Start recording"}
          </Button>
          <span className="text-xs leading-relaxed text-muted-foreground sm:ml-auto">
            {state === "ready"
              ? "Speak — watch the level bar — then click Start."
              : "Long sessions save automatically at natural pauses so you can keep recording. Speak at least 15–20 seconds per segment when possible."}
          </span>
        </div>
      )}

      {(state === "recording" || state === "paused") && (
        <div data-testid="audio-record-controls" className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-2.5 shrink-0 rounded-full",
                state === "recording" ? "animate-pulse bg-destructive" : "bg-muted-foreground"
              )}
            />
            <span
              aria-live="polite"
              aria-label={`Segment ${displayPart}, duration ${formatDuration(elapsed)}`}
              className={cn(
                "text-lg font-semibold tabular-nums",
                isWarning ? "text-destructive" : "text-foreground"
              )}
            >
              Part {displayPart} · {formatDuration(elapsed)}
            </span>
            {isWarning ? (
              <span role="alert" className="text-xs text-destructive">
                {formatSessionTimeLeft(sessionTimeLeft)} until session hour mark — billing
                reminder
              </span>
            ) : null}
            <span aria-live="polite" className="ml-auto text-xs text-muted-foreground">
              {state === "paused" ? "Paused" : "Recording…"}
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {state === "recording" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 whitespace-nowrap"
                onClick={onPause}
                aria-label="Pause recording"
                data-testid="audio-record-pause"
              >
                ⏸ Pause
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 shrink-0 whitespace-nowrap"
                onClick={onResume}
                aria-label="Resume recording"
                data-testid="audio-record-resume"
              >
                ▶ Resume
              </Button>
            )}
            <Button
              type="button"
              variant="accent"
              className="min-h-11 shrink-0 whitespace-nowrap"
              onClick={onStop}
              aria-label="Stop and save recording"
              data-testid="audio-record-stop"
            >
              ■ Stop & save
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 shrink-0 whitespace-nowrap sm:ml-auto"
              onClick={onReset}
              aria-label="Discard recording"
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
