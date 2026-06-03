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
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [pinFocused, setPinFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [hardLocked, setHardLocked] = useState(false);
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

      if (res.status === 423) {
        // IAC-10: hard lock — requires parent/guardian unlock
        setHardLocked(true);
        setError(null);
        return;
      }

      if (res.status === 429) {
        const raw = res.headers.get("Retry-After");
        const secs = raw ? parseInt(raw, 10) : 30;
        setRetryAfter(secs);
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
        if (data.error === "access_mode_mismatch") {
          setError("access_mode_mismatch");
        } else {
          setError("invalid_credentials");
        }
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

  const isLockedOut = retryAfter !== null && retryAfter > 0 || hardLocked;

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex justify-center">
          <MynkWordmark />
        </div>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-0 text-center">
            <CardTitle className="heading text-2xl font-normal">Student sign in</CardTitle>
            <CardDescription className="text-base">
              {"Sign in with your own username and PIN — this is separate from your parent/guardian's account."}
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
                  data-lpignore="true"
                  data-1p-ignore
                  readOnly={!usernameFocused}
                  onFocus={() => setUsernameFocused(true)}
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={busy || isLockedOut}
                  className="h-12 text-base"
                  aria-required="true"
                  placeholder="username@familyid"
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
                    maxLength={6}
                    data-lpignore="true"
                    data-1p-ignore
                    readOnly={!pinFocused}
                    onFocus={() => setPinFocused(true)}
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    disabled={busy || isLockedOut}
                    className="h-12 pr-12 text-base tracking-widest [&::-ms-reveal]:hidden"
                    aria-required="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((v) => !v)}
                    className="absolute right-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground focus:outline-none"
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    tabIndex={-1}
                  >
                    {showPin ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                        <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                        <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 0 0-1.06 1.06l14.5 14.5a.75.75 0 1 0 1.06-1.06l-1.745-1.745a10.029 10.029 0 0 0 3.3-4.38 1.651 1.651 0 0 0 0-1.185A10.004 10.004 0 0 0 9.999 3a9.956 9.956 0 0 0-4.744 1.194L3.28 2.22ZM7.752 6.69l1.092 1.092a2.5 2.5 0 0 1 3.374 3.373l1.091 1.092a4 4 0 0 0-5.557-5.557Z" clipRule="evenodd" />
                        <path d="M10.748 13.93l2.523 2.523a10.003 10.003 0 0 1-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 0 1 0-1.186A10.007 10.007 0 0 1 2.839 6.02L6.07 9.252a4 4 0 0 0 4.678 4.678Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error === "invalid_credentials" && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {"That username or PIN isn't right. Try again!"}
                </p>
              )}
              {error === "access_mode_mismatch" && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {"This account doesn't use a PIN login. Ask a parent/guardian to sign in instead."}
                </p>
              )}
              {error === "network" && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                  {"Connection problem. Check your internet and try again."}
                </p>
              )}

              {hardLocked && (
                <div
                  className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm"
                  role="alert"
                >
                  <p className="font-medium text-destructive">{"Account locked"}</p>
                  <p className="text-destructive/80 text-xs mt-1">
                    {"Too many failed attempts. Ask a parent/guardian to unlock your account from their account settings."}
                  </p>
                </div>
              )}

              {isLockedOut && !hardLocked && (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-sm dark:border-amber-700 dark:bg-amber-900/20"
                  role="status"
                  aria-live="polite"
                >
                  <p className="text-amber-800 dark:text-amber-300">
                    {`Slow down — try again in ${formatCooldown(retryAfter!)}.`}
                  </p>
                  {retryAfter && retryAfter > 60 ? (
                    <p className="text-amber-700 dark:text-amber-400 text-xs mt-1">
                      {"If you keep having trouble, ask a parent/guardian for help."}
                    </p>
                  ) : null}
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
