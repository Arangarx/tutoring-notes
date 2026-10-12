"use client";

import { useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnLearnerPinAction } from "@/app/join/child-home-actions";

export function ChangePinForm({
  learnerProfileId,
  requireCurrentPin = false,
}: {
  learnerProfileId: string;
  requireCurrentPin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const formErrorId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin !== confirm) {
      setError("mismatch");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      if (requireCurrentPin) {
        const result = await changeOwnLearnerPinAction({
          currentPin,
          newPin: pin,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const res = await fetch(`/api/learner-profiles/${learnerProfileId}/credentials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPin: pin }),
        });
        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          if (data.error === "pin_too_short") {
            setError("pin_too_short");
          } else if (data.error === "unauthorized") {
            setError("unauthorized");
          } else {
            setError("server");
          }
          return;
        }
      }

      setDone(true);
      setCurrentPin("");
      setPin("");
      setConfirm("");
      if (!requireCurrentPin) {
        setTimeout(() => {
          setDone(false);
          setOpen(false);
        }, 3000);
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change PIN
      </Button>
    );
  }

  if (done) {
    return (
      <p
        className="text-sm text-success"
        role="status"
        data-testid={requireCurrentPin ? "child-pin-saved" : undefined}
      >
        PIN updated. All devices have been signed out and will need to log in again.
      </p>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <p className="text-sm text-muted-foreground">
        {requireCurrentPin
          ? "Enter your current PIN, then choose a new one. This signs you out on every device. A parent can still set a new PIN if you forget it."
          : "Changing the PIN signs out all devices. Your child will need to log in again."}
      </p>
      {requireCurrentPin ? (
        <div className="space-y-1">
          <Label htmlFor="current-pin">Current PIN</Label>
          <Input
            id="current-pin"
            name="currentPin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            required
            minLength={6}
            maxLength={6}
            value={currentPin}
            onChange={(e) => setCurrentPin(e.target.value)}
            placeholder="6 digits"
            className="min-h-11"
            data-testid="child-current-pin"
            aria-invalid={error === "wrong_pin" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="new-pin">New PIN</Label>
        <Input
          id="new-pin"
          name="newPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          autoFocus
          required
          minLength={6}
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="6 digits"
          className="min-h-11"
          aria-invalid={error === "pin_too_short" || error === "mismatch" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
          data-testid={requireCurrentPin ? "child-new-pin" : undefined}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="confirm-pin">Confirm new PIN</Label>
        <Input
          id="confirm-pin"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-11"
          aria-invalid={error === "mismatch" ? true : undefined}
          aria-describedby={error ? formErrorId : undefined}
          data-testid={requireCurrentPin ? "child-confirm-pin" : undefined}
        />
      </div>

      {error === "mismatch" ? (
        <AuthFieldError id={formErrorId} message="PINs don't match." />
      ) : null}
      {error === "wrong_pin" ? (
        <div data-testid="child-pin-error">
          <AuthFieldError id={formErrorId} message="Current PIN is not right." />
        </div>
      ) : null}
      {error === "pin_too_short" ? (
        <AuthFieldError id={formErrorId} message="PIN must be at least 6 digits." />
      ) : null}
      {error === "pin_too_weak" ? (
        <AuthFieldError id={formErrorId} message="That PIN is too easy to guess. Choose a different one." />
      ) : null}
      {error === "unauthorized" ? (
        <AuthFieldError id={formErrorId} message="Session expired. Refresh the page and try again." />
      ) : null}
      {error === "server" || error === "network" ? (
        <AuthFieldError id={formErrorId} message="Something went wrong. Please try again." />
      ) : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          aria-busy={busy}
          data-testid={requireCurrentPin ? "child-pin-submit" : undefined}
        >
          {busy ? "Updating…" : "Update PIN"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(false);
            setError(null);
            setPin("");
            setConfirm("");
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
