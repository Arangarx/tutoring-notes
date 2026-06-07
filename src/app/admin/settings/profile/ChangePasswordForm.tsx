"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, sendPasswordResetEmail } from "./actions";

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Update password"}
    </Button>
  );
}

export default function ChangePasswordForm() {
  const [state, formAction, isPending] = useActionState(changePassword, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetPending, startReset] = useTransition();

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state?.ok]);

  return (
    <div className="max-w-sm space-y-6">
      <form ref={formRef} action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>

        {state?.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state?.ok ? (
          <p className="text-sm text-success" role="status">
            Password updated. Use your new password next time you sign in.
          </p>
        ) : null}

        <SubmitButton pending={isPending} />
      </form>

      <div className="border-t border-border pt-6 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Reset via email</p>
          <p className="text-sm text-muted-foreground">
            We&rsquo;ll send a link to <strong className="text-foreground font-medium">your signed-in email</strong> so
            you can set a new password without your current one. Requires email (SMTP or Gmail) to be
            configured.
          </p>
        </div>

        {resetErr ? (
          <p className="text-sm text-destructive" role="alert">
            {resetErr}
          </p>
        ) : null}
        {resetMsg ? (
          <p className="text-sm text-success" role="status">
            {resetMsg}
          </p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          disabled={resetPending}
          onClick={() => {
            setResetErr(null);
            setResetMsg(null);
            startReset(async () => {
              const r = await sendPasswordResetEmail();
              if (r.ok && r.message) setResetMsg(r.message);
              else setResetErr(r.error ?? "Could not send reset email.");
            });
          }}
        >
          {resetPending ? "Sending…" : "Email me a reset link"}
        </Button>
      </div>
    </div>
  );
}
