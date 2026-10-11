"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SELF_LEARNER_AGREEMENT } from "@/lib/consent-toggle-copy";

/** The one self-learner agreement checkbox. Claim setup and settings both use it. */
export function SelfLearnerAgreement({
  checked,
  onCheckedChange,
  id = "self-learner-agreement",
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        data-testid="self-learner-agreement"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-sm font-normal leading-snug">
        {SELF_LEARNER_AGREEMENT}
      </Label>
    </div>
  );
}
