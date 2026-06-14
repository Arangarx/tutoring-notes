import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { getEmailForValidResetToken } from "@/lib/password-reset";
import ResetPasswordForm from "./ResetPasswordForm";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = "" } = await searchParams;
  const email = token ? await getEmailForValidResetToken(token) : null;

  // Token present but expired/used/invalid → show invalid-link UI directly.
  // This guarantees that whenever the form with password fields renders,
  // the username anchor is present (email resolved from the token).
  if (token && !email) {
    return (
      <AuthShell
        title="Invalid link"
        description="This reset link has expired or was already used."
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
    <Suspense
      fallback={
        <AuthShell title="Set a new password" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm token={token} email={email ?? ""} />
    </Suspense>
  );
}
