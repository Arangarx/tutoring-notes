"use client";

import { Button } from "@/components/ui/button";
import { submitNamedForm } from "@/lib/submit-named-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const ORG_END_CHOICE_WARNING =
  "Let it finish, or end it now. Ending it now still lets the tutor finalize notes inside the seven-day window.";

/** Proposed. Andrew has not accepted this sentence. */
export const ORG_END_NO_NOTES_WARNING =
  "No notes will come from this session. Ending it does not give the time back. After the free pilot, that time still counts as time used.";

function submitOrgEndChoice(formId: string, choice: "finish" | "now" | "no-notes") {
  submitNamedForm(formId, (form) => {
    const choiceInput = form.querySelector('input[name="choice"]');
    if (choiceInput instanceof HTMLInputElement) choiceInput.value = choice;
  });
}

export function OrgSessionEndChoiceDialog({
  formId,
  triggerLabel,
  title,
  testId,
}: {
  formId: string;
  triggerLabel: string;
  title: string;
  testId: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid={testId}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription data-testid="org-session-end-warning">
            {ORG_END_CHOICE_WARNING}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground" data-testid="org-end-no-notes-warning">
          {ORG_END_NO_NOTES_WARNING}
        </p>
        <DialogFooter>
          <Button
            type="button"
            data-testid="org-let-it-finish"
            onClick={() => submitOrgEndChoice(formId, "finish")}
          >
            Let it finish
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="org-end-it-now"
            onClick={() => submitOrgEndChoice(formId, "now")}
          >
            End it now (notes still allowed for 7 days)
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="org-end-no-notes"
            onClick={() => submitOrgEndChoice(formId, "no-notes")}
          >
            End it now, and no notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
