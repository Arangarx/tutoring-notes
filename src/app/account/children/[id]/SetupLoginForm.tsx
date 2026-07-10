"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import {
  validateLearnerPin,
  validateLearnerUsername,
} from "@/lib/learner-credential-validation";
import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SetupLoginFormProps {
  learnerProfileId: string;
  learnerName: string;
}

/**
 * Form to create the initial username + PIN credential for a parent-created
 * learner who has no login set up yet.
 *
 * Calls POST /api/learner-profiles/[id]/credentials (mirrors the claim setup
 * flow but without a claim-token gate).
 *
 * On success, refreshes the page so the credential state reflects the new
 * credential and the "Set up login" section transitions to "Child login".
 */
export function SetupLoginForm({ learnerProfileId, learnerName }: SetupLoginFormProps) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameCheck = validateLearnerUsername(username);
    if (!usernameCheck.ok) {
      setError("invalid_username");
      return;
    }

    if (pin !== confirmPin) {
      setError("mismatch");
      return;
    }

    const pinCheck = validateLearnerPin(pin);
    if (!pinCheck.ok) {
      setError(pinCheck.error?.includes("6 digits") ? "pin_too_short" : "pin_too_weak");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch(`/api/learner-profiles/${learnerProfileId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });
      const data = (await res.json()) as { error?: string; message?: string };

      if (!res.ok) {
        switch (data.error) {
          case "invalid_username":
            setError("invalid_username");
            break;
          case "username_taken":
            setError("username_taken");
            break;
          case "pin_too_short":
            setError("pin_too_short");
            break;
          case "pin_too_weak":
            setError("pin_too_weak");
            break;
          case "unauthorized":
            setError("unauthorized");
            break;
          case "credential_already_exists":
            setError("already_exists");
            break;
          default:
            setError("server");
        }
        return;
      }

      // Refresh the server component to show the newly-created credential.
      router.refresh();
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="default" size="sm" onClick={() => setOpen(true)}>
        Set up login
      </Button>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <p className="text-sm text-muted-foreground">
        {"Choose a username and PIN for "}
        <strong>{learnerName}</strong>
        {". They'll sign in at the student login page using "}
        <em>{"username@familyhandle"}</em>
        {" + PIN."}
      </p>

      <div className="space-y-1">
        <Label htmlFor="setup-username">Username</Label>
        <Input
          id="setup-username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          required
          minLength={3}
          maxLength={20}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. alex (3–20 chars, letters/numbers/_)"
          className="min-h-11"
          aria-invalid={
            error === "invalid_username" || error === "username_taken" ? true : undefined
          }
          aria-describedby={error ? formErrorId : undefined}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="setup-pin">PIN</Label>
        <Input
          id="setup-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="6 digits"
          className="min-h-11"
          aria-invalid={
            error === "pin_too_short" || error === "pin_too_weak" || error === "mismatch"
              ? true
              : undefined
          }
          aria-describedby={error ? formErrorId : undefined}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="setup-pin-confirm">Confirm PIN</Label>
        <Input
          id="setup-pin-confirm"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={6}
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          placeholder="Repeat PIN"
          className="min-h-11"
          aria-invalid={error === "mismatch" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
        />
      </div>

      {error === "invalid_username" ? (
        <AuthFieldError
          id={formErrorId}
          message="Username must be 3–20 characters: letters, numbers, or underscore only."
        />
      ) : null}
      {error === "username_taken" ? (
        <AuthFieldError
          id={formErrorId}
          message="That username is already taken in your family. Choose a different one."
        />
      ) : null}
      {error === "pin_too_short" ? (
        <AuthFieldError id={formErrorId} message="PIN must be exactly 6 digits." />
      ) : null}
      {error === "pin_too_weak" ? (
        <AuthFieldError
          id={formErrorId}
          message="That PIN is too easy to guess. Avoid sequences or repeated digits."
        />
      ) : null}
      {error === "mismatch" ? (
        <AuthFieldError id={formErrorId} message="PINs don't match." />
      ) : null}
      {error === "unauthorized" ? (
        <AuthFieldError
          id={formErrorId}
          message="Session expired. Refresh the page and try again."
        />
      ) : null}
      {error === "already_exists" ? (
        <AuthFieldError
          id={formErrorId}
          message="This learner already has a login. Refresh the page."
        />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError id={formErrorId} message="Something went wrong. Please try again." />
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? "Setting up…" : "Set up login"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setUsername("");
            setPin("");
            setConfirmPin("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
