/**
 * Browser ICE server list for `RTCPeerConnection`.
 *
 * STUN-only (`DEFAULT_ICE_SERVERS` in peer-mesh) fails for **phone ↔ home
 * Wi‑Fi** on routers without NAT hairpinning, and for symmetric NAT. TURN
 * comes from two places, both appended after the default STUN servers:
 *
 *   1. Server-issued short-lived TURN credentials (`turn-ice-servers.ts`,
 *      Cloudflare), handed to the page by the server and passed in here.
 *   2. `NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON` — a JSON array of
 *      `RTCIceServer` objects (static override).
 *
 * Example env value:
 * `[{"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]`
 */

import { DEFAULT_ICE_SERVERS } from "@/lib/av/peer-mesh";

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function normalizeOne(item: unknown): RTCIceServer | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  let urls: string | string[];
  if (typeof rec.urls === "string") {
    urls = rec.urls;
  } else if (
    Array.isArray(rec.urls) &&
    rec.urls.length > 0 &&
    rec.urls.every((u) => typeof u === "string")
  ) {
    urls = rec.urls as string[];
  } else {
    return null;
  }
  const username = stringOrUndefined(rec.username);
  const credential = stringOrUndefined(rec.credential);
  return username !== undefined && credential !== undefined
    ? { urls, username, credential }
    : { urls };
}

/**
 * Validate an untrusted ICE server list: a JSON array of `RTCIceServer`, or
 * a single `RTCIceServer` object. Malformed entries are dropped; null when
 * nothing usable remains.
 */
export function normalizeIceServers(parsed: unknown): RTCIceServer[] | null {
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const out: RTCIceServer[] = [];
  for (const item of items) {
    const server = normalizeOne(item);
    if (server) out.push(server);
  }
  return out.length > 0 ? out : null;
}

function parseEnvIceServers(raw: string | undefined): RTCIceServer[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    return normalizeIceServers(JSON.parse(raw)) ?? [];
  } catch {
    return [];
  }
}

export function getIceServersForBrowser(
  serverIssued?: ReadonlyArray<RTCIceServer> | null
): ReadonlyArray<RTCIceServer> {
  const fromEnv = parseEnvIceServers(
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON
      : undefined
  );
  const issued = serverIssued ?? [];
  if (fromEnv.length === 0 && issued.length === 0) return DEFAULT_ICE_SERVERS;
  return [...DEFAULT_ICE_SERVERS, ...fromEnv, ...issued];
}
