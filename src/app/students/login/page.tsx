"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState } from "react";
import { MynkWordmark } from "@/components/auth/MynkWordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Child login page. Simple, friendly interface for kids on phones/tablets.
 *
 * Handles:
 *   - 401 invalid credentials: friendly error
 *   - 429 soft-lockout with Retry-After: shows countdown, never implies permanent lock
 */
function StudentLoginForm() {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/join";
  const fid = useId();

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (retryAfter && retryAfter > 0) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/learner/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, pin }),
      });

      if (res.status === 429) {
        const raw = res.headers.get("Retry-After");
        const secs = raw ? parseInt(raw, 10) : 30;
        setRetryAfter(secs);
        // Countdown
        const tick = setInterval(() => {
          setRetryAfter((prev) => {
            if (prev === null || prev <= 1) {
              clearInterval(tick);
              return null;
            }
            return prev - 1;
          });
        }, 1000);
        return;
      }

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError("invalid_credentials");
        return;
      }

      window.location.href = returnTo.startsWith("/") ? returnTo : "/join";
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  function formatCooldown(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  const isLockedOut = retryAfter !== null && retryAfter > 0;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex justify-center">
          <MynkWordmark />
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-0 text-center">
            <CardTitle className="heading text-2xl font-normal">Welcome back!</CardTitle>
            <CardDescription className="text-base">
              Sign in to start your session.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1">
                <Label htmlFor={`${fid}-username`} className="text-base">
                  Username
                </Label>
                <Input
                  id={`${fid}-username`}
                  name="learner-username"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy || isLockedOut}
                  className="h-12 text-base"
                  aria-required="true"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor={`${fid}-pin`} className="text-base">
                  PIN
                </Label>
                <div className="relative flex items-center">
                  <Input
                    id={`${fid}-pin`}
                    name="learner-pin"
                    type={showPin ? "text" : "password"}
                    autoComplete="off"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    disabled={busy || isLockedOut}
                    className="h-12 pr-16 text-base tracking-widest"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    tabIndex={-1}
                  >
                    {showPin ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              {error === "invalid_credentials" && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {"That username or PIN isn't right. Try again!"}
                </p>
              )}
              {error === "network" && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {"Connection problem. Check your internet and try again."}
                </p>
              )}

              {isLockedOut && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-700 dark:bg-amber-900/20"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-amber-800 dark:text-amber-300">
                    {`Slow down — try again in ${formatCooldown(retryAfter!)}.`}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                disabled={busy || isLockedOut}
                aria-busy={busy}
                className="h-12 w-full text-base"
              >
                {busy ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              {"Ask a parent if you forgot your PIN."}
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function StudentsLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </main>
      }
    >
      <StudentLoginForm />
    </Suspense>
  );
}
