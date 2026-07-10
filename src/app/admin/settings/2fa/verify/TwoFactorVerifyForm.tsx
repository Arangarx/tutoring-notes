"use client";

/**
 * 2FA Verify Client Component — Identity Phase 1 + remember-device (2026-06-13).
 * Shown when a non-test TUTOR/ADMIN is enrolled but has not yet verified this session.
 */

import { useState, useTransition } from "react";
import { verifyTotpCode } from "../actions";

export function TwoFactorVerifyForm({ callbackUrl }: { callbackUrl: string }) {
  const [codeInput, setCodeInput] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleVerify() {
    const input = codeInput.replace(/\s/g, "");
    if (!input) return;
    setError("");
    startTransition(async () => {
      const result = await verifyTotpCode(input, { rememberDevice });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Hard navigation: bypasses the Next.js client router cache so the browser
      // makes a fresh request with the newly-minted twoFactorVerified session cookie,
      // avoiding any client-router-cache race that could surface a stale page.
      window.location.replace(callbackUrl || "/admin");
    });
  }

  const isBackupLen = codeInput.replace(/\s/g, "").length === 8;
  const isTotpLen = codeInput.replace(/\s/g, "").length === 6;
  const canSubmit = (isTotpLen || isBackupLen) && !isPending;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app.
        If you have lost access, enter one of your 8-character backup codes.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          placeholder="000000"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))}
          className="border rounded-md px-3 py-2 text-sm w-36 font-mono tracking-widest"
          autoComplete="one-time-code"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmit) handleVerify();
          }}
        />
        <button
          onClick={handleVerify}
          disabled={!canSubmit}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify"}
        </button>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-sm">Remember this device for 30 days</span>
      </label>
      <p className="text-xs text-muted-foreground -mt-2">
        Skip the verification code on this browser when you sign in again.
        Don&apos;t use on shared computers.
      </p>
    </div>
  );
}
