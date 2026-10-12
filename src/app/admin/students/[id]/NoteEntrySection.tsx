"use client";

import { useRef, useState } from "react";
import AiAssistPanel from "./AiAssistPanel";
import NewNoteForm from "./NewNoteForm";
import type { NewNoteFormHandle } from "./NewNoteForm";
import { SectionCard } from "@/components/SectionCard";

type Props = {
  studentId: string;
  aiEnabled: boolean;
  blobEnabled: boolean;
  /** False keeps the manual form closed. Omitted shows the form. */
  manualFormOpen?: boolean;
  /** Called when the panel fills or clears the form, so the caller can open it. */
  onOpenManualForm?: () => void;
};

export default function NoteEntrySection({
  studentId,
  aiEnabled,
  blobEnabled,
  manualFormOpen = true,
  onOpenManualForm,
}: Props) {
  const formRef = useRef<NewNoteFormHandle>(null);
  const [panelKey, setPanelKey] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <AiAssistPanel
        key={panelKey}
        studentId={studentId}
        formRef={formRef}
        enabled={aiEnabled}
        blobEnabled={blobEnabled}
        onFormChanged={onOpenManualForm}
      />
      <div hidden={!manualFormOpen}>
        <SectionCard realm="admin" title="New session note">
          <NewNoteForm ref={formRef} studentId={studentId} onSaved={() => setPanelKey((k) => k + 1)} />
        </SectionCard>
      </div>
    </div>
  );
}
