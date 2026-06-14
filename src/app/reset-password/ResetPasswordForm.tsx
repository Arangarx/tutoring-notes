"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import zxcvbn from "zxcvbn";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { PasswordStrengthField } from "@/components/auth/PasswordStrengthField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storePasswordCredential } from "@/lib/credential-manager";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-strength";

export default function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formErrorId = useId();

  if (!token) {
    return (
      <AuthShell
        title="Invalid link"
        description="This page needs a reset token from your email."
        footer={
          <Link href="/forgot-password" className="text-brand underline-offset-2 hover:underline">
            Request a new link
          </Link>
        }
      >
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      description={`Choose a strong password (at least ${MIN_PASSWORD_LENGTH} characters).`}
      footer={
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Could not reset password.");
              return;
            }
            // Prompt the browser to save the new credential before navigating away.
            await storePasswordCredential(email, password);
            router.push("/login?reset=1");
          } catch {
            setError("Couldn't reach Mynk. Check your internet, then try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {email ? (
          /* Hidden username anchor: visually hidden but NOT aria-hidden so the
             browser password manager associates the email with the new-password
             fields and offers to save / generate a credential (FIX 3). */
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            className="sr-only"
          />
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <PasswordStrengthField
            id="password"
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
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        {error ? <AuthFieldError id={formErrorId} message={error} /> : null}

        <div className="flex flex-col gap-3 pt-1">
          <Button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="min-h-11 w-full text-base"
          >
            {busy ? "Saving…" : "Save password"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
