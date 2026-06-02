"use client";

import Link from "next/link";
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

function AccountSignupForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? null;
  const errorParam = searchParams.get("error");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordScore, setPasswordScore] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  const linkExpired = errorParam === "link_expired" || errorParam === "link_invalid";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/account-holder/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName.trim() || undefined,
          returnTo: returnTo ?? undefined,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (data.error === "password_too_short") {
          setError("password_too_short");
        } else if (data.error === "password_too_weak") {
          setError("password_too_weak");
        } else if (data.error === "invalid_email") {
          setError("invalid_email");
        } else {
          setError("server");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell title="Check your email" description="We sent you a confirmation link.">
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            We sent a confirmation link to{" "}
            <strong className="text-foreground">{email}</strong>. Click the link in the email to
            activate your account.
          </p>
          <p>{"The link expires in 24 hours. Check your spam folder if you don't see it."}</p>
        </div>
        <div className="mt-4">
          <Link
            href="/account/login"
            className="text-sm text-brand underline-offset-2 hover:underline"
          >
            {"Already confirmed? Sign in \u2192"}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      description="Parent or adult learner? Sign up here."
      footer={
        <p>
          {"Already have an account? "}
          <Link href="/account/login" className="text-brand underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      {linkExpired ? (
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
          <p className="font-medium text-foreground">Verification link used or expired</p>
          <p className="text-muted-foreground">
            This link has already been used or has expired.{" "}
            <a
              href="/account/login"
              className="text-brand underline-offset-2 hover:underline"
            >
              If your account is already active, just log in →
            </a>
          </p>
          <p className="text-muted-foreground">
            Need a new link? Sign up again with the same email and we&apos;ll send one.
          </p>
        </div>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="ah-signup-name">Your name (optional)</Label>
          <Input
            id="ah-signup-name"
            name="displayName"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alex Smith"
            className="min-h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ah-signup-email">Email</Label>
          <Input
            id="ah-signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11"
            aria-invalid={error === "invalid_email" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ah-signup-password">Password</Label>
          <PasswordStrengthField
            id="ah-signup-password"
            name="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => {
              const val = e.target.value;
              setPassword(val);
              setPasswordScore(val.length > 0 ? zxcvbn(val).score : null);
            }}
            strengthScore={passwordScore}
            aria-invalid={
              error === "password_too_short" || error === "password_too_weak" ? true : undefined
            }
            aria-describedby={error ? formErrorId : undefined}
          />
          <p className="text-xs text-muted-foreground">Minimum {MIN_PASSWORD_LENGTH} characters.</p>
        </div>

        {error === "password_too_short" || error === "password_too_weak" ? (
          <AuthFieldError
            id={formErrorId}
            message={
              error === "password_too_short"
                ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
                : "Password is too weak. Try a longer phrase or mix of words."
            }
          />
        ) : null}
        {error === "invalid_email" ? (
          <AuthFieldError id={formErrorId} message="Enter a valid email address." />
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
          {busy ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function AccountSignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Create your account">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </AuthShell>
      }
    >
      <AccountSignupForm />
    </Suspense>
  );
}
