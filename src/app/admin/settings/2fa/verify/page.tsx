import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import { authOptions } from "@/auth-options";
import { TwoFactorVerifyForm } from "./TwoFactorVerifyForm";
import { tryTrustedDeviceLoginSkip } from "@/lib/admin-trusted-device";

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

  // Trusted-device skip: check if this browser has a valid 30-day trust cookie.
  // Exempt: isTestAccount (already redirected above), isImpersonating, env-only admin.
  if (session.user.id && !session.user.isTestAccount) {
    const cookieName =
      process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token";
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(cookieName)?.value;
    if (sessionToken) {
      const currentToken = await decode({
        token: sessionToken,
        secret: process.env.NEXTAUTH_SECRET!,
      });
      if (currentToken) {
        const { callbackUrl: cbUrl } = await searchParams;
        const skipped = await tryTrustedDeviceLoginSkip(
          session.user.id,
          currentToken as Record<string, unknown>
        );
        if (skipped) redirect(safeReturnTo(cbUrl));
      }
    }
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
