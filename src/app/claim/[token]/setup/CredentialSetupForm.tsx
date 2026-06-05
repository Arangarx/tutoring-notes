"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { validateLearnerPin } from "@/lib/pin-strength";
import { CopyableLearnerHandle } from "@/components/account/CopyableLearnerHandle";
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
  const [pinFocused, setPinFocused] = useState(false);
  const [confirmPinFocused, setConfirmPinFocused] = useState(false);
  const [done, setDone] = useState(false);
  const [finalLoginHandle, setFinalLoginHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formErrorId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (pin !== confirmPin) {
      setError("pin_mismatch");
      setBusy(false);
      return;
    }

    const pinCheck = validateLearnerPin(pin);
    if (!pinCheck.ok) {
      setError("pin_too_weak");
      setBusy(false);
      return;
    }

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

      const data = (await res.json()) as {
        error?: string;
        loginHandle?: string;
      };

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

      setFinalLoginHandle(
        data.loginHandle ?? `${username.trim().toLowerCase()}@familyid`
      );
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
          <CopyableLearnerHandle
            loginHandle={finalLoginHandle}
            label="Login handle (username@familyid)"
          />
          <dl className="space-y-1.5 text-sm">
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
            {studentName} enters this handle and their PIN at the student login page.
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
            data-lpignore="true"
            data-1p-ignore
            readOnly={!pinFocused}
            onFocus={() => setPinFocused(true)}
            required
            minLength={6}
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="6-digit PIN"
            className="min-h-11 pr-12 [&::-ms-reveal]:hidden"
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
            tabIndex={-1}
            onClick={() => setShowPin((v) => !v)}
            className="absolute right-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label={showPin ? "Hide PIN" : "Show PIN"}
          >
            {showPin ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523a10.003 10.003 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
              </svg>
            )}
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
            data-lpignore="true"
            data-1p-ignore
            readOnly={!confirmPinFocused}
            onFocus={() => setConfirmPinFocused(true)}
            required
            maxLength={6}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            className="min-h-11 pr-12 [&::-ms-reveal]:hidden"
            aria-invalid={error === "pin_mismatch" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowConfirmPin((v) => !v)}
            className="absolute right-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none"
            aria-label={showConfirmPin ? "Hide PIN" : "Show PIN"}
          >
            {showConfirmPin ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                <path d="M10.748 13.93l2.523 2.523a10.003 10.003 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
              </svg>
            )}
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
