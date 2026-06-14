"use client";

/**
 * Impersonate button with inline TOTP step-up prompt (B1 — 2026-06-13).
 *
 * A trusted-device cookie that granted twoFactorVerified=true at login does NOT
 * satisfy impersonation start — this is the highest-privilege action and always
 * requires a fresh TOTP or backup code.
 */

import { useState, useTransition } from "react";
import { startImpersonation } from "@/app/admin/actions/impersonate";

interface Props {
  targetUserId: string;
}

export function ImpersonateButton({ targetUserId }: Props) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setTotpCode("");
    setError("");
    setShowPrompt(true);
  }

  function handleCancel() {
    setShowPrompt(false);
    setError("");
    setTotpCode("");
  }

  function handleConfirm() {
    const code = totpCode.trim();
    if (!code) {
      setError("Enter your 2FA code to confirm impersonation.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await startImpersonation(targetUserId, code);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impersonation failed.");
      }
    });
  }

  if (!showPrompt) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Log in as
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground font-medium">
        Enter your 2FA code to confirm impersonation
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <input
        type="text"
        inputMode="numeric"
        maxLength={8}
        placeholder="000000"
        value={totpCode}
        onChange={(e) => setTotpCode(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))}
        className="border rounded-md px-2 py-1 text-sm w-32 font-mono tracking-widest"
        autoComplete="one-time-code"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter" && totpCode.trim().length >= 6) handleConfirm();
          if (e.key === "Escape") handleCancel();
        }}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || totpCode.trim().length < 6}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Opening…" : "Confirm"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="text-xs text-muted-foreground underline hover:no-underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
