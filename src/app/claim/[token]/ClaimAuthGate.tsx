"use client";

import { useId, useState } from "react";
import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "choose" | "signup" | "login";

/**
 * Handles Cases A and B from §6.2 STEP 3:
 *  Case A: parent does not have an account → signup then auto-complete claim
 *  Case B: parent already has an account → login then complete claim
 */
export function ClaimAuthGate({
  rawToken,
  studentName,
  tutorName,
}: {
  rawToken: string;
  studentName: string;
  tutorName: string | null;
}) {
  const [mode, setMode] = useState<Mode>("choose");

  if (mode === "signup") {
    return (
      <ClaimSignupForm
        rawToken={rawToken}
        studentName={studentName}
        onBack={() => setMode("choose")}
      />
    );
  }

  if (mode === "login") {
    return (
      <ClaimLoginForm
        rawToken={rawToken}
        studentName={studentName}
        onBack={() => setMode("choose")}
      />
    );
  }

  // Choose mode
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {tutorName
          ? `To connect ${studentName}'s tutoring, create a free parent account or sign in.`
          : `To connect ${studentName}'s tutoring account, create a free parent account or sign in.`}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          className="min-h-11 w-full text-base"
          onClick={() => setMode("signup")}
        >
          Create parent account
        </Button>
        <Button
          variant="outline"
          className="min-h-11 w-full text-base"
          onClick={() => setMode("login")}
        >
          I already have an account
        </Button>
      </div>
    </div>
  );
}

function ClaimSignupForm({
  rawToken,
  studentName,
  onBack,
}: {
  rawToken: string;
  studentName: string;
  onBack: () => void;
}) {
  const fid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("password_too_short");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/account-holder/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          displayName: displayName || undefined,
          returnTo: `/claim/${rawToken}`,
        }),
      });
      const data = (await res.json()) as { error?: string };
      // Anti-enumeration: always show "check your email" on 2xx
      if (res.ok || res.status === 200) {
        setSubmitted(true);
        return;
      }
      if (!res.ok) {
        if (data.error === "password_too_short") setError("password_too_short");
        else if (data.error === "password_too_weak") setError("password_too_weak");
        else setError("server");
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">{"Check your email to continue"}</p>
        <p className="text-muted-foreground">
          {"We sent a verification link to "}
          <strong>{email}</strong>.
          {" Click it to verify your email, then come back to this claim link."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-brand underline-offset-2 hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={`${fid}-name`}>Your name (optional)</Label>
        <Input
          id={`${fid}-name`}
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="Jane Smith"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={busy}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fid}-email`}>Email</Label>
        <Input
          id={`${fid}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-required="true"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fid}-password`}>Password</Label>
        <Input
          id={`${fid}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-required="true"
        />
        <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
      </div>

      {error === "password_too_short" && (
        <AuthFieldError id={`${fid}-pw-err`} message="Password must be at least 8 characters." />
      )}
      {error === "password_too_weak" && (
        <AuthFieldError
          id={`${fid}-pw-weak-err`}
          message="Password is too weak. Try a longer phrase or mix of words."
        />
      )}
      {(error === "server" || error === "network") && (
        <AuthFieldError
          id={`${fid}-err`}
          message="Something went wrong. Please try again."
        />
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Creating account..." : `Create account to connect ${studentName}`}
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back
        </button>
      </div>
    </form>
  );
}

function ClaimLoginForm({
  rawToken,
  studentName,
  onBack,
}: {
  rawToken: string;
  studentName: string;
  onBack: () => void;
}) {
  const fid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      // Step 1: login
      const loginRes = await fetch("/api/auth/account-holder/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const loginData = (await loginRes.json()) as { next?: string; error?: string };

      if (!loginRes.ok) {
        setError(loginData.error === "invalid_credentials" ? "invalid_credentials" : "server");
        return;
      }

      if (loginData.next === "2fa_required") {
        window.location.href = `/account/2fa/verify?returnTo=${encodeURIComponent(`/claim/${rawToken}`)}`;
        return;
      }

      // Step 2: complete claim -- page will reload and show the interstitial or setup
      window.location.href = `/claim/${rawToken}`;
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor={`${fid}-email`}>Email</Label>
        <Input
          id={`${fid}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-required="true"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${fid}-password`}>Password</Label>
        <Input
          id={`${fid}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          aria-required="true"
        />
      </div>

      {error === "invalid_credentials" && (
        <AuthFieldError
          id={`${fid}-err`}
          message="Check your email and password and try again."
        />
      )}
      {(error === "server" || error === "network") && (
        <AuthFieldError
          id={`${fid}-err`}
          message="Something went wrong. Please try again."
        />
      )}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 w-full text-base"
        >
          {busy ? "Signing in..." : `Sign in to connect ${studentName}`}
        </Button>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Back
        </button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <a
          href={`/account/forgot-password?returnTo=${encodeURIComponent(`/claim/${rawToken}`)}`}
          className="underline-offset-2 hover:underline"
        >
          Forgot your password?
        </a>
      </p>
    </form>
  );
}
