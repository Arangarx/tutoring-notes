"use client";

/**
 * 2FA Verify Client Component — EMAIL_OTP, SMS_OTP, or TOTP based on
 * enrollment method. SMS- or TOTP-enrolled users may switch to email OTP as
 * a login alternative (one method enrolled at a time; email is always the
 * universal fallback channel).
 */

import { useState, useTransition } from "react";
import {
  sendLoginEmailOtp,
  sendLoginSmsOtp,
  verifyEmailOtpCode,
  verifySmsOtpCode,
  verifyTotpCode,
} from "../actions";

type ActiveChannel = "EMAIL" | "SMS" | "TOTP";

export function TwoFactorVerifyForm({
  callbackUrl,
  method,
  maskedPhone,
}: {
  callbackUrl: string;
  method: "EMAIL_OTP" | "SMS_OTP" | "TOTP";
  /** Pre-masked phone (e.g. "+1•••••1234") when method is SMS_OTP. */
  maskedPhone?: string;
}) {
  const primaryChannel: ActiveChannel =
    method === "TOTP" ? "TOTP" : method === "SMS_OTP" ? "SMS" : "EMAIL";

  const [codeInput, setCodeInput] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [activeChannel, setActiveChannel] = useState<ActiveChannel>(primaryChannel);
  const [isPending, startTransition] = useTransition();

  const isOtpChannel = activeChannel === "EMAIL" || activeChannel === "SMS";
  const channelNoun = activeChannel === "SMS" ? "phone" : "email";

  function handleSendCode() {
    setError("");
    setInfo("");
    startTransition(async () => {
      if (activeChannel === "SMS") {
        const result = await sendLoginSmsOtp();
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else {
        const result = await sendLoginEmailOtp();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMaskedEmail(result.maskedEmail);
      }
      setInfo(
        codeSent
          ? `We sent a new verification code to your ${channelNoun}.`
          : `We sent a verification code to your ${channelNoun}.`
      );
      setCodeSent(true);
    });
  }

  function handleVerify() {
    const input = codeInput.replace(/\s/g, "");
    if (!input) return;
    setError("");
    setInfo("");
    startTransition(async () => {
      const result =
        activeChannel === "TOTP"
          ? await verifyTotpCode(input, { rememberDevice })
          : activeChannel === "SMS"
            ? await verifySmsOtpCode(input, { rememberDevice })
            : await verifyEmailOtpCode(input, { rememberDevice });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      window.location.replace(callbackUrl || "/admin");
    });
  }

  function switchChannel(next: ActiveChannel) {
    setActiveChannel(next);
    setCodeInput("");
    setCodeSent(false);
    setError("");
    setInfo("");
  }

  const normalized = codeInput.replace(/\s/g, "");
  const isBackupLen = normalized.length === 8;
  const isTotpLen = normalized.length === 6;
  const canSubmit = isOtpChannel
    ? isTotpLen && !isPending
    : (isTotpLen || isBackupLen) && !isPending;

  if (isOtpChannel) {
    const destination =
      activeChannel === "SMS"
        ? maskedPhone || "your phone"
        : maskedEmail || "";

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {codeSent ? (
            <>
              Enter the 6-digit code we {activeChannel === "SMS" ? "texted" : "emailed"}
              {activeChannel === "SMS" || maskedEmail ? (
                <>
                  {" "}
                  to <strong>{destination}</strong>
                </>
              ) : null}
              .
            </>
          ) : activeChannel === "SMS" ? (
            <>
              Send a verification code to <strong>{maskedPhone || "your phone"}</strong>, then
              enter it below.
            </>
          ) : (
            <>Send a verification code to your email, then enter it below.</>
          )}
        </p>
        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
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
        <button
          type="button"
          onClick={handleSendCode}
          disabled={isPending}
          className="text-sm underline"
        >
          {codeSent ? "Resend code" : "Send verification code"}
        </button>
        {activeChannel !== "EMAIL" && (
          <button
            type="button"
            onClick={() => switchChannel("EMAIL")}
            disabled={isPending}
            className="text-sm underline text-muted-foreground"
          >
            Email me a code instead
          </button>
        )}
        {activeChannel === "EMAIL" && primaryChannel !== "EMAIL" && (
          <button
            type="button"
            onClick={() => switchChannel(primaryChannel)}
            disabled={isPending}
            className="text-sm underline text-muted-foreground"
          >
            {primaryChannel === "SMS" ? "Use text message instead" : "Use authenticator app instead"}
          </button>
        )}
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
      <button
        type="button"
        onClick={() => switchChannel("EMAIL")}
        disabled={isPending}
        className="text-sm underline"
      >
        Email me a code instead
      </button>
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
