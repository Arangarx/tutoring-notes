"use client";

import { useActionState, useId, useState } from "react";
import zxcvbn from "zxcvbn";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-strength";
import { createFirstAdmin } from "./actions";

export default function SetupForm({ setupToken }: { setupToken: string }) {
  const [state, formAction] = useActionState(createFirstAdmin, null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  const formErrorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" onSubmit={() => setBusy(true)}>
      <input type="hidden" name="setupToken" value={setupToken} />
      <div className="space-y-2">
        <Label htmlFor="setup-email">Email</Label>
        <Input
          id="setup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-password">Password</Label>
        <PasswordStrengthField
          id="setup-password"
          name="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => {
            const val = e.target.value;
            setPassword(val);
            setPasswordScore(val.length > 0 ? zxcvbn(val).score : null);
          }}
          strengthScore={passwordScore}
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-password-confirm">Confirm password</Label>
        <Input
          id="setup-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="setup-displayName">Your name (shown to parents in emails)</Label>
        <Input
          id="setup-displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="e.g. Alex Chen"
          className="min-h-11"
        />
        <p className="text-sm text-muted-foreground">
          Optional but recommended. You can change this later under Admin → Profile.
        </p>
      </div>

      {state?.error ? <AuthFieldError id={formErrorId} message={state.error} /> : null}

      <div className="flex flex-col gap-3 pt-1">
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}
