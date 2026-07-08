"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveBillingDefaults, type BillingDefaultsFormValues } from "./actions";
import { BILLING_TIMEZONE_OPTIONS } from "./billing-options";

const INCREMENT_OPTIONS = [
  { value: "5", label: "5 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "1", label: "1 minute (no rounding bucket)" },
] as const;

const MODE_OPTIONS = [
  { value: "nearest", label: "Nearest" },
  { value: "up", label: "Round up" },
  { value: "down", label: "Round down" },
] as const;

export default function BillingDefaultsForm({
  defaults,
}: {
  defaults: BillingDefaultsFormValues;
}) {
  const [state, formAction, pending] = useActionState(saveBillingDefaults, null);

  return (
    <form action={formAction} className="max-w-md space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="roundingIncrementMin">Time rounding</Label>
        <select
          id="roundingIncrementMin"
          name="roundingIncrementMin"
          defaultValue={String(defaults.roundingIncrementMin)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {INCREMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="roundingMode">Rounding direction</Label>
        <select
          id="roundingMode"
          name="roundingMode"
          defaultValue={defaults.roundingMode}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tutorTimezone">Your timezone</Label>
        <select
          id="tutorTimezone"
          name="tutorTimezone"
          defaultValue={defaults.tutorTimezone}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {BILLING_TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">
          Applies to new sessions; past sessions stay frozen.
        </p>
      </div>

      {state?.ok ? (
        <p className="text-sm text-success" role="status">
          Saved.
        </p>
      ) : null}
      {state?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save billing defaults"}
      </Button>
    </form>
  );
}
