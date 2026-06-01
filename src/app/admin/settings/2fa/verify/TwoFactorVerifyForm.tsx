"use client";

/**
 * 2FA Verify Client Component — Identity Phase 1.
 * Shown when a non-test TUTOR/ADMIN is enrolled but has not yet verified this session.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { verifyTotpCode } from "../actions";

export function TwoFactorVerifyForm({ callbackUrl }: { callbackUrl: string }) {
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleVerify() {
    const input = codeInput.replace(/\s/g, "");
    if (!input) return;
    setError("");
    startTransition(async () => {
      const result = await verifyTotpCode(input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Reload so the new JWT cookie is picked up and middleware re-validates.
      router.push(callbackUrl || "/admin");
      router.refresh();
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
    </div>
  );
}
