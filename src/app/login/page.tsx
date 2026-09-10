import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { env } from "@/lib/env";
import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";

import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Log in — Tutoring Notes",
  description: "Log in to Tutoring Notes.",
  ...productionCanonicalMetadata("/login"),
};

export default function LoginPage() {
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return (
    <Suspense
      fallback={
        <AuthShell title="Welcome back" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <LoginForm googleOAuthAvailable={googleOAuthAvailable} />
    </Suspense>
  );
}
