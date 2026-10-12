"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import NoteEntrySection from "../NoteEntrySection";

/**
 * Search and the notes list lead. The paste/upload/record panel stays visible
 * under the list. Add note reveals only the manual form, beside that panel.
 */
export function NotesPageBody({
  search,
  entry,
  children,
}: {
  search: ReactNode;
  entry: {
    studentId: string;
    aiEnabled: boolean;
    blobEnabled: boolean;
  } | null;
  children: ReactNode;
}) {
  const [manualOpen, setManualOpen] = useState(false);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {search}
        {entry ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            aria-expanded={manualOpen}
            onClick={() => setManualOpen((value) => !value)}
          >
            Add note
          </Button>
        ) : null}
      </div>
      {children}
      {entry ? (
        <div className="mt-8">
          <NoteEntrySection
            studentId={entry.studentId}
            aiEnabled={entry.aiEnabled}
            blobEnabled={entry.blobEnabled}
            manualFormOpen={manualOpen}
            onOpenManualForm={() => setManualOpen(true)}
          />
        </div>
      ) : null}
    </>
  );
}
