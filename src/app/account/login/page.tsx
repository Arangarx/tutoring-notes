"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRetryAfterCountdown } from "@/hooks/useRetryAfterCountdown";
import { parseRetryAfterSeconds } from "@/lib/auth-client";

function AccountLoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/account/dashboard";
  const notice = searchParams.get("notice");
  const source = searchParams.get("source");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { retryAfterSec, isRateLimited, startCountdown } = useRetryAfterCountdown();
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  const noticeMessage =
    notice === "verify_email_expired"
      ? "That verification link has expired. Sign in to your existing account, or request a new verification link."
      : notice === "reset_ok"
        ? "Your password was updated. Sign in with your new password."
        : notice === "link_already_used"
          ? "That verification link has already been used — your account is active. Sign in below."
          : null;

  // Messages for wall-redirect sources (notes auth wall + session state).
  const sourceMessage =
    source === "notes_email"
      ? "To view these notes, sign in with the account that received the link."
      : source === "claim_required"
        ? "Please sign in to claim this student\u2019s notes and view them here."
        : source === "session_expired"
          ? "Your session expired \u2014 please sign in again."
          : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRateLimited) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/account-holder/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 429) {
        startCountdown(parseRetryAfterSeconds(res));
        setError("too_many_requests");
        return;
      }

      const data = (await res.json()) as { next?: string; error?: string };

      if (!res.ok) {
        if (data.error === "email_not_verified") {
          setError("email_not_verified");
        } else {
          setError("credentials");
        }
        setPassword(""); // clear field — prevents browser save-password heuristic on failure
        return;
      }

      // next: "dashboard" | "2fa_required" (Phase 6)
      if (data.next === "2fa_required") {
        window.location.href = "/account/2fa/verify";
      } else {
        window.location.href = returnTo.startsWith("/") ? returnTo : "/account/dashboard";
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Sign in to your account"
      description="Use your account credentials."
      footer={
        <p>
          New to Mynk?{" "}
          <Link href="/account/signup" className="text-brand underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      {noticeMessage ? (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {noticeMessage}
        </p>
      ) : null}
      {sourceMessage ? (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {sourceMessage}
        </p>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="ah-login-email">Email</Label>
          <Input
            id="ah-login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ah-login-password">Password</Label>
          <Input
            id="ah-login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
          <p className="text-sm">
            <Link
              href="/account/forgot-password"
              className="text-brand underline-offset-2 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>

        {error === "credentials" ? (
          <AuthFieldError id={formErrorId}>
            Email or password is incorrect.{" "}
            <Link
              href="/account/forgot-password"
              className="underline underline-offset-2 hover:text-destructive/80"
            >
              Reset your password
            </Link>{" "}
            if you&apos;ve forgotten it.
          </AuthFieldError>
        ) : null}
        {error === "email_not_verified" ? (
          <AuthFieldError
            id={formErrorId}
            message="Please verify your email first. Check your inbox for a confirmation link."
          />
        ) : null}
        {error === "too_many_requests" ? (
          <AuthFieldError
            id={formErrorId}
            message={`Too many attempts — please wait${retryAfterSec ? ` ${retryAfterSec} second${retryAfterSec !== 1 ? "s" : ""}` : " a minute"} and try again.`}
          />
        ) : null}
        {error === "network" ? (
          <AuthFieldError
            id={formErrorId}
            message="Couldn't reach Mynk. Check your connection and try again."
          />
        ) : null}

        <Button
          type="submit"
          disabled={busy || isRateLimited}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function AccountLoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Sign in to your account">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <AccountLoginForm />
    </Suspense>
  );
}
