import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/auth-options";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getAdminByEmail } from "@/lib/auth-db";
import { getRequestBaseUrlSafe } from "@/lib/public-url";
import { syncUpcomingUnsyncedScheduledSessions } from "@/lib/calendar/google-calendar-connect-backfill";
import { safeCalendarOAuthReturnTo } from "@/lib/calendar/calendar-oauth-return";

export async function GET(request: NextRequest) {
  const baseUrl = getRequestBaseUrlSafe(request);
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const state = searchParams.get("state");
  const returnTo = safeCalendarOAuthReturnTo(
    state
      ? (() => {
          try {
            const s = JSON.parse(Buffer.from(state, "base64url").toString());
            return s?.returnTo;
          } catch {
            return null;
          }
        })()
      : null
  );

  if (error) {
    return NextResponse.redirect(new URL(`${returnTo}?error=calendar_denied`, baseUrl));
  }

  if (!code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL(`${returnTo}?error=missing_code_or_config`, baseUrl));
  }

  const sessionEmail = session.user?.email ?? null;
  const adminUser = sessionEmail ? await getAdminByEmail(sessionEmail) : null;
  const adminUserId = adminUser?.id ?? null;

  const redirectUri = `${baseUrl}/api/auth/calendar/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[calendar/callback] token exchange failed:", err);
    return NextResponse.redirect(new URL(`${returnTo}?error=token_exchange_failed`, baseUrl));
  }
  const tokens = await tokenRes.json();
  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    return NextResponse.redirect(new URL(`${returnTo}?error=no_refresh_token`, baseUrl));
  }

  const accessToken = tokens.access_token;
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : null;
  const email = userInfo?.email ?? session.user?.email ?? "unknown@gmail.com";

  if (
    typeof (db as { oAuthCalendarConnection?: { create: unknown } }).oAuthCalendarConnection?.create !==
    "function"
  ) {
    return NextResponse.redirect(new URL(`${returnTo}?error=db_not_ready`, baseUrl));
  }
  try {
    await db.$transaction(async (tx) => {
      if (adminUserId) {
        await tx.oAuthCalendarConnection.upsert({
          where: {
            provider_adminUserId: { provider: "google", adminUserId },
          },
          create: {
            provider: "google",
            refreshToken,
            email,
            adminUserId,
            reconnectRequiredAt: null,
          },
          update: {
            refreshToken,
            email,
            reconnectRequiredAt: null,
          },
        });
      } else {
        await tx.oAuthCalendarConnection.deleteMany({
          where: { provider: "google", adminUserId: null },
        });
        await tx.oAuthCalendarConnection.create({
          data: {
            provider: "google",
            refreshToken,
            email,
            adminUserId: null,
          },
        });
      }
    });
  } catch {
    return NextResponse.redirect(new URL(`${returnTo}?error=db_not_ready`, baseUrl));
  }

  if (adminUserId) {
    try {
      await syncUpcomingUnsyncedScheduledSessions(adminUserId, refreshToken);
    } catch (err) {
      console.error("[gcw] connect_backfill failed:", err);
    }
  }

  return NextResponse.redirect(new URL(`${returnTo}?connected=google_calendar`, baseUrl));
}
