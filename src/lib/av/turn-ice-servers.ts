/**
 * Short-lived TURN credentials for a live-session page (Cloudflare TURN).
 *
 * Called by the server page of an already-authorized participant (tutor
 * workspace, learner join). Credentials are minted per page load and expire
 * after `TURN_CREDENTIAL_TTL_SECONDS`, so nothing long-lived ships to the
 * browser. Any failure returns null and the page falls back to STUN only —
 * a slow or missing TURN key must never block entering the room.
 *
 * Env: `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN`. Never log
 * either value or the returned credential.
 *
 * Logs: `[avx] action=turn_credentials result=ok|unconfigured|error ...`.
 *
 * SERVER-ONLY.
 */

import { cookies } from "next/headers";
import { normalizeIceServers } from "@/lib/av/webrtc-ice-from-env";

const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

/** Longer than any session, so an open room never loses its relay. */
export const TURN_CREDENTIAL_TTL_SECONDS = 86_400;

const TURN_FETCH_TIMEOUT_MS = 2_500;

/**
 * Playwright-only: a cookie carrying the ICE server list, so the relay
 * regression test can point pages at a local TURN server. Ignored unless the
 * server runs with `PLAYWRIGHT_TEST=1`.
 */
export const PW_TURN_ICE_SERVERS_COOKIE = "pw_turn_ice_servers";

/** Browsers refuse port 53; Cloudflare includes :53 URLs for other clients. */
function dropPort53(servers: RTCIceServer[]): RTCIceServer[] | null {
  const out: RTCIceServer[] = [];
  for (const s of servers) {
    const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(
      (u) => !/:53(\?|$)/.test(u)
    );
    if (urls.length > 0) out.push({ ...s, urls });
  }
  return out.length > 0 ? out : null;
}

async function playwrightIceServers(): Promise<RTCIceServer[] | null> {
  if (process.env.PLAYWRIGHT_TEST !== "1" || process.env.VERCEL_ENV === "production") {
    return null;
  }
  try {
    const raw = (await cookies()).get(PW_TURN_ICE_SERVERS_COOKIE)?.value;
    if (!raw) return null;
    return normalizeIceServers(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

export async function getTurnIceServers(
  sessionLabel: string,
  fetchImpl?: typeof fetch
): Promise<RTCIceServer[] | null> {
  const harness = await playwrightIceServers();
  if (harness) return harness;

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !token) {
    console.warn(`[avx] ${sessionLabel} action=turn_credentials result=unconfigured`);
    return null;
  }

  try {
    const res = await (fetchImpl ?? fetch)(
      `${CLOUDFLARE_TURN_API}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL_SECONDS }),
        cache: "no-store",
        signal: AbortSignal.timeout(TURN_FETCH_TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      console.warn(
        `[avx] ${sessionLabel} action=turn_credentials result=error status=${res.status}`
      );
      return null;
    }
    const body = (await res.json()) as { iceServers?: unknown };
    const normalized = normalizeIceServers(body.iceServers);
    const servers = normalized ? dropPort53(normalized) : null;
    if (!servers) {
      console.warn(`[avx] ${sessionLabel} action=turn_credentials result=error reason=empty`);
      return null;
    }
    console.info(
      `[avx] ${sessionLabel} action=turn_credentials result=ok servers=${servers.length}`
    );
    return servers;
  } catch (err) {
    console.warn(
      `[avx] ${sessionLabel} action=turn_credentials result=error reason=${err instanceof Error ? err.name : "unknown"}`
    );
    return null;
  }
}
