"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formErrorId = useId();

  if (!token) {
    return (
      <AuthShell
        title="Invalid link"
        description="This page needs a reset token from your email."
        footer={
          <Link href="/forgot-password" className="text-brand underline-offset-2 hover:underline">
            Request a new link
          </Link>
        }
      >
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a strong password (at least 8 characters)."
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
          setError(null);
          if (password !== confirm) {
            setError("Passwords do not match.");
            return;
          }
          setBusy(true);
          try {
            const res = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token, password }),
            });
            const data = (await res.json()) as { ok?: boolean; error?: string };
            if (!res.ok || !data.ok) {
              setError(data.error ?? "Could not reset password.");
              return;
            }
            router.push("/login?reset=1");
          } catch {
            setError("Couldn't reach Mynk. Check your internet, then try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
            className="min-h-11"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>

        {error ? <AuthFieldError id={formErrorId} message={error} /> : null}

        <div className="flex flex-col gap-3 pt-1">
          <Button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="min-h-11 w-full text-base"
          >
            {busy ? "Saving…" : "Save password"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Set a new password" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
