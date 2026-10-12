"use client";

import { Button } from "@/components/ui/button";
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

/**
 * The dialog portals outside the form. A submit button with the HTML form
 * attribute does not carry a Next.js server action, so the choice is written
 * onto a submitter inside the form and that form is submitted.
 */
function submitOrgEndChoice(formId: string, choice: "finish" | "now" | "no-notes") {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) return;
  const choiceInput = form.querySelector('input[name="choice"]');
  if (choiceInput instanceof HTMLInputElement) choiceInput.value = choice;
  form.requestSubmit();
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
