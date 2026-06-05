"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function AccountLoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/account/dashboard";
  const notice = searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/account-holder/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.status === 429) {
        const ra = parseInt(res.headers.get("Retry-After") ?? "60", 10);
        setRetryAfterSec(isNaN(ra) ? 60 : ra);
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
          <AuthFieldError
            id={formErrorId}
            message="Email or password didn't match. Try again, or reset your password using the link above."
          />
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
          disabled={busy}
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
