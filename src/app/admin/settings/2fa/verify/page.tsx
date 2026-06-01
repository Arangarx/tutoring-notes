import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth-options";
import { TwoFactorVerifyForm } from "./TwoFactorVerifyForm";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>;
}

/**
 * Validates a returnTo/callbackUrl to prevent open-redirect attacks.
 * Accepts only same-origin relative paths (starts with / but not //).
 */
function safeReturnTo(url: string | undefined | null): string {
  if (url && /^\/(?!\/)/.test(url)) return url;
  return "/admin";
}

export default async function TwoFactorVerifyPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login");

  // Test accounts are exempt.
  if (session.user.isTestAccount) redirect("/admin");

  // Already verified this session.
  if (session.user.twoFactorVerified) {
    const { callbackUrl } = await searchParams;
    redirect(safeReturnTo(callbackUrl));
  }

  const { callbackUrl } = await searchParams;
  const safe = safeReturnTo(callbackUrl);

  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <h1 style={{ marginTop: 0 }}>Two-Factor Verification</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Enter the code from your authenticator app to continue.
      </p>
      <TwoFactorVerifyForm callbackUrl={safe} />
    </div>
  );
}
