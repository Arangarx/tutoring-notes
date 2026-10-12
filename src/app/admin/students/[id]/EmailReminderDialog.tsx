"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import SendUpdateForm from "./SendUpdateForm";

const REMINDER_SENTENCE =
  "The notes and the lesson replay are already in the family's account. This email only reminds them.";

export function EmailReminderDialog({
  studentId,
  defaultToEmail,
}: {
  studentId: string;
  defaultToEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-fit"
          data-testid="email-reminder-button"
          onClick={() => setOpen(true)}
        >
          Email a reminder
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="email-reminder-dialog">
        <DialogHeader>
          <DialogTitle>Email a reminder</DialogTitle>
          <DialogDescription>{REMINDER_SENTENCE}</DialogDescription>
        </DialogHeader>
        <SendUpdateForm studentId={studentId} defaultToEmail={defaultToEmail} />
      </DialogContent>
    </Dialog>
  );
}
