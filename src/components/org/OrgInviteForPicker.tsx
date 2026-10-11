"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/** Who receives the organization claim email. Submits inviteFor with the parent form. */
export function OrgInviteForPicker() {
  const [inviteFor, setInviteFor] = useState("student");

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">Send the claim email to</legend>
      <RadioGroup value={inviteFor} onValueChange={setInviteFor} className="gap-2">
        <div className="flex items-center gap-2">
          <RadioGroupItem value="student" id="org-invite-for-student" data-testid="org-invite-for-student" />
          <Label htmlFor="org-invite-for-student" className="text-sm font-normal">
            The student
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="parent" id="org-invite-for-parent" data-testid="org-invite-for-parent" />
          <Label htmlFor="org-invite-for-parent" className="text-sm font-normal">
            Their parent
          </Label>
        </div>
      </RadioGroup>
      <input type="hidden" name="inviteFor" value={inviteFor} />
    </fieldset>
  );
}
