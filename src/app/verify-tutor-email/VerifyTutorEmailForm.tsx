"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function errorCopy(code: string | null): string | null {
  if (code === "link_expired") return "That confirmation link has expired. Request a new one below.";
  if (code === "link_already_used") return "That confirmation link was already used. Sign in, or request a new link.";
  if (code === "link_invalid") return "That confirmation link is not valid. Request a new one below.";
  return null;
}

export default function VerifyTutorEmailForm() {
  const searchParams = useSearchParams();
  const linkError = errorCopy(searchParams.get("error"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(linkError);
  const formErrorId = useId();
  const statusId = useId();

  return (
    <AuthShell
      title="Confirm your email"
      description="We sent a confirmation link to your inbox. Open it to finish creating your tutor account, then sign in."
      footer={
        <Link href="/login" className="text-brand underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        className="flex flex-col gap-4"
        data-testid="tutor-verify-email-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setMessage(null);
          try {
            const res = await fetch("/api/auth/tutor/resend-verification", {
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
          <Label htmlFor="tutor-verify-email">Email</Label>
          <Input
            id="tutor-verify-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? formErrorId : message ? statusId : undefined}
          />
        </div>
        {error ? <AuthFieldError id={formErrorId}>{error}</AuthFieldError> : null}
        {message ? (
          <p id={statusId} className="text-sm text-success" role="status">
            {message}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="min-h-11">
          {busy ? "Sending…" : "Resend confirmation email"}
        </Button>
      </form>
    </AuthShell>
  );
}
