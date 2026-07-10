"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await fetch("/api/auth/account-holder/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        description="If that email is registered, you'll receive a reset link."
      >
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            We sent a password reset link to{" "}
            <strong className="text-foreground">{email}</strong>. The link expires in 1 hour.
          </p>
          <p>{"Check your spam folder if you don't see it."}</p>
        </div>
        <div className="mt-4">
          <Link
            href="/account/login"
            className="text-sm text-brand underline-offset-2 hover:underline"
          >
            {"\u2190"} Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send a reset link."
      footer={
        <Link href="/account/login" className="text-brand underline-offset-2 hover:underline">
          {"\u2190"} Back to sign in
        </Link>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="ah-forgot-email">Email</Label>
          <Input
            id="ah-forgot-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11"
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        {error === "network" ? (
          <AuthFieldError id={formErrorId} message="Couldn't reach Mynk. Try again." />
        ) : null}

        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Sending..." : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
