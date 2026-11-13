/**
 * The one "board was not saved" state, shown wherever a replay or review has no board because whiteboard recording
 * was off for the session (consent wave C6, W6). It is decided from the frozen capability, never from the stroke
 * count: an empty board that was recorded says nothing about this.
 */
export const BOARD_NOT_SAVED_COPY = "The board was not saved because whiteboard recording was off.";

export function ReplayBoardNotSavedNotice({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={`card muted${className ? ` ${className}` : ""}`}
      data-testid="wb-board-not-saved"
      style={{ padding: 12, fontSize: 13 }}
    >
      {BOARD_NOT_SAVED_COPY}
    </div>
  );
}
