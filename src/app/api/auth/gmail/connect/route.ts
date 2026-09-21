import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/auth-options";
import { env } from "@/lib/env";
import { isGmailConnectAllowedForEmail } from "@/lib/gmail-connect-allowed";
import { getRequestBaseUrlSafe } from "@/lib/public-url";

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export async function GET(request: NextRequest) {
  const baseUrl = getRequestBaseUrlSafe(request);
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  const sessionEmail = session.user?.email ?? null;
  if (!isGmailConnectAllowedForEmail(sessionEmail)) {
    return NextResponse.redirect(
      new URL("/admin/settings/email?error=gmail_connect_not_allowlisted", baseUrl)
    );
  }
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/admin/settings/email?error=google_oauth_not_configured", baseUrl)
    );
  }
  const redirectUri = `${baseUrl}/api/auth/gmail/callback`;
  const state = Buffer.from(JSON.stringify({ returnTo: "/admin/settings/email" })).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return NextResponse.redirect(url.toString());
}
