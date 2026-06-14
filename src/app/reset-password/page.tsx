import { Suspense } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { getEmailForValidResetToken } from "@/lib/password-reset";
import ResetPasswordForm from "./ResetPasswordForm";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = "" } = await searchParams;
  const email = token ? ((await getEmailForValidResetToken(token)) ?? "") : "";

  return (
    <Suspense
      fallback={
        <AuthShell title="Set a new password" description="Loading…">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordForm token={token} email={email} />
    </Suspense>
  );
}
