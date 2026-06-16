"use client";

/**
 * @deprecated Replaced by docked notes in SessionReviewMode unified surface (2026-06-15).
 * Retained for reference; no longer mounted in the in-frame review flow.
 */
import { useCallback, useEffect, useRef } from "react";
import TutorNotesSection, {
  type StructuredNoteFields,
} from "@/components/whiteboard/TutorNotesSection";
import type { TutorNoteStatusResult } from "@/app/admin/students/[id]/whiteboard/notes-actions";

export type ReplayNotesDrawerToggleProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
};

export function ReplayNotesDrawerToggle({
  open,
  onOpenChange,
  toggleRef,
}: ReplayNotesDrawerToggleProps) {
  return (
    <button
      ref={toggleRef}
      type="button"
      className="btn"
      style={{ fontSize: 12 }}
      data-testid="wb-replay-notes-drawer-toggle"
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      Notes
    </button>
  );
}

export type ReplayNotesDrawerPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  whiteboardSessionId: string;
  studentId: string;
  initialNote: TutorNoteStatusResult;
  hasAudio: boolean;
  fields: StructuredNoteFields;
  onFieldsChange: (fields: StructuredNoteFields) => void;
  isDirty: boolean;
  onSaved?: () => void;
  toggleRef?: React.RefObject<HTMLButtonElement | null>;
};

export function ReplayNotesDrawerPanel({
  open,
  onOpenChange,
  whiteboardSessionId,
  studentId,
  initialNote,
  hasAudio,
  fields,
  onFieldsChange,
  isDirty,
  onSaved,
  toggleRef,
}: ReplayNotesDrawerPanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
        toggleRef?.current?.focus();
      }
    },
    [onOpenChange, open, toggleRef]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (open && panelRef.current) {
      const firstInput = panelRef.current.querySelector<HTMLElement>(
        "textarea, input:not([type=hidden])"
      );
      firstInput?.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="mynk-wb-replay-drawer-backdrop"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <aside
        ref={panelRef}
        className="mynk-wb-replay-drawer"
        data-testid="wb-replay-notes-drawer"
      >
        <div className="mynk-wb-replay-drawer__body">
          <TutorNotesSection
            whiteboardSessionId={whiteboardSessionId}
            studentId={studentId}
            initialNote={initialNote}
            hasAudio={hasAudio}
            fields={fields}
            onFieldsChange={onFieldsChange}
            pollSyncAllowed={!isDirty}
            onSaved={onSaved}
            variant="drawer"
          />
        </div>
      </aside>
    </>
  );
}

/** @deprecated Use ReplayNotesDrawerToggle + ReplayNotesDrawerPanel */
export function ReplayNotesDrawer(
  props: ReplayNotesDrawerPanelProps & ReplayNotesDrawerToggleProps
) {
  return (
    <>
      <ReplayNotesDrawerToggle
        open={props.open}
        onOpenChange={props.onOpenChange}
        toggleRef={props.toggleRef}
      />
      <ReplayNotesDrawerPanel {...props} />
    </>
  );
}
