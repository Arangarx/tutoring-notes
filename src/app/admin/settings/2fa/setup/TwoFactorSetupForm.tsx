"use client";

/**
 * 2FA Setup Client Component — Identity Phase 1.
 * Handles the two-step enrollment flow:
 *   Step 1: Show QR code + base32 secret (start enrollment)
 *   Step 2: Confirm with first TOTP code → show backup codes
 *
 * QR code is rendered from a server-generated data: URI — the TOTP secret
 * never leaves our infrastructure.
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { startTotpEnrollment, confirmTotpEnrollment } from "../actions";

type Step =
  | "idle"
  | "loading-start"
  | "show-qr"
  | "confirming"
  | "show-backup"
  | "error";

export function TwoFactorSetupForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [qrDataUri, setQrDataUri] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [tokenInput, setTokenInput] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [backupCodes]);

  const handleDownload = useCallback(() => {
    const header = "Mynk 2FA Backup Codes — store these in a safe place.\n\n";
    const blob = new Blob([header + backupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mynk-2fa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [backupCodes]);

  function handleStart() {
    setStep("loading-start");
    setError("");
    startTransition(async () => {
      const result = await startTotpEnrollment();
      if (!result.ok) {
        setError(result.error);
        setStep("error");
        return;
      }
      setQrDataUri(result.qrDataUri);
      setSecret(result.secret);
      setStep("show-qr");
    });
  }

  function handleConfirm() {
    if (!tokenInput.trim()) return;
    setError("");
    setStep("confirming");
    startTransition(async () => {
      const result = await confirmTotpEnrollment(tokenInput.trim());
      if (!result.ok) {
        setError(result.error);
        setStep("show-qr");
        return;
      }
      setBackupCodes(result.backupCodes);
      setStep("show-backup");
    });
  }

  if (step === "idle" || step === "loading-start") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Two-factor authentication adds a second layer of security to your account.
          You will need an authenticator app (Google Authenticator, Authy, 1Password, etc.).
        </p>
        <button
          onClick={handleStart}
          disabled={isPending}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Set up 2FA"}
        </button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => setStep("idle")}
          className="text-sm underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (step === "show-qr" || step === "confirming") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-base font-semibold mb-2">Step 1 — Scan this QR code</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Open your authenticator app and scan the code below, or enter the secret manually.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUri}
            alt="TOTP QR code"
            width={200}
            height={200}
            className="border rounded-md"
          />
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Can&apos;t scan? Enter the key manually
            </summary>
            <code className="block mt-2 text-xs bg-muted px-3 py-2 rounded break-all select-all">
              {secret}
            </code>
          </details>
        </div>

        <div>
          <h2 className="text-base font-semibold mb-2">Step 2 — Enter the 6-digit code to confirm</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Enter the code from your authenticator app to complete setup.
          </p>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <form
            onSubmit={(e) => { e.preventDefault(); handleConfirm(); }}
            className="flex gap-2"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="border rounded-md px-3 py-2 text-sm w-32 font-mono tracking-widest"
              autoComplete="one-time-code"
            />
            <button
              type="submit"
              disabled={isPending || tokenInput.length < 6}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Verifying…" : "Confirm"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === "show-backup") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <h2 className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
            Save your backup codes — shown once only
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Store these in a safe place. Each code can only be used once to recover access
            if you lose your authenticator.
          </p>
          <div className="grid grid-cols-2 gap-1">
            {backupCodes.map((c) => (
              <code key={c} className="text-xs bg-white dark:bg-black/30 border rounded px-2 py-1 font-mono select-all">
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              {copied ? "Copied!" : "Copy codes"}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              Download .txt
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          ✓ 2FA is now active. You will be asked to verify on each new login.
        </p>
        <button
          type="button"
          onClick={() => { router.push("/admin"); router.refresh(); }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Continue to dashboard
        </button>
      </div>
    );
  }

  return null;
}
