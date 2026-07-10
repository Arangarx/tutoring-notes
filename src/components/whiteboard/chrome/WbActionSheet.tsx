"use client";

import { useCallback, useRef, type ReactNode } from "react";

export type WbActionSheetBackdropProps = {
  open: boolean;
  onDismiss: () => void;
};

/** Shared scrim for touch bottom sheets — one backdrop while any sheet is open. */
export function WbActionSheetBackdrop({ open, onDismiss }: WbActionSheetBackdropProps) {
  return (
    <div
      className={`mynk-wb-action-sheet-backdrop${open ? " mynk-wb-action-sheet-backdrop--open" : ""}`}
      onClick={onDismiss}
      // Stop pointer events from reaching Excalidraw's canvas pointerdown handler
      // (which would start a draw action before the click-dismiss fires).
      // Mirrors the guard on WbActionSheet itself (~L74).
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      aria-hidden={!open}
    />
  );
}

export type WbActionSheetProps = {
  open: boolean;
  onDismiss: () => void;
  ariaLabel: string;
  testId?: string;
  children: ReactNode;
};

/**
 * Touch bottom sheet — handle, swipe-down dismiss, backdrop + × close handled by parent.
 * Presentational only; no engine state.
 */
export function WbActionSheet({
  open,
  onDismiss,
  ariaLabel,
  testId,
  children,
}: WbActionSheetProps) {
  const swipeRef = useRef<{ startY: number } | null>(null);

  const onHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!open) return;
      swipeRef.current = { startY: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [open]
  );

  const onHandlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const swipe = swipeRef.current;
      if (!swipe) return;
      if (e.clientY - swipe.startY > 60) {
        swipeRef.current = null;
        onDismiss();
      }
    },
    [onDismiss]
  );

  const onHandlePointerUp = useCallback(() => {
    swipeRef.current = null;
  }, []);

  return (
    <div
      className={`mynk-wb-action-sheet${open ? " mynk-wb-action-sheet--open" : ""}`}
      role="dialog"
      aria-label={ariaLabel}
      aria-hidden={!open}
      data-testid={testId}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="mynk-wb-action-sheet__handle-row"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <div className="mynk-wb-action-sheet__handle" />
        <button
          type="button"
          className="mynk-wb-action-sheet__close"
          aria-label="Dismiss"
          onClick={onDismiss}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>
      <div className="mynk-wb-action-sheet__body mynk-wb-action-sheet__body--scroll-affordance">{children}</div>
    </div>
  );
}
