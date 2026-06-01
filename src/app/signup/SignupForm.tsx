"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "./actions";

export default function SignupForm() {
  const [state, formAction] = useActionState(signup, null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4" onSubmit={() => setBusy(true)}>
      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
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
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-password-confirm">Confirm password</Label>
        <Input
          id="signup-password-confirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="min-h-11"
          aria-invalid={state?.error ? true : undefined}
          aria-describedby={state?.error ? formErrorId : undefined}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signup-displayName">Your name (shown to parents in emails)</Label>
        <Input
          id="signup-displayName"
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
        <AuthMortensenNotice />
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Creating…" : "Create account"}
        </Button>
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
