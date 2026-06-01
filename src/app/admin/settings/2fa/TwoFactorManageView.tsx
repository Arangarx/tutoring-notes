"use client";

/**
 * 2FA Management View — Identity Phase 1.
 *
 * Rendered when the user is enrolled + confirmed + session-2FA-verified.
 * Provides:
 *   - Status: 2FA active, enrolled date, remaining backup codes count
 *   - Rotate authenticator: inline QR flow with no-lockout (old secret stays valid
 *     until new code is confirmed; see rotateTotpStart/rotateTotpConfirm in actions.ts)
 *   - Regenerate backup codes: invalidates old set, shows new ones once
 *   - Admin reset: ADMIN-only — reset own or another admin's 2FA
 */

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  rotateTotpStart,
  rotateTotpConfirm,
  regenerateBackupCodes,
  adminResetTwoFactor,
} from "./actions";

interface Props {
  enrolledAt: string;       // ISO string
  remainingBackupCodes: number;
  isAdmin: boolean;
  userId: string;
}

type ViewState =
  | "idle"
  | "rotating-loading"
  | "rotating-show-qr"
  | "rotating-confirming"
  | "rotating-done"
  | "regen-loading"
  | "regen-done"
  | "reset-confirm"
  | "reset-target"
  | "reset-loading"
  | "reset-done";

export function TwoFactorManageView({
  enrolledAt,
  remainingBackupCodes,
  isAdmin,
  userId,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewState>("idle");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Rotate state
  const [rotateQr, setRotateQr] = useState("");
  const [rotateSecret, setRotateSecret] = useState("");
  const [rotateToken, setRotateToken] = useState("");
  const [newBackupCodes, setNewBackupCodes] = useState<string[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);

  // Regen state
  const [regenCodes, setRegenCodes] = useState<string[]>([]);
  const [regenCopied, setRegenCopied] = useState(false);

  // Admin reset state
  const [resetTargetId, setResetTargetId] = useState("");

  const enrolledDate = new Date(enrolledAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // ---------------------------------------------------------------------------
  // Rotate authenticator
  // ---------------------------------------------------------------------------
  function handleRotateStart() {
    setError("");
    setView("rotating-loading");
    startTransition(async () => {
      const result = await rotateTotpStart();
      if (!result.ok) {
        setError(result.error);
        setView("idle");
        return;
      }
      setRotateQr(result.qrDataUri);
      setRotateSecret(result.secret);
      setView("rotating-show-qr");
    });
  }

  function handleRotateConfirm() {
    if (!rotateToken.trim()) return;
    setError("");
    setView("rotating-confirming");
    startTransition(async () => {
      const result = await rotateTotpConfirm(rotateToken.trim());
      if (!result.ok) {
        setError(result.error);
        setView("rotating-show-qr");
        return;
      }
      setNewBackupCodes(result.backupCodes);
      setRotateToken("");
      setView("rotating-done");
    });
  }

  function handleRotateCancel() {
    setRotateQr("");
    setRotateSecret("");
    setRotateToken("");
    setError("");
    setView("idle");
  }

  const handleCopyNewCodes = useCallback(async () => {
    await navigator.clipboard.writeText(newBackupCodes.join("\n"));
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [newBackupCodes]);

  const handleDownloadNewCodes = useCallback(() => {
    const header = "Mynk 2FA Backup Codes (post-rotation) — store these in a safe place.\n\n";
    const blob = new Blob([header + newBackupCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mynk-2fa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [newBackupCodes]);

  // ---------------------------------------------------------------------------
  // Regenerate backup codes
  // ---------------------------------------------------------------------------
  function handleRegenStart() {
    setError("");
    setView("regen-loading");
    startTransition(async () => {
      const result = await regenerateBackupCodes();
      if (!result.ok) {
        setError(result.error);
        setView("idle");
        return;
      }
      setRegenCodes(result.backupCodes);
      setView("regen-done");
    });
  }

  const handleCopyRegenCodes = useCallback(async () => {
    await navigator.clipboard.writeText(regenCodes.join("\n"));
    setRegenCopied(true);
    setTimeout(() => setRegenCopied(false), 2000);
  }, [regenCodes]);

  const handleDownloadRegenCodes = useCallback(() => {
    const header = "Mynk 2FA Backup Codes — store these in a safe place.\n\n";
    const blob = new Blob([header + regenCodes.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mynk-2fa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [regenCodes]);

  // ---------------------------------------------------------------------------
  // Admin reset
  // ---------------------------------------------------------------------------
  function handleResetSelf() {
    setError("");
    setView("reset-confirm");
  }

  function handleResetConfirm() {
    setError("");
    setView("reset-loading");
    startTransition(async () => {
      const result = await adminResetTwoFactor(userId);
      if (!result.ok) {
        setError(result.error);
        setView("reset-confirm");
        return;
      }
      console.log("[tfa] self-reset complete; redirecting to setup");
      setView("reset-done");
    });
  }

  function handleResetOther() {
    setError("");
    setResetTargetId("");
    setView("reset-target");
  }

  function handleResetTargetSubmit() {
    if (!resetTargetId.trim()) return;
    setError("");
    setView("reset-loading");
    startTransition(async () => {
      const result = await adminResetTwoFactor(resetTargetId.trim());
      if (!result.ok) {
        setError(result.error);
        setView("reset-target");
        return;
      }
      setView("reset-done");
    });
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function BackupCodeGrid({ codes }: { codes: string[] }) {
    return (
      <div className="grid grid-cols-2 gap-1">
        {codes.map((c) => (
          <code
            key={c}
            className="text-xs bg-white dark:bg-black/30 border rounded px-2 py-1 font-mono select-all"
          >
            {c}
          </code>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Rotating view: QR step
  // ---------------------------------------------------------------------------
  if (view === "rotating-loading") {
    return <p className="text-sm text-muted-foreground">Generating new authenticator QR…</p>;
  }

  if (view === "rotating-show-qr" || view === "rotating-confirming") {
    return (
      <div className="space-y-6">
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-800 dark:text-yellow-200">
          Your current authenticator remains active until you confirm a code from the new one.
        </div>
        <div>
          <h2 className="text-base font-semibold mb-2">Step 1 — Scan with your new authenticator</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Add this account to your new authenticator app. Do not remove the old entry yet.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rotateQr} alt="TOTP QR code" width={200} height={200} className="border rounded-md" />
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer select-none">
              Can&apos;t scan? Enter the key manually
            </summary>
            <code className="block mt-2 text-xs bg-muted px-3 py-2 rounded break-all select-all">
              {rotateSecret}
            </code>
          </details>
        </div>
        <div>
          <h2 className="text-base font-semibold mb-2">Step 2 — Confirm with new authenticator code</h2>
          <p className="text-sm text-muted-foreground mb-2">
            Enter the 6-digit code shown by your NEW authenticator to complete rotation.
          </p>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <form
            onSubmit={(e) => { e.preventDefault(); handleRotateConfirm(); }}
            className="flex gap-2 items-center"
          >
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={rotateToken}
              onChange={(e) => setRotateToken(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="border rounded-md px-3 py-2 text-sm w-32 font-mono tracking-widest"
              autoComplete="one-time-code"
              autoFocus
            />
            <button
              type="submit"
              disabled={isPending || rotateToken.length < 6}
              className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Confirming…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={handleRotateCancel}
              disabled={isPending}
              className="text-sm text-muted-foreground underline disabled:opacity-50"
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (view === "rotating-done") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Authenticator rotated successfully.
        </p>
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <h2 className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
            New backup codes — shown once only
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Your previous backup codes are no longer valid. Save these new ones in a safe place.
          </p>
          <BackupCodeGrid codes={newBackupCodes} />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleCopyNewCodes}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              {codeCopied ? "Copied!" : "Copy codes"}
            </button>
            <button
              type="button"
              onClick={handleDownloadNewCodes}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              Download .txt
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { router.refresh(); setView("idle"); }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Done
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Regen backup codes views
  // ---------------------------------------------------------------------------
  if (view === "regen-loading") {
    return <p className="text-sm text-muted-foreground">Regenerating backup codes…</p>;
  }

  if (view === "regen-done") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Backup codes regenerated successfully.
        </p>
        <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4">
          <h2 className="text-base font-semibold text-yellow-800 dark:text-yellow-200 mb-1">
            New backup codes — shown once only
          </h2>
          <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
            Your previous backup codes are no longer valid. Store these in a safe place.
          </p>
          <BackupCodeGrid codes={regenCodes} />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleCopyRegenCodes}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              {regenCopied ? "Copied!" : "Copy codes"}
            </button>
            <button
              type="button"
              onClick={handleDownloadRegenCodes}
              className="text-xs border rounded-md px-3 py-1.5 hover:bg-muted transition-colors"
            >
              Download .txt
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { router.refresh(); setView("idle"); }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Done
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Admin reset views
  // ---------------------------------------------------------------------------
  if (view === "reset-confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="text-base font-semibold mb-2">Reset your own 2FA?</h2>
          <p className="text-sm text-muted-foreground mb-3">
            This will delete your 2FA enrollment and backup codes. You will need to re-enroll
            on your next session. This action cannot be undone.
          </p>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleResetConfirm}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
            >
              {isPending ? "Resetting…" : "Yes, reset my 2FA"}
            </button>
            <button
              type="button"
              onClick={() => setView("idle")}
              disabled={isPending}
              className="text-sm text-muted-foreground underline disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "reset-target") {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Reset another admin&apos;s 2FA</h2>
        <p className="text-sm text-muted-foreground">
          Enter the locked-out admin&apos;s user ID. Their 2FA enrollment will be deleted and
          they will need to re-enroll on next login.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); handleResetTargetSubmit(); }}
          className="space-y-2"
        >
          <input
            type="text"
            placeholder="Admin user ID (UUID)"
            value={resetTargetId}
            onChange={(e) => setResetTargetId(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm w-full font-mono"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending || !resetTargetId.trim()}
              className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-destructive/90 disabled:opacity-50"
            >
              {isPending ? "Resetting…" : "Reset 2FA for this user"}
            </button>
            <button
              type="button"
              onClick={() => setView("idle")}
              disabled={isPending}
              className="text-sm text-muted-foreground underline"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === "reset-loading") {
    return <p className="text-sm text-muted-foreground">Resetting 2FA…</p>;
  }

  if (view === "reset-done") {
    return (
      <div className="space-y-4">
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          2FA reset complete.
        </p>
        <p className="text-sm text-muted-foreground">
          The affected account will need to re-enroll 2FA on next login.
        </p>
        <button
          type="button"
          onClick={() => { router.push("/admin/settings"); router.refresh(); }}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90"
        >
          Back to settings
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Idle: main management view
  // ---------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="rounded-md border border-green-300 bg-green-50 dark:bg-green-900/20 p-4">
        <p className="text-sm font-medium text-green-800 dark:text-green-200">
          Two-factor authentication is on
        </p>
        <p className="text-xs text-green-700 dark:text-green-300 mt-1">
          Enrolled {enrolledDate} &middot; {remainingBackupCodes} backup code
          {remainingBackupCodes !== 1 ? "s" : ""} remaining
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Rotate authenticator */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Rotate authenticator</h2>
        <p className="text-sm text-muted-foreground">
          Got a new phone? Generate a new QR code and scan it with your new app.
          Your current authenticator keeps working until you confirm the new one.
        </p>
        <button
          type="button"
          onClick={handleRotateStart}
          disabled={isPending}
          className="mt-2 text-sm border rounded-md px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
        >
          Rotate authenticator
        </button>
      </div>

      <hr className="border-border" />

      {/* Regenerate backup codes */}
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Regenerate backup codes</h2>
        <p className="text-sm text-muted-foreground">
          Generate a new set of backup codes. Your old codes will be invalidated immediately.
          {remainingBackupCodes < 3 && (
            <span className="text-yellow-700 dark:text-yellow-400 font-medium">
              {" "}Only {remainingBackupCodes} code{remainingBackupCodes !== 1 ? "s" : ""} left — consider regenerating soon.
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={handleRegenStart}
          disabled={isPending}
          className="mt-2 text-sm border rounded-md px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
        >
          Regenerate backup codes
        </button>
      </div>

      {/* Admin-only reset section */}
      {isAdmin && (
        <>
          <hr className="border-border" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Admin: reset 2FA</h2>
            <p className="text-sm text-muted-foreground">
              ADMIN-only. Reset your own 2FA (emergency) or clear a locked-out admin&apos;s
              enrollment so they can re-enroll on next login.
            </p>
            <div className="flex gap-2 mt-2 flex-wrap">
              <button
                type="button"
                onClick={handleResetSelf}
                disabled={isPending}
                className="text-sm border border-destructive/50 text-destructive rounded-md px-4 py-2 hover:bg-destructive/5 transition-colors disabled:opacity-50"
              >
                Reset my 2FA
              </button>
              <button
                type="button"
                onClick={handleResetOther}
                disabled={isPending}
                className="text-sm border rounded-md px-4 py-2 hover:bg-muted transition-colors disabled:opacity-50"
              >
                Reset another admin&apos;s 2FA
              </button>
            </div>
          </div>
        </>
      )}

      <hr className="border-border" />
      <p className="text-sm">
        <a href="/admin/settings" className="text-muted-foreground underline">
          &larr; Back to Settings
        </a>
      </p>
    </div>
  );
}
