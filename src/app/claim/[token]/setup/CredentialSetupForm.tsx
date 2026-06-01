"use client";

import Link from "next/link";
import { useId, useState } from "react";

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
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">
          ✓ Login set up for {studentName}
        </p>
        <p className="text-sm text-muted-foreground">
          Username: <strong>@{finalUsername}</strong>
        </p>
        <p className="text-sm text-muted-foreground">
          {studentName} can now sign in at{" "}
          <a href="/students/login" className="text-brand underline-offset-2 hover:underline">
            the student login page
          </a>
          .
        </p>
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
        <Input
          id="cred-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          minLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="6+ digit PIN"
          className="min-h-11"
          aria-invalid={error === "pin_too_short" || error === "pin_mismatch" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
        />
        <p className="text-xs text-muted-foreground">At least 6 digits. Keep this private.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cred-pin-confirm">Confirm PIN</Label>
        <Input
          id="cred-pin-confirm"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="min-h-11"
          aria-invalid={error === "pin_mismatch" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
        />
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
        <AuthFieldError id={formErrorId} message="PIN must be at least 6 digits." />
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
