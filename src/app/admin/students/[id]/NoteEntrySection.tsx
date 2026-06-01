"use client";

import { useRef, useState } from "react";
import AiAssistPanel from "./AiAssistPanel";
import NewNoteForm from "./NewNoteForm";
import type { NewNoteFormHandle } from "./NewNoteForm";
import { AdminSectionCard } from "@/components/admin/AdminSectionCard";

type Props = {
  studentId: string;
  aiEnabled: boolean;
  blobEnabled: boolean;
};

export default function NoteEntrySection({ studentId, aiEnabled, blobEnabled }: Props) {
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
      />
      <AdminSectionCard title="New session note">
        <NewNoteForm ref={formRef} studentId={studentId} onSaved={() => setPanelKey((k) => k + 1)} />
      </AdminSectionCard>
    </div>
  );
}
