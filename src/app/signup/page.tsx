import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/AuthShell";
import { env } from "@/lib/env";
import { productionCanonicalMetadata } from "@/lib/seo/canonical-host";

import { safeRelativeReturnPath } from "@/lib/safe-return-path";

import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Sign up — Tutoring Notes",
  description: "Create a tutor account for Tutoring Notes.",
  ...productionCanonicalMetadata("/signup"),
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; callbackUrl?: string }>;
}) {
  const googleOAuthAvailable = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const params = await searchParams;
  const returnTo = safeRelativeReturnPath(params.callbackUrl);
  const initialEmail = (params.email ?? "").trim();

  return (
    <AuthShell
      title="Create your account"
      description="Sign up with email and password or Google. Each account is separate — your students and notes stay in your workspace."
      footer={
        <Link href="/" className="text-brand underline-offset-2 hover:underline">
          ← Home
        </Link>
      }
    >
      <SignupForm
        googleOAuthAvailable={googleOAuthAvailable}
        initialEmail={initialEmail}
        returnTo={returnTo}
      />
    </AuthShell>
  );
}
