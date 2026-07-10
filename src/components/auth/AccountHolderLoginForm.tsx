"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRetryAfterCountdown } from "@/hooks/useRetryAfterCountdown";
import { parseRetryAfterSeconds } from "@/lib/auth-client";

export interface AccountHolderLoginFormProps {
  /** Where to redirect after a successful login. Must start with "/" or falls back to /account/dashboard. */
  returnTo: string;
  /**
   * If provided, appends `?returnTo=<forgotPasswordReturnTo>` to the forgot-password link.
   * When absent, the link navigates to /account/forgot-password with no returnTo.
   */
  forgotPasswordReturnTo?: string;
  /**
   * If provided, appends `?returnTo=<twoFaReturnTo>` to the 2FA verify URL when the
   * API responds with next:"2fa_required".
   */
  twoFaReturnTo?: string;
  /** Submit button label. Defaults to "Sign in". The busy label is always "Signing in…". */
  submitLabel?: string;
  /** When provided, renders a Back button below the submit button. */
  onBack?: () => void;
}

/**
 * Shared account-holder login form.
 *
 * Owns the full submit + error-code mapping for /api/auth/account-holder/login:
 *   - email_not_verified  → verify-email message
 *   - invalid_credentials → incorrect credentials message
 *   - 429                 → rate-limit countdown
 *   - network error       → connection error message
 *   - other server error  → generic "something went wrong"
 *
 * Used by /account/login and /claim/[token] (ClaimAuthGate login panel).
 * [composition-over-duplication — replaces the duplicated ClaimLoginForm]
 */
export function AccountHolderLoginForm({
  returnTo,
  forgotPasswordReturnTo,
  twoFaReturnTo,
  submitLabel = "Sign in",
  onBack,
}: AccountHolderLoginFormProps) {
  const uid = useId();
  const errorId = `${uid}-err`;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { retryAfterSec, isRateLimited, startCountdown } = useRetryAfterCountdown();
  const [busy, setBusy] = useState(false);

  const forgotPasswordHref = forgotPasswordReturnTo
    ? `/account/forgot-password?returnTo=${encodeURIComponent(forgotPasswordReturnTo)}`
    : "/account/forgot-password";

  const twoFaHref = twoFaReturnTo
    ? `/account/2fa/verify?returnTo=${encodeURIComponent(twoFaReturnTo)}`
    : "/account/2fa/verify";

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

      if (data.next === "2fa_required") {
        window.location.href = twoFaHref;
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
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={`${uid}-email`}>Email</Label>
        <Input
          id={`${uid}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11"
          aria-invalid={error === "credentials" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={busy || isRateLimited}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${uid}-password`}>Password</Label>
        <Input
          id={`${uid}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11"
          aria-invalid={error === "credentials" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={busy || isRateLimited}
        />
        <p className="text-sm">
          <Link
            href={forgotPasswordHref}
            className="text-brand underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </p>
      </div>

      {error === "credentials" ? (
        <AuthFieldError id={errorId}>
          Email or password is incorrect.{" "}
          <Link
            href={forgotPasswordHref}
            className="underline underline-offset-2 hover:text-destructive/80"
          >
            Reset your password
          </Link>{" "}
          if you&apos;ve forgotten it.
        </AuthFieldError>
      ) : null}
      {error === "email_not_verified" ? (
        <AuthFieldError
          id={errorId}
          message="Please verify your email first. Check your inbox for a confirmation link."
        />
      ) : null}
      {error === "too_many_requests" ? (
        <AuthFieldError
          id={errorId}
          message={`Too many attempts — please wait${retryAfterSec ? ` ${retryAfterSec} second${retryAfterSec !== 1 ? "s" : ""}` : " a minute"} and try again.`}
        />
      ) : null}
      {error === "network" ? (
        <AuthFieldError
          id={errorId}
          message="Couldn't reach Mynk. Check your connection and try again."
        />
      ) : null}

      <Button
        type="submit"
        disabled={busy || isRateLimited}
        aria-busy={busy}
        className="min-h-11 w-full text-base"
      >
        {busy ? "Signing in\u2026" : submitLabel}
      </Button>

      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back
        </button>
      ) : null}
    </form>
  );
}
