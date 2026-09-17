"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
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
        <NativeSelect
          id="roundingIncrementMin"
          name="roundingIncrementMin"
          defaultValue={String(defaults.roundingIncrementMin)}
        >
          {INCREMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="roundingMode">Rounding direction</Label>
        <NativeSelect
          id="roundingMode"
          name="roundingMode"
          defaultValue={defaults.roundingMode}
        >
          {MODE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tutorTimezone">Your timezone</Label>
        <NativeSelect
          id="tutorTimezone"
          name="tutorTimezone"
          defaultValue={defaults.tutorTimezone}
        >
          <option value="">Same as this device</option>
          {BILLING_TIMEZONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {defaults.tutorTimezone &&
          !BILLING_TIMEZONE_OPTIONS.some((o) => o.value === defaults.tutorTimezone) ? (
            <option value={defaults.tutorTimezone}>{defaults.tutorTimezone}</option>
          ) : null}
        </NativeSelect>
        <p className="text-sm text-muted-foreground">
          Defaults to this computer&apos;s timezone. Pick a zone here only if you want an override.
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
