"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AuthFieldError } from "@/components/auth/AuthFieldError";

/**
 * Identity-confirmation interstitial (HARD requirement -- §RATIFIED + AMENDED).
 *
 * Shown when the user follows a claim link while already signed in as an AccountHolder.
 * Prevents a connect link from silently binding learners to whatever ambient
 * `mynk_ah_session` is active (accidental / CSRF-ish mis-bind).
 *
 * Copy: "You're signed in as [email]. Tie [Learner name(s)] to [Tutor]?"
 * "Not you? Switch account" escape -- clears session and routes to login with returnTo.
 */
export function ClaimInterstitial({
  rawToken,
  studentName,
  tutorName,
  signedInEmail,
}: {
  rawToken: string;
  studentName: string;
  tutorName: string | null;
  signedInEmail: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/claim/${rawToken}/complete`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        setupPath?: string;
      };

      if (!res.ok) {
        if (
          data.error === "student_already_claimed" ||
          data.error === "claim_already_completed"
        ) {
          setError("already_claimed");
        } else if (data.error === "email_not_verified") {
          setError("email_not_verified");
        } else {
          setError("server");
        }
        return;
      }

      window.location.href = data.setupPath ?? `/claim/${rawToken}/setup`;
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchAccount() {
    await fetch("/api/auth/account-holder/logout", { method: "POST" });
    window.location.href = `/account/login?returnTo=${encodeURIComponent(`/claim/${rawToken}`)}`;
  }

  return (
    <div className="space-y-4" data-testid="claim-interstitial">
      {/* Identity confirmation panel */}
      <div className="rounded-md border border-border bg-muted/40 p-4">
        <p className="text-sm font-medium text-foreground">
          {"You're signed in as "}
          <strong>{signedInEmail}</strong>.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {"Tie "}
          <strong>{studentName}</strong>
          {" to "}
          {tutorName ? (
            <>
              <strong>{tutorName}</strong>
              {"'s Mynk account"}
            </>
          ) : (
            "your tutor's Mynk account"
          )}
          {" under this account?"}
        </p>
      </div>

      {error === "already_claimed" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="This student has already been claimed. Sign in to your account to view them."
        />
      ) : null}
      {error === "email_not_verified" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="Please verify your email before claiming. Check your inbox for a confirmation link."
        />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError
          id="claim-interstitial-error"
          message="Something went wrong. Please try again."
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          onClick={handleConfirm}
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Connecting..." : `Yes, connect ${studentName}`}
        </Button>
        <Button
          variant="ghost"
          onClick={handleSwitchAccount}
          disabled={busy}
          className="w-full text-sm"
        >
          {"Not you? Switch account"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {"Clicking \"Connect\" links "}
        {studentName}
        {"'s tutoring data to the account "}
        <strong>{signedInEmail}</strong>.
      </p>
    </div>
  );
}
