"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formErrorId = useId();
  const statusId = useId();

  return (
    <AuthShell
      title="Reset your password"
      description={
        <>
          We&apos;ll send a reset link to your email if an account exists and email is configured.
          <span className="mt-2 block text-sm">
            Accounts that only use <code className="text-xs">ADMIN_EMAIL</code> /{" "}
            <code className="text-xs">ADMIN_PASSWORD</code> in server config are not reset here —
            update the server environment instead.
          </span>
        </>
      }
      footer={
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setMessage(null);
          try {
            const res = await fetch("/api/auth/forgot-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Something went wrong.");
              return;
            }
            setMessage(data.message ?? "Check your email.");
          } catch {
            setError("Couldn't reach Mynk. Check your internet, then try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? formErrorId : message ? statusId : undefined
            }
          />
        </div>

        {error ? <AuthFieldError id={formErrorId} message={error} /> : null}
        {message ? (
          <p id={statusId} className="text-sm text-success" role="status">
            {message}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 pt-1">
          <AuthMortensenNotice />
          <Button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="min-h-11 w-full text-base"
          >
            {busy ? "Sending…" : "Send reset link"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
