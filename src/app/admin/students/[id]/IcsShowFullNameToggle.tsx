"use client";

import { useTransition } from "react";
import { CheckboxField } from "@/components/ui/checkbox";
import { setStudentIcsShowFullName } from "@/app/admin/students/[id]/actions";

type IcsShowFullNameToggleProps = {
  studentId: string;
  checked: boolean;
};

export function IcsShowFullNameToggle({ studentId, checked }: IcsShowFullNameToggleProps) {
  const [pending, startTransition] = useTransition();

  function handleChange(next: boolean) {
    startTransition(async () => {
      await setStudentIcsShowFullName(studentId, next);
    });
  }

  return (
    <CheckboxField
      id={`ics-show-full-name-${studentId}`}
      label="Use full student name in calendar event titles (ICS feed and Google Calendar)"
      checked={checked}
      disabled={pending}
      onCheckedChange={(value) => handleChange(value === true)}
      data-testid="ics-show-full-name-toggle"
    />
  );
}
