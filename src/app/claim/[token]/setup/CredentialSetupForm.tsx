"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { validateLearnerPin } from "@/lib/pin-strength";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CredentialSetupForm({
  rawToken,
  learnerProfileId,
  studentName,
}: {
  rawToken: string;
  learnerProfileId: string;
  studentName: string;
}) {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [done, setDone] = useState(false);
  const [finalUsername, setFinalUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (pin !== confirmPin) {
      setError("pin_mismatch");
      return;
    }

    const pinCheck = validateLearnerPin(pin);
    if (!pinCheck.ok) {
      setError("pin_too_weak");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(`/api/claim/${rawToken}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "credentials",
          username,
          pin,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        if (data.error === "username_taken") {
          setError("username_taken");
        } else if (data.error === "invalid_username") {
          setError("invalid_username");
        } else if (data.error === "pin_too_short") {
          setError("pin_too_short");
        } else if (data.error === "pin_too_weak") {
          setError("pin_too_weak");
        } else {
          setError("server");
        }
        return;
      }

      setFinalUsername(username.trim().toLowerCase());
      setDone(true);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const loginUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/students/login`
        : "/students/login";
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">
          ✓ Login set up for {studentName}
        </p>
        <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2">
          <p className="text-sm text-foreground font-medium">
            Share this with {studentName}:
          </p>
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Username</dt>
              <dd className="font-mono font-medium text-foreground">{finalUsername}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Sign-in link</dt>
              <dd>
                <a
                  href="/students/login"
                  className="text-brand underline-offset-2 hover:underline break-all"
                >
                  {loginUrl}
                </a>
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground pt-1">
            {studentName} enters their username (not starting with @) and PIN at the student login page.
          </p>
        </div>
        <Link
          href="/account/dashboard"
          className="inline-block text-sm text-brand underline-offset-2 hover:underline"
        >
          Go to dashboard →
        </Link>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="cred-username">
          Username for {studentName}
        </Label>
        <Input
          id="cred-username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          minLength={3}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. alex_s"
          className="min-h-11"
          aria-invalid={
            error === "username_taken" || error === "invalid_username" ? true : undefined
          }
          aria-describedby={error ? formErrorId : undefined}
        />
        <p className="text-xs text-muted-foreground">
          3–20 characters, letters/numbers/underscore only. Not secret.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cred-pin">PIN for {studentName}</Label>
        <div className="relative flex items-center">
          <Input
            id="cred-pin"
            name="pin"
            type={showPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6-digit PIN"
            className="min-h-11 pr-16"
            aria-invalid={
              error === "pin_too_short" ||
              error === "pin_too_weak" ||
              error === "pin_mismatch"
                ? true
                : undefined
            }
            aria-describedby={error ? formErrorId : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            className="absolute right-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
          >
            {showPin ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Exactly 6 digits. Keep this private.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cred-pin-confirm">Confirm PIN</Label>
        <div className="relative flex items-center">
          <Input
            id="cred-pin-confirm"
            name="confirmPin"
            type={showConfirmPin ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            required
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="min-h-11 pr-16"
            aria-invalid={error === "pin_mismatch" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
          <button
            type="button"
            onClick={() => setShowConfirmPin((v) => !v)}
            className="absolute right-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
          >
            {showConfirmPin ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {error === "username_taken" ? (
        <AuthFieldError id={formErrorId} message="That username is taken. Try another one." />
      ) : null}
      {error === "invalid_username" ? (
        <AuthFieldError
          id={formErrorId}
          message="Username must be 3–20 characters, using only letters, numbers, and underscores."
        />
      ) : null}
      {error === "pin_too_short" ? (
        <AuthFieldError id={formErrorId} message="PIN must be exactly 6 digits." />
      ) : null}
      {error === "pin_too_weak" ? (
        <AuthFieldError
          id={formErrorId}
          message="That PIN is too easy to guess. Try a less obvious combination."
        />
      ) : null}
      {error === "pin_mismatch" ? (
        <AuthFieldError id={formErrorId} message="PINs don't match." />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError id={formErrorId} message="Something went wrong. Please try again." />
      ) : null}

      <Button type="submit" disabled={busy} aria-busy={busy} className="min-h-11 w-full">
        {busy ? "Setting up…" : "Set up login"}
      </Button>

      <div className="mt-1 text-center">
        <Link
          href="/account/dashboard"
          className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Set up later
        </Link>
      </div>
    </form>
  );
}
