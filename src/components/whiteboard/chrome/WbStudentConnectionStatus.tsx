"use client";

export type WbStudentConnectionStatusProps = {
  connectionPillOk: boolean;
  connectionPillLabel: string;
  liveTimerMs: number;
  showWaitingForOther: boolean;
  formatTimerMinutesOnly: (ms: number) => string;
};

/** Student live top-bar sync pill + session timer — shared by narrow and non-narrow layouts. */
export function WbStudentConnectionStatus({
  connectionPillOk,
  connectionPillLabel,
  liveTimerMs,
  showWaitingForOther,
  formatTimerMinutesOnly,
}: WbStudentConnectionStatusProps) {
  return (
    <>
      <span
        className={`mynk-wb-status-pill${connectionPillOk ? " mynk-wb-status-pill--ok" : " mynk-wb-status-pill--warn"}`}
        data-testid="wb-student-sync-pill"
      >
        {connectionPillLabel}
      </span>
      <span className="mynk-wb-timer" data-testid="wb-student-timer">
        {showWaitingForOther
          ? `${formatTimerMinutesOnly(liveTimerMs)} (waiting)`
          : formatTimerMinutesOnly(liveTimerMs)}
      </span>
    </>
  );
}
