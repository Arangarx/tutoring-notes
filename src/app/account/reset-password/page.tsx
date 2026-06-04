"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import zxcvbn from "zxcvbn";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-strength";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  if (!token) {
    return (
      <AuthShell title="Invalid link">
        <p className="text-sm text-muted-foreground">
          This reset link is invalid or missing. Please request a new one from the{" "}
          <a href="/account/forgot-password" className="text-brand underline-offset-2 hover:underline">
            forgot password page
          </a>
          .
        </p>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("mismatch");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/account-holder/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (data.error === "link_expired") {
          setError("expired");
        } else if (data.error === "password_too_short") {
          setError("too_short");
        } else if (data.error === "password_too_weak") {
          setError("too_weak");
        } else {
          setError("server");
        }
        return;
      }

      // P2a reset-password issues a fresh session and returns ok:true
      // Redirect to dashboard (already signed in)
      window.location.href = "/account/dashboard";
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a new password for your account."
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="ah-reset-password">New password</Label>
          <PasswordStrengthField
            id="ah-reset-password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(e) => {
              const val = e.target.value;
              setNewPassword(val);
              setPasswordScore(val.length > 0 ? zxcvbn(val).score : null);
            }}
            strengthScore={passwordScore}
            aria-invalid={
              error === "too_short" || error === "too_weak" || error === "mismatch"
                ? true
                : undefined
            }
            aria-describedby={error ? formErrorId : undefined}
          />
          <p className="text-xs text-muted-foreground">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="ah-reset-confirm">Confirm new password</Label>
          <Input
            id="ah-reset-confirm"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="min-h-11"
            aria-invalid={error === "mismatch" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        {error === "mismatch" ? (
          <AuthFieldError id={formErrorId} message="Passwords don't match." />
        ) : null}
        {error === "too_short" ? (
          <AuthFieldError
            id={formErrorId}
            message={`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`}
          />
        ) : null}
        {error === "too_weak" ? (
          <div id={formErrorId} role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
            <p className="font-medium">{"That password is too weak."}</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>{"Make it longer"}</li>
              <li>{"Mix unrelated words, numbers, and symbols"}</li>
              <li>{"Avoid common words and names"}</li>
              <li>{"Or let a password manager generate one for you"}</li>
            </ul>
          </div>
        ) : null}
        {error === "expired" ? (
          <AuthFieldError
            id={formErrorId}
            message="This reset link has expired. Please request a new one."
          />
        ) : null}
        {error === "server" || error === "network" ? (
          <AuthFieldError id={formErrorId} message="Something went wrong. Please try again." />
        ) : null}

        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function AccountResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Set a new password">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
