"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useState } from "react";

import { AuthFieldError } from "@/components/auth/AuthFieldError";
import { AuthMortensenNotice } from "@/components/auth/AuthMortensenNotice";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/admin";
  const resetOk = searchParams.get("reset") === "1";
  const registeredOk = searchParams.get("registered") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [setupHint, setSetupHint] = useState(false);
  const formErrorId = useId();

  useEffect(() => {
    fetch("/api/setup-required")
      .then((r) => r.json())
      .then((data: { setupRequired?: boolean; autoRedirectToSetup?: boolean }) => {
        if (data.setupRequired && data.autoRedirectToSetup) {
          window.location.href = "/setup";
          return;
        }
        if (data.setupRequired) setSetupHint(true);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <AuthShell title="Welcome back" description="Loading…">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Sign in with your tutor account."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-brand underline-offset-2 hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      {registeredOk ? (
        <p className="mb-4 text-sm text-success" role="status">
          Account created. Sign in with the email and password you just chose.
        </p>
      ) : null}
      {setupHint ? (
        <p className="mb-4 text-sm text-muted-foreground">
          No admin exists yet. On production, set <code className="text-xs">SETUP_SECRET</code> in
          your host env, redeploy, then open <code className="text-xs">/setup?token=…</code> with that
          value (see <code className="text-xs">docs/DEPLOY.md</code>). Or set{" "}
          <code className="text-xs">ADMIN_EMAIL</code> / <code className="text-xs">ADMIN_PASSWORD</code>{" "}
          and sign in here.
        </p>
      ) : null}
      {resetOk ? (
        <p className="mb-4 text-sm text-success" role="status">
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}

      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);

          try {
            const res = await signIn("credentials", {
              email,
              password,
              callbackUrl,
              redirect: false,
            });

            if (!res || res.error) {
              setError("credentials");
              return;
            }
            window.location.href = res.url ?? callbackUrl;
          } catch {
            setError("network");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
            className="min-h-11"
            aria-invalid={error === "credentials" ? true : undefined}
            aria-describedby={error ? formErrorId : undefined}
          />
          <p className="text-sm">
            <Link
              href="/forgot-password"
              className="text-brand underline-offset-2 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>

        {error === "credentials" ? (
          <AuthFieldError
            id={formErrorId}
            message="Email or password didn't match. Try again, or reset your password using the link above."
          />
        ) : null}
        {error === "network" ? (
          <AuthFieldError
            id={formErrorId}
            message="Couldn't reach Mynk. Check your internet, then try again."
          />
        ) : null}

        <div className="flex flex-col gap-3 pt-1">
          <AuthMortensenNotice />
          <Button
            type="submit"
            disabled={busy}
            aria-busy={busy}
            className="min-h-11 w-full text-base"
          >
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Welcome back" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
