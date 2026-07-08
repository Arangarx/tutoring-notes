"use client";

import { WbIconRedo, WbIconUndo } from "@/components/whiteboard/chrome/wb-icons";

export type WbUndoRedoButtonsProps = {
  undoTestId: string;
  redoTestId: string;
  disabled: boolean;
  onUndo: () => void;
  onRedo: () => void;
};

/** Live top-bar undo/redo pair — tutor and student chrome share layout; testids differ by role. */
export function WbUndoRedoButtons({
  undoTestId,
  redoTestId,
  disabled,
  onUndo,
  onRedo,
}: WbUndoRedoButtonsProps) {
  return (
    <>
      <button
        type="button"
        className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={disabled}
        data-testid={undoTestId}
        onClick={onUndo}
      >
        <WbIconUndo />
      </button>
      <button
        type="button"
        className="mynk-wb-tb-btn mynk-wb-tb-btn--icon mynk-wb-topbar__desktop-only"
        title="Redo (Ctrl+Shift+Z)"
        aria-label="Redo"
        disabled={disabled}
        data-testid={redoTestId}
        onClick={onRedo}
      >
        <WbIconRedo />
      </button>
    </>
  );
}
