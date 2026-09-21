import { OAuth2Client } from "google-auth-library";

import { env } from "@/lib/env";

export type GoogleAccessTokenResult =
  | { ok: true; oauth2Client: OAuth2Client; accessToken: string }
  | { ok: false; invalidGrant: boolean; message: string };

function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code === "invalid_grant") return true;
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("invalid_grant");
}

/** Refresh a Google OAuth access token (Gmail + Calendar share this pattern). */
export async function getGoogleAccessToken(
  refreshToken: string
): Promise<GoogleAccessTokenResult> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, invalidGrant: false, message: "Google OAuth not configured" };
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await oauth2Client.getAccessToken();
    if (!token) {
      return { ok: false, invalidGrant: false, message: "Could not get access token" };
    }
    return { ok: true, oauth2Client, accessToken: token };
  } catch (err) {
    return {
      ok: false,
      invalidGrant: isInvalidGrantError(err),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
