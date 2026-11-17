"use client";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/**
 * Confirms a server-action form that lives outside the dialog.
 * The dialog portals out of the form, and a button's form attribute does not
 * carry a Next.js server action, so confirm submits the form by id.
 */
function submitNamedForm(formId: string) {
  const form = document.getElementById(formId);
  if (form instanceof HTMLFormElement) form.requestSubmit();
}

export function ConfirmActionDialog({
  formId,
  triggerLabel,
  title,
  description,
  confirmLabel,
  testId,
}: {
  formId: string;
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  testId: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" data-testid={testId}>
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={`${testId}-dialog`}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid={`${testId}-cancel`}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid={`${testId}-confirm`}
            onClick={() => submitNamedForm(formId)}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
