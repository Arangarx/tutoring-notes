/**
 * Trusted-device login-skip Route Handler.
 *
 * Called from /admin/settings/2fa/verify and /admin/settings/2fa/setup when the
 * trusted-device cookie is present. Cookie writes (mintTwoFactorVerifiedSession)
 * are only legal in a Route Handler or Server Action, NOT inside a Server Component
 * render — moving the call here is the core of the fix.
 *
 * REGRESSION NOTE: Prior implementation called tryTrustedDeviceLoginSkip directly
 * inside the RSC render of verify/page.tsx and setup/page.tsx. Inside that context,
 * mintTwoFactorVerifiedSession's cookies().set() throws:
 *   "Cookies can only be modified in a Server Action or Route Handler"
 * That error was silently swallowed by tryTrustedDeviceLoginSkip's try-catch →
 * returned false → skip never fired → user always shown the TOTP screen despite
 * having a valid trusted-device cookie. This handler moves the call to a legal
 * execution context.
 *
 * Loop-safety: on any failure, redirects to /admin/settings/2fa/verify?td=0.
 * The verify page only redirects HERE when td≠"0", so a handler failure never
 * bounces the user in a loop — one round trip maximum.
 *
 * Fail-closed: DB errors, decode errors, missing session → verify page (not 500,
 * not access without 2FA).
 *
 * Log prefix: tfa= (AGENTS.md § Conventions)
 *
 * Node.js runtime required — needs DB access (via tryTrustedDeviceLoginSkip)
 * and next-auth/jwt encode/decode. NOT edge-compatible.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { decode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { authOptions } from "@/auth-options";
import { tryTrustedDeviceLoginSkip } from "@/lib/admin-trusted-device";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

/** Allow only same-origin relative paths; anything else falls back to /admin. */
function safeReturnTo(url: string | null | undefined): string {
  if (url && /^\/(?!\/)/.test(url)) return url;
  return "/admin";
}

/**
 * Redirect to the TOTP verify page with the td=0 sentinel to prevent a
 * redirect loop. callbackUrl is preserved when present and safe.
 */
function redirectToVerify(reqUrl: string, callbackUrl: string | null): NextResponse {
  const params = new URLSearchParams();
  params.set("td", "0");
  if (callbackUrl && /^\/(?!\/)/.test(callbackUrl)) {
    params.set("callbackUrl", callbackUrl);
  }
  return NextResponse.redirect(
    new URL(`/admin/settings/2fa/verify?${params}`, reqUrl)
  );
}

export async function GET(req: Request): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const rawCallbackUrl = searchParams.get("callbackUrl");

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionToken) {
      console.error(
        `[tfa] tfa=unknown adminUserId=${session.user.id} action=trusted_device_check_no_session_token`
      );
      return redirectToVerify(req.url, rawCallbackUrl);
    }

    const currentToken = await decode({
      token: sessionToken,
      secret: process.env.NEXTAUTH_SECRET!,
    });

    if (!currentToken) {
      console.error(
        `[tfa] tfa=unknown adminUserId=${session.user.id} action=trusted_device_check_decode_failed`
      );
      return redirectToVerify(req.url, rawCallbackUrl);
    }

    const skipped = await tryTrustedDeviceLoginSkip(
      session.user.id,
      currentToken as Record<string, unknown>
    );

    if (skipped) {
      return NextResponse.redirect(
        new URL(safeReturnTo(rawCallbackUrl), req.url)
      );
    }

    return redirectToVerify(req.url, rawCallbackUrl);
  } catch (e) {
    console.error("[tfa] tfa=unknown action=trusted_device_check_handler_error", e);
    return redirectToVerify(req.url, null);
  }
}
