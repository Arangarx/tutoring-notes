"use client";

import { FormSubmitButton } from "@/components/ui/form-submit-button";

export function RegenerateCalendarFeedForm({ action }: { action: () => void }) {
  return (
    <form action={action}>
      <FormSubmitButton
        label="Regenerate feed URL"
        pendingLabel="Regenerating…"
        variant="outline"
      />
    </form>
  );
}
