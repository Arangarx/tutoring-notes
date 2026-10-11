"use client";

import { useState } from "react";

import { CheckboxField } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Explicit unlimited is the checked box. A number is a limit. Omitted is not this form. */
export function OrgDailyCapFields({ current }: { current: number | null }) {
  const [unlimited, setUnlimited] = useState(current == null);
  const [value, setValue] = useState(current == null ? "" : String(current));

  return (
    <div className="space-y-3">
      <CheckboxField
        id="org-daily-cap-unlimited"
        label="No daily limit"
        checked={unlimited}
        onCheckedChange={(checked) => setUnlimited(checked === true)}
      />
      <input type="hidden" name="unlimited" value={unlimited ? "1" : "0"} />
      <div className="space-y-2">
        <Label htmlFor="org-daily-cap">Daily invite limit</Label>
        <Input
          id="org-daily-cap"
          name="dailyInviteCap"
          type="number"
          min={1}
          inputMode="numeric"
          value={value}
          disabled={unlimited}
          required={!unlimited}
          onChange={(event) => setValue(event.target.value)}
          className="max-w-32"
        />
      </div>
    </div>
  );
}
