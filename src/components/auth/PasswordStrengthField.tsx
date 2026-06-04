"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_SCORE } from "@/lib/password-strength";

interface PasswordStrengthFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  name: string;
  label?: string;
  strengthScore?: number | null;
}

/**
 * Reusable password input with strength meter and show/hide toggle.
 *
 * The parent controls the `value` and `onChange`; the parent also computes
 * `strengthScore` (from zxcvbn) and passes it in so the meter can render.
 * Keeping computation in the parent avoids loading zxcvbn in this module
 * (server-tree-shaking safety — this component is always client).
 */
export function PasswordStrengthField({
  id,
  name,
  strengthScore,
  ...inputProps
}: PasswordStrengthFieldProps) {
  const [show, setShow] = useState(false);

  const score = strengthScore ?? null;

  let meterColor = "bg-destructive/60";
  let meterLabel = "Weak";
  if (score !== null && score >= 3) {
    meterColor = "bg-green-500";
    meterLabel = "Strong";
  } else if (score !== null && score >= MIN_PASSWORD_SCORE) {
    meterColor = "bg-yellow-400";
    meterLabel = "Good";
  }

  const hasValue =
    typeof inputProps.value === "string"
      ? inputProps.value.length > 0
      : false;

  return (
    <div className="space-y-1.5">
      <div className="relative flex items-center">
        <Input
          {...inputProps}
          id={id}
          name={name}
          type={show ? "text" : "password"}
          className={`${inputProps.className ?? ""} min-h-11 pr-16`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {/* IAC-11-E: show requirements up front under the field */}
      {!hasValue && (
        <p className="text-xs text-muted-foreground">
          {`Minimum ${MIN_PASSWORD_LENGTH} characters — strength meter must reach "Good" or better.`}
        </p>
      )}

      {hasValue && score !== null && (
        <div aria-live="polite" className="space-y-1">
          <div className="flex h-1.5 gap-1 rounded-full">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                  i <= score ? meterColor : "bg-muted"
                }`}
              />
            ))}
          </div>
          <p
            className={`text-xs ${
              score < MIN_PASSWORD_SCORE
                ? "text-destructive"
                : score >= 3
                  ? "text-green-600 dark:text-green-400"
                  : "text-yellow-600 dark:text-yellow-400"
            }`}
          >
            {meterLabel}
          </p>
        </div>
      )}
    </div>
  );
}
